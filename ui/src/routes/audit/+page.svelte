<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ─────────────────────────────
  interface AuditEntry {
    id: number;
    timestamp: string;
    actor_type: string;
    actor_id: string | null;
    action: string;
    resource: string | null;
    details: string | null;
    ip: string | null;
    result: string;
    created_at: number;
  }

  interface AuditStats {
    total: number;
    byAction: Record<string, number>;
    byActor: Record<string, number>;
    failures: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  }

  // ─── State ─────────────────────────────
  let entries = $state<AuditEntry[]>([]);
  let stats = $state<AuditStats | null>(null);
  let loading = $state(false);
  let statsLoading = $state(false);
  let error = $state<string | null>(null);

  // Filters
  let filterAction = $state('');
  let filterActor = $state('');
  let filterResult = $state('');
  let timeRange = $state('24h');
  let entryLimit = $state(100);

  // Auto-refresh
  let autoRefresh = $state(false);
  let refreshInterval: ReturnType<typeof setInterval> | null = null;

  // View mode
  let showStats = $state(false);

  // Expanded row
  let expandedId = $state<number | null>(null);

  // ─── Time Range ────────────────────────
  const timeRanges = [
    { label: '1h', value: '1h', seconds: 3600 },
    { label: '6h', value: '6h', seconds: 21600 },
    { label: '24h', value: '24h', seconds: 86400 },
    { label: '7d', value: '7d', seconds: 604800 },
    { label: '30d', value: '30d', seconds: 2592000 },
    { label: 'All', value: 'all', seconds: 0 },
  ];

  function getTimeSince(): number | undefined {
    const range = timeRanges.find(r => r.value === timeRange);
    if (!range || range.seconds === 0) return undefined;
    return Math.floor(Date.now() / 1000) - range.seconds;
  }

  // ─── Data Fetching ─────────────────────
  async function fetchEntries() {
    if (conn.state.status !== 'connected') return;
    loading = true;
    error = null;
    try {
      const params: Record<string, unknown> = { limit: entryLimit };
      const since = getTimeSince();
      if (since) params.since = since;
      if (filterAction) params.action = filterAction;
      if (filterActor) params.actor = filterActor;
      if (filterResult) params.result = filterResult;

      const res = await gateway.call<{ entries?: AuditEntry[]; count?: number }>('audit.query', params);
      untrack(() => {
        entries = res.entries ?? [];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      untrack(() => { error = msg; });
    } finally {
      untrack(() => { loading = false; });
    }
  }

  async function fetchStats() {
    if (conn.state.status !== 'connected') return;
    statsLoading = true;
    try {
      const params: Record<string, unknown> = {};
      const since = getTimeSince();
      if (since) params.since = since;
      const res = await gateway.call<AuditStats>('audit.stats', params);
      untrack(() => {
        stats = res;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toasts.add('error', `Stats failed: ${msg}`);
    } finally {
      untrack(() => { statsLoading = false; });
    }
  }

  // ─── Auto Refresh ──────────────────────
  function toggleAutoRefresh() {
    autoRefresh = !autoRefresh;
    if (autoRefresh) {
      refreshInterval = setInterval(() => { void fetchEntries(); }, 10000);
    } else if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  // ─── Effects ───────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => {
        void fetchEntries();
        void fetchStats();
      });
    }
  });

  // Cleanup on destroy
  $effect(() => {
    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }
    };
  });

  // ─── Helpers ───────────────────────────
  function formatTime(ts: string): string {
    try {
      const d = new Date(ts);
      return d.toLocaleString(undefined, { 
        month: 'short', day: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit' 
      });
    } catch { return ts; }
  }

  function resultBadgeClass(result: string): string {
    if (result === 'success') return 'bg-accent-green/20 text-accent-green border-accent-green/30';
    if (result === 'denied') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    return 'bg-red-500/20 text-red-400 border-red-500/30';
  }

  function actorTypeIcon(type: string): string {
    switch(type) {
      case 'operator': return '👤';
      case 'node': return '🖥️';
      case 'device': return '📱';
      case 'system': return '⚙️';
      case 'webchat': return '💬';
      default: return '❓';
    }
  }

  // Get unique actions from current entries for filter dropdown
  let uniqueActions = $derived(
    [...new Set(entries.map(e => e.action))].sort()
  );

  let uniqueResults = ['success', 'failure', 'denied'];
