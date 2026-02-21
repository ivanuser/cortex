<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

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
    if (!ms || ms <= 0) return '—';
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
    return raw.length > 60 ? raw.slice(0, 60) + '…' : raw;
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

<div class="h-full overflow-y-auto">
  <div class="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

    <!-- ═══ Page Header ═══════════════════════════ -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">Usage Analytics</h1>
        <p class="text-sm text-text-muted mt-1">Track tokens, costs, and session activity across your gateway.</p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Chart mode toggle -->
        <div class="flex rounded-lg border border-border-default overflow-hidden">
          <button
            onclick={() => chartMode = 'tokens'}
            class="px-3 py-1.5 text-xs font-medium transition-all
                   {chartMode === 'tokens' ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-muted hover:text-text-secondary'}">
            Tokens
          </button>
          <button
            onclick={() => chartMode = 'cost'}
            class="px-3 py-1.5 text-xs font-medium transition-all
                   {chartMode === 'cost' ? 'bg-accent-purple/20 text-accent-purple' : 'text-text-muted hover:text-text-secondary'}">
            Cost
          </button>
        </div>
        <button onclick={() => loadUsage()} disabled={loading || conn.state.status !== 'connected'}
          class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
          {#if loading}
            <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          Refresh
        </button>
      </div>
    </div>

    <!-- ═══ Date Range Picker ═════════════════════ -->
    <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
      <div class="flex items-center flex-wrap gap-3">
        <div class="flex items-center gap-2">
          <span class="text-xs text-text-muted uppercase tracking-wider font-medium">Range</span>
          <input
            type="date"
            bind:value={startDate}
            class="px-3 py-1.5 rounded-lg border border-border-default bg-bg-tertiary text-sm
                   text-text-primary focus:outline-none focus:border-accent-cyan transition-all"
          />
          <span class="text-text-muted text-sm">to</span>
          <input
            type="date"
            bind:value={endDate}
            class="px-3 py-1.5 rounded-lg border border-border-default bg-bg-tertiary text-sm
                   text-text-primary focus:outline-none focus:border-accent-cyan transition-all"
          />
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick={() => applyPreset(1)}
            class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted
                   hover:border-accent-cyan hover:text-accent-cyan transition-all">
            Today
          </button>
          <button onclick={() => applyPreset(7)}
            class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted
                   hover:border-accent-cyan hover:text-accent-cyan transition-all">
            7d
          </button>
          <button onclick={() => applyPreset(30)}
            class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted
                   hover:border-accent-cyan hover:text-accent-cyan transition-all">
            30d
          </button>
          <button onclick={() => applyPreset(90)}
            class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted
                   hover:border-accent-cyan hover:text-accent-cyan transition-all">
            90d
          </button>
        </div>
        {#if sessions.length > 0}
          <span class="text-xs text-text-muted ml-auto">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} in range
            {#if sessions.length >= 1000}
              <span class="text-accent-amber ml-1">(limit reached)</span>
            {/if}
          </span>
        {/if}
      </div>
    </div>

    <!-- ═══ Error Banner ══════════════════════════ -->
    {#if error}
      <div class="rounded-xl border border-status-error/30 bg-status-error/10 p-4">
        <p class="text-sm text-status-error">{error}</p>
      </div>
    {/if}

    <!-- ═══ Not Connected ═════════════════════════ -->
    {#if conn.state.status !== 'connected'}
      <div class="text-center py-16">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">Connect to the gateway to view usage analytics.</p>
      </div>

    <!-- ═══ Loading skeleton ══════════════════════ -->
    {:else if loading && !totals}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-3 w-16 bg-bg-tertiary rounded mb-3"></div>
            <div class="h-7 w-24 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-32 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>

    <!-- ═══ Main Content ══════════════════════════ -->
    {:else if totals}

      <!-- ─── Overview Stats Cards ─────────────── -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Total Tokens -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 glow-cyan">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Total Tokens</div>
          <div class="text-2xl font-bold text-accent-cyan">{formatTokens(totals.totalTokens)}</div>
          <div class="text-xs text-text-muted mt-1">
            {formatTokens(totals.input)} in · {formatTokens(totals.output)} out
          </div>
        </div>

        <!-- Total Cost -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 glow-purple">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Total Cost</div>
          <div class="text-2xl font-bold text-accent-purple">{formatCost(totals.totalCost)}</div>
          <div class="text-xs text-text-muted mt-1">
            {costSummary?.currency ?? 'USD'} · {formatCost(totals.totalCost / Math.max(sessions.length, 1), 3)} avg/session
          </div>
        </div>

        <!-- Sessions -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Sessions</div>
          <div class="text-2xl font-bold text-accent-green">{sessions.length}</div>
          <div class="text-xs text-text-muted mt-1">
            {#if aggregates}
              {aggregates.messages.total} messages · {aggregates.messages.errors} errors
            {:else}
              In selected range
            {/if}
          </div>
        </div>

        <!-- Cache Hit Rate -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Cache Hit Rate</div>
          <div class="text-2xl font-bold {cacheHitRate > 0.6 ? 'text-accent-green' : cacheHitRate > 0.3 ? 'text-accent-amber' : 'text-accent-pink'}">
            {cacheHitRate > 0 ? `${(cacheHitRate * 100).toFixed(1)}%` : '—'}
          </div>
          <div class="text-xs text-text-muted mt-1">
            {formatTokens(totals.cacheRead)} cached · {formatTokens(totals.input)} uncached
          </div>
        </div>
      </div>

      <!-- ─── Secondary Stats ──────────────────── -->
      {#if aggregates}
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold text-text-primary">{aggregates.messages.total}</div>
            <div class="text-xs text-text-muted">Messages</div>
          </div>
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold text-text-primary">{aggregates.messages.user}</div>
            <div class="text-xs text-text-muted">User Msgs</div>
          </div>
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold text-text-primary">{aggregates.messages.assistant}</div>
            <div class="text-xs text-text-muted">Assistant Msgs</div>
          </div>
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold text-text-primary">{aggregates.tools.totalCalls}</div>
            <div class="text-xs text-text-muted">Tool Calls</div>
          </div>
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold text-text-primary">{aggregates.tools.uniqueTools}</div>
            <div class="text-xs text-text-muted">Unique Tools</div>
          </div>
          <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
            <div class="text-lg font-bold {aggregates.messages.errors > 0 ? 'text-accent-pink' : 'text-text-primary'}">{aggregates.messages.errors}</div>
            <div class="text-xs text-text-muted">Errors</div>
          </div>
        </div>
      {/if}

      <!-- ─── Cost Breakdown Bar ───────────────── -->
      {#if costBreakdown && totals.totalCost > 0}
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">
            {chartMode === 'tokens' ? 'Token' : 'Cost'} Breakdown
          </h3>
          <!-- Stacked bar -->
          <div class="h-4 rounded-full overflow-hidden flex bg-bg-tertiary mb-3">
            {#if chartMode === 'tokens'}
              <div class="bg-accent-pink/80 transition-all" style="width: {pct(totals.output, totals.totalTokens)}%"
                title="Output: {formatTokens(totals.output)}"></div>
              <div class="bg-accent-cyan/80 transition-all" style="width: {pct(totals.input, totals.totalTokens)}%"
                title="Input: {formatTokens(totals.input)}"></div>
              <div class="bg-accent-purple/80 transition-all" style="width: {pct(totals.cacheWrite, totals.totalTokens)}%"
                title="Cache Write: {formatTokens(totals.cacheWrite)}"></div>
              <div class="bg-accent-green/80 transition-all" style="width: {pct(totals.cacheRead, totals.totalTokens)}%"
                title="Cache Read: {formatTokens(totals.cacheRead)}"></div>
            {:else}
              <div class="bg-accent-pink/80 transition-all" style="width: {costBreakdown.output.pct}%"
                title="Output: {formatCost(costBreakdown.output.cost)}"></div>
              <div class="bg-accent-cyan/80 transition-all" style="width: {costBreakdown.input.pct}%"
                title="Input: {formatCost(costBreakdown.input.cost)}"></div>
              <div class="bg-accent-purple/80 transition-all" style="width: {costBreakdown.cacheWrite.pct}%"
                title="Cache Write: {formatCost(costBreakdown.cacheWrite.cost)}"></div>
              <div class="bg-accent-green/80 transition-all" style="width: {costBreakdown.cacheRead.pct}%"
                title="Cache Read: {formatCost(costBreakdown.cacheRead.cost)}"></div>
            {/if}
          </div>
          <!-- Legend -->
          <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm bg-accent-pink/80"></span>
              <span class="text-text-muted">Output</span>
              <span class="text-text-secondary font-medium">
                {chartMode === 'tokens' ? formatTokens(totals.output) : formatCost(costBreakdown.output.cost)}
              </span>
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm bg-accent-cyan/80"></span>
              <span class="text-text-muted">Input</span>
              <span class="text-text-secondary font-medium">
                {chartMode === 'tokens' ? formatTokens(totals.input) : formatCost(costBreakdown.input.cost)}
              </span>
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm bg-accent-purple/80"></span>
              <span class="text-text-muted">Cache Write</span>
              <span class="text-text-secondary font-medium">
                {chartMode === 'tokens' ? formatTokens(totals.cacheWrite) : formatCost(costBreakdown.cacheWrite.cost)}
              </span>
            </span>
            <span class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-sm bg-accent-green/80"></span>
              <span class="text-text-muted">Cache Read</span>
              <span class="text-text-secondary font-medium">
                {chartMode === 'tokens' ? formatTokens(totals.cacheRead) : formatCost(costBreakdown.cacheRead.cost)}
              </span>
            </span>
          </div>
        </div>
      {/if}

      <!-- ─── Daily Chart + Model Breakdown Grid ── -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        <!-- Daily Usage Chart -->
        <div class="lg:col-span-2 rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">
            Daily {chartMode === 'tokens' ? 'Token' : 'Cost'} Usage
          </h3>
          {#if daily.length > 0}
            <div class="flex items-end gap-px h-36">
              {#each daily as day}
                {@const value = chartMode === 'tokens' ? day.totalTokens : day.totalCost}
                {@const heightPct = Math.max((value / dailyMax) * 100, 1)}
                {@const dayLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                <div class="flex-1 flex flex-col items-center group relative min-w-0">
                  <div
                    class="w-full rounded-t transition-all bg-accent-cyan/60 hover:bg-accent-cyan/90 cursor-default"
                    style="height: {heightPct}%"
                    title="{dayLabel}: {chartMode === 'tokens' ? formatTokens(value) : formatCost(value)}"
                  ></div>
                  <!-- Tooltip -->
                  <div class="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div class="glass rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg border border-border-default">
                      <div class="font-medium text-text-primary">{dayLabel}</div>
                      <div class="text-text-secondary">{formatTokens(day.totalTokens)} tokens</div>
                      <div class="text-text-secondary">{formatCost(day.totalCost)}</div>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
            <!-- X-axis labels (first, mid, last) -->
            {#if daily.length >= 2}
              <div class="flex justify-between mt-1.5 text-[10px] text-text-muted px-1">
                <span>{new Date(daily[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                {#if daily.length > 2}
                  <span>{new Date(daily[Math.floor(daily.length / 2)].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                {/if}
                <span>{new Date(daily[daily.length - 1].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
            {/if}
          {:else}
            <div class="h-36 flex items-center justify-center text-text-muted text-sm">No daily data</div>
          {/if}
        </div>

        <!-- Model Breakdown -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
          <h3 class="text-sm font-semibold text-text-primary mb-3">Top Models</h3>
          {#if topModels.length > 0}
            <div class="space-y-3">
              {#each topModels as model}
                {@const maxCost = topModels[0]?.cost || 1}
                {@const barWidth = pct(model.cost, maxCost)}
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <span class="text-text-secondary truncate mr-2 font-mono">{model.name}</span>
                    <span class="text-text-muted whitespace-nowrap">{formatCost(model.cost)}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all"
                      style="width: {barWidth}%"></div>
                  </div>
                  <div class="text-[10px] text-text-muted mt-0.5">
                    {formatTokens(model.tokens)} tokens · {model.count} msgs
                  </div>
                </div>
              {/each}
            </div>
          {:else}
            <div class="flex items-center justify-center h-24 text-text-muted text-sm">No model data</div>
          {/if}

          <!-- Top Providers (compact) -->
          {#if topProviders.length > 0}
            <h3 class="text-sm font-semibold text-text-primary mt-5 mb-2">Top Providers</h3>
            <div class="space-y-1.5">
              {#each topProviders as provider}
                <div class="flex justify-between text-xs">
                  <span class="text-text-secondary font-mono">{provider.name}</span>
                  <span class="text-text-muted">{formatCost(provider.cost)} · {formatTokens(provider.tokens)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- ─── Sessions List ────────────────────── -->
      <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-text-primary">Sessions</h3>
          <div class="flex items-center gap-2">
            <select bind:value={sortBy}
              class="px-2 py-1 text-xs rounded-lg border border-border-default bg-bg-tertiary text-text-secondary">
              <option value="tokens">Sort: Tokens</option>
              <option value="cost">Sort: Cost</option>
              <option value="recent">Sort: Recent</option>
            </select>
            <span class="text-xs text-text-muted">{sessions.length} total</span>
          </div>
        </div>

        {#if sortedSessions.length === 0}
          <div class="text-center py-8 text-text-muted text-sm">No sessions in this date range.</div>
        {:else}
          <div class="space-y-1">
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
                class="w-full text-left rounded-lg p-3 transition-all border
                       {isSelected
                         ? 'border-accent-cyan/50 bg-accent-cyan/5 glow-cyan'
                         : 'border-transparent hover:bg-bg-hover'}">
                <div class="flex items-start gap-3">
                  <!-- Session info -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5">
                      <span class="text-sm font-medium text-text-primary truncate">{sessionLabel(session)}</span>
                      {#if session.channel}
                        <span class="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted flex-shrink-0">{session.channel}</span>
                      {/if}
                      {#if session.model}
                        <span class="px-1.5 py-0.5 rounded text-[10px] bg-accent-purple/10 text-purple-300 flex-shrink-0 truncate max-w-32">{session.model}</span>
                      {/if}
                    </div>
                    <!-- Usage bar -->
                    <div class="h-1 rounded-full bg-bg-tertiary overflow-hidden mt-1.5 mb-1">
                      <div class="h-full rounded-full transition-all {chartMode === 'tokens' ? 'bg-accent-cyan/60' : 'bg-accent-purple/60'}"
                        style="width: {barPct}%"></div>
                    </div>
                    <div class="flex items-center gap-3 text-[11px] text-text-muted">
                      {#if usage}
                        <span>{formatTokens(usage.totalTokens)} tokens</span>
                        <span>{formatCost(usage.totalCost)}</span>
                        {#if usage.messageCounts}
                          <span>{usage.messageCounts.total} msgs</span>
                        {/if}
                        {#if usage.messageCounts?.errors}
                          <span class="text-accent-pink">{usage.messageCounts.errors} errors</span>
                        {/if}
                      {/if}
                      <span class="ml-auto">{formatTime(session.updatedAt)}</span>
                    </div>
                  </div>
                  <!-- Expand chevron -->
                  <svg class="w-4 h-4 text-text-muted flex-shrink-0 mt-1 transition-transform {isSelected ? 'rotate-180' : ''}"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                <!-- ═══ Expanded Session Detail ═══ -->
                {#if isSelected}
                  <div class="mt-3 pt-3 border-t border-border-default" onclick={(e) => e.stopPropagation()}>
                    {#if detailLoading}
                      <div class="flex items-center gap-2 text-sm text-text-muted py-4">
                        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Loading session details...
                      </div>
                    {:else}
                      <!-- Session Summary Cards -->
                      {#if usage}
                        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                          <div class="rounded-lg bg-bg-tertiary/50 p-2.5">
                            <div class="text-[10px] text-text-muted uppercase">Input</div>
                            <div class="text-sm font-bold text-accent-cyan">{formatTokens(usage.input)}</div>
                            {#if usage.inputCost}<div class="text-[10px] text-text-muted">{formatCost(usage.inputCost, 4)}</div>{/if}
                          </div>
                          <div class="rounded-lg bg-bg-tertiary/50 p-2.5">
                            <div class="text-[10px] text-text-muted uppercase">Output</div>
                            <div class="text-sm font-bold text-accent-pink">{formatTokens(usage.output)}</div>
                            {#if usage.outputCost}<div class="text-[10px] text-text-muted">{formatCost(usage.outputCost, 4)}</div>{/if}
                          </div>
                          <div class="rounded-lg bg-bg-tertiary/50 p-2.5">
                            <div class="text-[10px] text-text-muted uppercase">Duration</div>
                            <div class="text-sm font-bold text-text-primary">{formatDuration(usage.durationMs)}</div>
                            {#if usage.messageCounts}<div class="text-[10px] text-text-muted">{usage.messageCounts.total} messages</div>{/if}
                          </div>
                          <div class="rounded-lg bg-bg-tertiary/50 p-2.5">
                            <div class="text-[10px] text-text-muted uppercase">Tools</div>
                            <div class="text-sm font-bold text-text-primary">{usage.toolUsage?.totalCalls ?? 0}</div>
                            <div class="text-[10px] text-text-muted">{usage.toolUsage?.uniqueTools ?? 0} unique</div>
                          </div>
                        </div>
                      {/if}

                      <!-- Metadata badges -->
                      <div class="flex flex-wrap gap-1.5 mb-3">
                        {#if session.agentId}
                          <span class="px-2 py-0.5 rounded text-[10px] bg-accent-cyan/10 text-accent-cyan">agent:{session.agentId}</span>
                        {/if}
                        {#if session.modelProvider || session.providerOverride}
                          <span class="px-2 py-0.5 rounded text-[10px] bg-accent-purple/10 text-accent-purple">
                            provider:{session.modelProvider ?? session.providerOverride}
                          </span>
                        {/if}
                        {#if session.model}
                          <span class="px-2 py-0.5 rounded text-[10px] bg-accent-amber/10 text-accent-amber">model:{session.model}</span>
                        {/if}
                        <span class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted font-mono truncate max-w-80">{session.key}</span>
                      </div>

                      <!-- Model usage in this session -->
                      {#if usage?.modelUsage && usage.modelUsage.length > 0}
                        <div class="mb-3">
                          <h4 class="text-xs font-medium text-text-muted mb-1.5">Model Mix</h4>
                          <div class="flex flex-wrap gap-2">
                            {#each usage.modelUsage.slice(0, 6) as mu}
                              <div class="rounded-lg bg-bg-tertiary/50 px-2.5 py-1.5 text-xs">
                                <span class="text-text-secondary font-mono">{mu.model ?? 'unknown'}</span>
                                <span class="text-text-muted ml-1.5">{formatCost(mu.totals.totalCost)} · {formatTokens(mu.totals.totalTokens)}</span>
                              </div>
                            {/each}
                          </div>
                        </div>
                      {/if}

                      <!-- Top tools in this session -->
                      {#if usage?.toolUsage?.tools && usage.toolUsage.tools.length > 0}
                        <div class="mb-3">
                          <h4 class="text-xs font-medium text-text-muted mb-1.5">Top Tools</h4>
                          <div class="flex flex-wrap gap-1.5">
                            {#each usage.toolUsage.tools.slice(0, 8) as tool}
                              <span class="px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green">
                                {tool.name} ×{tool.count}
                              </span>
                            {/each}
                          </div>
                        </div>
                      {/if}

                      <!-- Time Series Mini Chart -->
                      {#if timeSeriesProcessed.length >= 2}
                        <div class="mb-3">
                          <h4 class="text-xs font-medium text-text-muted mb-1.5">Usage Over Time</h4>
                          <div class="flex items-end gap-px h-16">
                            {#each timeSeriesProcessed as point}
                              {@const tsMax = Math.max(...timeSeriesProcessed.map(p => p.totalTokens), 1)}
                              {@const h = Math.max((point.totalTokens / tsMax) * 100, 2)}
                              <div
                                class="flex-1 rounded-t bg-accent-cyan/40 hover:bg-accent-cyan/70 transition-all min-w-[1px]"
                                style="height: {h}%"
                                title="{new Date(point.timestamp).toLocaleString()}: {formatTokens(point.totalTokens)} tokens"
                              ></div>
                            {/each}
                          </div>
                          <div class="text-[10px] text-text-muted mt-1">
                            {timeSeriesProcessed.length} turns ·
                            {formatTokens(timeSeriesProcessed[timeSeriesProcessed.length - 1]?.cumulativeTokens ?? 0)} total ·
                            {formatCost(timeSeriesProcessed[timeSeriesProcessed.length - 1]?.cumulativeCost ?? 0)}
                          </div>
                        </div>
                      {/if}

                      <!-- Session Logs Preview -->
                      {#if sessionLogs && sessionLogs.length > 0}
                        <div>
                          <h4 class="text-xs font-medium text-text-muted mb-1.5">
                            Conversation ({sessionLogs.length} messages)
                          </h4>
                          <div class="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border-default bg-bg-primary/50 p-2">
                            {#each sessionLogs.slice(0, 30) as log}
                              {@const isUser = log.role === 'user'}
                              {@const isAssistant = log.role === 'assistant'}
                              <div class="flex gap-2 text-xs py-1 {isUser ? '' : ''}">
                                <span class="font-medium flex-shrink-0 w-14 text-right
                                  {isUser ? 'text-accent-cyan' : isAssistant ? 'text-accent-purple' : 'text-accent-amber'}">
                                  {isUser ? 'You' : isAssistant ? 'AI' : 'Tool'}
                                </span>
                                <span class="text-text-secondary truncate flex-1">{log.content?.slice(0, 200) ?? ''}</span>
                                {#if log.tokens}
                                  <span class="text-text-muted flex-shrink-0">{formatTokens(log.tokens)}</span>
                                {/if}
                              </div>
                            {/each}
                            {#if sessionLogs.length > 30}
                              <div class="text-[10px] text-text-muted text-center py-1">
                                +{sessionLogs.length - 30} more messages
                              </div>
                            {/if}
                          </div>
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/if}
              </button>
            {/each}

            {#if sortedSessions.length > 50}
              <div class="text-center text-xs text-text-muted py-3">
                Showing 50 of {sortedSessions.length} sessions. Narrow the date range for more detail.
              </div>
            {/if}
          </div>
        {/if}
      </div>

    <!-- ═══ Empty State ═══════════════════════════ -->
    {:else if !loading}
      <div class="text-center py-16">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">No usage data found for this date range.</p>
        <p class="text-text-muted text-xs mt-1">Try expanding the date range or check that sessions have been active.</p>
      </div>
    {/if}

  </div>
</div>
