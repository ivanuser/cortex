<script lang="ts">
  let { show = $bindable(false) } = $props<{ show?: boolean }>();

  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';

  const shortcuts: { keys: string[]; desc: string }[] = [
    { keys: [mod, 'K'], desc: 'Focus chat input' },
    { keys: [mod, '/'], desc: 'Toggle this help' },
    { keys: [mod, ','], desc: 'Open Settings' },
    { keys: [mod, '1–9'], desc: 'Navigate to page by order' },
    { keys: ['Esc'], desc: 'Close modal / deselect' }
  ];

  const pageMap = [
    'Chat', 'Overview', 'Channels', 'Instances', 'Sessions',
    'Usage', 'Cron Jobs', 'Approvals', 'Agents'
  ];

  function onBackdrop() {
    show = false;
  }
</script>

{#if show}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    onkeydown={(e) => { if (e.key === 'Escape') show = false; }}
    onclick={onBackdrop}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="relative w-full max-w-md mx-4 rounded-xl border border-accent-cyan/30 bg-bg-surface/95 backdrop-blur-md shadow-[0_0_30px_rgba(124,77,255,0.15)] overflow-hidden"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border-default">
        <h2 class="text-base font-semibold text-text-primary tracking-wide flex items-center gap-2">
          <svg class="w-4 h-4 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Keyboard Shortcuts
        </h2>
        <button
          onclick={() => show = false}
          class="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Shortcuts list -->
      <div class="px-5 py-4 space-y-2.5">
        {#each shortcuts as s}
          <div class="flex items-center justify-between py-1">
            <span class="text-sm text-text-secondary">{s.desc}</span>
            <div class="flex items-center gap-1">
              {#each s.keys as key}
                <kbd class="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-border-default bg-bg-primary/80 text-[11px] font-mono font-medium text-accent-cyan shadow-[0_1px_0_1px_rgba(30,41,59,0.5)]">
                  {key}
                </kbd>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      <!-- Page numbers reference -->
      <div class="px-5 pb-4">
        <div class="rounded-lg border border-border-default/50 bg-bg-primary/40 p-3">
          <div class="text-[10px] uppercase tracking-widest text-text-muted/60 mb-2 font-semibold">Page Numbers</div>
          <div class="grid grid-cols-3 gap-x-3 gap-y-1">
            {#each pageMap as name, i}
              <div class="flex items-center gap-1.5 text-xs">
                <kbd class="inline-flex items-center justify-center w-5 h-5 rounded border border-border-default bg-bg-primary/80 text-[10px] font-mono text-accent-cyan">
                  {i + 1}
                </kbd>
                <span class="text-text-muted truncate">{name}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