</script>

<svelte:head>
  <title>Audit Log — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
<div class="p-4 md:p-6 max-w-[1400px] mx-auto space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-bold gradient-text tracking-wide">Audit Log</h1>
      <p class="text-sm text-text-muted mt-1">Security event tracking and compliance monitoring</p>
    </div>
    <div class="flex items-center gap-2">
      <button
        onclick={() => { showStats = !showStats; }}
        class="px-3 py-1.5 text-sm rounded-lg border transition-colors
          {showStats ? 'border-accent-cyan/50 bg-accent-cyan/10 text-accent-cyan' : 'border-border-default bg-bg-secondary text-text-muted hover:text-text-primary hover:border-border-hover'}"
      >
        📊 Stats
      </button>
      <button
        onclick={toggleAutoRefresh}
        class="px-3 py-1.5 text-sm rounded-lg border transition-colors
          {autoRefresh ? 'border-accent-green/50 bg-accent-green/10 text-accent-green' : 'border-border-default bg-bg-secondary text-text-muted hover:text-text-primary hover:border-border-hover'}"
      >
        {autoRefresh ? '⏸ Auto' : '▶ Auto'}
      </button>
      <button
        onclick={() => { void fetchEntries(); void fetchStats(); }}
        class="px-3 py-1.5 text-sm rounded-lg border border-border-default bg-bg-secondary text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
        disabled={loading}
      >
        🔄 Refresh
      </button>
    </div>
  </div>

  <!-- Stats Panel -->
  {#if showStats && stats}
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/60">
        <div class="text-2xl font-bold text-accent-cyan">{stats.total.toLocaleString()}</div>
        <div class="text-xs text-text-muted mt-1">Total Events</div>
      </div>
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/60">
        <div class="text-2xl font-bold {stats.failures > 0 ? 'text-red-400' : 'text-accent-green'}">{stats.failures.toLocaleString()}</div>
        <div class="text-xs text-text-muted mt-1">Failures / Denied</div>
      </div>
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/60">
        <div class="text-2xl font-bold text-accent-purple">{Object.keys(stats.byAction).length}</div>
        <div class="text-xs text-text-muted mt-1">Unique Actions</div>
      </div>
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/60">
        <div class="text-2xl font-bold text-amber-400">{Object.keys(stats.byActor).length}</div>
        <div class="text-xs text-text-muted mt-1">Unique Actors</div>
      </div>
    </div>

    <!-- Top Actions -->
    {#if Object.keys(stats.byAction).length > 0}
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/60">
        <h3 class="text-sm font-semibold text-text-primary mb-3">Top Actions</h3>
        <div class="flex flex-wrap gap-2">
          {#each Object.entries(stats.byAction).slice(0, 12) as [action, count]}
            <button
              onclick={() => { filterAction = action; void fetchEntries(); }}
              class="px-2.5 py-1 text-xs rounded-full border border-border-default bg-bg-primary/50 text-text-secondary hover:border-accent-cyan/50 hover:text-accent-cyan transition-colors"
            >
              {action} <span class="text-text-muted ml-1">({count})</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Filters -->
  <div class="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border-default bg-bg-secondary/40">
    <!-- Time Range -->
    <div class="flex items-center gap-1 bg-bg-primary/50 rounded-lg p-0.5">
      {#each timeRanges as range}
        <button
          onclick={() => { timeRange = range.value; void fetchEntries(); void fetchStats(); }}
          class="px-2.5 py-1 text-xs rounded-md transition-colors
            {timeRange === range.value ? 'bg-accent-cyan/20 text-accent-cyan font-medium' : 'text-text-muted hover:text-text-primary'}"
        >
          {range.label}
        </button>
      {/each}
    </div>

    <!-- Action filter -->
    <select
      bind:value={filterAction}
      onchange={() => void fetchEntries()}
      class="px-2.5 py-1.5 text-xs rounded-lg border border-border-default bg-bg-primary text-text-secondary focus:border-accent-cyan/50 focus:outline-none"
    >
      <option value="">All Actions</option>
      {#each uniqueActions as action}
        <option value={action}>{action}</option>
      {/each}
    </select>

    <!-- Result filter -->
    <select
      bind:value={filterResult}
      onchange={() => void fetchEntries()}
      class="px-2.5 py-1.5 text-xs rounded-lg border border-border-default bg-bg-primary text-text-secondary focus:border-accent-cyan/50 focus:outline-none"
    >
      <option value="">All Results</option>
      {#each uniqueResults as result}
        <option value={result}>{result}</option>
      {/each}
    </select>

    <!-- Actor filter -->
    <input
      type="text"
      placeholder="Filter by actor..."
      bind:value={filterActor}
      onkeydown={(e) => { if (e.key === 'Enter') void fetchEntries(); }}
      class="px-2.5 py-1.5 text-xs rounded-lg border border-border-default bg-bg-primary text-text-secondary placeholder-text-muted/50 focus:border-accent-cyan/50 focus:outline-none w-40"
    />

    {#if filterAction || filterActor || filterResult}
      <button
        onclick={() => { filterAction = ''; filterActor = ''; filterResult = ''; void fetchEntries(); }}
        class="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
      >
        ✕ Clear
      </button>
    {/if}

    <span class="text-xs text-text-muted ml-auto">
      {entries.length} entries
    </span>
  </div>

  <!-- Error -->
  {#if error}
    <div class="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
      {error}
    </div>
  {/if}

  <!-- Loading -->
  {#if loading && entries.length === 0}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin w-6 h-6 border-2 border-accent-cyan/30 border-t-accent-cyan rounded-full"></div>
      <span class="ml-3 text-text-muted text-sm">Loading audit entries...</span>
    </div>
  {/if}

  <!-- Table -->
  {#if entries.length > 0}
    <div class="rounded-xl border border-border-default overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-bg-secondary/80 border-b border-border-default">
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Time</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Action</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Actor</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Result</th>
            <th class="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider max-md:hidden">IP</th>
          </tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.id)}
            <tr
              class="border-b border-border-default/50 hover:bg-bg-hover/50 cursor-pointer transition-colors"
              onclick={() => { expandedId = expandedId === entry.id ? null : entry.id; }}
            >
              <td class="px-4 py-2.5 text-text-muted whitespace-nowrap text-xs">{formatTime(entry.timestamp)}</td>
              <td class="px-4 py-2.5">
                <span class="font-mono text-xs text-accent-cyan">{entry.action}</span>
              </td>
              <td class="px-4 py-2.5">
                <span class="text-xs" title={entry.actor_type}>
                  {actorTypeIcon(entry.actor_type)}
                  <span class="text-text-secondary ml-1">{entry.actor_id ?? entry.actor_type}</span>
                </span>
              </td>
              <td class="px-4 py-2.5">
                <span class="px-2 py-0.5 text-[10px] font-semibold uppercase rounded-full border {resultBadgeClass(entry.result)}">
                  {entry.result}
                </span>
              </td>
              <td class="px-4 py-2.5 text-text-muted text-xs font-mono max-md:hidden">{entry.ip ?? '—'}</td>
            </tr>

            {#if expandedId === entry.id}
              <tr class="bg-bg-secondary/30">
                <td colspan="5" class="px-4 py-3">
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span class="text-text-muted">ID:</span>
                      <span class="text-text-secondary ml-1 font-mono">{entry.id}</span>
                    </div>
                    <div>
                      <span class="text-text-muted">Actor Type:</span>
                      <span class="text-text-secondary ml-1">{entry.actor_type}</span>
                    </div>
                    <div>
                      <span class="text-text-muted">Resource:</span>
                      <span class="text-text-secondary ml-1">{entry.resource ?? '—'}</span>
                    </div>
                    <div>
                      <span class="text-text-muted">Epoch:</span>
                      <span class="text-text-secondary ml-1 font-mono">{entry.created_at}</span>
                    </div>
                    {#if entry.details}
                      <div class="col-span-full">
                        <span class="text-text-muted">Details:</span>
                        <span class="text-text-secondary ml-1 font-mono">{entry.details}</span>
                      </div>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {:else if !loading && !error}
    <div class="text-center py-12 text-text-muted">
      <div class="text-4xl mb-3">🔒</div>
      <p class="text-lg font-medium">No audit entries</p>
      <p class="text-sm mt-1">Events will appear here as gateway operations are performed.</p>
    </div>
  {/if}
</div>
</div>
