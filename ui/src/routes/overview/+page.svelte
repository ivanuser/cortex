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
  let presenceList = $state<Array<Record<string, unknown>>>([]);
  let cronStatus = $state<{ enabled: boolean; nextRun: number | null; jobCount?: number } | null>(null);
  let cronJobs = $state<Array<Record<string, unknown>>>([]);
  let debugStatus = $state<Record<string, unknown> | null>(null);
  let healthData = $state<Record<string, unknown> | null>(null);
  let modelsCount = $state(0);
  let modelsList = $state<Array<Record<string, unknown>>>([]);
  let nodesList = $state<Array<Record<string, unknown>>>([]);
  let auditRecent = $state<Array<Record<string, unknown>>>([]);
  let channelStatus = $state<Array<{ name: string; connected: boolean }>>([]);
  let loading = $state(false);

  // Listen for hello events to capture snapshot
  gateway.on('hello', (payload) => {
    helloData = payload as HelloOk;
    const snap = helloData?.snapshot;
    presenceList = Array.isArray(snap?.presence) ? snap!.presence as Array<Record<string, unknown>> : [];
    presenceCount = presenceList.length;
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
      const [status, health, models, cron, cronList, nodes, audit] = await Promise.all([
        gateway.call<Record<string, unknown>>('status', {}).catch(() => null),
        gateway.call<Record<string, unknown>>('health', {}).catch(() => null),
        gateway.call<{ models?: Array<Record<string, unknown>> }>('models.list', {}).catch(() => null),
        gateway.call<{ enabled?: boolean; nextRunMs?: number; jobCount?: number }>('cron.status', {}).catch(() => null),
        gateway.call<{ jobs?: Array<Record<string, unknown>> }>('cron.list', {}).catch(() => null),
        gateway.call<{ nodes?: Array<Record<string, unknown>> }>('node.list', {}).catch(() => null),
        gateway.call<{ entries?: Array<Record<string, unknown>> }>('audit.query', { limit: 8 }).catch(() => null),
      ]);
      debugStatus = status;
      healthData = health;
      modelsList = Array.isArray(models?.models) ? models!.models : [];
      modelsCount = modelsList.length;
      cronJobs = Array.isArray(cronList?.jobs) ? cronList!.jobs : [];
      if (cron) {
        cronStatus = { enabled: cron.enabled ?? false, nextRun: cron.nextRunMs ?? null, jobCount: cron.jobCount };
      }
      nodesList = Array.isArray(nodes?.nodes) ? nodes!.nodes : [];
      auditRecent = Array.isArray(audit?.entries) ? audit!.entries : [];

      // Derive channel status from health data
      if (health && typeof health === 'object') {
        const channels: Array<{ name: string; connected: boolean }> = [];
        const ch = (health as any).channels;
        if (ch && typeof ch === 'object') {
          for (const [name, info] of Object.entries(ch)) {
            channels.push({ name, connected: !!(info as any)?.connected });
          }
        }
        channelStatus = channels;
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

  function formatTimeAgo(ts: string | number): string {
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
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

  function resultColor(result: string): string {
    if (result === 'success') return 'text-accent-green';
    if (result === 'denied') return 'text-amber-400';
    return 'text-red-400';
  }

  function resultDot(result: string): string {
    if (result === 'success') return 'bg-accent-green';
    if (result === 'denied') return 'bg-amber-400';
    return 'bg-red-400';
  }

  // Derived stats
  let uptimeMs = $derived(helloData?.snapshot?.uptimeMs as number | undefined);
  let serverVersion = $derived(helloData?.server?.version ?? conn.state.serverVersion);
  let protocol = $derived(helloData?.protocol ?? conn.state.protocol);
  let connectedNodes = $derived(nodesList.filter(n => (n as any).connected));
  let activeSessions = $derived(sessions.list.filter(s => s.kind !== 'isolated'));
</script>

<svelte:head>
  <title>Overview — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-7xl mx-auto p-4 md:p-6 space-y-5">

    <!-- Hero Header -->
    <div class="relative rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-secondary/80 to-accent-cyan/5 p-6 overflow-hidden">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(0,200,255,0.06),transparent_60%)]"></div>
      <div class="relative flex items-center justify-between flex-wrap gap-4">
        <div class="flex items-center gap-4">
          <div class="relative">
            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-cyan/20 to-accent-purple/20 border border-accent-cyan/30 flex items-center justify-center text-2xl">
              ⚡
            </div>
            <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-bg-secondary
                        {conn.state.status === 'connected' ? 'bg-accent-green animate-pulse' : 'bg-red-400'}"></div>
          </div>
          <div>
            <h1 class="text-2xl font-bold text-text-primary tracking-tight">Cortex Gateway</h1>
            <div class="flex items-center gap-3 mt-1">
              {#if serverVersion}
                <span class="text-xs font-mono px-2 py-0.5 rounded-full bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">v{serverVersion}</span>
              {/if}
              <span class="text-xs text-text-muted">
                {conn.state.status === 'connected' ? `Up ${formatUptime(uptimeMs)}` : 'Disconnected'}
              </span>
              {#if protocol}
                <span class="text-xs text-text-muted">Proto {protocol}</span>
              {/if}
            </div>
          </div>
        </div>
        <button
          onclick={loadOverview}
          disabled={loading || conn.state.status !== 'connected'}
          class="px-4 py-2 rounded-xl text-sm font-medium border border-border-default hover:border-accent-cyan
                 bg-bg-primary/50 text-text-secondary hover:text-accent-cyan transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
        >
          {#if loading}
            <svg class="w-4 h-4 animate-spin inline mr-1.5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          Refresh
        </button>
      </div>
    </div>

    <!-- Metric Cards -->
    {#if loading && !debugStatus}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-3 w-16 bg-bg-tertiary rounded mb-3"></div>
            <div class="h-8 w-20 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-24 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <!-- Sessions -->
        <a href="/sessions" class="group rounded-xl border border-border-default bg-bg-secondary/50 p-4 hover:border-accent-purple/50 transition-all">
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Sessions</div>
            <div class="w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center text-accent-purple group-hover:scale-110 transition-transform">
              💬
            </div>
          </div>
          <div class="text-3xl font-bold text-accent-purple">{sessions.list.length}</div>
          <div class="text-xs text-text-muted mt-1">{activeSessions.length} active</div>
        </a>

        <!-- Nodes -->
        <a href="/nodes" class="group rounded-xl border border-border-default bg-bg-secondary/50 p-4 hover:border-accent-green/50 transition-all">
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Nodes</div>
            <div class="w-8 h-8 rounded-lg bg-accent-green/10 flex items-center justify-center text-accent-green group-hover:scale-110 transition-transform">
              🖥️
            </div>
          </div>
          <div class="text-3xl font-bold text-accent-green">{connectedNodes.length}</div>
          <div class="text-xs text-text-muted mt-1">{nodesList.length} registered</div>
        </a>

        <!-- Models -->
        <a href="/settings" class="group rounded-xl border border-border-default bg-bg-secondary/50 p-4 hover:border-accent-amber/50 transition-all">
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Models</div>
            <div class="w-8 h-8 rounded-lg bg-accent-amber/10 flex items-center justify-center text-accent-amber group-hover:scale-110 transition-transform">
              🧠
            </div>
          </div>
          <div class="text-3xl font-bold text-accent-amber">{modelsCount}</div>
          <div class="text-xs text-text-muted mt-1">providers</div>
        </a>

        <!-- Cron -->
        <a href="/cron" class="group rounded-xl border border-border-default bg-bg-secondary/50 p-4 hover:border-accent-cyan/50 transition-all">
          <div class="flex items-center justify-between mb-1">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">Cron</div>
            <div class="w-8 h-8 rounded-lg bg-accent-cyan/10 flex items-center justify-center text-accent-cyan group-hover:scale-110 transition-transform">
              ⏱️
            </div>
          </div>
          <div class="text-3xl font-bold text-accent-cyan">{cronJobs.length}</div>
          <div class="text-xs text-text-muted mt-1">
            {cronStatus?.enabled ? `Next: ${formatNextRun(cronStatus.nextRun)}` : 'disabled'}
          </div>
        </a>
      </div>
    {/if}

    <!-- Two-column layout: Activity Feed + Sidebar -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">

      <!-- Left: Activity Feed (2 cols) -->
      <div class="lg:col-span-2 space-y-5">

        <!-- Recent Audit Activity -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-border-default/50">
            <h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse"></span>
              Recent Activity
            </h2>
            <a href="/audit" class="text-xs text-accent-cyan hover:underline">View all →</a>
          </div>
          {#if auditRecent.length > 0}
            <div class="divide-y divide-border-default/30">
              {#each auditRecent as entry}
                <div class="px-4 py-2.5 flex items-center gap-3 hover:bg-bg-hover/30 transition-colors">
                  <div class="w-2 h-2 rounded-full flex-shrink-0 {resultDot(String(entry.result))}"></div>
                  <div class="flex-1 min-w-0">
                    <span class="text-xs font-mono text-accent-cyan">{entry.action}</span>
                    {#if entry.actor_id}
                      <span class="text-xs text-text-muted ml-2">by {entry.actor_id}</span>
                    {/if}
                  </div>
                  <span class="text-[10px] {resultColor(String(entry.result))} font-semibold uppercase">{entry.result}</span>
                  <span class="text-[10px] text-text-muted whitespace-nowrap">{formatTimeAgo(String(entry.timestamp))}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="px-4 py-8 text-center text-text-muted text-sm">No recent activity</div>
          {/if}
        </div>

        <!-- Connected Nodes -->
        {#if nodesList.length > 0}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-border-default/50">
              <h2 class="text-sm font-semibold text-text-primary">Node Fleet</h2>
              <a href="/nodes" class="text-xs text-accent-cyan hover:underline">Manage →</a>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y sm:divide-y-0 divide-border-default/30">
              {#each nodesList as node}
                {@const isConnected = !!(node as any).connected}
                {@const displayName = (node as any).displayName || (node as any).name || 'Unknown'}
                {@const platform = (node as any).platform || (node as any).os || ''}
                {@const caps = Array.isArray((node as any).capabilities) ? (node as any).capabilities : []}
                <div class="px-4 py-3 flex items-center gap-3 {isConnected ? '' : 'opacity-50'}">
                  <div class="relative flex-shrink-0">
                    <div class="w-10 h-10 rounded-xl bg-bg-primary border border-border-default flex items-center justify-center text-lg">
                      {platform.includes('windows') || platform.includes('win') ? '🪟' : platform.includes('linux') ? '🐧' : platform.includes('mac') || platform.includes('darwin') ? '🍎' : '🖥️'}
                    </div>
                    <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary
                                {isConnected ? 'bg-accent-green' : 'bg-text-muted'}"></div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-text-primary truncate">{displayName}</div>
                    <div class="flex items-center gap-1.5 mt-0.5">
                      {#if platform}
                        <span class="text-[10px] text-text-muted">{platform}</span>
                      {/if}
                      {#each caps.slice(0, 4) as cap}
                        <span class="text-[10px] px-1.5 py-0 rounded-full bg-bg-primary border border-border-default text-text-muted">{cap}</span>
                      {/each}
                    </div>
                  </div>
                  <span class="text-[10px] font-medium {isConnected ? 'text-accent-green' : 'text-text-muted'}">
                    {isConnected ? 'online' : 'offline'}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Gateway Snapshot (collapsed) -->
        {#if debugStatus}
          <details class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
            <summary class="px-4 py-3 text-sm font-semibold text-text-primary cursor-pointer hover:bg-bg-hover/30 transition-colors">
              Gateway Internals
            </summary>
            <div class="px-4 py-3 border-t border-border-default/50">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                {#each Object.entries(debugStatus).filter(([k]) => typeof debugStatus![k] !== 'object') as [key, value]}
                  <div>
                    <div class="text-[10px] text-text-muted uppercase tracking-wider">{key}</div>
                    <div class="text-xs text-text-secondary font-mono truncate" title={String(value)}>
                      {String(value)}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          </details>
        {/if}
      </div>

      <!-- Right Sidebar -->
      <div class="space-y-5">

        <!-- Health Status -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <h2 class="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
            System Health
            {#if conn.state.status === 'connected'}
              <span class="w-2 h-2 rounded-full bg-accent-green"></span>
            {:else}
              <span class="w-2 h-2 rounded-full bg-red-400"></span>
            {/if}
          </h2>
          <div class="space-y-2.5">
            <!-- Gateway -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-secondary">Gateway</span>
              <span class="text-xs font-medium {conn.state.status === 'connected' ? 'text-accent-green' : 'text-red-400'}">
                {conn.state.status === 'connected' ? '● Healthy' : '● Down'}
              </span>
            </div>
            <!-- WebSocket -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-secondary">WebSocket</span>
              <span class="text-xs font-medium {conn.state.status === 'connected' ? 'text-accent-green' : 'text-text-muted'}">
                {conn.state.status === 'connected' ? '● Connected' : '● Closed'}
              </span>
            </div>
            <!-- Cron -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-secondary">Scheduler</span>
              <span class="text-xs font-medium {cronStatus?.enabled ? 'text-accent-green' : 'text-text-muted'}">
                {cronStatus?.enabled ? '● Running' : '● Stopped'}
              </span>
            </div>
            <!-- Presence -->
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-secondary">Clients</span>
              <span class="text-xs font-medium text-accent-cyan">{presenceCount} connected</span>
            </div>
          </div>
        </div>

        <!-- Channels -->
        {#if channelStatus.length > 0}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
            <h2 class="text-sm font-semibold text-text-primary mb-3">Channels</h2>
            <div class="space-y-2">
              {#each channelStatus as ch}
                <div class="flex items-center justify-between">
                  <span class="text-xs text-text-secondary capitalize">{ch.name}</span>
                  <span class="text-xs font-medium {ch.connected ? 'text-accent-green' : 'text-red-400'}">
                    {ch.connected ? '● Online' : '● Offline'}
                  </span>
                </div>
              {/each}
            </div>
            <a href="/channels" class="inline-block mt-3 text-xs text-accent-cyan hover:underline">Configure →</a>
          </div>
        {/if}

        <!-- Cron Jobs -->
        {#if cronJobs.length > 0}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-sm font-semibold text-text-primary">Scheduled Jobs</h2>
              <span class="text-xs text-text-muted">{cronJobs.length}</span>
            </div>
            <div class="space-y-2">
              {#each cronJobs.slice(0, 5) as job}
                {@const name = (job as any).name || (job as any).id || 'Unnamed'}
                {@const enabled = (job as any).enabled !== false}
                <div class="flex items-center gap-2">
                  <div class="w-1.5 h-1.5 rounded-full flex-shrink-0 {enabled ? 'bg-accent-green' : 'bg-text-muted'}"></div>
                  <span class="text-xs text-text-secondary truncate flex-1">{name}</span>
                </div>
              {/each}
              {#if cronJobs.length > 5}
                <div class="text-[10px] text-text-muted">+{cronJobs.length - 5} more</div>
              {/if}
            </div>
            <a href="/cron" class="inline-block mt-3 text-xs text-accent-cyan hover:underline">Manage →</a>
          </div>
        {/if}

        <!-- Quick Actions -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <h2 class="text-sm font-semibold text-text-primary mb-3">Quick Actions</h2>
          <div class="grid grid-cols-2 gap-2">
            <a href="/" class="flex items-center gap-2 p-2.5 rounded-lg border border-border-default hover:border-accent-cyan
                              text-text-secondary hover:text-accent-cyan transition-all text-xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              Chat
            </a>
            <a href="/nodes" class="flex items-center gap-2 p-2.5 rounded-lg border border-border-default hover:border-accent-cyan
                                   text-text-secondary hover:text-accent-cyan transition-all text-xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Nodes
            </a>
            <a href="/audit" class="flex items-center gap-2 p-2.5 rounded-lg border border-border-default hover:border-accent-cyan
                                   text-text-secondary hover:text-accent-cyan transition-all text-xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Audit
            </a>
            <a href="/logs" class="flex items-center gap-2 p-2.5 rounded-lg border border-border-default hover:border-accent-cyan
                                  text-text-secondary hover:text-accent-cyan transition-all text-xs">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7" />
              </svg>
              Logs
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
