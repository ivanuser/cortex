<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { gateway } from '$lib/gateway';

  // ─── Types ─────────────────────────────────
  type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  interface LogEntry {
    raw: string;
    time: string | null;
    level: LogLevel | null;
    subsystem: string | null;
    message: string;
  }

  const LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  const LOG_BUFFER_LIMIT = 2000;

  const conn = getConnection();

  // ─── State ─────────────────────────────────
  let entries = $state<LogEntry[]>([]);
  let cursor = $state<number | null>(null);
  let logFile = $state<string | null>(null);
  let truncated = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let filterText = $state('');
  let debouncedFilterText = $state('');
  let autoFollow = $state(true);
  let pollTimer = $state<ReturnType<typeof setInterval> | null>(null);

  let levelFilters = $state<Record<LogLevel, boolean>>({
    trace: true,
    debug: true,
    info: true,
    warn: true,
    error: true,
    fatal: true,
  });

  // Scroll container ref
  let scrollContainer: HTMLDivElement | undefined = $state();

  // ─── Log Parsing ───────────────────────────
  function normalizeLevel(value: unknown): LogLevel | null {
    if (typeof value !== 'string') return null;
    const lowered = value.toLowerCase() as LogLevel;
    return LEVELS.includes(lowered) ? lowered : null;
  }

  function parseMaybeJson(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  function parseLogLine(line: string): LogEntry {
    if (!line.trim()) return { raw: line, time: null, level: null, subsystem: null, message: line };
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const meta = obj && typeof obj._meta === 'object' && obj._meta !== null
        ? (obj._meta as Record<string, unknown>)
        : null;

      const time = typeof obj.time === 'string' ? obj.time :
                   typeof meta?.date === 'string' ? (meta.date as string) : null;
      const level = normalizeLevel(meta?.logLevelName ?? meta?.level);

      const contextCandidate = typeof obj['0'] === 'string' ? obj['0'] :
                                typeof meta?.name === 'string' ? (meta.name as string) : null;
      const contextObj = parseMaybeJson(contextCandidate);
      let subsystem: string | null = null;
      if (contextObj) {
        subsystem = typeof contextObj.subsystem === 'string' ? contextObj.subsystem :
                    typeof contextObj.module === 'string' ? (contextObj.module as string) : null;
      }
      if (!subsystem && contextCandidate && contextCandidate.length < 120) {
        subsystem = contextCandidate;
      }

      let message: string | null = null;
      if (typeof obj['1'] === 'string') message = obj['1'];
      else if (!contextObj && typeof obj['0'] === 'string') message = obj['0'];
      else if (typeof obj.message === 'string') message = obj.message;

      return { raw: line, time, level, subsystem, message: message ?? line };
    } catch {
      return { raw: line, time: null, level: null, subsystem: null, message: line };
    }
  }

  // ─── Load/Fetch Logs ──────────────────────
  async function loadLogs(opts?: { reset?: boolean; quiet?: boolean }) {
    if (!gateway.connected) return;
    if (loading && !opts?.quiet) return;
    if (!opts?.quiet) loading = true;
    if (!opts?.quiet) error = null;  // Only clear error on explicit loads
    try {
      const res = await gateway.call<Record<string, unknown>>('logs.tail', {
        cursor: opts?.reset ? undefined : (cursor ?? undefined),
        limit: 200,
        maxBytes: 512000,
      });

      // Handle various response shapes
      const rawLines = Array.isArray(res?.lines) ? res.lines
        : Array.isArray(res) ? res
        : [];
      const lines = rawLines.filter((l): l is string => typeof l === 'string');
      const parsed = lines.map(parseLogLine);
      const shouldReset = Boolean(opts?.reset || res.reset || cursor == null);

      entries = shouldReset
        ? parsed
        : [...entries, ...parsed].slice(-LOG_BUFFER_LIMIT);

      // Clear error on successful fetch
      if (parsed.length > 0 || shouldReset) error = null;

      if (typeof res.cursor === 'number') cursor = res.cursor;
      if (typeof res.file === 'string') logFile = res.file;
      truncated = Boolean(res.truncated);

      // Auto-scroll
      if (autoFollow && parsed.length > 0) {
        requestAnimationFrame(() => {
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });
      }
    } catch (e) {
      error = String(e);
    } finally {
      if (!opts?.quiet) loading = false;
    }
  }

  // ─── Auto-poll ─────────────────────────────
  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => {
      if (gateway.connected) {
        loadLogs({ quiet: true });
      }
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // Auto-start polling and load on connect (with retry)
  $effect(() => {
    const status = conn.state.status;
    untrack(() => {
      if (status === 'connected') {
        // Initial load + retry once after 2s if first attempt fails
        loadLogs({ reset: true }).then(() => {
          if (entries.length === 0 && !error) {
            setTimeout(() => loadLogs({ reset: true }), 2000);
          }
        });
        startPolling();
      } else {
        stopPolling();
      }
    });
    return () => untrack(() => stopPolling());
  });

  // ─── Debounce filter text ──────────────────
  $effect(() => {
    const q = filterText;
    const timer = setTimeout(() => { debouncedFilterText = q; }, 200);
    return () => clearTimeout(timer);
  });

  // ─── Filtering ─────────────────────────────
  let filteredEntries = $derived.by(() => {
    const needle = debouncedFilterText.trim().toLowerCase();
    return entries.filter((entry) => {
      if (entry.level && !levelFilters[entry.level]) return false;
      if (!needle) return true;
      const haystack = [entry.message, entry.subsystem, entry.raw]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  });

  let activeFilterCount = $derived(LEVELS.filter(l => !levelFilters[l]).length);

  // ─── Export ────────────────────────────────
  function exportLogs() {
    const text = filteredEntries.map(e => e.raw).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cortex-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Helpers ───────────────────────────────
  function formatTime(value: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as Intl.DateTimeFormatOptions);
  }

  function levelColor(level: LogLevel | null): string {
    switch (level) {
      case 'trace': return 'text-gray-500';
      case 'debug': return 'text-blue-400';
      case 'info': return 'text-accent-cyan';
      case 'warn': return 'text-amber-400';
      case 'error': return 'text-red-400';
      case 'fatal': return 'text-accent-pink';
      default: return 'text-text-muted';
    }
  }

  function levelBg(level: LogLevel | null): string {
    switch (level) {
      case 'trace': return 'bg-gray-500/10';
      case 'debug': return 'bg-blue-400/10';
      case 'info': return 'bg-accent-cyan/10';
      case 'warn': return 'bg-amber-400/10';
      case 'error': return 'bg-red-400/10';
      case 'fatal': return 'bg-accent-pink/10';
      default: return '';
    }
  }

  function chipColor(level: LogLevel): string {
    switch (level) {
      case 'trace': return 'border-gray-500/40 text-gray-400 has-[:checked]:bg-gray-500/20 has-[:checked]:border-gray-500';
      case 'debug': return 'border-blue-400/40 text-blue-400 has-[:checked]:bg-blue-400/20 has-[:checked]:border-blue-400';
      case 'info': return 'border-accent-cyan/40 text-accent-cyan has-[:checked]:bg-accent-cyan/20 has-[:checked]:border-accent-cyan';
      case 'warn': return 'border-amber-400/40 text-amber-400 has-[:checked]:bg-amber-400/20 has-[:checked]:border-amber-400';
      case 'error': return 'border-red-400/40 text-red-400 has-[:checked]:bg-red-400/20 has-[:checked]:border-red-400';
      case 'fatal': return 'border-accent-pink/40 text-accent-pink has-[:checked]:bg-accent-pink/20 has-[:checked]:border-accent-pink';
    }
  }

  function handleScroll() {
    if (!scrollContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    if (!atBottom && autoFollow) {
      autoFollow = false;
    }
  }

  function toggleLevel(level: LogLevel) {
    levelFilters[level] = !levelFilters[level];
  }
</script>

<svelte:head>
  <title>Logs — Cortex</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <div class="flex-1 flex flex-col max-w-full p-4 md:p-6 overflow-hidden">

    <!-- Header -->
    <div class="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary flex items-center gap-3">
          <span class="text-accent-cyan">📋</span>
          Logs
        </h1>
        <p class="text-sm text-text-muted mt-0.5">
          Live gateway log tail
          {#if logFile}
            <span class="font-mono text-xs text-text-muted/60">— {logFile}</span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <!-- Entry count -->
        <span class="text-xs text-text-muted font-mono">
          {filteredEntries.length}{activeFilterCount > 0 ? ` / ${entries.length}` : ''} entries
        </span>
        <!-- Export -->
        <button
          onclick={exportLogs}
          disabled={filteredEntries.length === 0}
          class="px-3 py-2 rounded-lg text-xs border border-border-default hover:border-accent-purple
                 text-text-secondary hover:text-accent-purple transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Export
        </button>
        <!-- Refresh -->
        <button
          onclick={() => loadLogs({ reset: true })}
          disabled={loading || conn.state.status !== 'connected'}
          class="px-3 py-2 rounded-lg text-xs border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          {#if loading}
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          Refresh
        </button>
      </div>
    </div>

    {#if conn.state.status !== 'connected'}
      <div class="flex-1 flex items-center justify-center">
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center">
          <div class="text-text-muted text-sm">Connect to the gateway to view logs.</div>
        </div>
      </div>
    {:else}

      <!-- Controls Bar -->
      <div class="flex flex-wrap items-center gap-3 mb-3 flex-shrink-0">
        <!-- Search -->
        <div class="relative flex-1 min-w-[200px] max-w-sm">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            bind:value={filterText}
            placeholder="Filter logs…"
            class="w-full bg-bg-input border border-border-default rounded-lg pl-9 pr-3 py-2
                   text-sm text-text-primary placeholder:text-text-muted/50
                   focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)]
                   transition-all"
          />
        </div>

        <!-- Level filter chips -->
        <div class="flex items-center gap-1.5">
          {#each LEVELS as level}
            <label class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono
                          border cursor-pointer transition-all select-none {chipColor(level)}">
              <input
                type="checkbox"
                checked={levelFilters[level]}
                onchange={() => toggleLevel(level)}
                class="sr-only"
              />
              {level}
            </label>
          {/each}
        </div>

        <!-- Auto-follow toggle -->
        <label class="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none ml-auto">
          <input
            type="checkbox"
            bind:checked={autoFollow}
            class="w-3.5 h-3.5 rounded border-border-default bg-bg-input accent-accent-cyan"
          />
          Auto-scroll
        </label>
      </div>

      <!-- Truncated warning -->
      {#if truncated}
        <div class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-amber-400 text-xs mb-2 flex-shrink-0">
          Log output truncated — showing latest chunk.
        </div>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-red-400 text-xs mb-2 flex-shrink-0">
          {error}
        </div>
      {/if}

      <!-- Log Stream -->
      <div
        bind:this={scrollContainer}
        onscroll={handleScroll}
        class="flex-1 overflow-y-auto bg-bg-input/30 border border-border-default rounded-xl"
      >
        {#if filteredEntries.length === 0}
          <div class="flex items-center justify-center h-full text-text-muted/40 text-sm">
            {entries.length === 0 ? 'Waiting for log entries…' : 'No entries match current filters'}
          </div>
        {:else}
          <div class="divide-y divide-border-default/30">
            {#each filteredEntries as entry}
              <div class="virtual-item flex items-start gap-0 px-3 py-1 hover:bg-bg-hover/30 transition-colors text-xs font-mono {levelBg(entry.level)}">
                <!-- Timestamp -->
                <span class="w-[85px] flex-shrink-0 text-text-muted/70 select-all">
                  {formatTime(entry.time)}
                </span>
                <!-- Level -->
                <span class="w-[50px] flex-shrink-0 font-bold uppercase {levelColor(entry.level)}">
                  {entry.level ?? ''}
                </span>
                <!-- Subsystem -->
                {#if entry.subsystem}
                  <span class="w-[140px] flex-shrink-0 text-accent-purple/70 truncate" title={entry.subsystem}>
                    {entry.subsystem}
                  </span>
                {:else}
                  <span class="w-[140px] flex-shrink-0"></span>
                {/if}
                <!-- Message -->
                <span class="flex-1 text-text-secondary break-all select-all whitespace-pre-wrap">
                  {entry.message}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Status bar -->
      <div class="flex items-center justify-between mt-2 flex-shrink-0 text-[10px] text-text-muted/50 font-mono">
        <span>
          {#if pollTimer}
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-accent-green/60 mr-1 animate-pulse"></span>
            Polling every 3s
          {:else}
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-text-muted/30 mr-1"></span>
            Paused
          {/if}
        </span>
        <span>
          Buffer: {entries.length}/{LOG_BUFFER_LIMIT}
          {#if cursor != null}
            · Cursor: {cursor}
          {/if}
        </span>
      </div>

    {/if}
  </div>
</div>
