<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ──────────────────────────────────
  interface UsageTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost: number;
    outputCost: number;
    cacheReadCost: number;
    cacheWriteCost: number;
    missingCostEntries: number;
  }

  interface MessageCounts {
    total: number;
    user: number;
    assistant: number;
    toolCalls: number;
    toolResults: number;
    errors: number;
  }

  interface ToolUsage {
    totalCalls: number;
    uniqueTools: number;
    tools: Array<{ name: string; count: number }>;
  }

  interface ModelUsageEntry {
    provider?: string;
    model?: string;
    count: number;
    totals: UsageTotals;
  }

  interface SessionUsage {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
    missingCostEntries?: number;
    messageCounts?: MessageCounts;
    toolUsage?: ToolUsage;
    modelUsage?: ModelUsageEntry[];
    durationMs?: number;
    firstActivity?: number;
    lastActivity?: number;
    activityDates?: string[];
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>;
  }

  interface UsageSession {
    key: string;
    label?: string;
    agentId?: string;
    channel?: string;
    model?: string;
    modelProvider?: string;
    providerOverride?: string;
    updatedAt?: number;
    usage?: SessionUsage;
  }

  interface UsageAggregates {
    messages: MessageCounts;
    tools: ToolUsage;
    byModel: ModelUsageEntry[];
    byProvider: Array<{ provider?: string; count: number; totals: UsageTotals }>;
    byAgent: Array<{ agentId: string; totals: UsageTotals }>;
    byChannel: Array<{ channel: string; totals: UsageTotals }>;
  }

  interface UsageResult {
    sessions: UsageSession[];
    totals: UsageTotals;
    aggregates?: UsageAggregates;
  }

  interface CostDailyEntry {
    date: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
    inputCost?: number;
    outputCost?: number;
    cacheReadCost?: number;
    cacheWriteCost?: number;
  }

  interface CostSummary {
    totalCost: number;
    currency?: string;
    daily?: CostDailyEntry[];
  }

  interface TimeSeriesPoint {
    timestamp: number;
    totalTokens: number;
    cost: number;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cumulativeTokens?: number;
    cumulativeCost?: number;
  }

  interface SessionLogEntry {
    role: string;
    content: string;
    timestamp: number;
    tokens?: number;
  }

  // ─── State ──────────────────────────────────
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Date range (default: last 7 days)
  let startDate = $state(formatIsoDate(daysAgo(6)));
  let endDate = $state(formatIsoDate(new Date()));

  // Data
  let usageResult = $state<UsageResult | null>(null);
  let costSummary = $state<CostSummary | null>(null);

  // Session detail
  let selectedSessionKey = $state<string | null>(null);
  let detailLoading = $state(false);
  let timeSeries = $state<{ points: TimeSeriesPoint[] } | null>(null);
  let sessionLogs = $state<SessionLogEntry[] | null>(null);

  // View mode
  let chartMode = $state<'tokens' | 'cost'>('tokens');
  let sortBy = $state<'tokens' | 'cost' | 'recent'>('tokens');

  // ─── Helpers ────────────────────────────────
  function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  function formatIsoDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
  }

  function formatCost(n: number, decimals = 2): string {
    return `$${n.toFixed(decimals)}`;
  }

  function formatTime(ts?: number): string {
    if (!ts) return 'n/a';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms?: number): string {
    if (!ms || ms <= 0) return '---';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function pct(part: number, total: number): number {
    return total > 0 ? (part / total) * 100 : 0;
  }

  function sessionLabel(s: UsageSession): string {
    const raw = s.label || s.key;
    if (raw.startsWith('agent:') && raw.includes('?token=')) {
      return raw.slice(0, raw.indexOf('?token='));
    }
    return raw.length > 60 ? raw.slice(0, 60) + '...' : raw;
  }

  // ─── Data Loading ───────────────────────────
  async function loadUsage() {
    if (!gateway.connected || loading) return;
    loading = true;
    error = null;
    selectedSessionKey = null;
    timeSeries = null;
    sessionLogs = null;

    try {
      const [sessionsRes, costRes] = await Promise.all([
        gateway.call<UsageResult>('sessions.usage', {
          startDate,
          endDate,
          limit: 1000,
          includeContextWeight: true,
        }),
        gateway.call<CostSummary>('usage.cost', { startDate, endDate }),
      ]);

      usageResult = sessionsRes;
      costSummary = costRes;
    } catch (e) {
      error = String(e);
      toasts.error('Usage Load Failed', String(e));
    } finally {
      loading = false;
    }
  }

  async function selectSession(key: string) {
    if (selectedSessionKey === key) {
      selectedSessionKey = null;
      timeSeries = null;
      sessionLogs = null;
      return;
    }

    selectedSessionKey = key;
    detailLoading = true;
    timeSeries = null;
    sessionLogs = null;

    try {
      const [tsRes, logsRes] = await Promise.all([
        gateway.call<{ points: TimeSeriesPoint[] }>('sessions.usage.timeseries', { key }).catch(() => null),
        gateway.call<{ logs: SessionLogEntry[] }>('sessions.usage.logs', { key, limit: 200 }).catch(() => null),
      ]);
      if (tsRes) timeSeries = tsRes;
      if (logsRes?.logs) sessionLogs = logsRes.logs;
    } catch {
      // Silent fail for detail data
    } finally {
      detailLoading = false;
    }
  }

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    startDate = formatIsoDate(start);
    endDate = formatIsoDate(end);
    loadUsage();
  }

  // ─── Auto-load on connect ──────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadUsage());
    }
  });

  // ─── Derived data ──────────────────────────
  let totals = $derived(usageResult?.totals ?? null);
  let sessions = $derived(usageResult?.sessions ?? []);
  let aggregates = $derived(usageResult?.aggregates ?? null);
  let daily = $derived(costSummary?.daily ?? []);

  let sortedSessions = $derived.by(() => {
    const list = [...sessions];
    switch (sortBy) {
      case 'cost':
        return list.sort((a, b) => (b.usage?.totalCost ?? 0) - (a.usage?.totalCost ?? 0));
      case 'recent':
        return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      case 'tokens':
      default:
        return list.sort((a, b) => (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0));
    }
  });

  let selectedSession = $derived(
    selectedSessionKey ? sessions.find(s => s.key === selectedSessionKey) ?? null : null
  );

  let topModels = $derived.by(() => {
    return (aggregates?.byModel ?? []).slice(0, 5).map(m => ({
      name: m.model ?? 'unknown',
      provider: m.provider ?? '',
      cost: m.totals.totalCost,
      tokens: m.totals.totalTokens,
      count: m.count,
    }));
  });

  let topProviders = $derived.by(() => {
    return (aggregates?.byProvider ?? []).slice(0, 5).map(p => ({
      name: p.provider ?? 'unknown',
      cost: p.totals.totalCost,
      tokens: p.totals.totalTokens,
      count: p.count,
    }));
  });

  // Cost breakdown
  let costBreakdown = $derived.by(() => {
    if (!totals) return null;
    const total = totals.totalCost || 1;
    return {
      input: { tokens: totals.input, cost: totals.inputCost, pct: pct(totals.inputCost, total) },
      output: { tokens: totals.output, cost: totals.outputCost, pct: pct(totals.outputCost, total) },
      cacheRead: { tokens: totals.cacheRead, cost: totals.cacheReadCost, pct: pct(totals.cacheReadCost, total) },
      cacheWrite: { tokens: totals.cacheWrite, cost: totals.cacheWriteCost, pct: pct(totals.cacheWriteCost, total) },
    };
  });

  // Cache hit rate
  let cacheHitRate = $derived.by(() => {
    if (!totals) return 0;
    const base = totals.input + totals.cacheRead;
    return base > 0 ? totals.cacheRead / base : 0;
  });

  // Daily chart max value
  let dailyMax = $derived.by(() => {
    if (!daily.length) return 1;
    const isTokenMode = chartMode === 'tokens';
    const values = daily.map(d => isTokenMode ? d.totalTokens : d.totalCost);
    return Math.max(...values, isTokenMode ? 1 : 0.001);
  });

  // Process timeseries for chart
  let timeSeriesProcessed = $derived.by(() => {
    if (!timeSeries?.points?.length) return [];
    let cumTokens = 0;
    let cumCost = 0;
    return timeSeries.points.map(p => {
      cumTokens += p.totalTokens;
      cumCost += p.cost;
      return { ...p, cumulativeTokens: cumTokens, cumulativeCost: cumCost };
    });
  });
