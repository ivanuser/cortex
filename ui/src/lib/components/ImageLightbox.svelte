<script lang="ts">
  import { browser } from '$app/environment';

  let { src = '', alt = '', open = false, onclose } = $props<{
    src?: string;
    alt?: string;
    open?: boolean;
    onclose?: () => void;
  }>();

  function handleClose() {
    onclose?.();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    // Only close when clicking the backdrop itself, not the image
    if (e.target === e.currentTarget) handleClose();
  }
</script>

{#if open && browser}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Image preview"
  >
    <!-- Close button -->
    <button
      onclick={handleClose}
      class="absolute top-4 right-4 z-10 p-2 rounded-full glass-strong text-text-muted hover:text-accent-cyan transition-colors"
      aria-label="Close lightbox"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>

    <!-- Image -->
    <img
      src={src}
      alt={alt}
      class="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
      draggable="false"
    />
  </div>
{/if}
