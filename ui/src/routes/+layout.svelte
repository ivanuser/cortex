<script lang="ts">
  import '../app.css';
  import 'katex/dist/katex.min.css';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { getMessages } from '$lib/stores/messages.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { getTheme } from '$lib/stores/theme.svelte';
  import { getNotifications } from '$lib/notifications.svelte';
  import { gateway, type ChatEvent } from '$lib/gateway';
  import { loadConfig } from '$lib/config';
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import AuthDialog from '$lib/components/AuthDialog.svelte';
  import AppNav from '$lib/components/AppNav.svelte';
  import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
  import ShortcutHelp from '$lib/components/ShortcutHelp.svelte';
  import SetupWizard from '$lib/components/SetupWizard.svelte';

  const conn = getConnection();
  const sessions = getSessions();
  const msgs = getMessages();
  const toasts = getToasts();
  const notif = getNotifications();

  // Initialize theme (reads localStorage, applies CSS vars)
  getTheme();

  let { children } = $props();
  let hasLoadedOnConnect = $state(false);
  let showAuthDialog = $state(false);
  let navCollapsed = $state(false);
  let mobileNavOpen = $state(false);
  let showShortcutHelp = $state(false);

  // Load runtime config, then initialize connection
  $effect(() => {
    loadConfig().then(() => {
      conn.init();
    });
  });

  // Register service worker
  $effect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });

  // When connected, fetch sessions and load history
  $effect(() => {
    if (conn.state.status === 'connected' && !hasLoadedOnConnect) {
      hasLoadedOnConnect = true;
      sessions.fetchSessions();

      // Restore last active session, or fall back to main
      const sessionToLoad = sessions.activeKey || conn.state.mainSessionKey;
      if (sessionToLoad) {
        sessions.setActiveSession(sessionToLoad);
        msgs.loadHistory(sessionToLoad);
      }
    }
    // Reset flag on disconnect so we reload on reconnect
    if (conn.state.status === 'disconnected') {
      hasLoadedOnConnect = false;
    }
  });

  // When active session changes from sidebar, reload history
  $effect(() => {
    const key = sessions.activeKey;
    if (key && key !== msgs.activeSessionKey && gateway.connected) {
      msgs.loadHistory(key);
    }
  });

  // Network error handling with toasts
  $effect(() => {
    const status = conn.state.status;
    if (status === 'error' && conn.state.error) {
      toasts.error('Connection Error', conn.state.error, 8000);
    }
  });

  // ─── Browser Notifications ────────────────────

  // Initialize notification manager
  $effect(() => {
    untrack(() => notif.init());
  });

  // Notify on assistant messages when tab is hidden
  $effect(() => {
    const unsub = gateway.on('chat', (payload) => {
      const event = payload as ChatEvent;
      if (event.state !== 'final') return;
      if (!notif.notifyOnMessages) return;

      const msg = event.message;
      if (!msg || msg.role !== 'assistant') return;

      // Extract text content for the notification body
      let body = '';
      if (typeof msg.content === 'string') {
        body = msg.content;
      } else if (Array.isArray(msg.content)) {
        body = (msg.content as Array<Record<string, unknown>>)
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text as string)
          .join(' ');
      }

      if (!body) return;

      // Truncate to ~100 chars
      const truncated = body.length > 100 ? body.slice(0, 100) + '…' : body;
      notif.notify('Cortex — New message', truncated);
    });

    return unsub;
  });

  // Notify on connection lost
  $effect(() => {
    const unsub = conn.onStateChange((state) => {
      if (state.status === 'disconnected' && notif.notifyOnDisconnect) {
        notif.notify('Cortex — Connection lost', 'The gateway connection was lost. Attempting to reconnect…');
      }
    });

    return unsub;
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && mobileNavOpen) mobileNavOpen = false; }} />

<div class="h-screen w-screen overflow-hidden bg-bg-primary flex">
  <!-- Skip to content link -->
  <a href="#main-content" class="skip-to-content">Skip to content</a>

  <!-- Mobile backdrop overlay -->
  {#if mobileNavOpen}
    <div
      class="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
      onclick={() => mobileNavOpen = false}
      onkeydown={(e) => e.key === 'Escape' && (mobileNavOpen = false)}
      role="button"
      tabindex="0"
      aria-label="Close navigation"
    ></div>
  {/if}

  <!-- App Navigation (left sidebar / mobile overlay) -->
  <AppNav
    bind:collapsed={navCollapsed}
    bind:mobileOpen={mobileNavOpen}
    onshortcuthelp={() => showShortcutHelp = true}
    onnavigate={() => mobileNavOpen = false}
  />

  <!-- Main content area -->
  <div id="main-content" class="flex-1 flex flex-col min-w-0 overflow-hidden" role="main">
    <!-- Mobile top bar with hamburger -->
    <header class="flex items-center gap-3 px-3 py-2 border-b border-border-default bg-bg-secondary/50 md:hidden flex-shrink-0">
      <button
        onclick={() => mobileNavOpen = true}
        class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors"
        aria-label="Open navigation menu"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <img src="/logo.png" alt="Cortex" class="w-6 h-6 rounded-lg" />
      <span class="text-sm font-bold gradient-text tracking-wider">CORTEX</span>
    </header>

    {@render children()}
  </div>

  <!-- Toast notifications -->
  <ToastContainer />

  <!-- Auth dialog for first-time setup -->
  <AuthDialog bind:show={showAuthDialog} />

  <!-- Keyboard shortcuts -->
  <KeyboardShortcuts bind:showHelp={showShortcutHelp} />
  <ShortcutHelp bind:show={showShortcutHelp} />
  <SetupWizard />
</div>