</script>

<svelte:head>
  <title>Usage — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- ═══ Top Bar ═══════════════════════════════ -->
  <div class="hud-page-topbar">
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="/overview" class="hud-back">&#9666; BACK</a>
      <h1 class="hud-page-title">USAGE STATS</h1>
    </div>
    <div style="display:flex;align-items:center;gap:8px;">
      <!-- Chart mode toggle -->
      <div class="hud-toggle-group">
        <button
          onclick={() => chartMode = 'tokens'}
          class="hud-toggle-btn {chartMode === 'tokens' ? 'active cyan' : ''}">
          TOKENS
        </button>
        <button
          onclick={() => chartMode = 'cost'}
          class="hud-toggle-btn {chartMode === 'cost' ? 'active purple' : ''}">
          COST
        </button>
      </div>
      <button onclick={() => loadUsage()} disabled={loading || conn.state.status !== 'connected'}
        class="hud-btn">
        {#if loading}
          <span class="hud-spinner"></span>
        {/if}
        REFRESH
      </button>
    </div>
  </div>

  <div class="hud-content">
  <!-- ═══ Date Range Picker ═════════════════════ -->
  <div class="hud-panel">
    <div class="hud-range-row">
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="hud-panel-lbl">RANGE</span>
        <input
          type="date"
          bind:value={startDate}
          class="hud-input"
        />
        <span class="hud-sep">to</span>
        <input
          type="date"
          bind:value={endDate}
          class="hud-input"
        />
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button onclick={() => applyPreset(1)} class="hud-btn sm">TODAY</button>
        <button onclick={() => applyPreset(7)} class="hud-btn sm">7D</button>
        <button onclick={() => applyPreset(30)} class="hud-btn sm">30D</button>
        <button onclick={() => applyPreset(90)} class="hud-btn sm">90D</button>
      </div>
      {#if sessions.length > 0}
        <span class="hud-meta" style="margin-left:auto;">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} in range
          {#if sessions.length >= 1000}
            <span class="hud-warn">(LIMIT)</span>
          {/if}
        </span>
      {/if}
    </div>
  </div>

  <!-- ═══ Error Banner ══════════════════════════ -->
  {#if error}
    <div class="hud-panel error">
      <span class="hud-panel-lbl">ERROR</span>
      <p class="hud-error-text">{error}</p>
    </div>
  {/if}

  <!-- ═══ Not Connected ═════════════════════════ -->
  {#if conn.state.status !== 'connected'}
    <div class="hud-empty">
      <div class="hud-empty-icon">&#9889;</div>
      <p>CONNECT TO GATEWAY TO VIEW USAGE ANALYTICS</p>
    </div>

  <!-- ═══ Loading skeleton ══════════════════════ -->
  {:else if loading && !totals}
    <div class="hud-grid-4">
      {#each Array(4) as _}
        <div class="hud-panel skeleton">
          <div class="hud-skel-line short"></div>
          <div class="hud-skel-line wide"></div>
          <div class="hud-skel-line med"></div>
        </div>
      {/each}
    </div>

  <!-- ═══ Main Content ══════════════════════════ -->
  {:else if totals}

    <!-- ─── Overview Stats Cards ─────────────── -->
    <div class="hud-grid-4">
      <!-- Total Tokens -->
      <div class="hud-panel glow-cyan">
        <div class="hud-panel-lbl">TOTAL TOKENS</div>
        <div class="hud-stat cyan">{formatTokens(totals.totalTokens)}</div>
        <div class="hud-meta">
          {formatTokens(totals.input)} in // {formatTokens(totals.output)} out
        </div>
      </div>

      <!-- Total Cost -->
      <div class="hud-panel glow-purple">
        <div class="hud-panel-lbl">TOTAL COST</div>
        <div class="hud-stat purple">{formatCost(totals.totalCost)}</div>
        <div class="hud-meta">
          {costSummary?.currency ?? 'USD'} // {formatCost(totals.totalCost / Math.max(sessions.length, 1), 3)} avg/session
        </div>
      </div>

      <!-- Sessions -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">SESSIONS</div>
        <div class="hud-stat green">{sessions.length}</div>
        <div class="hud-meta">
          {#if aggregates}
            {aggregates.messages.total} msgs // {aggregates.messages.errors} errors
          {:else}
            In selected range
          {/if}
        </div>
      </div>

      <!-- Cache Hit Rate -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">CACHE HIT RATE</div>
        <div class="hud-stat {cacheHitRate > 0.6 ? 'green' : cacheHitRate > 0.3 ? 'amber' : 'pink'}">
          {cacheHitRate > 0 ? `${(cacheHitRate * 100).toFixed(1)}%` : '---'}
        </div>
        <div class="hud-meta">
          {formatTokens(totals.cacheRead)} cached // {formatTokens(totals.input)} uncached
        </div>
      </div>
    </div>

    <!-- ─── Secondary Stats ──────────────────── -->
    {#if aggregates}
      <div class="hud-grid-6">
        <div class="hud-panel compact">
          <div class="hud-stat-sm">{aggregates.messages.total}</div>
          <div class="hud-panel-lbl">MESSAGES</div>
        </div>
        <div class="hud-panel compact">
          <div class="hud-stat-sm">{aggregates.messages.user}</div>
          <div class="hud-panel-lbl">USER MSGS</div>
        </div>
        <div class="hud-panel compact">
          <div class="hud-stat-sm">{aggregates.messages.assistant}</div>
          <div class="hud-panel-lbl">ASSISTANT MSGS</div>
        </div>
        <div class="hud-panel compact">
          <div class="hud-stat-sm">{aggregates.tools.totalCalls}</div>
          <div class="hud-panel-lbl">TOOL CALLS</div>
        </div>
        <div class="hud-panel compact">
          <div class="hud-stat-sm">{aggregates.tools.uniqueTools}</div>
          <div class="hud-panel-lbl">UNIQUE TOOLS</div>
        </div>
        <div class="hud-panel compact">
          <div class="hud-stat-sm {aggregates.messages.errors > 0 ? 'pink' : ''}">{aggregates.messages.errors}</div>
          <div class="hud-panel-lbl">ERRORS</div>
        </div>
      </div>
    {/if}

    <!-- ─── Cost Breakdown Bar ───────────────── -->
    {#if costBreakdown && totals.totalCost > 0}
      <div class="hud-panel">
        <div class="hud-panel-lbl" style="margin-bottom:10px;">
          {chartMode === 'tokens' ? 'TOKEN' : 'COST'} BREAKDOWN
        </div>
        <!-- Stacked bar -->
        <div class="hud-bar-stack">
          {#if chartMode === 'tokens'}
            <div class="hud-bar-seg pink" style="width: {pct(totals.output, totals.totalTokens)}%"
              title="Output: {formatTokens(totals.output)}"></div>
            <div class="hud-bar-seg cyan" style="width: {pct(totals.input, totals.totalTokens)}%"
              title="Input: {formatTokens(totals.input)}"></div>
            <div class="hud-bar-seg purple" style="width: {pct(totals.cacheWrite, totals.totalTokens)}%"
              title="Cache Write: {formatTokens(totals.cacheWrite)}"></div>
            <div class="hud-bar-seg green" style="width: {pct(totals.cacheRead, totals.totalTokens)}%"
              title="Cache Read: {formatTokens(totals.cacheRead)}"></div>
          {:else}
            <div class="hud-bar-seg pink" style="width: {costBreakdown.output.pct}%"
              title="Output: {formatCost(costBreakdown.output.cost)}"></div>
            <div class="hud-bar-seg cyan" style="width: {costBreakdown.input.pct}%"
              title="Input: {formatCost(costBreakdown.input.cost)}"></div>
            <div class="hud-bar-seg purple" style="width: {costBreakdown.cacheWrite.pct}%"
              title="Cache Write: {formatCost(costBreakdown.cacheWrite.cost)}"></div>
            <div class="hud-bar-seg green" style="width: {costBreakdown.cacheRead.pct}%"
              title="Cache Read: {formatCost(costBreakdown.cacheRead.cost)}"></div>
          {/if}
        </div>
        <!-- Legend -->
        <div class="hud-legend">
          <span class="hud-legend-item">
            <span class="hud-legend-dot pink"></span>
            <span class="hud-meta">Output</span>
            <span class="hud-legend-val">
              {chartMode === 'tokens' ? formatTokens(totals.output) : formatCost(costBreakdown.output.cost)}
            </span>
          </span>
          <span class="hud-legend-item">
            <span class="hud-legend-dot cyan"></span>
            <span class="hud-meta">Input</span>
            <span class="hud-legend-val">
              {chartMode === 'tokens' ? formatTokens(totals.input) : formatCost(costBreakdown.input.cost)}
            </span>
          </span>
          <span class="hud-legend-item">
            <span class="hud-legend-dot purple"></span>
            <span class="hud-meta">Cache Write</span>
            <span class="hud-legend-val">
              {chartMode === 'tokens' ? formatTokens(totals.cacheWrite) : formatCost(costBreakdown.cacheWrite.cost)}
            </span>
          </span>
          <span class="hud-legend-item">
            <span class="hud-legend-dot green"></span>
            <span class="hud-meta">Cache Read</span>
            <span class="hud-legend-val">
              {chartMode === 'tokens' ? formatTokens(totals.cacheRead) : formatCost(costBreakdown.cacheRead.cost)}
            </span>
          </span>
        </div>
      </div>
    {/if}

    <!-- ─── Daily Chart + Model Breakdown Grid ── -->
    <div class="hud-grid-3-2">

      <!-- Daily Usage Chart -->
      <div class="hud-panel span-2">
        <div class="hud-panel-lbl" style="margin-bottom:10px;">
          DAILY {chartMode === 'tokens' ? 'TOKEN' : 'COST'} USAGE
        </div>
        {#if daily.length > 0}
          <div class="hud-chart-bars">
            {#each daily as day}
              {@const value = chartMode === 'tokens' ? day.totalTokens : day.totalCost}
              {@const heightPct = Math.max((value / dailyMax) * 100, 1)}
              {@const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              <div class="hud-chart-col group">
                <div
                  class="hud-chart-bar"
                  style="height: {heightPct}%"
                  title="{dayLabel}: {chartMode === 'tokens' ? formatTokens(value) : formatCost(value)}"
                ></div>
                <!-- Tooltip -->
                <div class="hud-chart-tooltip">
                  <div class="hud-tooltip-title">{dayLabel}</div>
                  <div class="hud-meta">{formatTokens(day.totalTokens)} tokens</div>
                  <div class="hud-meta">{formatCost(day.totalCost)}</div>
                </div>
              </div>
            {/each}
          </div>
          <!-- X-axis labels -->
          {#if daily.length >= 2}
            <div class="hud-chart-axis">
              <span>{new Date(daily[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              {#if daily.length > 2}
                <span>{new Date(daily[Math.floor(daily.length / 2)].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              {/if}
              <span>{new Date(daily[daily.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          {/if}
        {:else}
          <div class="hud-empty-inline">NO DAILY DATA</div>
        {/if}
      </div>

      <!-- Model Breakdown -->
      <div class="hud-panel">
        <div class="hud-panel-lbl" style="margin-bottom:10px;">TOP MODELS</div>
        {#if topModels.length > 0}
          <div class="hud-model-list">
            {#each topModels as model}
              {@const maxCost = topModels[0]?.cost || 1}
              {@const barWidth = pct(model.cost, maxCost)}
              <div class="hud-model-item">
                <div class="hud-model-header">
                  <span class="hud-mono">{model.name}</span>
                  <span class="hud-meta">{formatCost(model.cost)}</span>
                </div>
                <div class="hud-progress-track">
                  <div class="hud-progress-fill" style="width: {barWidth}%"></div>
                </div>
                <div class="hud-meta" style="font-size:0.6rem;margin-top:2px;">
                  {formatTokens(model.tokens)} tokens // {model.count} msgs
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="hud-empty-inline">NO MODEL DATA</div>
        {/if}

        <!-- Top Providers (compact) -->
        {#if topProviders.length > 0}
          <div class="hud-panel-lbl" style="margin-top:16px;margin-bottom:8px;">TOP PROVIDERS</div>
          <div class="hud-provider-list">
            {#each topProviders as provider}
              <div class="hud-provider-row">
                <span class="hud-mono">{provider.name}</span>
                <span class="hud-meta">{formatCost(provider.cost)} // {formatTokens(provider.tokens)}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <!-- ─── Sessions List ────────────────────── -->
    <div class="hud-panel">
      <div class="hud-panel-header">
        <div class="hud-panel-lbl">SESSIONS</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select bind:value={sortBy} class="hud-select">
            <option value="tokens">SORT: TOKENS</option>
            <option value="cost">SORT: COST</option>
            <option value="recent">SORT: RECENT</option>
          </select>
          <span class="hud-meta">{sessions.length} total</span>
        </div>
      </div>

      {#if sortedSessions.length === 0}
        <div class="hud-empty-inline" style="padding:24px 0;">NO SESSIONS IN THIS DATE RANGE</div>
      {:else}
        <div class="hud-session-list">
          {#each sortedSessions.slice(0, 50) as session (session.key)}
            {@const isSelected = selectedSessionKey === session.key}
            {@const usage = session.usage}
            {@const value = chartMode === 'tokens' ? (usage?.totalTokens ?? 0) : (usage?.totalCost ?? 0)}
            {@const maxVal = chartMode === 'tokens'
              ? (sortedSessions[0]?.usage?.totalTokens ?? 1)
              : (sortedSessions[0]?.usage?.totalCost ?? 1)}
            {@const barPct = pct(value, maxVal)}

            <button
              onclick={() => selectSession(session.key)}
              class="hud-session-row {isSelected ? 'selected' : ''}">
              <div class="hud-session-main">
                <!-- Session info -->
                <div class="hud-session-info">
                  <div class="hud-session-title-row">
                    <span class="hud-session-name">{sessionLabel(session)}</span>
                    {#if session.channel}
                      <span class="hud-tag">{session.channel}</span>
                    {/if}
                    {#if session.model}
                      <span class="hud-tag purple">{session.model}</span>
                    {/if}
                  </div>
                  <!-- Usage bar -->
                  <div class="hud-progress-track" style="margin:6px 0 4px;">
                    <div class="hud-progress-fill {chartMode === 'tokens' ? '' : 'purple'}"
                      style="width: {barPct}%"></div>
                  </div>
                  <div class="hud-session-meta">
                    {#if usage}
                      <span>{formatTokens(usage.totalTokens)} tokens</span>
                      <span>{formatCost(usage.totalCost)}</span>
                      {#if usage.messageCounts}
                        <span>{usage.messageCounts.total} msgs</span>
                      {/if}
                      {#if usage.messageCounts?.errors}
                        <span class="hud-warn">{usage.messageCounts.errors} errors</span>
                      {/if}
                    {/if}
                    <span style="margin-left:auto;">{formatTime(session.updatedAt)}</span>
                  </div>
                </div>
                <!-- Expand chevron -->
                <span class="hud-chevron {isSelected ? 'open' : ''}">&#9662;</span>
              </div>

            </button>
          {/each}

          {#if sortedSessions.length > 50}
            <div class="hud-meta" style="text-align:center;padding:10px 0;">
              SHOWING 50 OF {sortedSessions.length} SESSIONS. NARROW DATE RANGE FOR MORE DETAIL.
            </div>
          {/if}
        </div>
      {/if}
    </div>

  <!-- ═══ Empty State ═══════════════════════════ -->
  {:else if !loading}
    <div class="hud-empty">
      <div class="hud-empty-icon">&#9614;&#9614;&#9614;</div>
      <p>NO USAGE DATA FOR THIS DATE RANGE</p>
      <p class="hud-meta">Try expanding the date range or check that sessions have been active.</p>
    </div>
  {/if}

  </div><!-- /hud-content -->
</div>

<!-- ═══ Session Detail Drawer ═══════════════════ -->
{#if selectedSession}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-backdrop" onclick={() => selectedSessionKey = null}></div>
  <div class="drawer-panel">
    <div class="drawer-header">
      <div>
        <div class="drawer-title">{sessionLabel(selectedSession)}</div>
        <div class="hud-meta" style="margin-top:4px;">{selectedSession.key}</div>
      </div>
      <button class="drawer-close" onclick={() => selectedSessionKey = null}>✕</button>
    </div>
    <div class="drawer-body">
      {#if detailLoading}
        <div class="hud-detail-loading">
          <span class="hud-spinner"></span>
          LOADING SESSION DETAILS...
        </div>
      {:else}
        {@const usage = selectedSession.usage}
        <!-- Summary Cards -->
        {#if usage}
          <div class="hud-grid-4 tight">
            <div class="hud-panel compact inner">
              <div class="hud-panel-lbl">INPUT</div>
              <div class="hud-stat-sm cyan">{formatTokens(usage.input)}</div>
              {#if usage.inputCost}<div class="hud-meta">{formatCost(usage.inputCost, 4)}</div>{/if}
            </div>
            <div class="hud-panel compact inner">
              <div class="hud-panel-lbl">OUTPUT</div>
              <div class="hud-stat-sm pink">{formatTokens(usage.output)}</div>
              {#if usage.outputCost}<div class="hud-meta">{formatCost(usage.outputCost, 4)}</div>{/if}
            </div>
            <div class="hud-panel compact inner">
              <div class="hud-panel-lbl">DURATION</div>
              <div class="hud-stat-sm">{formatDuration(usage.durationMs)}</div>
              {#if usage.messageCounts}<div class="hud-meta">{usage.messageCounts.total} messages</div>{/if}
            </div>
            <div class="hud-panel compact inner">
              <div class="hud-panel-lbl">TOOLS</div>
              <div class="hud-stat-sm">{usage.toolUsage?.totalCalls ?? 0}</div>
              <div class="hud-meta">{usage.toolUsage?.uniqueTools ?? 0} unique</div>
            </div>
          </div>
        {/if}

        <!-- Badges -->
        <div class="hud-badges" style="margin-top:14px;">
          {#if selectedSession.agentId}
            <span class="hud-tag cyan">agent:{selectedSession.agentId}</span>
          {/if}
          {#if selectedSession.modelProvider || selectedSession.providerOverride}
            <span class="hud-tag purple">provider:{selectedSession.modelProvider ?? selectedSession.providerOverride}</span>
          {/if}
          {#if selectedSession.model}
            <span class="hud-tag amber">model:{selectedSession.model}</span>
          {/if}
          {#if selectedSession.channel}
            <span class="hud-tag">{selectedSession.channel}</span>
          {/if}
        </div>

        <!-- Model Mix -->
        {#if usage?.modelUsage && usage.modelUsage.length > 0}
          <div class="hud-detail-section">
            <div class="hud-panel-lbl">MODEL MIX</div>
            <div class="hud-badges" style="margin-top:6px;">
              {#each usage.modelUsage.slice(0, 6) as mu}
                <div class="hud-tag">
                  <span class="hud-mono">{mu.model ?? 'unknown'}</span>
                  <span class="hud-meta" style="margin-left:6px;">{formatCost(mu.totals.totalCost)} // {formatTokens(mu.totals.totalTokens)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Top Tools -->
        {#if usage?.toolUsage?.tools && usage.toolUsage.tools.length > 0}
          <div class="hud-detail-section">
            <div class="hud-panel-lbl">TOP TOOLS</div>
            <div class="hud-badges" style="margin-top:6px;">
              {#each usage.toolUsage.tools.slice(0, 8) as tool}
                <span class="hud-tag green">{tool.name} x{tool.count}</span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Usage Over Time -->
        {#if timeSeriesProcessed.length >= 2}
          <div class="hud-detail-section">
            <div class="hud-panel-lbl">USAGE OVER TIME</div>
            <div class="hud-mini-chart">
              {#each timeSeriesProcessed as point}
                {@const tsMax = Math.max(...timeSeriesProcessed.map(p => p.totalTokens), 1)}
                {@const h = Math.max((point.totalTokens / tsMax) * 100, 2)}
                <div class="hud-mini-bar" style="height: {h}%"
                  title="{new Date(point.timestamp).toLocaleString()}: {formatTokens(point.totalTokens)} tokens"></div>
              {/each}
            </div>
            <div class="hud-meta" style="margin-top:4px;">
              {timeSeriesProcessed.length} turns //
              {formatTokens(timeSeriesProcessed[timeSeriesProcessed.length - 1]?.cumulativeTokens ?? 0)} total //
              {formatCost(timeSeriesProcessed[timeSeriesProcessed.length - 1]?.cumulativeCost ?? 0)}
            </div>
          </div>
        {/if}

        <!-- Conversation -->
        {#if sessionLogs && sessionLogs.length > 0}
          <div class="hud-detail-section">
            <div class="hud-panel-lbl">CONVERSATION ({sessionLogs.length} messages)</div>
            <div class="hud-logs">
              {#each sessionLogs.slice(0, 50) as log}
                {@const isUser = log.role === 'user'}
                {@const isAssistant = log.role === 'assistant'}
                <div class="hud-log-line">
                  <span class="hud-log-role {isUser ? 'cyan' : isAssistant ? 'purple' : 'amber'}">
                    {isUser ? 'YOU' : isAssistant ? 'AI' : 'TOOL'}
                  </span>
                  <span class="hud-log-content">{log.content?.slice(0, 300) ?? ''}</span>
                  {#if log.tokens}
                    <span class="hud-meta">{formatTokens(log.tokens)}</span>
                  {/if}
                </div>
              {/each}
              {#if sessionLogs.length > 50}
                <div class="hud-meta" style="text-align:center;padding:4px 0;">+{sessionLogs.length - 50} more messages</div>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════
     HUD PAGE — CYBERPUNK USAGE STATS
  ═══════════════════════════════════════════════ */
  .hud-page {
    position: relative; z-index: 10; width: 100%; height: 100%;
    display: flex; flex-direction: column;
    overflow: hidden; font-family: 'Share Tech Mono', monospace; color: var(--color-accent-cyan);
  }
  .hud-content {
    flex: 1; overflow-y: auto; min-height: 0;
    padding: 14px 22px 22px;
    display: flex; flex-direction: column; gap: 14px;
  }

  /* ─── TOP BAR ─── */
  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding: 18px 22px 10px;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    text-decoration: none;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding: 4px 10px;
    border-radius: 2px;
    transition: all 0.2s;
  }
  .hud-back:hover {
    color: var(--color-accent-cyan);
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: 0.22em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 18px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent),
                 0 0 50px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    margin: 0;
  }

  /* ─── PANELS ─── */
  .hud-panel {
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border-radius: 3px;
    padding: 14px;
    position: relative;
  }
  .hud-panel.error {
    border-color: color-mix(in srgb, var(--color-accent-pink) 40%, transparent);
    background: color-mix(in srgb, var(--color-accent-pink) 5%, transparent);
  }
  .hud-panel.glow-cyan {
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent),
                inset 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
  }
  .hud-panel.glow-purple {
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-purple) 15%, transparent),
                inset 0 0 12px color-mix(in srgb, var(--color-accent-purple) 5%, transparent);
  }
  .hud-panel.compact {
    padding: 10px;
    text-align: center;
  }
  .hud-panel.inner {
    background: color-mix(in srgb, var(--color-accent-cyan) 2%, transparent);
  }
  .hud-panel.skeleton {
    animation: hud-pulse 1.5s ease-in-out infinite;
  }

  .hud-panel-lbl {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.22em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
  }

  .hud-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  /* ─── BUTTONS ─── */
  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    padding: 10px 20px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    text-shadow: 0 0 8px var(--color-accent-cyan);
  }
  .hud-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .hud-btn.sm {
    padding: 3px 8px;
    font-size: 0.65rem;
  }

  /* ─── TOGGLE GROUP ─── */
  .hud-toggle-group {
    display: flex;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }
  .hud-toggle-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    padding: 5px 12px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-toggle-btn:hover {
    color: var(--color-accent-cyan);
  }
  .hud-toggle-btn.active.cyan {
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    color: var(--color-accent-cyan);
  }
  .hud-toggle-btn.active.purple {
    background: color-mix(in srgb, var(--color-accent-purple) 15%, transparent);
    color: var(--color-accent-purple);
  }

  /* ─── INPUTS ─── */
  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    padding: 5px 10px;
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s;
  }
  .hud-input:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  /* Style the date picker icon */
  .hud-input::-webkit-calendar-picker-indicator {
    filter: invert(0.7) sepia(1) saturate(3) hue-rotate(140deg);
  }

  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    padding: 4px 8px;
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
  }

  .hud-sep {
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    font-size: 0.72rem;
  }

  /* ─── STATS ─── */
  .hud-stat {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.5rem;
    font-weight: 700;
    margin: 6px 0 4px;
  }
  .hud-stat.cyan { color: var(--color-accent-cyan); text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-stat.purple { color: var(--color-accent-purple); text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-purple) 40%, transparent); }
  .hud-stat.green { color: var(--color-accent-green); text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-green) 40%, transparent); }
  .hud-stat.amber { color: var(--color-accent-amber); text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-amber) 40%, transparent); }
  .hud-stat.pink { color: var(--color-accent-pink); text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-pink) 40%, transparent); }

  .hud-stat-sm {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
  }
  .hud-stat-sm.cyan { color: var(--color-accent-cyan); }
  .hud-stat-sm.purple { color: var(--color-accent-purple); }
  .hud-stat-sm.green { color: var(--color-accent-green); }
  .hud-stat-sm.pink { color: var(--color-accent-pink); }
  .hud-stat-sm.amber { color: var(--color-accent-amber); }

  .hud-meta {
    font-size: 0.68rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    letter-spacing: 0.08em;
  }

  .hud-warn {
    color: var(--color-accent-amber);
  }

  .hud-error-text {
    color: var(--color-accent-pink);
    font-size: 0.75rem;
    margin: 6px 0 0;
  }

  .hud-mono {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 80%, transparent);
  }

  /* ─── GRIDS ─── */
  .hud-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .hud-grid-4.tight {
    gap: 8px;
  }
  .hud-grid-6 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 10px;
  }
  .hud-grid-3-2 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 12px;
  }
  .hud-panel.span-2 {
    /* used in grid-3-2 for the left column */
  }

  @media (max-width: 900px) {
    .hud-grid-4 { grid-template-columns: repeat(2, 1fr); }
    .hud-grid-6 { grid-template-columns: repeat(3, 1fr); }
    .hud-grid-3-2 { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    .hud-grid-4 { grid-template-columns: 1fr; }
    .hud-grid-6 { grid-template-columns: repeat(2, 1fr); }
  }

  /* ─── RANGE ROW ─── */
  .hud-range-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }

  /* ─── BAR CHART (STACKED) ─── */
  .hud-bar-stack {
    height: 14px;
    border-radius: 2px;
    overflow: hidden;
    display: flex;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    margin-bottom: 10px;
  }
  .hud-bar-seg {
    transition: width 0.3s;
  }
  .hud-bar-seg.pink { background: color-mix(in srgb, var(--color-accent-pink) 75%, transparent); }
  .hud-bar-seg.cyan { background: color-mix(in srgb, var(--color-accent-cyan) 75%, transparent); }
  .hud-bar-seg.purple { background: color-mix(in srgb, var(--color-accent-purple) 75%, transparent); }
  .hud-bar-seg.green { background: color-mix(in srgb, var(--color-accent-green) 75%, transparent); }

  /* ─── LEGEND ─── */
  .hud-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
  }
  .hud-legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .hud-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 1px;
  }
  .hud-legend-dot.pink { background: color-mix(in srgb, var(--color-accent-pink) 75%, transparent); }
  .hud-legend-dot.cyan { background: color-mix(in srgb, var(--color-accent-cyan) 75%, transparent); }
  .hud-legend-dot.purple { background: color-mix(in srgb, var(--color-accent-purple) 75%, transparent); }
  .hud-legend-dot.green { background: color-mix(in srgb, var(--color-accent-green) 75%, transparent); }
  .hud-legend-val {
    font-size: 0.68rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 70%, transparent);
    font-weight: 600;
  }

  /* ─── DAILY CHART ─── */
  .hud-chart-bars {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 144px;
  }
  .hud-chart-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    min-width: 0;
    height: 100%;
    justify-content: flex-end;
  }
  .hud-chart-bar {
    width: 100%;
    border-radius: 1px 1px 0 0;
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    transition: background 0.2s;
  }
  .hud-chart-col:hover .hud-chart-bar {
    background: color-mix(in srgb, var(--color-accent-cyan) 85%, transparent);
  }
  .hud-chart-tooltip {
    position: absolute;
    bottom: 100%;
    margin-bottom: 8px;
    display: none;
    z-index: 10;
    background: color-mix(in srgb, var(--color-bg-primary) 95%, var(--color-accent-cyan));
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 3px;
    padding: 8px 10px;
    white-space: nowrap;
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }
  .hud-chart-col:hover .hud-chart-tooltip {
    display: block;
  }
  .hud-tooltip-title {
    font-size: 0.72rem;
    color: var(--color-accent-cyan);
    font-weight: 600;
    margin-bottom: 2px;
  }
  .hud-chart-axis {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    padding: 0 2px;
    font-size: 0.58rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    letter-spacing: 0.08em;
  }

  /* ─── PROGRESS BARS ─── */
  .hud-progress-track {
    height: 5px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    overflow: hidden;
  }
  .hud-progress-fill {
    height: 100%;
    border-radius: 1px;
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--color-accent-cyan) 70%, transparent),
      color-mix(in srgb, var(--color-accent-purple) 70%, transparent));
    transition: width 0.3s;
  }
  .hud-progress-fill.purple {
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--color-accent-purple) 70%, transparent),
      color-mix(in srgb, var(--color-accent-pink) 70%, transparent));
  }

  /* ─── MODELS / PROVIDERS ─── */
  .hud-model-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .hud-model-item {}
  .hud-model-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .hud-provider-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .hud-provider-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  /* ─── TAGS ─── */
  .hud-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    padding: 2px 7px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    flex-shrink: 0;
  }
  .hud-tag.purple {
    background: color-mix(in srgb, var(--color-accent-purple) 8%, transparent);
    color: color-mix(in srgb, var(--color-accent-purple) 70%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-purple) 15%, transparent);
  }
  .hud-tag.cyan {
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  .hud-tag.green {
    background: color-mix(in srgb, var(--color-accent-green) 8%, transparent);
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 15%, transparent);
  }
  .hud-tag.amber {
    background: color-mix(in srgb, var(--color-accent-amber) 8%, transparent);
    color: var(--color-accent-amber);
    border-color: color-mix(in srgb, var(--color-accent-amber) 15%, transparent);
  }
  .hud-tag.mono {
    font-family: 'Share Tech Mono', monospace;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  /* ─── SESSIONS ─── */
  .hud-session-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 60vh;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-accent-cyan) 30%, transparent) transparent;
  }
  .hud-session-row {
    width: 100%;
    text-align: left;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    padding: 10px 12px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
  }
  .hud-session-row:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }
  .hud-session-row.selected {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }
  .hud-session-main {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .hud-session-info {
    flex: 1;
    min-width: 0;
  }
  .hud-session-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .hud-session-name {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--color-accent-cyan);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hud-session-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.62rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    letter-spacing: 0.06em;
  }
  .hud-chevron {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    transition: transform 0.2s;
    flex-shrink: 0;
    font-size: 0.8rem;
    margin-top: 2px;
  }
  .hud-chevron.open {
    transform: rotate(180deg);
  }

  /* ─── SESSION DETAIL ─── */
  /* ─── DRAWER ─── */
  .drawer-backdrop {
    position: fixed; inset: 0; z-index: 90;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    animation: fade-in 0.15s ease-out;
  }
  .drawer-panel {
    position: fixed; top: 0; right: 0; bottom: 0; z-index: 91;
    width: min(560px, 85vw);
    background: #0a0e18;
    border-left: 1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
    box-shadow: -4px 0 30px rgba(0, 0, 0, 0.6), -1px 0 15px color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
    display: flex; flex-direction: column;
    animation: slide-in-right 0.2s ease-out;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
  }
  .drawer-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    flex-shrink: 0;
  }
  .drawer-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem; font-weight: 700; letter-spacing: 0.12em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 40%, transparent);
  }
  .drawer-close {
    background: transparent; border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
    color: var(--color-accent-cyan); font-size: 1rem; padding: 4px 10px;
    border-radius: 2px; cursor: pointer; transition: all 0.2s;
  }
  .drawer-close:hover {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 40%, transparent);
  }
  .drawer-body {
    flex: 1; min-height: 0; overflow-y: auto; padding: 20px 24px;
    display: flex; flex-direction: column; gap: 0;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent) transparent;
  }
  @keyframes slide-in-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .hud-detail-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    padding: 12px 0;
  }
  .hud-detail-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
  }

  /* ─── MINI CHART ─── */
  .hud-mini-chart {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 56px;
    margin-top: 6px;
  }
  .hud-mini-bar {
    flex: 1;
    min-width: 1px;
    border-radius: 1px 1px 0 0;
    background: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    transition: background 0.2s;
  }
  .hud-mini-bar:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 65%, transparent);
  }

  /* ─── LOGS ─── */
  .hud-logs {
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 3px;
    padding: 10px 12px;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent) transparent;
    margin-top: 6px;
    background: color-mix(in srgb, var(--color-accent-cyan) 1%, transparent);
  }
  .hud-log-line {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 3px 0;
    font-size: 0.68rem;
  }
  .hud-log-role {
    flex-shrink: 0;
    width: 36px;
    text-align: right;
    font-weight: 600;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
  }
  .hud-log-role.cyan { color: var(--color-accent-cyan); }
  .hud-log-role.purple { color: var(--color-accent-purple); }
  .hud-log-role.amber { color: var(--color-accent-amber); }
  .hud-log-content {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  /* ─── EMPTY STATES ─── */
  .hud-empty {
    text-align: center;
    padding: 48px 16px;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    font-size: 0.78rem;
    letter-spacing: 0.15em;
  }
  .hud-empty-icon {
    font-size: 2rem;
    margin-bottom: 12px;
    opacity: 0.5;
  }
  .hud-empty-inline {
    text-align: center;
    padding: 16px;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    font-size: 0.72rem;
    letter-spacing: 0.12em;
  }

  /* ─── SKELETON ─── */
  .hud-skel-line {
    height: 10px;
    border-radius: 1px;
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    margin-bottom: 8px;
  }
  .hud-skel-line.short { width: 50px; }
  .hud-skel-line.wide { width: 80px; height: 20px; }
  .hud-skel-line.med { width: 110px; }

  /* ─── SPINNER ─── */
  .hud-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-top-color: var(--color-accent-cyan);
    border-radius: 50%;
    animation: hud-spin 0.8s linear infinite;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  @keyframes hud-spin {
    to { transform: rotate(360deg); }
  }
</style>
