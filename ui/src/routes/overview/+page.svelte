<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { gateway, type HelloOk } from '$lib/gateway';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const sessions = getSessions();
  const toasts = getToasts();

  // Overview data
  let helloData = $state<HelloOk | null>(null);
  let presenceCount = $state(0);
  let cronStatus = $state<{ enabled: boolean; nextRun: number | null } | null>(null);
  let debugStatus = $state<Record<string, unknown> | null>(null);
  let healthData = $state<Record<string, unknown> | null>(null);
  let modelsCount = $state(0);
  let loading = $state(false);

  // Listen for hello events to capture snapshot
  gateway.on('hello', (payload) => {
    helloData = payload as HelloOk;
    presenceCount = Array.isArray(helloData?.snapshot?.presence) ? helloData.snapshot.presence.length : 0;
  });

  // Load overview data when connected
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadOverview());
    }
  });

  async function loadOverview() {
    if (!gateway.connected || loading) return;
    loading = true;
    try {
      const [status, health, models, cron] = await Promise.all([
        gateway.call<Record<string, unknown>>('status', {}).catch(() => null),
        gateway.call<Record<string, unknown>>('health', {}).catch(() => null),
        gateway.call<{ models?: unknown[] }>('models.list', {}).catch(() => null),
        gateway.call<{ enabled?: boolean; nextRunMs?: number }>('cron.status', {}).catch(() => null),
      ]);
      debugStatus = status;
      healthData = health;
      modelsCount = Array.isArray(models?.models) ? models!.models.length : 0;
      if (cron) {
        cronStatus = { enabled: cron.enabled ?? false, nextRun: cron.nextRunMs ?? null };
      }
    } catch (e) {
      console.error('Failed to load overview:', e);
    } finally {
      loading = false;
    }
  }

  function formatUptime(ms?: number): string {
    if (!ms) return 'n/a';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function formatNextRun(ms: number | null): string {
    if (ms == null) return 'n/a';
    const now = Date.now();
    const diff = ms - now;
    if (diff < 0) return 'overdue';
    if (diff < 60000) return `in ${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
    return `in ${Math.floor(diff / 3600000)}h`;
  }

  // Derived stats
  let uptimeMs = $derived(helloData?.snapshot?.uptimeMs as number | undefined);
  let tickMs = $derived(helloData?.policy?.tickIntervalMs);
  let serverVersion = $derived(helloData?.server?.version ?? conn.state.serverVersion);
  let protocol = $derived(helloData?.protocol ?? conn.state.protocol);
  let authMode = $derived((helloData?.snapshot as any)?.authMode ?? 'unknown');
  let connId = $derived(helloData?.server?.connId ?? conn.state.connId);
</script>

<svelte:head>
  <title>Overview — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    <!-- Page header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">Overview</h1>
        <p class="text-sm text-text-muted mt-1">Gateway status, entry points, and a fast health read.</p>
      </div>
      <button
        onclick={loadOverview}
        disabled={loading || conn.state.status !== 'connected'}
        class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
               text-text-secondary hover:text-accent-cyan transition-all
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {#if loading}
          <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
        Refresh
      </button>
    </div>

    <!-- Status Cards Row -->
    {#if loading && !debugStatus}
      <!-- Loading skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-3 w-16 bg-bg-tertiary rounded mb-3"></div>
            <div class="h-7 w-24 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-32 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Connection Status -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4
                    {conn.state.status === 'connected' ? 'glow-green' : ''}">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Status</div>
          <div class="text-2xl font-bold
                      {conn.state.status === 'connected' ? 'text-accent-green' : 'text-red-400'}">
            {conn.state.status === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
          {#if serverVersion}
            <div class="text-xs text-text-muted mt-1">v{serverVersion} · protocol {protocol ?? '?'}</div>
          {/if}
        </div>

        <!-- Uptime -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Uptime</div>
          <div class="text-2xl font-bold text-accent-cyan">{formatUptime(uptimeMs)}</div>
          <div class="text-xs text-text-muted mt-1">Tick: {tickMs ? `${tickMs}ms` : 'n/a'}</div>
        </div>

        <!-- Sessions -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Sessions</div>
          <div class="text-2xl font-bold text-accent-purple">{sessions.list.length}</div>
          <div class="text-xs text-text-muted mt-1">
            {#if sessions.mainKey}
              Main: {sessions.mainKey.split(':').pop()}
            {:else}
              No main session
            {/if}
          </div>
        </div>

        <!-- Models -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Models</div>
          <div class="text-2xl font-bold text-accent-amber">{modelsCount}</div>
          <div class="text-xs text-text-muted mt-1">Available providers</div>
        </div>
      </div>
    {/if}

    <!-- Second Row: Presence + Cron + Auth -->
    {#if loading && !debugStatus}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {#each Array(3) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="flex items-center justify-between mb-3">
              <div class="h-3 w-20 bg-bg-tertiary rounded"></div>
              <div class="h-5 w-8 bg-bg-tertiary rounded"></div>
            </div>
            <div class="h-3 w-40 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-20 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- Instances / Presence -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Instances</div>
            <span class="text-lg font-bold text-accent-cyan">{presenceCount}</span>
          </div>
          <p class="text-xs text-text-muted">Presence beacons from connected clients and nodes.</p>
          <a href="/instances" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">View all →</a>
        </div>

        <!-- Cron Status -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Cron</div>
            {#if cronStatus}
              <span class="px-2 py-0.5 rounded text-xs font-medium
                          {cronStatus.enabled ? 'bg-accent-green/20 text-accent-green' : 'bg-red-500/20 text-red-400'}">
                {cronStatus.enabled ? 'Enabled' : 'Disabled'}
              </span>
            {:else}
              <span class="text-xs text-text-muted">n/a</span>
            {/if}
          </div>
          <p class="text-xs text-text-muted">
            Next run: {cronStatus ? formatNextRun(cronStatus.nextRun) : 'n/a'}
          </p>
          <a href="/cron" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">Manage jobs →</a>
        </div>

        <!-- Auth Info -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Auth</div>
            <span class="px-2 py-0.5 rounded text-xs font-medium bg-accent-purple/20 text-accent-purple">
              {authMode}
            </span>
        </div>
          {#if connId}
            <p class="text-xs text-text-muted font-mono">ID: {connId.substring(0, 16)}…</p>
          {/if}
          <a href="/settings" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">Configure →</a>
        </div>
      </div>
    {/if}

    <!-- Gateway Details -->
    {#if debugStatus}
      <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
        <h2 class="text-sm font-semibold text-text-primary mb-3">Gateway Snapshot</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          {#each Object.entries(debugStatus).filter(([k]) => typeof debugStatus![k] !== 'object') as [key, value]}
            <div>
              <div class="text-xs text-text-muted">{key}</div>
              <div class="text-sm text-text-secondary font-mono truncate" title={String(value)}>
                {String(value)}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Quick Links -->
    <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
      <h2 class="text-sm font-semibold text-text-primary mb-3">Quick Actions</h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <a href="/" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan
                          text-text-secondary hover:text-accent-cyan transition-all text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          Open Chat
        </a>
        <a href="/nodes" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan
                               text-text-secondary hover:text-accent-cyan transition-all text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Node Fleet
        </a>
        <a href="/debug" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan
                               text-text-secondary hover:text-accent-cyan transition-all text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Debug
        </a>
        <a href="/logs" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan
                              text-text-secondary hover:text-accent-cyan transition-all text-sm">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
          View Logs
        </a>
      </div>
    </div>
  </div>
</div>
