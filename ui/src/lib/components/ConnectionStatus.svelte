<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { gateway } from '$lib/gateway';

  const conn = getConnection();
  const toasts = getToasts();

  const statusConfig: Record<string, { color: string; pulse: boolean; label: string }> = {
    disconnected: { color: 'bg-red-500', pulse: false, label: 'Disconnected' },
    connecting: { color: 'bg-amber-500', pulse: true, label: 'Connecting...' },
    authenticating: { color: 'bg-amber-500', pulse: true, label: 'Authenticating...' },
    connected: { color: 'bg-accent-green', pulse: false, label: 'Connected' },
    error: { color: 'bg-red-500', pulse: true, label: 'Error' }
  };

  let config = $derived(statusConfig[conn.state.status] ?? statusConfig.disconnected);
  let reconnectAttempts = $state(0);
  let reconnectCountdown = $state(0);
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let uptime = $state<string>('');
  let connectedAt = $state<number>(0);

  // Track connection state changes for reconnection UI
  // IMPORTANT: All reads/writes to local $state must be inside untrack()
  // to prevent Svelte 5 effect_update_depth_exceeded infinite loops.
  // Only conn.state.status should be tracked as a dependency.
  $effect(() => {
    const status = conn.state.status;
    
    untrack(() => {
      if (status === 'connected') {
        const wasReconnecting = reconnectAttempts > 0;
        reconnectAttempts = 0;
        reconnectCountdown = 0;
        connectedAt = Date.now();
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
        if (wasReconnecting) {
          toasts.success('Reconnected', 'Connection restored successfully');
        }
      } else if (status === 'connecting' && reconnectAttempts > 0) {
        startCountdown(5);
      } else if (status === 'error') {
        reconnectAttempts++;
        if (conn.state.error) {
          toasts.error('Connection Error', conn.state.error);
        }
      } else if (status === 'disconnected' && reconnectAttempts === 0) {
        toasts.warning('Disconnected', 'Connection lost, attempting to reconnect...');
        reconnectAttempts = 1;
      }
    });
  });

  // Update uptime display
  $effect(() => {
    if (conn.state.status === 'connected' && connectedAt > 0) {
      const timer = setInterval(() => {
        const elapsed = Date.now() - connectedAt;
        uptime = formatUptime(elapsed);
      }, 1000);
      return () => clearInterval(timer);
    }
  });

  function startCountdown(seconds: number) {
    reconnectCountdown = seconds;
    if (countdownInterval) clearInterval(countdownInterval);
    
    countdownInterval = setInterval(() => {
      reconnectCountdown--;
      if (reconnectCountdown <= 0) {
        clearInterval(countdownInterval!);
        countdownInterval = null;
      }
    }, 1000);
  }

  function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function handleRetryConnection() {
    if (conn.url && conn.token) {
      reconnectAttempts++;
      conn.connect(conn.url, conn.token);
      toasts.info('Retrying', 'Attempting to reconnect...');
    }
  }

  function handleDisconnect() {
    conn.disconnect();
    reconnectAttempts = 0;
    reconnectCountdown = 0;
    uptime = '';
    connectedAt = 0;
    toasts.info('Disconnected', 'Manually disconnected from gateway');
  }
</script>

<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg glass text-xs transition-all duration-300
            {conn.state.status === 'connected' ? 'gradient-bg glow-green' : ''}">
  <!-- Status indicator -->
  <div class="relative flex items-center">
    <span class="block w-2 h-2 rounded-full {config.color} transition-colors duration-300
               {conn.state.status === 'connected' ? 'glow-green' : ''}"></span>
    {#if config.pulse}
      <span class="absolute block w-2 h-2 rounded-full {config.color} animate-ping opacity-75"></span>
    {/if}
  </div>
  
  <!-- Status text -->
  <span class="text-text-secondary transition-colors duration-300
              {conn.state.status === 'connected' ? 'text-accent-green' : ''}">{config.label}</span>

  <!-- Reconnection info -->
  {#if reconnectAttempts > 0 && conn.state.status !== 'connected'}
    <span class="text-text-muted">
      (#{reconnectAttempts}{#if reconnectCountdown > 0}, retry in {reconnectCountdown}s{/if})
    </span>
  {/if}

  <!-- Connected details -->
  {#if conn.state.status === 'connected'}
    <!-- Server version -->
    {#if conn.state.serverVersion}
      <span class="text-text-muted">v{conn.state.serverVersion}</span>
    {/if}
    
    <!-- Connection ID -->
    {#if conn.state.connId}
      <span class="text-text-muted font-mono text-xs">{conn.state.connId.substring(0, 8)}</span>
    {/if}
    
    <!-- Uptime -->
    {#if uptime}
      <span class="text-accent-green text-xs">↑{uptime}</span>
    {/if}

    <!-- Disconnect button -->
    <button
      onclick={handleDisconnect}
      class="ml-2 p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-red transition-colors"
      title="Disconnect"
    >
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  {/if}

  <!-- Error display -->
  {#if conn.state.status === 'error' && conn.state.error}
    <span class="text-red-400 truncate max-w-48" title={conn.state.error}>
      {conn.state.error}
    </span>
  {/if}

  <!-- Retry button for failed connections -->
  {#if (conn.state.status === 'error' || conn.state.status === 'disconnected') && reconnectAttempts > 0}
    <button
      onclick={handleRetryConnection}
      class="ml-2 px-2 py-1 text-xs rounded border border-border-default hover:border-accent-cyan 
             text-text-muted hover:text-accent-cyan transition-colors"
      title="Retry connection"
    >
      Retry
    </button>
  {/if}
</div>
