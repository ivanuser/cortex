<script lang="ts">
  import { getMessages, type ImageAttachment } from '$lib/stores/messages.svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { browser } from '$app/environment';

  const msgs = getMessages();
  const conn = getConnection();

  let inputText = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let fileInputEl: HTMLInputElement | undefined = $state();
  let attachments = $state<ImageAttachment[]>([]);
  let dragOver = $state(false);

  // Auto-focus on mount and when connection becomes connected
  $effect(() => {
    if (conn.state.status === 'connected' && textareaEl) {
      textareaEl.focus();
    }
  });

  // Listen for quick action prefill events from MessageList
  $effect(() => {
    if (!browser) return;
    
    function handlePrefill(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.text && textareaEl) {
        inputText = detail.text;
        textareaEl.focus();
        requestAnimationFrame(() => {
          if (textareaEl) {
            textareaEl.selectionStart = textareaEl.selectionEnd = inputText.length;
            textareaEl.style.height = 'auto';
            textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
          }
        });
      }
    }
    
    document.addEventListener('cortex:prefill', handlePrefill);
    return () => document.removeEventListener('cortex:prefill', handlePrefill);
  });

  // ── Image handling ───────────────────────────

  function processFiles(files: FileList | File[]) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 20 * 1024 * 1024) {
        console.warn('Image too large (>20MB), skipping:', file.name);
        continue;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const dataUrl = reader.result as string;
        attachments = [...attachments, { mimeType: file.type, dataUrl }];
      });
      reader.readAsDataURL(file);
    }
  }

  function handlePaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItems.push(items[i]);
      }
    }
    if (imageItems.length === 0) return;

    e.preventDefault();
    const files: File[] = [];
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    processFiles(files);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragOver = false;
    if (e.dataTransfer?.files) {
      processFiles(e.dataTransfer.files);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    dragOver = true;
  }

  function handleDragLeave() {
    dragOver = false;
  }

  function removeAttachment(index: number) {
    attachments = attachments.filter((_, i) => i !== index);
  }

  function openFilePicker() {
    fileInputEl?.click();
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      processFiles(input.files);
      input.value = ''; // reset so same file can be picked again
    }
  }

  // ── Send ─────────────────────────────────────

  function handleSend() {
    const hasText = inputText.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if ((!hasText && !hasAttachments) || msgs.streaming || conn.state.status !== 'connected') return;

    msgs.sendMessage(inputText, attachments.length > 0 ? [...attachments] : undefined);
    inputText = '';
    attachments = [];
    if (textareaEl) {
      textareaEl.style.height = 'auto';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput() {
    if (textareaEl) {
      textareaEl.style.height = 'auto';
      textareaEl.style.height = Math.min(textareaEl.scrollHeight, 200) + 'px';
    }
  }

  let canSend = $derived(
    (inputText.trim().length > 0 || attachments.length > 0) &&
    !msgs.streaming &&
    conn.state.status === 'connected'
  );
  
  let charCount = $derived(inputText.length);
  let showCharCount = $derived(charCount > 500);
</script>

<div
  class="p-3 md:p-4 border-t border-border-default bg-bg-secondary transition-colors duration-200
         {dragOver ? 'border-accent-cyan/50 bg-accent-cyan/5' : ''}"
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  role="region"
  aria-label="Chat input"
>
  <div class="flex flex-col gap-2 max-w-4xl mx-auto">
    <!-- Streaming status indicator -->
    {#if msgs.streaming}
      <div class="flex items-center gap-2 px-1">
        <div class="flex items-center gap-1">
          <span class="streaming-dot"></span>
          <span class="streaming-dot" style="animation-delay: 0.15s"></span>
          <span class="streaming-dot" style="animation-delay: 0.3s"></span>
        </div>
        <span class="text-xs text-accent-purple font-medium">Assistant is responding...</span>
      </div>
    {/if}

    <!-- Drag overlay hint -->
    {#if dragOver}
      <div class="flex items-center justify-center py-3 px-4 rounded-xl border-2 border-dashed border-accent-cyan/40 bg-accent-cyan/5">
        <span class="text-sm text-accent-cyan font-medium">📎 Drop image here</span>
      </div>
    {/if}

    <!-- Attachment previews -->
    {#if attachments.length > 0}
      <div class="flex flex-wrap gap-2 px-1">
        {#each attachments as att, i}
          <div class="relative group/att">
            <img
              src={att.dataUrl}
              alt="Attachment {i + 1}"
              class="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-border-default"
            />
            <button
              onclick={() => removeAttachment(i)}
              class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white
                     flex items-center justify-center text-xs font-bold
                     opacity-0 group-hover/att:opacity-100 transition-opacity duration-150
                     hover:bg-red-400"
              aria-label="Remove attachment"
            >×</button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Character count -->
    {#if showCharCount}
      <div class="flex justify-end">
        <span class="text-xs text-text-muted font-mono">
          {charCount.toLocaleString()} characters
        </span>
      </div>
    {/if}
    
    <div class="flex items-end gap-2 md:gap-3">
      <!-- Attach button -->
      <button
        onclick={openFilePicker}
        disabled={conn.state.status !== 'connected'}
        class="flex-shrink-0 p-3 md:p-3 rounded-xl transition-all duration-200
               min-h-11 min-w-11 md:min-h-auto md:min-w-auto
               flex items-center justify-center
               {conn.state.status === 'connected'
                 ? 'text-text-muted hover:text-accent-cyan hover:bg-bg-hover'
                 : 'text-text-muted opacity-30 cursor-not-allowed'}"
        aria-label="Attach image"
        title="Attach image (or paste / drag-drop)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
      </button>

      <!-- Hidden file input -->
      <input
        bind:this={fileInputEl}
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        onchange={handleFileSelect}
      />

      <div class="flex-1 relative">
        <textarea
          bind:this={textareaEl}
          bind:value={inputText}
          onkeydown={handleKeydown}
          oninput={handleInput}
          onpaste={handlePaste}
          aria-label="Chat message"
          placeholder={conn.state.status === 'connected'
            ? attachments.length > 0
              ? 'Add a message or paste more images...'
              : 'Message (Shift+Enter for newline, paste images)'
            : 'Connect to gateway first...'}
          disabled={conn.state.status !== 'connected'}
          rows="1"
          class="w-full resize-none rounded-xl px-3 py-4 md:px-4 md:py-3 text-sm
            bg-bg-input border border-border-default
            text-text-primary placeholder:text-text-muted
            focus:outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/20 glow-cyan
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200"
        ></textarea>
      </div>

    {#if msgs.streaming}
      <!-- Stop button -->
      <button
        onclick={() => msgs.abortResponse()}
        class="flex-shrink-0 p-3 md:p-3 rounded-xl bg-red-500/20 border border-red-500/30
          text-red-400 hover:bg-red-500/30 transition-all duration-200
          min-h-11 min-w-11 md:min-h-auto md:min-w-auto
          glow-pink flex items-center justify-center"
        style="box-shadow: 0 0 15px rgba(244, 63, 158, 0.15)"
        aria-label="Stop response"
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    {:else}
      <!-- Send button -->
      <button
        onclick={handleSend}
        disabled={!canSend}
        class="flex-shrink-0 p-3 md:p-3 rounded-xl transition-all duration-200
          min-h-11 min-w-11 md:min-h-auto md:min-w-auto
          flex items-center justify-center
          {canSend
            ? 'bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 hover:scale-105 glow-cyan glow-pulse'
            : 'bg-bg-tertiary border border-border-default text-text-muted cursor-not-allowed opacity-50'
          }"
        aria-label="Send message"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </button>
    {/if}
    </div>
  </div>
</div>

<style>
  .streaming-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-accent-purple);
    animation: streamPulse 1.2s ease-in-out infinite;
  }

  @keyframes streamPulse {
    0%, 60%, 100% {
      transform: scale(0.8);
      opacity: 0.4;
    }
    30% {
      transform: scale(1.2);
      opacity: 1;
    }
  }
</style>
