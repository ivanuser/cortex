<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { gateway } from '$lib/gateway';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();

  // ─── State ─────────────────────────────────
  let loading = $state(false);
  let debugStatus = $state<Record<string, unknown> | null>(null);
  let debugHealth = $state<Record<string, unknown> | null>(null);
  let debugModels = $state<unknown[]>([]);
  let debugHeartbeat = $state<unknown>(null);
  let loadError = $state<string | null>(null);

  // RPC Console state
  let callMethod = $state('status');
  let callParams = $state('{}');
  let callResult = $state<string | null>(null);
  let callError = $state<string | null>(null);
  let callLoading = $state(false);

  // History
  let callHistory = $state<Array<{ method: string; params: string; result?: string; error?: string; ts: number }>>([]);

  // ─── Auto-load on connect ──────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => { if (!loading && !debugStatus) loadDebug(); });
    }
  });

  // ─── Load All Debug Data ───────────────────
  async function loadDebug() {
    if (!gateway.connected) return;
    loading = true;
    loadError = null;
    try {
      const [status, health, models, heartbeat] = await Promise.all([
        gateway.call<Record<string, unknown>>('status', {}).catch(() => null),
        gateway.call<Record<string, unknown>>('health', {}).catch(() => null),
        gateway.call<{ models?: unknown[] }>('models.list', {}).catch(() => null),
        gateway.call<unknown>('last-heartbeat', {}).catch(() => null),
      ]);
      debugStatus = status;
      debugHealth = health;
      debugModels = Array.isArray(models?.models) ? models!.models : [];
      debugHeartbeat = heartbeat;
    } catch (e) {
      loadError = String(e);
    } finally {
      loading = false;
    }
  }

  // ─── RPC Call ──────────────────────────────
  async function executeCall() {
    if (!gateway.connected || !callMethod.trim()) return;
    callLoading = true;
    callError = null;
    callResult = null;
    const method = callMethod.trim();
    const paramsStr = callParams.trim();
    try {
      const params = paramsStr ? JSON.parse(paramsStr) : {};
      const res = await gateway.call(method, params);
      const resultStr = JSON.stringify(res, null, 2);
      callResult = resultStr;
      callHistory = [{ method, params: paramsStr, result: resultStr, ts: Date.now() }, ...callHistory].slice(0, 20);
    } catch (e) {
      const errStr = String(e);
      callError = errStr;
      callHistory = [{ method, params: paramsStr, error: errStr, ts: Date.now() }, ...callHistory].slice(0, 20);
    } finally {
      callLoading = false;
    }
  }

  // ─── Helpers ───────────────────────────────
  function flatEntries(obj: Record<string, unknown> | null): [string, string][] {
    if (!obj) return [];
    return Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)
    ]);
  }

  function formatHeartbeat(hb: unknown): string {
    if (!hb) return 'No heartbeat data';
    return JSON.stringify(hb, null, 2);
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeCall();
    }
  }

  function replayHistory(entry: { method: string; params: string }) {
    callMethod = entry.method;
    callParams = entry.params;
  }

  // Security audit extraction
  let securityAudit = $derived.by(() => {
    if (!debugStatus || typeof debugStatus !== 'object') return null;
    const sa = (debugStatus as { securityAudit?: { summary?: Record<string, number> } }).securityAudit;
    return sa?.summary ?? null;
  });

  let securityTone = $derived.by(() => {
    if (!securityAudit) return '';
    const critical = securityAudit.critical ?? 0;
    const warn = securityAudit.warn ?? 0;
    if (critical > 0) return 'error';
    if (warn > 0) return 'warn';
    return 'ok';
  });
</script>

