<script lang="ts">
  import { renderMarkdownSync, postProcessMarkdown } from '$lib/markdown';
  import type { DisplayMessage } from '$lib/stores/messages.svelte';
  import { formatRelativeTime } from '$lib/utils/time';
  import ThinkingBlock from './ThinkingBlock.svelte';
  import ToolCallCard from './ToolCallCard.svelte';
  import ImageLightbox from './ImageLightbox.svelte';
  import { browser } from '$app/environment';

  // User profile from localStorage
  let userAvatarUrl = $state<string | null>(null);
  let userDisplayName = $state<string>('');
  
  $effect(() => {
    if (!browser) return;
    userAvatarUrl = localStorage.getItem('cortex-user-avatar');
    userDisplayName = localStorage.getItem('cortex-user-name') || '';
  });

  let { 
    message, 
    streaming = false, 
    streamingContent = '',
    streamingThinkingContent = '',
    streamingToolCalls = [],
    showChannel = false
  } = $props<{
    message?: DisplayMessage;
    streaming?: boolean;
    streamingContent?: string;
    streamingThinkingContent?: string;
    streamingToolCalls?: any[];
    showChannel?: boolean;
  }>();

  // Lightbox state
  let lightboxOpen = $state(false);
  let lightboxSrc = $state('');
  let lightboxAlt = $state('');

  function openLightbox(src: string, alt: string) {
    lightboxSrc = src;
    lightboxAlt = alt;
    lightboxOpen = true;
  }

  function closeLightbox() {
    lightboxOpen = false;
  }

  // Channel badge config
  const channelConfig: Record<string, { label: string; color: string; bg: string }> = {
    discord:  { label: 'Discord',  color: '#5865F2', bg: 'rgba(88,101,242,0.15)' },
    telegram: { label: 'Telegram', color: '#0088cc', bg: 'rgba(0,136,204,0.15)' },
    webchat:  { label: 'Web',      color: '#00e5ff', bg: 'rgba(0,229,255,0.12)' },
    signal:   { label: 'Signal',   color: '#3A76F0', bg: 'rgba(58,118,240,0.15)' },
    whatsapp: { label: 'WhatsApp', color: '#25D366', bg: 'rgba(37,211,102,0.15)' },
    slack:    { label: 'Slack',    color: '#4A154B', bg: 'rgba(74,21,75,0.25)' },
  };

  let channelBadge = $derived.by(() => {
    if (!showChannel || !message?.channel) return null;
    const ch = message.channel.toLowerCase();
    return channelConfig[ch] ?? { label: message.channel, color: '#888', bg: 'rgba(136,136,136,0.12)' };
  });

  let showCopyButton = $state(false);
  let copySuccess = $state(false);
  let renderedHtml = $state('');

  // For streaming state: no message, just content
  let role = $derived(message?.role ?? 'assistant');
  let content = $derived(streaming ? streamingContent : (message?.content ?? ''));
  let isUser = $derived(role === 'user');
  let timestamp = $derived(message?.timestamp ? new Date(message.timestamp) : null);
  
  // Auto-updating relative time
  let now = $state(Date.now());
  let relativeTime = $derived(timestamp ? formatRelativeTime(timestamp.getTime()) : null);
  
  // Refresh relative time every 30 seconds
  $effect(() => {
    if (!browser || !timestamp) return;
    const interval = setInterval(() => {
      now = Date.now();
    }, 30000);
    return () => clearInterval(interval);
  });

  // Detect image URLs in content for inline rendering
  const imageUrlRegex = /(?:!\[([^\]]*)\]\((https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s)]*)?)\))|(?:^|\s)(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)(?:\s|$)/gi;
  
  let inlineImages = $derived.by(() => {
    if (!content) return [];
    const images: { url: string; alt: string }[] = [];
    const seen = new Set<string>();
    let match;
    const regex = new RegExp(imageUrlRegex.source, imageUrlRegex.flags);
    while ((match = regex.exec(content)) !== null) {
      const url = match[2] || match[3];
      if (url && !seen.has(url)) {
        seen.add(url);
        images.push({ url, alt: match[1] || 'Image' });
      }
    }
    return images;
  });

  // Process markdown with async post-processing for shiki and mermaid
  $effect(() => {
    if (content) {
      const syncHtml = renderMarkdownSync(content);
      renderedHtml = syncHtml;
      
      // Post-process for syntax highlighting and mermaid on client side
      if (browser) {
        postProcessMarkdown(syncHtml).then(processedHtml => {
          renderedHtml = processedHtml;
        });
      }
    } else {
      renderedHtml = '';
    }
  });

  // Get full message text for copying
  let fullMessageText = $derived.by(() => {
    let text = content;
    const thinking = streaming ? streamingThinkingContent : message?.thinkingContent;
    if (thinking) {
      text = `[Thinking]\n${thinking}\n\n${text}`;
    }
    return text;
  });

  // Current thinking content (streaming or final)
  let currentThinkingContent = $derived(streaming ? streamingThinkingContent : message?.thinkingContent);
  
  // Current tool calls (streaming or final)  
  let currentToolCalls = $derived(streaming ? streamingToolCalls : message?.toolCalls);

  async function copyMessage() {
    if (!fullMessageText) return;
    
    try {
      await navigator.clipboard.writeText(fullMessageText);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  }
</script>

<div class="flex {isUser ? 'justify-end' : 'justify-start'} animate-slide-in-up mb-3 md:mb-4 px-2 md:px-0">
  <!-- Avatar -->
  {#if !isUser}
    <div class="flex-shrink-0 mr-2.5 mt-5 hidden md:block">
      <img
        src="/images/ranaye-avatar.png"
        alt="Ranaye"
        class="w-8 h-8 rounded-full object-cover border border-accent-purple/30 shadow-[0_0_8px_rgba(124,77,255,0.2)]"
        onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  {/if}

  <div 
    class="max-w-[90%] md:max-w-[80%] {isUser ? 'ml-8 md:ml-12' : ''} group"
    onmouseenter={() => showCopyButton = true}
    onmouseleave={() => { showCopyButton = false; }}
    role="article"
  >
    <!-- Role label with copy button -->
    <div class="flex items-center gap-2 mb-1 {isUser ? 'justify-end' : ''}">
      {#if !isUser}
        <span class="text-xs font-medium text-accent-purple">Ranaye</span>
      {:else}
        <span class="text-xs font-medium text-accent-cyan">{userDisplayName || 'You'}</span>
      {/if}
      {#if channelBadge}
        <span
          class="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none"
          style="color: {channelBadge.color}; background: {channelBadge.bg}; border: 1px solid {channelBadge.color}33;"
        >{channelBadge.label}</span>
      {/if}
      {#if relativeTime}
        <span class="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none" title={timestamp?.toLocaleString()}>
          {relativeTime}
        </span>
      {/if}
      {#if message?.isAborted}
        <span class="text-xs text-amber-400 font-medium">⚡ Aborted</span>
      {/if}
      {#if message?.isError}
        <span class="text-xs text-red-400 font-medium">✕ Error</span>
      {/if}
      
      <!-- Copy button with success feedback -->
      <button
        onclick={copyMessage}
        class="text-xs p-1.5 md:p-1 rounded-md transition-all duration-200
               min-h-6 min-w-6 flex items-center justify-center
               {copySuccess 
                 ? 'text-accent-green opacity-100' 
                 : 'text-text-muted hover:text-accent-cyan opacity-0 group-hover:opacity-100'}
               {!fullMessageText ? 'hidden' : ''}"
        aria-label={copySuccess ? 'Copied!' : 'Copy message'}
        title={copySuccess ? 'Copied!' : 'Copy message'}
      >
        {#if copySuccess}
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
        {:else}
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        {/if}
      </button>
    </div>

    <!-- Thinking block (for assistant messages) -->
    {#if !isUser && currentThinkingContent}
      <ThinkingBlock thinkingContent={currentThinkingContent} isStreaming={streaming} />
    {/if}

    <!-- Message content — hide empty text bubble when only images present -->
    {#if content || message?.images?.length || inlineImages.length > 0 || streaming}
    <div
      class="rounded-2xl px-2.5 py-2.5 md:px-4 md:py-3 {isUser
        ? 'bg-accent-cyan/10 border border-accent-cyan/20'
        : 'glass'
      } {streaming ? 'border-accent-purple/30' : ''}"
    >
      <!-- Attached images (from user uploads or history) -->
      {#if message?.images?.length}
        <div class="flex flex-wrap gap-2 {content ? 'mb-2' : ''}">
          {#each message.images as img, idx}
            <button
              onclick={() => openLightbox(img.dataUrl, `Attachment ${idx + 1}`)}
              class="block cursor-pointer bg-transparent border-0 p-0"
              aria-label="View attachment {idx + 1} fullscreen"
            >
              <img
                src={img.dataUrl}
                alt="Attachment {idx + 1}"
                class="max-w-[200px] md:max-w-xs max-h-48 md:max-h-64 rounded-lg border border-border-default hover:border-accent-cyan/50 transition-colors cursor-pointer object-contain"
                loading="lazy"
              />
            </button>
          {/each}
        </div>
      {/if}

      {#if content}
        <div class="markdown-content text-sm">
          {@html renderedHtml}
        </div>
      {/if}

      <!-- Inline image display (from markdown URLs) -->
      {#if inlineImages.length > 0}
        <div class="mt-2 flex flex-wrap gap-2">
          {#each inlineImages as img}
            <button
              onclick={() => openLightbox(img.url, img.alt)}
              class="block cursor-pointer bg-transparent border-0 p-0"
              aria-label="View image fullscreen"
            >
              <img 
                src={img.url} 
                alt={img.alt} 
                class="max-w-[200px] md:max-w-sm max-h-48 md:max-h-64 rounded-lg border border-border-default hover:border-accent-cyan/50 transition-colors cursor-pointer object-contain"
                loading="lazy"
                onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </button>
          {/each}
        </div>
      {/if}

      {#if streaming && !content && !currentThinkingContent && !currentToolCalls?.length}
        <!-- Typing indicator -->
        <div class="flex items-center gap-2 py-1">
          <div class="flex items-center gap-1">
            <span class="typing-dot"></span>
            <span class="typing-dot" style="animation-delay: 0.15s"></span>
            <span class="typing-dot" style="animation-delay: 0.3s"></span>
          </div>
          <span class="text-xs text-text-muted">Thinking...</span>
        </div>
      {/if}

      {#if streaming && content}
        <!-- Streaming cursor -->
        <span class="inline-block w-0.5 h-4 bg-accent-cyan ml-0.5 animate-pulse align-middle"></span>
      {/if}
    </div>
    {/if}

    <!-- Tool calls with enhanced visualization -->
    {#if currentToolCalls?.length}
      {#each currentToolCalls as toolCall}
        {@const toolResult = message?.toolResults?.find((r: any) => r.toolCallId === toolCall.id)}
        <ToolCallCard {toolCall} {toolResult} isExecuting={streaming && !toolResult} isHistorical={message?.isHistorical ?? false} />
      {/each}
    {/if}
  </div>

  <!-- User avatar (right side) -->
  {#if isUser}
    <div class="flex-shrink-0 ml-2.5 mt-5 hidden md:block">
      {#if userAvatarUrl}
        <img
          src={userAvatarUrl}
          alt="You"
          class="w-8 h-8 rounded-full object-cover border border-accent-cyan/30 shadow-[0_0_8px_rgba(0,229,255,0.15)]"
        />
      {:else}
        <div class="w-8 h-8 rounded-full bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.15)]">
          <svg class="w-4 h-4 text-accent-cyan" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- Image lightbox overlay -->
<ImageLightbox src={lightboxSrc} alt={lightboxAlt} open={lightboxOpen} onclose={closeLightbox} />

<style>
  .typing-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent-purple);
    animation: typingBounce 1.2s ease-in-out infinite;
  }

  @keyframes typingBounce {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-6px);
      opacity: 1;
    }
  }
</style>
