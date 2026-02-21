<script lang="ts">
  import { getToasts } from '$lib/stores/toasts.svelte';

  const toasts = getToasts();

  const typeConfig = {
    success: {
      color: 'bg-accent-green border-accent-green',
      glow: 'glow-green',
      icon: 'M5 13l4 4L19 7'
    },
    error: {
      color: 'bg-accent-red border-accent-red',
      glow: 'glow-red',
      icon: 'M6 18L18 6M6 6l12 12'
    },
    warning: {
      color: 'bg-accent-amber border-accent-amber',
      glow: 'glow-amber',
      icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z'
    },
    info: {
      color: 'bg-accent-cyan border-accent-cyan',
      glow: 'glow-cyan',
      icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
    }
  };
</script>

<!-- Toast container positioned bottom-right -->
<div class="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" aria-live="polite" aria-relevant="additions removals">
  {#each toasts.list as toast (toast.id)}
    {@const config = typeConfig[toast.type]}
    <div
      class="gradient-border glass p-4 rounded-lg shadow-lg {config.color} {config.glow} animate-in slide-in-from-right-full duration-300"
      role="alert"
    >
      <div class="flex items-start gap-3">
        <!-- Icon -->
        <div class="flex-shrink-0 w-5 h-5 mt-0.5">
          <svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={config.icon} />
          </svg>
        </div>
        
        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-text-primary">{toast.title}</p>
          {#if toast.message}
            <p class="text-xs text-text-secondary mt-1">{toast.message}</p>
          {/if}
        </div>
        
        <!-- Close button -->
        <button
          onclick={() => toasts.remove(toast.id)}
          class="flex-shrink-0 ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          aria-label="Close notification"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/each}
</div>

<style>
  @keyframes slide-in-from-right-full {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  .animate-in {
    animation-fill-mode: both;
  }
  
  .slide-in-from-right-full {
    animation-name: slide-in-from-right-full;
  }
  
  .duration-300 {
    animation-duration: 300ms;
  }
</style>