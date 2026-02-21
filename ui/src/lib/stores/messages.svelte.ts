/**
 * Messages store — manages chat history and streaming state
 */
import { gateway, type ChatEvent, type ChatMessage } from '$lib/gateway';
import { getToasts } from './toasts.svelte';

const toasts = getToasts();

// ─── Helpers ───────────────────────────────────

/** Enhanced content extraction that captures text, thinking blocks, tool calls, and images */
function extractContent(content: unknown): { text: string; thinkingContent?: string; toolCalls: any[]; toolResults: any[]; images: ImageAttachment[] } {
  let text = '';
  let thinkingContent: string | undefined;
  const toolCalls: any[] = [];
  const toolResults: any[] = [];
  const images: ImageAttachment[] = [];

  if (typeof content === 'string') {
    return { text: content, toolCalls, toolResults, images };
  }
  
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    
    for (const block of content) {
      if (typeof block === 'string') {
        textParts.push(block);
      } else if (block && typeof block === 'object') {
        const b = block as Record<string, unknown>;
        
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text);
        } else if (b.type === 'thinking' && typeof b.thinking === 'string') {
          thinkingContent = b.thinking;
        } else if (b.type === 'image') {
          // Handle image content blocks (from chat.send attachments)
          const source = b.source as Record<string, unknown> | undefined;
          if (source && source.type === 'base64' && typeof source.data === 'string') {
            const mediaType = (source.media_type as string) || 'image/png';
            images.push({
              mimeType: mediaType,
              dataUrl: `data:${mediaType};base64,${source.data}`
            });
          } else if (typeof b.url === 'string') {
            // URL-based image
            images.push({
              mimeType: (b.mimeType as string) || 'image/png',
              dataUrl: b.url as string
            });
          }
        } else if (b.type === 'toolCall' || b.type === 'tool_use') {
          toolCalls.push({
            id: b.id,
            name: b.name,
            arguments: b.arguments || b.input
          });
        } else if (b.type === 'toolResult' || b.type === 'tool_result') {
          toolResults.push({
            toolCallId: b.toolCallId,
            name: b.toolName || b.name,
            content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
            isError: b.isError || false
          });
        }
      }
    }
    
    text = textParts.filter(Boolean).join('\n');
  } else if (content && typeof content === 'object') {
    const c = content as Record<string, unknown>;
    if (typeof c.text === 'string') {
      text = c.text;
    }
  }

  return { text, thinkingContent, toolCalls, toolResults, images };
}

// ─── Types ─────────────────────────────────────

export interface ImageAttachment {
  mimeType: string;
  dataUrl: string;   // data:image/...;base64,... for display
}

export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  channel?: string;
  images?: ImageAttachment[];
  thinkingContent?: string;
  toolCalls?: Array<{ id: string; name: string; input?: unknown; arguments?: unknown }>;
  toolResults?: Array<{ toolCallId: string; name?: string; content?: string; isError?: boolean }>;
  isStreaming?: boolean;
  isAborted?: boolean;
  isError?: boolean;
  isHistorical?: boolean;
}

// ─── Reactive state ────────────────────────────

let messages = $state<DisplayMessage[]>([]);
let streaming = $state(false);
let streamingContent = $state('');
let streamingThinkingContent = $state('');
let streamingToolCalls = $state<any[]>([]);
let activeRunId = $state<string | null>(null);
let activeSessionKey = $state<string>('');
let loadingHistory = $state(false);

// ─── Chat event handler ───────────────────────

