import { a as gateway } from "./connection.svelte.js";
import { g as getToasts } from "./toasts.svelte.js";
const toasts = getToasts();
function extractContent(content) {
  let text = "";
  let thinkingContent;
  const toolCalls = [];
  const toolResults = [];
  const images = [];
  if (typeof content === "string") {
    return { text: content, toolCalls, toolResults, images };
  }
  if (Array.isArray(content)) {
    const textParts = [];
    for (const block of content) {
      if (typeof block === "string") {
        textParts.push(block);
      } else if (block && typeof block === "object") {
        const b = block;
        if (b.type === "text" && typeof b.text === "string") {
          textParts.push(b.text);
        } else if (b.type === "thinking" && typeof b.thinking === "string") {
          thinkingContent = b.thinking;
        } else if (b.type === "image") {
          const source = b.source;
          if (source && source.type === "base64" && typeof source.data === "string") {
            const mediaType = source.media_type || "image/png";
            images.push({
              mimeType: mediaType,
              dataUrl: `data:${mediaType};base64,${source.data}`
            });
          } else if (typeof b.url === "string") {
            images.push({ mimeType: b.mimeType || "image/png", dataUrl: b.url });
          }
        } else if (b.type === "toolCall" || b.type === "tool_use") {
          toolCalls.push({ id: b.id, name: b.name, arguments: b.arguments || b.input });
        } else if (b.type === "toolResult" || b.type === "tool_result") {
          toolResults.push({
            toolCallId: b.toolCallId,
            name: b.toolName || b.name,
            content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
            isError: b.isError || false
          });
        }
      }
    }
    text = textParts.filter(Boolean).join("\n");
  } else if (content && typeof content === "object") {
    const c = content;
    if (typeof c.text === "string") {
      text = c.text;
    }
  }
  return { text, thinkingContent, toolCalls, toolResults, images };
}
let messages = [];
let streaming = false;
let streamingContent = "";
let streamingThinkingContent = "";
let streamingToolCalls = [];
let activeRunId = null;
let activeSessionKey = "";
let loadingHistory = false;
gateway.on("chat", (payload) => {
  const event = payload;
  if (event.sessionKey !== activeSessionKey) return;
  switch (event.state) {
    case "delta": {
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
    case "final": {
      const extracted = event.message?.content ? extractContent(event.message.content) : null;
      const finalContent = extracted?.text || streamingContent;
      const finalThinking = extracted?.thinkingContent || streamingThinkingContent || void 0;
      if (finalContent || finalThinking || extracted?.toolCalls?.length || extracted?.toolResults?.length || streamingToolCalls.length) {
        messages = [
          ...messages,
          {
            id: `msg-${Date.now()}-${event.seq}`,
            role: "assistant",
            content: finalContent,
            timestamp: Date.now(),
            thinkingContent: finalThinking,
            toolCalls: extracted?.toolCalls?.length ? extracted.toolCalls : streamingToolCalls.length ? streamingToolCalls : event.message?.toolCalls,
            toolResults: extracted?.toolResults?.length ? extracted.toolResults : event.message?.toolResults
          }
        ];
      }
      streamingContent = "";
      streamingThinkingContent = "";
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
    case "aborted": {
      if (streamingContent || streamingThinkingContent || streamingToolCalls.length) {
        messages = [
          ...messages,
          {
            id: `msg-${Date.now()}-aborted`,
            role: "assistant",
            content: streamingContent,
            timestamp: Date.now(),
            thinkingContent: streamingThinkingContent || void 0,
            toolCalls: streamingToolCalls.length ? streamingToolCalls : void 0,
            isAborted: true
          }
        ];
      }
      streamingContent = "";
      streamingThinkingContent = "";
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
    case "error": {
      if (streamingContent || streamingThinkingContent || streamingToolCalls.length) {
        messages = [
          ...messages,
          {
            id: `msg-${Date.now()}-err`,
            role: "assistant",
            content: streamingContent,
            timestamp: Date.now(),
            thinkingContent: streamingThinkingContent || void 0,
            toolCalls: streamingToolCalls.length ? streamingToolCalls : void 0,
            isError: true
          }
        ];
      }
      toasts.error("Chat Error", event.errorMessage || "Failed to generate response");
      streamingContent = "";
      streamingThinkingContent = "";
      streamingToolCalls = [];
      streaming = false;
      activeRunId = null;
      break;
    }
  }
});
async function loadHistory(sessionKey) {
  activeSessionKey = sessionKey;
  loadingHistory = true;
  messages = [];
  streamingContent = "";
  streamingThinkingContent = "";
  streamingToolCalls = [];
  streaming = false;
  activeRunId = null;
  if (!gateway.connected) {
    loadingHistory = false;
    return;
  }
  try {
    const history = await gateway.chatHistory(sessionKey, 1e3);
    const allExtracted = history.map((m, i) => {
      const extracted = extractContent(m.content);
      return {
        index: i,
        role: m.role,
        content: extracted.text,
        timestamp: m.ts ? m.ts * 1e3 : Date.now(),
        channel: m.channel,
        images: extracted.images,
        thinkingContent: extracted.thinkingContent,
        toolCalls: extracted.toolCalls?.length ? extracted.toolCalls : m.toolCalls ?? [],
        toolResults: extracted.toolResults?.length ? extracted.toolResults : m.toolResults ?? [],
        rawContent: m.content
      };
    });
    const toolResultMap = /* @__PURE__ */ new Map();
    for (const msg of allExtracted) {
      for (const tr of msg.toolResults) {
        if (tr.toolCallId) toolResultMap.set(tr.toolCallId, tr);
      }
      if (Array.isArray(msg.rawContent)) {
        for (const block of msg.rawContent) {
          if (block && typeof block === "object") {
            const b = block;
            if ((b.type === "tool_result" || b.type === "toolResult") && typeof b.tool_use_id === "string") {
              const resultContent = typeof b.content === "string" ? b.content : Array.isArray(b.content) ? b.content.filter((c) => c?.type === "text").map((c) => c.text).join("\n") : JSON.stringify(b.content);
              toolResultMap.set(b.tool_use_id, {
                toolCallId: b.tool_use_id,
                content: resultContent,
                isError: b.is_error || false
              });
            }
          }
        }
      }
    }
    messages = allExtracted.filter((m) => m.role === "user" || m.role === "assistant").map((m) => {
      const associatedResults = [];
      for (const tc of m.toolCalls) {
        const result = toolResultMap.get(tc.id);
        if (result) associatedResults.push(result);
      }
      const finalResults = associatedResults.length ? associatedResults : m.toolResults.length ? m.toolResults : void 0;
      return {
        id: `hist-${m.index}-${m.timestamp}`,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        channel: m.channel,
        images: m.images.length ? m.images : void 0,
        thinkingContent: m.thinkingContent,
        toolCalls: m.toolCalls.length ? m.toolCalls : void 0,
        toolResults: finalResults,
        isHistorical: true
        // Flag so UI knows these are completed
      };
    }).filter((m) => m.content.trim() !== "" || m.thinkingContent || m.toolCalls?.length || m.toolResults?.length || m.images?.length);
  } catch (e) {
    console.error("Failed to load chat history:", e);
    toasts.error("History Load Failed", e instanceof Error ? e.message : "Could not load chat history");
  } finally {
    loadingHistory = false;
  }
}
async function sendMessage(text, attachments) {
  const hasText = text.trim().length > 0;
  const hasAttachments = attachments && attachments.length > 0;
  if (!hasText && !hasAttachments || !activeSessionKey || !gateway.connected) return;
  messages = [
    ...messages,
    {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: text,
      timestamp: Date.now(),
      images: hasAttachments ? attachments : void 0
    }
  ];
  streaming = true;
  streamingContent = "";
  streamingThinkingContent = "";
  streamingToolCalls = [];
  try {
    const apiAttachments = hasAttachments ? attachments.map((att) => {
      const match = /^data:([^;]+);base64,(.+)$/.exec(att.dataUrl);
      if (!match) return null;
      return { type: "image", mimeType: match[1], content: match[2] };
    }).filter((a) => a !== null) : void 0;
    const result = await gateway.chatSend(activeSessionKey, text, { attachments: apiAttachments });
    activeRunId = result.runId;
  } catch (e) {
    streaming = false;
    console.error("Failed to send message:", e);
    toasts.error("Send Failed", e instanceof Error ? e.message : "Could not send message");
  }
}
async function abortResponse() {
  if (!activeSessionKey) return;
  try {
    await gateway.chatAbort(activeSessionKey, activeRunId ?? void 0);
  } catch (e) {
    console.error("Failed to abort:", e);
  }
}
function getMessages() {
  return {
    get list() {
      return messages;
    },
    get streaming() {
      return streaming;
    },
    get streamingContent() {
      return streamingContent;
    },
    get streamingThinkingContent() {
      return streamingThinkingContent;
    },
    get streamingToolCalls() {
      return streamingToolCalls;
    },
    get activeRunId() {
      return activeRunId;
    },
    get loadingHistory() {
      return loadingHistory;
    },
    get activeSessionKey() {
      return activeSessionKey;
    },
    loadHistory,
    sendMessage,
    abortResponse
  };
}
export {
  getMessages as g
};