<svelte:head>
  <title>Debug -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- TOP BAR -->
  <div class="hud-page-topbar">
    <div class="hud-page-topbar-left">
      <a href="/overview" class="hud-back">&larr; BACK</a>
      <div class="hud-page-title">DEBUG CONSOLE</div>
    </div>
    <button
      onclick={loadDebug}
      disabled={loading || conn.state.status !== 'connected'}
      class="hud-btn"
    >
      {#if loading}
        <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
      {/if}
      REFRESH ALL
    </button>
  </div>

  {#if conn.state.status !== 'connected'}
    <div class="hud-panel" style="text-align:center; padding:40px 16px;">
      <div class="hud-panel-lbl" style="justify-content:center;">AWAITING CONNECTION</div>
      <div class="hud-muted">Connect to the gateway to use debug tools.</div>
    </div>
  {:else}

    <!-- RPC CONSOLE -->
    <div class="hud-panel hud-panel--hero">
      <div class="hud-panel-lbl">
        MANUAL RPC CONSOLE
        <span class="hud-hint">Ctrl+Enter to execute</span>
      </div>

      <div class="hud-rpc-grid">
        <!-- Input Side -->
        <div class="hud-rpc-input">
          <label for="rpc-method" class="hud-field-lbl">METHOD</label>
          <input
            id="rpc-method"
            bind:value={callMethod}
            onkeydown={handleKeydown}
            placeholder="e.g. status, health, models.list"
            class="hud-input"
          />

          <label for="rpc-params" class="hud-field-lbl">PARAMS (JSON)</label>
          <textarea
            id="rpc-params"
            bind:value={callParams}
            onkeydown={handleKeydown}
            rows="6"
            placeholder={'{ }'}
            class="hud-input hud-textarea"
          ></textarea>

          <button
            onclick={executeCall}
            disabled={callLoading || !callMethod.trim()}
            class="hud-btn hud-btn--execute"
          >
            {#if callLoading}
              <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              EXECUTING...
            {:else}
              EXECUTE
            {/if}
          </button>
        </div>

        <!-- Result Side -->
        <div class="hud-rpc-result">
          <div class="hud-field-lbl">RESULT</div>
          <div class="hud-result-box">
            {#if callError}
              <div class="hud-result-badge hud-result-badge--err">ERROR</div>
              <pre class="hud-result-pre hud-result-pre--err">{callError}</pre>
            {:else if callResult}
              <div class="hud-result-badge hud-result-badge--ok">OK</div>
              <pre class="hud-result-pre hud-result-pre--ok">{callResult}</pre>
            {:else}
              <div class="hud-result-empty">Response will appear here</div>
            {/if}
          </div>
        </div>
      </div>

      <!-- History -->
      {#if callHistory.length > 0}
        <div class="hud-history">
          <div class="hud-field-lbl">RECENT CALLS</div>
          <div class="hud-history-list">
            {#each callHistory.slice(0, 8) as entry}
              <button
                onclick={() => replayHistory(entry)}
                class="hud-history-tag {entry.error ? 'hud-history-tag--err' : 'hud-history-tag--ok'}"
                title="{entry.method} @ {new Date(entry.ts).toLocaleTimeString()}"
              >
                {entry.method}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- ERROR BANNER -->
    {#if loadError}
      <div class="hud-panel hud-panel--error">
        {loadError}
      </div>
    {/if}

    <!-- SNAPSHOT CARDS -->
    <div class="hud-card-grid">

      <!-- Status Card -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">
          <span><span class="hud-dot hud-dot--green"></span> STATUS</span>
          {#if securityAudit}
            <span class="hud-sec-badge hud-sec-badge--{securityTone}">
              {securityTone === 'error' ? `${securityAudit.critical} CRITICAL` :
               securityTone === 'warn' ? `${securityAudit.warn} WARNINGS` :
               'CLEAN'}
            </span>
          {/if}
        </div>
        {#if debugStatus}
          <div class="hud-kv-grid">
            {#each flatEntries(debugStatus).filter(([, v]) => !v.startsWith('{') && !v.startsWith('[')) as [key, value]}
              <div class="hud-kv">
                <div class="hud-kv-key">{key}</div>
                <div class="hud-kv-val" title={value}>{value}</div>
              </div>
            {/each}
          </div>
          {#if flatEntries(debugStatus).some(([, v]) => v.startsWith('{') || v.startsWith('['))}
            <div class="hud-details-wrap">
              <details>
                <summary class="hud-details-summary">Full JSON</summary>
                <pre class="hud-json-pre">{JSON.stringify(debugStatus, null, 2)}</pre>
              </details>
            </div>
          {/if}
        {:else}
          <div class="hud-muted">No data loaded</div>
        {/if}
      </div>

      <!-- Health Card -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">
          <span><span class="hud-dot hud-dot--purple"></span> HEALTH</span>
        </div>
        {#if debugHealth}
          <div class="hud-kv-grid">
            {#each flatEntries(debugHealth).filter(([, v]) => !v.startsWith('{') && !v.startsWith('[')) as [key, value]}
              <div class="hud-kv">
                <div class="hud-kv-key">{key}</div>
                <div class="hud-kv-val" title={value}>{value}</div>
              </div>
            {/each}
          </div>
          {#if flatEntries(debugHealth).some(([, v]) => v.startsWith('{') || v.startsWith('['))}
            <div class="hud-details-wrap">
              <details>
                <summary class="hud-details-summary">Full JSON</summary>
                <pre class="hud-json-pre">{JSON.stringify(debugHealth, null, 2)}</pre>
              </details>
            </div>
          {/if}
        {:else}
          <div class="hud-muted">No data loaded</div>
        {/if}
      </div>
    </div>

    <!-- Models + Heartbeat Row -->
    <div class="hud-card-grid">

      <!-- Models Card -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">
          <span><span class="hud-dot hud-dot--amber"></span> MODELS</span>
          <span class="hud-count">{debugModels.length} registered</span>
        </div>
        {#if debugModels.length > 0}
          <div class="hud-model-list">
            {#each debugModels as model, i}
              <div class="hud-model-row">
                <span class="hud-model-idx">{i + 1}</span>
                <span class="hud-model-name">
                  {typeof model === 'object' && model !== null
                    ? (model as Record<string, unknown>).id ?? (model as Record<string, unknown>).name ?? JSON.stringify(model)
                    : String(model)}
                </span>
              </div>
            {/each}
          </div>
        {:else}
          <div class="hud-muted">No models available</div>
        {/if}
      </div>

      <!-- Heartbeat Card -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">
          <span><span class="hud-dot hud-dot--pink"></span> LAST HEARTBEAT</span>
        </div>
        {#if debugHeartbeat}
          <pre class="hud-json-pre">{formatHeartbeat(debugHeartbeat)}</pre>
        {:else}
          <div class="hud-muted">No heartbeat data</div>
        {/if}
      </div>
    </div>

  {/if}
</div>

<style>
  /* ─── PAGE LAYOUT ─── */
  .hud-page {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px 24px;
    height: 100%;
    overflow-y: auto;
    max-width: 1400px;
    margin: 0 auto;
    width: 100%;
  }

  /* ─── TOP BAR ─── */
  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding-bottom: 6px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-page-topbar-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .hud-back:hover {
    color: var(--color-accent-cyan);
    text-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── BUTTON ─── */
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
  }

  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hud-btn--execute {
    width: 100%;
    padding: 8px 12px;
    margin-top: 4px;
  }

  /* ─── PANEL ─── */
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

  .hud-panel--hero {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    box-shadow: 0 0 30px color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
  }

  .hud-panel--error {
    border-color: color-mix(in srgb, #ef4444 35%, transparent);
    color: #f87171;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
  }

  .hud-panel--error::before {
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
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
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── CARD GRID ─── */
  .hud-card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  @media (max-width: 767px) {
    .hud-card-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ─── DOTS ─── */
  .hud-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-right: 6px;
    vertical-align: middle;
  }

  .hud-dot--green {
    background: var(--color-accent-green, #22c55e);
    box-shadow: 0 0 6px var(--color-accent-green, #22c55e);
    animation: pulse-dot 2s infinite;
  }

  .hud-dot--purple {
    background: var(--color-accent-purple, #a855f7);
    box-shadow: 0 0 6px var(--color-accent-purple, #a855f7);
  }

  .hud-dot--amber {
    background: var(--color-accent-amber, #f59e0b);
    box-shadow: 0 0 6px var(--color-accent-amber, #f59e0b);
  }

  .hud-dot--pink {
    background: var(--color-accent-pink, #ec4899);
    box-shadow: 0 0 6px var(--color-accent-pink, #ec4899);
    animation: pulse-dot 2s infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  /* ─── RPC CONSOLE ─── */
  .hud-rpc-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 767px) {
    .hud-rpc-grid {
      grid-template-columns: 1fr;
    }
  }

  .hud-rpc-input {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .hud-rpc-result {
    display: flex;
    flex-direction: column;
  }

  .hud-field-lbl {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  .hud-input {
    width: 100%;
    background: rgba(10, 14, 26, 0.8);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    padding: 8px 10px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.82rem;
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
  }

  .hud-input:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  .hud-textarea {
    resize: vertical;
  }

  .hud-hint {
    font-size: 0.55rem;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  /* ─── RESULT BOX ─── */
  .hud-result-box {
    flex: 1;
    background: rgba(10, 14, 26, 0.8);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    position: relative;
    min-height: 180px;
    overflow: hidden;
  }

  .hud-result-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 1px 8px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.55rem;
    letter-spacing: 0.2em;
    border-radius: 1px;
    font-weight: 700;
  }

  .hud-result-badge--err {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }

  .hud-result-badge--ok {
    background: color-mix(in srgb, var(--color-accent-green, #22c55e) 20%, transparent);
    color: var(--color-accent-green, #22c55e);
    border: 1px solid color-mix(in srgb, var(--color-accent-green, #22c55e) 30%, transparent);
  }

  .hud-result-pre {
    padding: 16px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    overflow: auto;
    max-height: 280px;
    white-space: pre-wrap;
    margin: 0;
  }

  .hud-result-pre--err {
    color: #f87171;
  }

  .hud-result-pre--ok {
    color: var(--color-accent-green, #22c55e);
  }

  .hud-result-empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    min-height: 180px;
  }

  /* ─── HISTORY ─── */
  .hud-history {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  .hud-history-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .hud-history-tag {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    padding: 3px 8px;
    border-radius: 1px;
    background: rgba(10, 14, 26, 0.8);
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-history-tag--ok {
    border: 1px solid color-mix(in srgb, var(--color-accent-green, #22c55e) 30%, transparent);
    color: color-mix(in srgb, var(--color-accent-green, #22c55e) 70%, transparent);
  }

  .hud-history-tag--ok:hover {
    border-color: var(--color-accent-green, #22c55e);
    color: var(--color-accent-green, #22c55e);
  }

  .hud-history-tag--err {
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: rgba(248, 113, 113, 0.7);
  }

  .hud-history-tag--err:hover {
    border-color: #ef4444;
    color: #f87171;
  }

  /* ─── KEY-VALUE GRID ─── */
  .hud-kv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .hud-kv-key {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    text-transform: uppercase;
  }

  .hud-kv-val {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    color: var(--color-accent-cyan);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ─── DETAILS / JSON ─── */
  .hud-details-wrap {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-details-summary {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    cursor: pointer;
    transition: color 0.2s;
  }

  .hud-details-summary:hover {
    color: var(--color-accent-cyan);
  }

  .hud-json-pre {
    margin: 8px 0 0;
    padding: 10px;
    background: rgba(10, 14, 26, 0.8);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    border-radius: 2px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 75%, transparent);
    overflow: auto;
    max-height: 240px;
    white-space: pre-wrap;
  }

  /* ─── MUTED TEXT ─── */
  .hud-muted {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    letter-spacing: 0.08em;
  }

  /* ─── SECURITY BADGE ─── */
  .hud-sec-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.15em;
    padding: 1px 8px;
    border-radius: 1px;
  }

  .hud-sec-badge--error {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .hud-sec-badge--warn {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  .hud-sec-badge--ok {
    background: color-mix(in srgb, var(--color-accent-green, #22c55e) 20%, transparent);
    color: var(--color-accent-green, #22c55e);
  }

  /* ─── COUNT BADGE ─── */
  .hud-count {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
  }

  /* ─── MODEL LIST ─── */
  .hud-model-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 250px;
    overflow-y: auto;
  }

  .hud-model-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-radius: 2px;
    background: rgba(10, 14, 26, 0.4);
    transition: border-color 0.2s;
  }

  .hud-model-row:hover {
    border-color: color-mix(in srgb, var(--color-accent-amber, #f59e0b) 40%, transparent);
  }

  .hud-model-idx {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    width: 18px;
    text-align: right;
  }

  .hud-model-name {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 75%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.2s;
  }

  .hud-model-row:hover .hud-model-name {
    color: var(--color-accent-amber, #f59e0b);
  }
</style>
