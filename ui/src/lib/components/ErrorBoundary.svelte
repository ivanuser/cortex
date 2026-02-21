<script lang="ts">
  import { getToasts } from '$lib/stores/toasts.svelte';

  const toasts = getToasts();

  let { 
    children,
    fallback
  } = $props<{
    children: any;
    fallback?: any;
  }>();

  let hasError = $state(false);
  let errorMessage = $state('');

  function handleError(error: Error) {
    hasError = true;
    errorMessage = error.message || 'An unexpected error occurred';
    console.error('ErrorBoundary caught error:', error);
    
    // Show toast notification
    toasts.error(
      'Component Error',
      'A component encountered an error and has been disabled.',
      8000
    );
  }

  function retry() {
    hasError = false;
    errorMessage = '';
  }

  // In Svelte 5, we handle this differently since there's no try/catch block
  // We'll just render the children and catch JavaScript errors globally
  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      handleError(new Error(event.message || 'Runtime error'));
    });
    
    window.addEventListener('unhandledrejection', (event) => {
      handleError(new Error(event.reason?.message || 'Unhandled promise rejection'));
    });
  }
</script>

{#if hasError}
  <div class="flex items-center justify-center p-8">
    {#if fallback}
      {@render fallback({ error: errorMessage, retry })}
    {:else}
      <!-- Default error display -->
      <div class="max-w-md mx-auto text-center">
        <div class="gradient-border glass p-6 rounded-lg glow-red">
          <!-- Error icon -->
          <div class="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-accent-red/20">
            <svg class="w-8 h-8 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          <h2 class="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2>
          <p class="text-sm text-text-secondary mb-4">
            A component encountered an error and cannot be displayed.
          </p>
          
          {#if errorMessage}
            <details class="mb-4 text-left">
              <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary">
                Error details
              </summary>
              <div class="mt-2 p-3 rounded bg-bg-tertiary text-xs font-mono text-text-secondary">
                {errorMessage}
              </div>
            </details>
          {/if}
          
          <button
            onclick={retry}
            class="px-4 py-2 rounded-lg gradient-bg gradient-border glow-cyan text-sm font-medium text-text-primary hover:brightness-110 transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <!-- Just render children normally -->
  {@render children()}
{/if}