<script lang="ts">
  let { 
    toolCall, 
    toolResult, 
    isExecuting = false,
    isHistorical = false
  } = $props<{
    toolCall: { id: string; name: string; input?: unknown; arguments?: unknown };
    toolResult?: { toolCallId: string; name?: string; content?: string; isError?: boolean };
    isExecuting?: boolean;
    isHistorical?: boolean;
  }>();

  let showInput = $state(false);
  let showOutput = $state(false);

  // Format JSON for display
  function formatJson(obj: unknown): string {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  }

  // Get status info — using CSS color values for inline styles (Tailwind purge-safe)
  let status = $derived.by(() => {
    if (isExecuting) return { text: 'Running', cssColor: 'var(--color-accent-cyan)', icon: '⚡', pulse: true };
    if (toolResult?.isError) return { text: 'Error', cssColor: '#f87171', icon: '✕', pulse: false };
    if (toolResult) return { text: 'Complete', cssColor: 'var(--color-accent-green, #34d399)', icon: '✓', pulse: false };
    if (isHistorical) return { text: 'Done', cssColor: 'var(--color-accent-green, #34d399)', icon: '✓', pulse: false };
    return { text: 'Pending', cssColor: 'var(--color-text-muted, #888)', icon: '⏳', pulse: false };
  });

  let hasInput = $derived(Boolean(toolCall.input || toolCall.arguments));
  let hasOutput = $derived(Boolean(toolResult?.content));
</script>

<div class="tool-call-card my-3 border border-border-default rounded-lg bg-bg-tertiary overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between p-3 bg-bg-surface/50">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-lg">{status.icon}</span>
        <span class="font-mono font-medium text-sm text-text-primary">{toolCall.name}</span>
      </div>
      
      <div class="flex items-center gap-1">
        <div class="w-2 h-2 rounded-full {status.pulse ? 'animate-pulse' : ''}" style="background-color: {status.cssColor}"></div>
        <span class="text-xs font-medium" style="color: {status.cssColor}">{status.text}</span>
      </div>
    </div>

    <div class="flex items-center gap-2">
      {#if hasInput}
        <button
          onclick={() => showInput = !showInput}
          class="text-xs text-text-muted hover:text-accent-cyan px-2 py-1 rounded
                 bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors"
        >
          Input {showInput ? '▼' : '▶'}
        </button>
      {/if}
      
      {#if hasOutput}
        <button
          onclick={() => showOutput = !showOutput}
          class="text-xs text-text-muted hover:text-accent-cyan px-2 py-1 rounded
                 bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors"
        >
          Output {showOutput ? '▼' : '▶'}
        </button>
      {/if}
    </div>
  </div>

  <!-- Input Section -->
  {#if showInput && hasInput}
    <div class="border-t border-border-default bg-bg-primary/30">
      <div class="p-3">
        <h4 class="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">Input Parameters</h4>
        <pre class="text-xs text-text-primary bg-bg-input border border-border-default rounded p-3 
                   overflow-x-auto font-mono">{formatJson(toolCall.input || toolCall.arguments)}</pre>
      </div>
    </div>
  {/if}

  <!-- Output Section -->
  {#if showOutput && hasOutput}
    <div class="border-t border-border-default {toolResult?.isError ? 'bg-red-950/20' : 'bg-bg-primary/30'}">
      <div class="p-3">
        <h4 class="text-xs font-medium text-text-secondary mb-2 uppercase tracking-wider">
          {toolResult?.isError ? 'Error Output' : 'Result'}
        </h4>
        <pre class="text-xs {toolResult?.isError ? 'text-red-300' : 'text-text-primary'} 
                   bg-bg-input border border-border-default rounded p-3 overflow-x-auto font-mono 
                   whitespace-pre-wrap max-h-96">{toolResult?.content}</pre>
      </div>
    </div>
  {/if}

  <!-- Executing Animation -->
  {#if isExecuting}
    <div class="border-t border-border-default bg-accent-cyan/5">
      <div class="p-3 flex items-center gap-3">
        <div class="flex items-center gap-1">
          <div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0s"></div>
          <div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0.2s"></div>
          <div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0.4s"></div>
        </div>
        <span class="text-xs text-accent-cyan font-medium">Executing...</span>
      </div>
    </div>
  {/if}
</div>