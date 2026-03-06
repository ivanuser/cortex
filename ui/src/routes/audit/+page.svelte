<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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
    if (result === 'success') return 'badge-success';
    if (result === 'denied') return 'badge-denied';
    return 'badge-failure';
  }

  function actorTypeIcon(type: string): string {
    switch(type) {
      case 'operator': return '>';
      case 'node': return '#';
      case 'device': return '@';
      case 'system': return '$';
      case 'webchat': return '~';
      default: return '?';
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

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top Bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">AUDIT LOG</div>
    <div></div>
  </div>

  <!-- Subheader -->
  <div class="hud-subheader">
    <p class="hud-subtitle">Security event tracking and compliance monitoring</p>
    <div class="hud-actions">
      <button
        onclick={() => { showStats = !showStats; }}
        class="hud-btn {showStats ? 'hud-btn-active' : ''}"
      >
        [STATS]
      </button>
      <button
        onclick={toggleAutoRefresh}
        class="hud-btn {autoRefresh ? 'hud-btn-active-green' : ''}"
      >
        {autoRefresh ? '[PAUSE]' : '[AUTO]'}
      </button>
      <button
        onclick={() => { void fetchEntries(); void fetchStats(); }}
        class="hud-btn"
        disabled={loading}
      >
        [REFRESH]
      </button>
    </div>
  </div>

  <!-- Stats Panel -->
  {#if showStats && stats}
    <div class="hud-stats-grid">
      <div class="hud-panel hud-stat-card">
        <div class="hud-stat-value cyan">{stats.total.toLocaleString()}</div>
        <div class="hud-panel-lbl">Total Events</div>
      </div>
      <div class="hud-panel hud-stat-card">
        <div class="hud-stat-value {stats.failures > 0 ? 'red' : 'green'}">{stats.failures.toLocaleString()}</div>
        <div class="hud-panel-lbl">Failures / Denied</div>
      </div>
      <div class="hud-panel hud-stat-card">
        <div class="hud-stat-value purple">{Object.keys(stats.byAction).length}</div>
        <div class="hud-panel-lbl">Unique Actions</div>
      </div>
      <div class="hud-panel hud-stat-card">
        <div class="hud-stat-value amber">{Object.keys(stats.byActor).length}</div>
        <div class="hud-panel-lbl">Unique Actors</div>
      </div>
    </div>

    <!-- Top Actions -->
    {#if Object.keys(stats.byAction).length > 0}
      <div class="hud-panel">
        <h3 class="hud-panel-lbl">Top Actions</h3>
        <div class="hud-tag-wrap">
          {#each Object.entries(stats.byAction).slice(0, 12) as [action, count]}
            <button
              onclick={() => { filterAction = action; void fetchEntries(); }}
              class="hud-tag"
            >
              {action} <span class="hud-tag-count">({count})</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  {/if}

  <!-- Filters -->
  <div class="hud-panel hud-filters">
    <!-- Time Range -->
    <div class="hud-time-range">
      {#each timeRanges as range}
        <button
          onclick={() => { timeRange = range.value; void fetchEntries(); void fetchStats(); }}
          class="hud-time-btn {timeRange === range.value ? 'hud-time-btn-active' : ''}"
        >
          {range.label}
        </button>
      {/each}
    </div>

    <!-- Action filter -->
    <select
      bind:value={filterAction}
      onchange={() => void fetchEntries()}
      class="hud-select"
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
      class="hud-select"
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
      class="hud-input"
    />

    {#if filterAction || filterActor || filterResult}
      <button
        onclick={() => { filterAction = ''; filterActor = ''; filterResult = ''; void fetchEntries(); }}
        class="hud-btn hud-btn-danger"
      >
        [CLEAR]
      </button>
    {/if}

    <span class="hud-entry-count">
      {entries.length} entries
    </span>
  </div>

  <!-- Error -->
  {#if error}
    <div class="hud-panel hud-error">
      {error}
    </div>
  {/if}

  <!-- Loading -->
  {#if loading && entries.length === 0}
    <div class="hud-loading">
      <div class="hud-spinner"></div>
      <span>Loading audit entries...</span>
    </div>
  {/if}

  <!-- Table -->
  {#if entries.length > 0}
    <div class="hud-panel hud-table-wrap">
      <table class="hud-table">
        <thead>
          <tr>
            <th>TIME</th>
            <th>ACTION</th>
            <th>ACTOR</th>
            <th>RESULT</th>
            <th class="hide-mobile">IP</th>
          </tr>
        </thead>
        <tbody>
          {#each entries as entry (entry.id)}
            <tr
              class="hud-row"
              onclick={() => { expandedId = expandedId === entry.id ? null : entry.id; }}
            >
              <td class="hud-cell-time">{formatTime(entry.timestamp)}</td>
              <td>
                <span class="hud-cell-action">{entry.action}</span>
              </td>
              <td>
                <span class="hud-cell-actor" title={entry.actor_type}>
                  <span class="actor-icon">{actorTypeIcon(entry.actor_type)}</span>
                  {entry.actor_id ?? entry.actor_type}
                </span>
              </td>
              <td>
                <span class="hud-badge {resultBadgeClass(entry.result)}">
                  {entry.result}
                </span>
              </td>
              <td class="hud-cell-ip hide-mobile">{entry.ip ?? '---'}</td>
            </tr>

            {#if expandedId === entry.id}
              <tr class="hud-expanded-row">
                <td colspan="5">
                  <div class="hud-detail-grid">
                    <div>
                      <span class="hud-panel-lbl">ID:</span>
                      <span class="hud-detail-val">{entry.id}</span>
                    </div>
                    <div>
                      <span class="hud-panel-lbl">Actor Type:</span>
                      <span class="hud-detail-val">{entry.actor_type}</span>
                    </div>
                    <div>
                      <span class="hud-panel-lbl">Resource:</span>
                      <span class="hud-detail-val">{entry.resource ?? '---'}</span>
                    </div>
                    <div>
                      <span class="hud-panel-lbl">Epoch:</span>
                      <span class="hud-detail-val">{entry.created_at}</span>
                    </div>
                    {#if entry.details}
                      <div class="hud-detail-full">
                        <span class="hud-panel-lbl">Details:</span>
                        <span class="hud-detail-val">{entry.details}</span>
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
    <div class="hud-empty">
      <div class="hud-empty-icon">[SECURE]</div>
      <p class="hud-empty-title">No audit entries</p>
      <p class="hud-empty-sub">Events will appear here as gateway operations are performed.</p>
    </div>
  {/if}
</div>

<style>
  /* ─── Page Layout ─────────────────────── */
  .hud-page {
    height: 100%;
    overflow-y: auto;
    padding: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    position: relative;
    z-index: 1;
  }

  /* ─── Top Bar ─────────────────────────── */
  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-accent-cyan);
    opacity: 0.9;
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
    text-decoration: none;
    letter-spacing: 0.1em;
    transition: color 0.2s, text-shadow 0.2s;
  }
  .hud-back:hover {
    color: var(--color-accent-green);
    text-shadow: 0 0 8px var(--color-accent-green);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.25rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px var(--color-accent-cyan);
    text-transform: uppercase;
  }

  /* ─── Subheader ───────────────────────── */
  .hud-subheader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hud-subtitle {
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
    opacity: 0.6;
    letter-spacing: 0.05em;
  }

  .hud-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ─── Panels ──────────────────────────── */
  .hud-panel {
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid var(--color-accent-cyan);
    border-radius: 4px;
    padding: 1rem;
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.08), inset 0 0 8px rgba(0, 255, 255, 0.03);
  }

  .hud-panel-lbl {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    color: var(--color-accent-cyan);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  /* ─── Buttons ─────────────────────────── */
  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    padding: 0.35rem 0.75rem;
    background: transparent;
    border: 1px solid var(--color-accent-cyan);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    cursor: pointer;
    letter-spacing: 0.08em;
    transition: all 0.2s;
    opacity: 0.8;
  }
  .hud-btn:hover {
    opacity: 1;
    background: rgba(0, 255, 255, 0.1);
    text-shadow: 0 0 6px var(--color-accent-cyan);
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.15);
  }
  .hud-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .hud-btn-active {
    background: rgba(0, 255, 255, 0.15);
    text-shadow: 0 0 8px var(--color-accent-cyan);
    opacity: 1;
  }
  .hud-btn-active-green {
    border-color: var(--color-accent-green);
    color: var(--color-accent-green);
    background: rgba(0, 255, 100, 0.12);
    text-shadow: 0 0 8px var(--color-accent-green);
    opacity: 1;
  }
  .hud-btn-danger {
    border-color: #f44;
    color: #f44;
  }
  .hud-btn-danger:hover {
    background: rgba(255, 68, 68, 0.12);
    text-shadow: 0 0 6px #f44;
    box-shadow: 0 0 8px rgba(255, 68, 68, 0.15);
  }

  /* ─── Stats Grid ──────────────────────── */
  .hud-stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }
  @media (min-width: 768px) {
    .hud-stats-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .hud-stat-card {
    text-align: center;
    padding: 1rem;
  }

  .hud-stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .hud-stat-value.cyan { color: var(--color-accent-cyan); text-shadow: 0 0 10px var(--color-accent-cyan); }
  .hud-stat-value.green { color: var(--color-accent-green); text-shadow: 0 0 10px var(--color-accent-green); }
  .hud-stat-value.red { color: #f44; text-shadow: 0 0 10px #f44; }
  .hud-stat-value.purple { color: var(--color-accent-purple, #c084fc); text-shadow: 0 0 10px var(--color-accent-purple, #c084fc); }
  .hud-stat-value.amber { color: #fbbf24; text-shadow: 0 0 10px #fbbf24; }

  /* ─── Tags (Top Actions) ──────────────── */
  .hud-tag-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .hud-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    padding: 0.25rem 0.6rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--color-accent-cyan);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.2s;
    letter-spacing: 0.05em;
  }
  .hud-tag:hover {
    opacity: 1;
    background: rgba(0, 255, 255, 0.1);
    text-shadow: 0 0 6px var(--color-accent-cyan);
  }
  .hud-tag-count {
    opacity: 0.5;
    margin-left: 0.25rem;
  }

  /* ─── Filters ─────────────────────────── */
  .hud-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .hud-time-range {
    display: flex;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 2px;
    padding: 2px;
  }

  .hud-time-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.6rem;
    background: transparent;
    border: none;
    color: var(--color-accent-cyan);
    cursor: pointer;
    opacity: 0.5;
    border-radius: 2px;
    transition: all 0.2s;
    letter-spacing: 0.05em;
  }
  .hud-time-btn:hover {
    opacity: 0.8;
  }
  .hud-time-btn-active {
    opacity: 1;
    background: rgba(0, 255, 255, 0.15);
    text-shadow: 0 0 6px var(--color-accent-cyan);
  }

  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    padding: 0.35rem 0.6rem;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid var(--color-accent-cyan);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
    cursor: pointer;
    opacity: 0.8;
  }
  .hud-select:focus {
    opacity: 1;
    box-shadow: 0 0 6px rgba(0, 255, 255, 0.2);
  }
  .hud-select option {
    background: #0a0a0f;
    color: var(--color-accent-cyan);
  }

  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    padding: 0.35rem 0.6rem;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid var(--color-accent-cyan);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
    width: 10rem;
    opacity: 0.8;
  }
  .hud-input::placeholder {
    color: var(--color-accent-cyan);
    opacity: 0.3;
  }
  .hud-input:focus {
    opacity: 1;
    box-shadow: 0 0 6px rgba(0, 255, 255, 0.2);
  }

  .hud-entry-count {
    font-size: 0.7rem;
    color: var(--color-accent-cyan);
    opacity: 0.5;
    margin-left: auto;
    letter-spacing: 0.08em;
  }

  /* ─── Error ───────────────────────────── */
  .hud-error {
    border-color: #f44;
    color: #f44;
    background: rgba(255, 68, 68, 0.08);
    font-size: 0.8rem;
  }

  /* ─── Loading ─────────────────────────── */
  .hud-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 0;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
    opacity: 0.7;
  }

  .hud-spinner {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid rgba(0, 255, 255, 0.2);
    border-top-color: var(--color-accent-cyan);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Table ───────────────────────────── */
  .hud-table-wrap {
    padding: 0;
    overflow: hidden;
  }

  .hud-table {
    width: 100%;
    font-size: 0.8rem;
    border-collapse: collapse;
  }

  .hud-table thead tr {
    background: rgba(0, 255, 255, 0.06);
    border-bottom: 1px solid var(--color-accent-cyan);
  }

  .hud-table th {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    padding: 0.65rem 1rem;
    color: var(--color-accent-cyan);
    letter-spacing: 0.15em;
    opacity: 0.7;
  }

  .hud-row {
    border-bottom: 1px solid rgba(0, 255, 255, 0.1);
    cursor: pointer;
    transition: background 0.15s;
  }
  .hud-row:hover {
    background: rgba(0, 255, 255, 0.05);
  }

  .hud-row td {
    padding: 0.55rem 1rem;
  }

  .hud-cell-time {
    color: var(--color-accent-cyan);
    opacity: 0.5;
    white-space: nowrap;
    font-size: 0.7rem;
  }

  .hud-cell-action {
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    font-size: 0.75rem;
  }

  .hud-cell-actor {
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
    opacity: 0.8;
  }

  .actor-icon {
    color: var(--color-accent-green);
    margin-right: 0.35rem;
    font-weight: bold;
  }

  .hud-cell-ip {
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    opacity: 0.6;
    font-size: 0.7rem;
  }

  /* ─── Badges ──────────────────────────── */
  .hud-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 2px;
    border: 1px solid;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 600;
  }

  .badge-success {
    color: var(--color-accent-green);
    border-color: var(--color-accent-green);
    background: rgba(0, 255, 100, 0.08);
    text-shadow: 0 0 6px var(--color-accent-green);
  }
  .badge-denied {
    color: #fbbf24;
    border-color: #fbbf24;
    background: rgba(251, 191, 36, 0.08);
    text-shadow: 0 0 6px #fbbf24;
  }
  .badge-failure {
    color: #f44;
    border-color: #f44;
    background: rgba(255, 68, 68, 0.08);
    text-shadow: 0 0 6px #f44;
  }

  /* ─── Expanded Row ────────────────────── */
  .hud-expanded-row {
    background: rgba(0, 255, 255, 0.03);
  }
  .hud-expanded-row td {
    padding: 0.75rem 1rem;
  }

  .hud-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
    font-size: 0.7rem;
  }
  @media (min-width: 768px) {
    .hud-detail-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .hud-detail-val {
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    opacity: 0.8;
    margin-left: 0.35rem;
  }

  .hud-detail-full {
    grid-column: 1 / -1;
  }

  /* ─── Empty State ─────────────────────── */
  .hud-empty {
    text-align: center;
    padding: 3rem 0;
  }

  .hud-empty-icon {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.5rem;
    color: var(--color-accent-cyan);
    opacity: 0.3;
    margin-bottom: 0.75rem;
    letter-spacing: 0.2em;
  }

  .hud-empty-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    color: var(--color-accent-cyan);
    opacity: 0.6;
    letter-spacing: 0.1em;
  }

  .hud-empty-sub {
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
    opacity: 0.35;
    margin-top: 0.35rem;
  }

  /* ─── Responsive ──────────────────────── */
  @media (max-width: 767px) {
    .hide-mobile {
      display: none;
    }
  }
</style>
