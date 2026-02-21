<script lang="ts">
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getMessages } from '$lib/stores/messages.svelte';
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';

  const sessions = getSessions();
  const conn = getConnection();
  const msgs = getMessages();

  let sidebarCollapsed = $state(false);
  let sidebarMobileOpen = $state(false);
  let isCompacting = $state(false);
  let compactingTimeout: ReturnType<typeof setTimeout> | undefined;

  // Listen for compaction events from the gateway
  $effect(() => {
    const unsub = gateway.on('chat', (payload: any) => {
      if (payload.state === 'compacting') {
        isCompacting = true;
        // Auto-clear after 30s in case no follow-up event
        clearTimeout(compactingTimeout);
        compactingTimeout = setTimeout(() => { isCompacting = false; }, 30000);
      } else if (payload.state === 'final' || payload.state === 'error' || payload.state === 'aborted') {
        isCompacting = false;
        clearTimeout(compactingTimeout);
      }
    });

    return () => {
      unsub();
      clearTimeout(compactingTimeout);
    };
  });

  // Also detect compaction from streaming content
  let streamingHasCompaction = $derived(
    msgs.streamingContent.toLowerCase().includes('compacting') ||
    msgs.streamingContent.toLowerCase().includes('context compaction')
  );

  let showCompacting = $derived(isCompacting || streamingHasCompaction);

  // Derive active session info
  let activeSession = $derived(sessions.list.find((s: any) => s.key === sessions.activeKey));
  let messageCount = $derived(activeSession?.messageCount ?? msgs.list.length);

  function closeMobileSidebar() {
    sidebarMobileOpen = false;
  }

  function handleMobileSessionSelect(key: string) {
    sessions.setActiveSession(key);
    sidebarMobileOpen = false;
  }

  // Format thinking/reasoning level for display
  function formatThinkingLevel(session: any): string | null {
    const level = session?.thinkingLevel || session?.reasoningLevel;
    if (!level || level === 'off' || level === 'none') return null;
    return level;
  }
</script>

<svelte:head>
  <title>Chat — Cortex</title>
</svelte:head>

<div class="flex h-full relative">
  <!-- Mobile backdrop -->
  {#if sidebarMobileOpen}
    <div 
      class="fixed inset-0 bg-black/50 z-40 md:hidden"
      onclick={closeMobileSidebar}
      onkeydown={(e) => e.key === 'Escape' && closeMobileSidebar()}
      role="button"
      tabindex="0"
      aria-label="Close sidebar"
    ></div>
  {/if}

  <!-- Session Sidebar -->
  <SessionSidebar 
    bind:collapsed={sidebarCollapsed} 
    bind:mobileOpen={sidebarMobileOpen}
    onMobileSessionSelect={handleMobileSessionSelect}
  />

  <!-- Main chat area -->
  <main class="flex-1 flex flex-col min-w-0">
    <!-- Top bar -->
    <header class="flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 border-b border-border-default bg-bg-secondary/50">
      <!-- Mobile hamburger -->
      <button
        onclick={() => sidebarMobileOpen = true}
        class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors md:hidden min-h-11"
        aria-label="Open sidebar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <!-- Desktop sidebar toggle -->
      {#if sidebarCollapsed}
        <button
          onclick={() => sidebarCollapsed = false}
          class="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors hidden md:block"
          aria-label="Open sidebar"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      {/if}

      <div class="flex-1 min-w-0">
        {#if sessions.activeKey}
          {#each sessions.list.filter((s: any) => s.key === sessions.activeKey) as session}
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-sm font-medium text-text-primary truncate">
                {sessions.getSessionTitle(session)}
              </h2>
              <!-- Message count badge -->
              {#if messageCount > 0}
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 leading-none">
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {messageCount}
                </span>
              {/if}
            </div>
            <!-- Session metadata line -->
            <div class="flex items-center gap-2 flex-wrap mt-0.5">
              {#if session.model}
                <span class="text-[11px] text-text-muted font-mono">{session.model}</span>
              {/if}
              {#if formatThinkingLevel(session)}
                <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple border border-accent-purple/20 leading-none font-medium">
                  🧠 {formatThinkingLevel(session)}
                </span>
              {/if}
            </div>
          {/each}
          {#if !sessions.list.find((s: any) => s.key === sessions.activeKey)}
            <h2 class="text-sm font-medium text-text-primary truncate">{sessions.activeKey}</h2>
          {/if}
        {:else}
          <h2 class="text-sm text-text-muted">No session selected</h2>
        {/if}
      </div>

      <div class="flex items-center gap-2" role="status" aria-live="polite">
        {#if conn.state.status === 'connected'}
          <span class="w-2 h-2 rounded-full bg-accent-green" aria-hidden="true"></span>
          <span class="sr-only">Connected</span>
        {:else if conn.state.status === 'connecting' || conn.state.status === 'authenticating'}
          <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true"></span>
          <span class="sr-only">{conn.state.status}</span>
        {:else}
          <span class="w-2 h-2 rounded-full bg-red-500" aria-hidden="true"></span>
          <span class="sr-only">Disconnected</span>
        {/if}
      </div>
    </header>

    <!-- Compaction indicator -->
    {#if showCompacting}
      <div class="flex items-center gap-2 px-4 py-1.5 bg-accent-purple/5 border-b border-accent-purple/15 animate-fade-in">
        <svg class="w-3.5 h-3.5 text-accent-purple animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-xs text-accent-purple font-medium">Context compacting…</span>
      </div>
    {/if}

    <ErrorBoundary>
      <MessageList />
    </ErrorBoundary>

    <ChatInput />
  </main>
</div>
