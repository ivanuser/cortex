<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { gateway } from '$lib/gateway';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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
    if (!opts?.quiet) error = null;
    try {
      const res = await gateway.call<Record<string, unknown>>('logs.tail', {
        cursor: opts?.reset ? undefined : (cursor ?? undefined),
        limit: 200,
        maxBytes: 512000,
      });

      const rawLines = Array.isArray(res?.lines) ? res.lines
        : Array.isArray(res) ? res
        : [];
      const lines = rawLines.filter((l): l is string => typeof l === 'string');
      const parsed = lines.map(parseLogLine);
      const shouldReset = Boolean(opts?.reset || res.reset || cursor == null);

      entries = shouldReset
        ? parsed
        : [...entries, ...parsed].slice(-LOG_BUFFER_LIMIT);

      if (parsed.length > 0 || shouldReset) error = null;

      if (typeof res.cursor === 'number') cursor = res.cursor;
      if (typeof res.file === 'string') logFile = res.file;
      truncated = Boolean(res.truncated);

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

  $effect(() => {
    const status = conn.state.status;
    untrack(() => {
      if (status === 'connected') {
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

  function levelCls(level: LogLevel | null): string {
    switch (level) {
      case 'trace': return 'log-lvl-trace';
      case 'debug': return 'log-lvl-debug';
      case 'info': return 'log-lvl-info';
      case 'warn': return 'log-lvl-warn';
      case 'error': return 'log-lvl-error';
      case 'fatal': return 'log-lvl-fatal';
      default: return 'log-lvl-none';
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
  <title>Logs -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top Bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&lt; BACK</a>
    <span class="hud-page-title">LOG VIEWER</span>
    <span class="hud-topbar-meta">
      {filteredEntries.length}{activeFilterCount > 0 ? ` / ${entries.length}` : ''} ENTRIES
    </span>
  </div>

  {#if conn.state.status !== 'connected'}
    <div class="hud-panel" style="text-align:center; margin-top:40px; padding:40px;">
      <div class="hud-panel-lbl" style="justify-content:center">DISCONNECTED</div>
      <span class="hud-muted">Connect to the gateway to view logs.</span>
    </div>
  {:else}

    <!-- Controls Bar -->
    <div class="hud-controls">
      <!-- Search -->
      <div class="hud-search-wrap">
        <input
          bind:value={filterText}
          placeholder="FILTER LOGS..."
          class="hud-search"
        />
      </div>

      <!-- Level filter chips -->
      <div class="hud-chips">
        {#each LEVELS as level}
          <label class="hud-chip {levelCls(level)}" class:active={levelFilters[level]}>
            <input
              type="checkbox"
              checked={levelFilters[level]}
              onchange={() => toggleLevel(level)}
              class="sr-only"
            />
            {level.toUpperCase()}
          </label>
        {/each}
      </div>

      <!-- Actions -->
      <div class="hud-controls-right">
        <label class="hud-follow-toggle">
          <input
            type="checkbox"
            bind:checked={autoFollow}
            class="sr-only"
          />
          <span class="hud-follow-dot" class:on={autoFollow}></span>
          AUTO-SCROLL
        </label>
        <button
          onclick={exportLogs}
          disabled={filteredEntries.length === 0}
          class="hud-btn"
        >
          EXPORT
        </button>
        <button
          onclick={() => loadLogs({ reset: true })}
          disabled={loading || conn.state.status !== 'connected'}
          class="hud-btn"
        >
          {#if loading}
            <span class="hud-spinner"></span>
          {/if}
          REFRESH
        </button>
      </div>
    </div>

    {#if logFile}
      <div class="hud-file-path">{logFile}</div>
    {/if}

    <!-- Truncated warning -->
    {#if truncated}
      <div class="hud-alert hud-alert-warn">
        LOG OUTPUT TRUNCATED -- SHOWING LATEST CHUNK
      </div>
    {/if}

    <!-- Error -->
    {#if error}
      <div class="hud-alert hud-alert-error">
        {error}
      </div>
    {/if}

    <!-- Log Stream -->
    <div
      bind:this={scrollContainer}
      onscroll={handleScroll}
      class="hud-log-stream"
    >
      {#if filteredEntries.length === 0}
        <div class="hud-log-empty">
          {entries.length === 0 ? 'WAITING FOR LOG ENTRIES...' : 'NO ENTRIES MATCH CURRENT FILTERS'}
          <span class="hud-cursor"></span>
        </div>
      {:else}
        {#each filteredEntries as entry}
          <div class="hud-log-line {levelCls(entry.level)}">
            <span class="hud-log-ts">{formatTime(entry.time)}</span>
            <span class="hud-log-lvl">{entry.level?.toUpperCase() ?? ''}</span>
            <span class="hud-log-sub" title={entry.subsystem ?? ''}>{entry.subsystem ?? ''}</span>
            <span class="hud-log-msg">{entry.message}</span>
          </div>
        {/each}
      {/if}
    </div>

    <!-- Status bar -->
    <div class="hud-statusbar">
      <span>
        {#if pollTimer}
          <span class="hud-poll-dot on"></span>
          POLLING 3s
        {:else}
          <span class="hud-poll-dot"></span>
          PAUSED
        {/if}
      </span>
      <span>
        BUFFER: {entries.length}/{LOG_BUFFER_LIMIT}
        {#if cursor != null}
          // CURSOR: {cursor}
        {/if}
      </span>
    </div>

  {/if}
</div>

<style>
  /* ─── PAGE LAYOUT ─── */
  .hud-page {
    position: relative;
    z-index: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 22px;
    font-family: 'Share Tech Mono', monospace;
    overflow: hidden;
    gap: 10px;
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-bottom: 10px;
  }

  .hud-back {
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    text-decoration: none;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .hud-back:hover {
    opacity: 0.7;
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-topbar-meta {
    margin-left: auto;
    font-size: 0.65rem;
    letter-spacing: 0.22em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
  }

  /* ─── PANELS ─── */
  .hud-panel {
    background: color-mix(in srgb, var(--color-accent-cyan) 8%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 3px;
    padding: 16px;
    position: relative;
    overflow: hidden;
  }

  .hud-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }

  .hud-panel-lbl {
    font-size: 0.65rem;
    letter-spacing: 0.35em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
    margin-bottom: 9px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hud-muted {
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── BUTTONS ─── */
  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    padding: 4px 12px;
    border-radius: 2px;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ─── CONTROLS BAR ─── */
  .hud-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .hud-search-wrap {
    flex: 1;
    min-width: 180px;
    max-width: 320px;
  }

  .hud-search {
    width: 100%;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    padding: 5px 10px;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .hud-search::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-search:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  /* ─── LEVEL CHIPS ─── */
  .hud-chips {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .hud-chip {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    padding: 2px 8px;
    border: 1px solid;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    opacity: 0.35;
  }

  .hud-chip.active {
    opacity: 1;
  }

  .hud-chip.log-lvl-trace  { border-color: #6b7280; color: #9ca3af; }
  .hud-chip.active.log-lvl-trace  { background: rgba(107, 114, 128, 0.15); }
  .hud-chip.log-lvl-debug  { border-color: #60a5fa; color: #60a5fa; }
  .hud-chip.active.log-lvl-debug  { background: rgba(96, 165, 250, 0.15); }
  .hud-chip.log-lvl-info   { border-color: var(--color-accent-cyan); color: var(--color-accent-cyan); }
  .hud-chip.active.log-lvl-info   { background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent); }
  .hud-chip.log-lvl-warn   { border-color: #fbbf24; color: #fbbf24; }
  .hud-chip.active.log-lvl-warn   { background: rgba(251, 191, 36, 0.15); }
  .hud-chip.log-lvl-error  { border-color: #f87171; color: #f87171; }
  .hud-chip.active.log-lvl-error  { background: rgba(248, 113, 113, 0.15); }
  .hud-chip.log-lvl-fatal  { border-color: #ff3864; color: #ff3864; }
  .hud-chip.active.log-lvl-fatal  { background: rgba(255, 56, 100, 0.15); }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0,0,0,0);
    white-space: nowrap;
    border: 0;
  }

  .hud-controls-right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .hud-follow-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    cursor: pointer;
    user-select: none;
  }

  .hud-follow-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    transition: all 0.2s;
  }

  .hud-follow-dot.on {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
  }

  .hud-file-path {
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    flex-shrink: 0;
  }

  /* ─── ALERTS ─── */
  .hud-alert {
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    padding: 4px 10px;
    border: 1px solid;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .hud-alert-warn {
    border-color: rgba(251, 191, 36, 0.3);
    background: rgba(251, 191, 36, 0.05);
    color: #fbbf24;
  }

  .hud-alert-error {
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.05);
    color: #f87171;
  }

  /* ─── LOG STREAM ─── */
  .hud-log-stream {
    flex: 1;
    overflow-y: auto;
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, #060a12);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-radius: 3px;
    position: relative;
    min-height: 0;
  }

  .hud-log-stream::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
    pointer-events: none;
    z-index: 1;
  }

  .hud-log-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    gap: 6px;
  }

  .hud-cursor {
    display: inline-block;
    width: 7px;
    height: 13px;
    background: var(--color-accent-cyan);
    animation: hud-blink 1s step-end infinite;
    vertical-align: middle;
  }

  /* ─── LOG LINE ─── */
  .hud-log-line {
    display: flex;
    align-items: flex-start;
    gap: 0;
    padding: 2px 10px;
    font-size: 0.72rem;
    line-height: 1.55;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    transition: background 0.15s;
  }

  .hud-log-line:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
  }

  /* Level-specific row tints */
  .hud-log-line.log-lvl-warn  { background: rgba(251, 191, 36, 0.03); }
  .hud-log-line.log-lvl-error { background: rgba(248, 113, 113, 0.04); }
  .hud-log-line.log-lvl-fatal { background: rgba(255, 56, 100, 0.06); }

  .hud-log-ts {
    width: 85px;
    flex-shrink: 0;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    user-select: all;
  }

  .hud-log-lvl {
    width: 50px;
    flex-shrink: 0;
    font-weight: 700;
    text-transform: uppercase;
  }

  .log-lvl-trace .hud-log-lvl  { color: #6b7280; }
  .log-lvl-debug .hud-log-lvl  { color: #60a5fa; }
  .log-lvl-info  .hud-log-lvl  { color: var(--color-accent-cyan); }
  .log-lvl-warn  .hud-log-lvl  { color: #fbbf24; }
  .log-lvl-error .hud-log-lvl  { color: #f87171; }
  .log-lvl-fatal .hud-log-lvl  { color: #ff3864; }
  .log-lvl-none  .hud-log-lvl  { color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent); }

  .hud-log-sub {
    width: 140px;
    flex-shrink: 0;
    color: color-mix(in srgb, var(--color-accent-purple, #a855f7) 60%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-log-msg {
    flex: 1;
    color: color-mix(in srgb, var(--color-accent-cyan) 75%, transparent);
    word-break: break-all;
    white-space: pre-wrap;
    user-select: all;
  }

  /* ─── STATUS BAR ─── */
  .hud-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    font-size: 0.62rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-poll-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    margin-right: 4px;
    vertical-align: middle;
  }

  .hud-poll-dot.on {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
    animation: hud-dp 1.6s ease-in-out infinite;
  }

  .hud-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-top-color: var(--color-accent-cyan);
    border-radius: 50%;
    animation: hud-spin 0.6s linear infinite;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes hud-dp {
    0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--color-accent-green); }
    50% { opacity: 0.25; box-shadow: none; }
  }

  @keyframes hud-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
