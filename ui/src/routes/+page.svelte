<script lang="ts">
  import SessionSidebar from '$lib/components/SessionSidebar.svelte';
  import MessageList from '$lib/components/MessageList.svelte';
  import ChatInput from '$lib/components/ChatInput.svelte';
  import ErrorBoundary from '$lib/components/ErrorBoundary.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';
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

  let streamingHasCompaction = $derived(
    msgs.streamingContent.toLowerCase().includes('compacting') ||
    msgs.streamingContent.toLowerCase().includes('context compaction')
  );

  let showCompacting = $derived(isCompacting || streamingHasCompaction);

  let activeSession = $derived(sessions.list.find((s: any) => s.key === sessions.activeKey));
  let messageCount = $derived(activeSession?.messageCount ?? msgs.list.length);

  function closeMobileSidebar() {
    sidebarMobileOpen = false;
  }

  function handleMobileSessionSelect(key: string) {
    sessions.setActiveSession(key);
    sidebarMobileOpen = false;
  }

  function formatThinkingLevel(session: any): string | null {
    const level = session?.thinkingLevel || session?.reasoningLevel;
    if (!level || level === 'off' || level === 'none') return null;
    return level;
  }
</script>

<svelte:head>
  <title>Chat — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="chat-wrapper">
  <!-- Mobile backdrop -->
  {#if sidebarMobileOpen}
    <div 
      class="mobile-backdrop"
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
  <main class="chat-main">
    <!-- Top bar -->
    <header class="chat-header">
      <!-- Mobile hamburger -->
      <button
        onclick={() => sidebarMobileOpen = true}
        class="chat-hamburger md:hidden"
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
          class="chat-sidebar-toggle hidden md:block"
          aria-label="Open sidebar"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      {/if}

      <div class="chat-header-info">
        {#if sessions.activeKey}
          {#each sessions.list.filter((s: any) => s.key === sessions.activeKey) as session}
            <div class="chat-session-row">
              <h2 class="chat-session-title">
                {sessions.getSessionTitle(session)}
              </h2>
              {#if messageCount > 0}
                <span class="chat-msg-badge">
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  {messageCount}
                </span>
              {/if}
            </div>
            <div class="chat-meta-row">
              {#if session.model}
                <span class="chat-model-tag">{session.model}</span>
              {/if}
              {#if formatThinkingLevel(session)}
                <span class="chat-thinking-tag">
                  🧠 {formatThinkingLevel(session)}
                </span>
              {/if}
            </div>
          {/each}
          {#if !sessions.list.find((s: any) => s.key === sessions.activeKey)}
            <h2 class="chat-session-title">{sessions.activeKey}</h2>
          {/if}
        {:else}
          <h2 class="chat-session-title" style="opacity:0.5">// NO SESSION SELECTED</h2>
        {/if}
      </div>

      <div class="chat-status" role="status" aria-live="polite">
        {#if conn.state.status === 'connected'}
          <span class="chat-dot chat-dot-on" aria-hidden="true"></span>
          <span class="sr-only">Connected</span>
        {:else if conn.state.status === 'connecting' || conn.state.status === 'authenticating'}
          <span class="chat-dot chat-dot-connecting" aria-hidden="true"></span>
          <span class="sr-only">{conn.state.status}</span>
        {:else}
          <span class="chat-dot chat-dot-off" aria-hidden="true"></span>
          <span class="sr-only">Disconnected</span>
        {/if}
      </div>
    </header>

    <!-- Compaction indicator -->
    {#if showCompacting}
      <div class="chat-compaction">
        <svg class="w-3.5 h-3.5 animate-spin" style="color: var(--color-accent-purple, #7c4dff)" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="chat-compaction-text">CONTEXT COMPACTING…</span>
      </div>
    {/if}

    <ErrorBoundary>
      <MessageList />
    </ErrorBoundary>

    <ChatInput />
  </main>
</div>

<style>
  /* ═══ CHAT WRAPPER ═══ */
  .chat-wrapper {
    position: relative;
    z-index: 10;
    display: flex;
    height: 100%;
    font-family: 'Share Tech Mono', monospace;
  }

  .mobile-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 40;
  }

  /* ═══ MAIN AREA ═══ */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* ═══ HEADER ═══ */
  .chat-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, var(--color-bg-secondary, #151d30));
    flex-shrink: 0;
  }

  .chat-hamburger,
  .chat-sidebar-toggle {
    padding: 8px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .chat-hamburger:hover,
  .chat-sidebar-toggle:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    color: var(--color-accent-cyan);
  }

  .chat-header-info {
    flex: 1;
    min-width: 0;
  }

  .chat-session-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chat-session-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .chat-msg-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.65rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    line-height: 1;
  }

  .chat-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .chat-model-tag {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    letter-spacing: 0.05em;
  }

  .chat-thinking-tag {
    font-size: 0.6rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--color-accent-purple, #7c4dff) 10%, transparent);
    color: var(--color-accent-purple, #7c4dff);
    border: 1px solid color-mix(in srgb, var(--color-accent-purple, #7c4dff) 20%, transparent);
    line-height: 1;
    font-weight: 600;
  }

  /* ═══ STATUS DOT ═══ */
  .chat-status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .chat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .chat-dot-on {
    background: var(--color-accent-green, #00ff88);
    box-shadow: 0 0 8px var(--color-accent-green, #00ff88);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  .chat-dot-connecting {
    background: var(--color-accent-amber, #ffb300);
    animation: pulse-dot 1s ease-in-out infinite;
  }

  .chat-dot-off {
    background: #ff3864;
    box-shadow: 0 0 6px rgba(255, 56, 100, 0.4);
  }

  /* ═══ COMPACTION BAR ═══ */
  .chat-compaction {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: color-mix(in srgb, var(--color-accent-purple, #7c4dff) 5%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-purple, #7c4dff) 15%, transparent);
  }

  .chat-compaction-text {
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-purple, #7c4dff);
    font-weight: 600;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
