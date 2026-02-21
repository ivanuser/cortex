<script lang="ts">
  let { thinkingContent, isStreaming = false } = $props<{
    thinkingContent: string;
    isStreaming?: boolean;
  }>();

  let isExpanded = $state(false);
</script>

<div class="thinking-block my-2">
  <button
    onclick={() => isExpanded = !isExpanded}
    class="flex items-center gap-2 text-xs text-accent-purple hover:text-accent-purple/80 
           bg-accent-purple/5 hover:bg-accent-purple/10 border border-accent-purple/20 
           rounded-lg px-3 py-2 transition-all duration-200 w-full text-left"
    style="box-shadow: 0 0 8px rgba(124, 77, 255, 0.1)"
  >
    <!-- Expand/collapse icon -->
    <svg 
      class="w-3 h-3 transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}"
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
    </svg>

    <!-- Thinking label with animation -->
    <span class="font-medium">
      {#if isStreaming}
        <span class="thinking-dots">Thinking</span>
      {:else}
        Thinking
      {/if}
    </span>

    {#if !isExpanded}
      <span class="text-text-muted">({thinkingContent.length} chars)</span>
    {/if}
  </button>

  {#if isExpanded}
    <div 
      class="mt-2 text-xs text-text-secondary bg-accent-purple/3 border border-accent-purple/10 
             rounded-lg p-3 whitespace-pre-wrap animate-fade-in"
      style="font-family: var(--font-mono); line-height: 1.4"
    >
      {thinkingContent}
    </div>
  {/if}
</div>

<style>
  .thinking-dots::after {
    content: '';
    animation: thinking-dots 1.5s steps(4, end) infinite;
  }

  @keyframes thinking-dots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
  }
</style>