gateway.on('chat', (payload) => {
  const event = payload as ChatEvent;
  
  // Only handle events for the active session
  if (event.sessionKey !== activeSessionKey) return;

  switch (event.state) {
    case 'delta': {
      streaming = true;
      activeRunId = event.runId;
      if (event.message?.content) {
        const extracted = extractContent(event.message.content);
        if (extracted.text) streamingContent += extracted.text;
        if (extracted.thinkingContent) streamingThinkingContent = extracted.thinkingContent;
        if (extracted.toolCalls.length) streamingToolCalls = [...streamingToolCalls, ...extracted.toolCalls];
      }
      break;
    }
    case 'final': {
      // Commit the streaming message
      const extracted = event.message?.content ? extractContent(event.message.content) : null;
      const finalContent = extracted?.text || streamingContent;
      const finalThinking = extracted?.thinkingContent || streamingThinkingContent || undefined;
      
      if (finalContent || finalThinking || extracted?.toolCalls?.length || extracted?.toolResults?.length || streamingToolCalls.length) {
        messages = [...messages, {
          id: `msg-${Date.now()}-${event.seq}`,
          role: 'assistant',
          content: finalContent,
          timestamp: Date.now(),
          thinkingContent: finalThinking,
          toolCalls: extracted?.toolCalls?.length ? extracted.toolCalls : 
                     streamingToolCalls.length ? streamingToolCalls : event.message?.toolCalls,
          toolResults: extracted?.toolResults?.length ? extracted.toolResults : event.message?.toolResults
        }];
      }
      streamingContent = '';
      streamingThinkingContent = '';
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
    case 'aborted': {
      // Keep partial content if any
      if (streamingContent || streamingThinkingContent || streamingToolCalls.length) {
        messages = [...messages, {
          id: `msg-${Date.now()}-aborted`,
          role: 'assistant',
          content: streamingContent,
          timestamp: Date.now(),
          thinkingContent: streamingThinkingContent || undefined,
          toolCalls: streamingToolCalls.length ? streamingToolCalls : undefined,
          isAborted: true
        }];
      }
      streamingContent = '';
      streamingThinkingContent = '';
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
    case 'error': {
      if (streamingContent || streamingThinkingContent || streamingToolCalls.length) {
        messages = [...messages, {
          id: `msg-${Date.now()}-err`,
          role: 'assistant',
          content: streamingContent,
          timestamp: Date.now(),
          thinkingContent: streamingThinkingContent || undefined,
          toolCalls: streamingToolCalls.length ? streamingToolCalls : undefined,
          isError: true
        }];
      }
      
      // Show error toast
      toasts.error('Chat Error', event.errorMessage || 'Failed to generate response');
      
      streamingContent = '';
      streamingThinkingContent = '';
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
  }
});

// ─── Functions ─────────────────────────────────

async function loadHistory(sessionKey: string): Promise<void> {
  activeSessionKey = sessionKey;
  loadingHistory = true;
  messages = [];
  streamingContent = '';
  streamingThinkingContent = '';
  streamingToolCalls = [];
  streaming = false;
  activeRunId = null;

  if (!gateway.connected) {
    loadingHistory = false;
    return;
  }

  try {
    const history = await gateway.chatHistory(sessionKey, 1000);
    // First pass: extract all messages including tool-role for result association
    const allExtracted = history.map((m, i) => {
      const extracted = extractContent(m.content);
      return {
        index: i,
        role: m.role,
        content: extracted.text,
        timestamp: m.ts ? m.ts * 1000 : Date.now(),
        channel: m.channel,
        images: extracted.images,
        thinkingContent: extracted.thinkingContent,
        toolCalls: extracted.toolCalls?.length ? extracted.toolCalls : m.toolCalls ?? [],
        toolResults: extracted.toolResults?.length ? extracted.toolResults : m.toolResults ?? [],
        rawContent: m.content
      };
    });

    // Build a map of toolCallId → toolResult from ALL messages (including tool role)
    const toolResultMap = new Map<string, { toolCallId: string; name?: string; content?: string; isError?: boolean }>();
    for (const msg of allExtracted) {
      for (const tr of msg.toolResults) {
        if (tr.toolCallId) toolResultMap.set(tr.toolCallId, tr);
      }
      // Also check raw content for tool_result blocks in user/tool messages
      if (Array.isArray(msg.rawContent)) {
        for (const block of msg.rawContent) {
          if (block && typeof block === 'object') {
            const b = block as Record<string, unknown>;
            if ((b.type === 'tool_result' || b.type === 'toolResult') && typeof b.tool_use_id === 'string') {
              const resultContent = typeof b.content === 'string' ? b.content :
                Array.isArray(b.content) ? (b.content as any[]).filter((c: any) => c?.type === 'text').map((c: any) => c.text).join('\n') :
                JSON.stringify(b.content);
              toolResultMap.set(b.tool_use_id as string, {
                toolCallId: b.tool_use_id as string,
                content: resultContent,
                isError: b.is_error as boolean || false
              });
            }
          }
        }
      }
    }

    // Second pass: build display messages with associated tool results
    messages = allExtracted
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map((m) => {
        // Associate tool results with this message's tool calls
        const associatedResults: typeof m.toolResults = [];
        for (const tc of m.toolCalls) {
          const result = toolResultMap.get(tc.id);
          if (result) associatedResults.push(result);
        }
        const finalResults = associatedResults.length ? associatedResults : m.toolResults.length ? m.toolResults : undefined;

        return {
          id: `hist-${m.index}-${m.timestamp}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.timestamp,
          channel: m.channel,
          images: m.images.length ? m.images : undefined,
          thinkingContent: m.thinkingContent,
          toolCalls: m.toolCalls.length ? m.toolCalls : undefined,
          toolResults: finalResults,
          isHistorical: true  // Flag so UI knows these are completed
        };
      })
      .filter(m => m.content.trim() !== '' || m.thinkingContent || m.toolCalls?.length || m.toolResults?.length || m.images?.length);
  } catch (e) {
    console.error('Failed to load chat history:', e);
    toasts.error('History Load Failed', e instanceof Error ? e.message : 'Could not load chat history');
  } finally {
    loadingHistory = false;
  }
}

async function sendMessage(text: string, attachments?: ImageAttachment[]): Promise<void> {
  const hasText = text.trim().length > 0;
  const hasAttachments = attachments && attachments.length > 0;
  if ((!hasText && !hasAttachments) || !activeSessionKey || !gateway.connected) return;

  // Add user message immediately (optimistic) with image previews
  messages = [...messages, {
    id: `msg-${Date.now()}-user`,
    role: 'user',
    content: text,
    timestamp: Date.now(),
    images: hasAttachments ? attachments : undefined
  }];

  streaming = true;
  streamingContent = '';
  streamingThinkingContent = '';
  streamingToolCalls = [];

  try {
    // Convert attachments to API format: strip data URL prefix to get raw base64
    const apiAttachments = hasAttachments
      ? attachments.map(att => {
          const match = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
          if (!match) return null;
          return { type: 'image', mimeType: match[1], content: match[2] };
        }).filter((a): a is NonNullable<typeof a> => a !== null)
      : undefined;

    const result = await gateway.chatSend(activeSessionKey, text, {
      attachments: apiAttachments
    });
    activeRunId = result.runId;
  } catch (e) {
    streaming = false;
    console.error('Failed to send message:', e);
    toasts.error('Send Failed', e instanceof Error ? e.message : 'Could not send message');
  }
}

async function abortResponse(): Promise<void> {
  if (!activeSessionKey) return;
  try {
    await gateway.chatAbort(activeSessionKey, activeRunId ?? undefined);
  } catch (e) {
    console.error('Failed to abort:', e);
  }
}

// ─── Export ────────────────────────────────────

export function getMessages() {
  return {
    get list() { return messages; },
    get streaming() { return streaming; },
    get streamingContent() { return streamingContent; },
    get streamingThinkingContent() { return streamingThinkingContent; },
    get streamingToolCalls() { return streamingToolCalls; },
    get activeRunId() { return activeRunId; },
    get loadingHistory() { return loadingHistory; },
    get activeSessionKey() { return activeSessionKey; },
    loadHistory,
    sendMessage,
    abortResponse
  };
}
