<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { gateway } from '$lib/gateway';

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
  <title>Debug — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

    <!-- Page Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary flex items-center gap-3">
          <span class="text-accent-cyan">⚡</span>
          Debug Console
        </h1>
        <p class="text-sm text-text-muted mt-1">Gateway diagnostics, snapshots, and raw RPC access.</p>
      </div>
      <button
        onclick={loadDebug}
        disabled={loading || conn.state.status !== 'connected'}
        class="px-4 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
               text-text-secondary hover:text-accent-cyan transition-all
               disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
      >
        {#if loading}
          <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
        Refresh All
      </button>
    </div>

    {#if conn.state.status !== 'connected'}
      <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center">
        <div class="text-text-muted text-sm">Connect to the gateway to use debug tools.</div>
      </div>
    {:else}

      <!-- ═══ RPC Console (Hero Section) ═══ -->
      <div class="rounded-xl border border-accent-cyan/30 bg-bg-secondary/60 p-5
                  shadow-[0_0_30px_rgba(0,229,255,0.06)]">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-lg font-semibold text-accent-cyan flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Manual RPC Console
            </h2>
            <p class="text-xs text-text-muted mt-0.5">Send raw gateway methods with JSON params. <kbd class="text-accent-cyan/70">Ctrl+Enter</kbd> to execute.</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Input Side -->
          <div class="space-y-3">
            <div>
              <label for="rpc-method" class="block text-xs font-medium text-text-muted mb-1.5">Method</label>
              <input
                id="rpc-method"
                bind:value={callMethod}
                onkeydown={handleKeydown}
                placeholder="e.g. status, health, models.list"
                class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2.5
                       font-mono text-sm text-text-primary placeholder:text-text-muted/50
                       focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)]
                       transition-all"
              />
            </div>
            <div>
              <label for="rpc-params" class="block text-xs font-medium text-text-muted mb-1.5">Params (JSON)</label>
              <textarea
                id="rpc-params"
                bind:value={callParams}
                onkeydown={handleKeydown}
                rows="6"
                placeholder={'{ }'}
                class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2.5
                       font-mono text-sm text-text-primary placeholder:text-text-muted/50
                       focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)]
                       transition-all resize-y"
              ></textarea>
            </div>
            <button
              onclick={executeCall}
              disabled={callLoading || !callMethod.trim()}
              class="w-full py-2.5 rounded-lg text-sm font-medium transition-all
                     bg-accent-cyan/10 border border-accent-cyan/40 text-accent-cyan
                     hover:bg-accent-cyan/20 hover:border-accent-cyan hover:shadow-[0_0_15px_rgba(0,229,255,0.2)]
                     disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {#if callLoading}
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Executing…
              {:else}
                Execute
              {/if}
            </button>
          </div>

          <!-- Result Side -->
          <div class="flex flex-col">
            <div class="text-xs font-medium text-text-muted mb-1.5">Result</div>
            <div class="flex-1 bg-bg-input border border-border-default rounded-lg overflow-hidden relative">
              {#if callError}
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 uppercase tracking-wider">Error</div>
                <pre class="p-3 text-sm font-mono text-red-400 overflow-auto max-h-[280px] whitespace-pre-wrap">{callError}</pre>
              {:else if callResult}
                <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold bg-accent-green/20 text-accent-green uppercase tracking-wider">OK</div>
                <pre class="p-3 text-sm font-mono text-accent-green/90 overflow-auto max-h-[280px] whitespace-pre-wrap">{callResult}</pre>
              {:else}
                <div class="h-full flex items-center justify-center text-text-muted/40 text-sm">
                  Response will appear here
                </div>
              {/if}
            </div>
          </div>
        </div>

        <!-- History -->
        {#if callHistory.length > 0}
          <div class="mt-4 pt-3 border-t border-border-default">
            <div class="text-xs font-medium text-text-muted mb-2">Recent Calls</div>
            <div class="flex flex-wrap gap-2">
              {#each callHistory.slice(0, 8) as entry}
                <button
                  onclick={() => replayHistory(entry)}
                  class="px-2.5 py-1 rounded text-xs font-mono border transition-all
                         {entry.error
                           ? 'border-red-500/30 text-red-400/70 hover:border-red-500/60 hover:text-red-400'
                           : 'border-accent-green/30 text-accent-green/70 hover:border-accent-green/60 hover:text-accent-green'}
                         bg-bg-input hover:bg-bg-hover"
                  title="{entry.method} @ {new Date(entry.ts).toLocaleTimeString()}"
                >
                  {entry.method}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      <!-- ═══ Snapshot Cards ═══ -->
      {#if loadError}
        <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-red-400 text-sm">
          {loadError}
        </div>
      {/if}

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Status Card -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-accent-green animate-pulse"></span>
              Status
            </h2>
            {#if securityAudit}
              <span class="px-2 py-0.5 rounded text-xs font-medium
                          {securityTone === 'error' ? 'bg-red-500/20 text-red-400' :
                           securityTone === 'warn' ? 'bg-amber-500/20 text-amber-400' :
                           'bg-accent-green/20 text-accent-green'}">
                {securityTone === 'error' ? `${securityAudit.critical} critical` :
                 securityTone === 'warn' ? `${securityAudit.warn} warnings` :
                 'Clean'}
              </span>
            {/if}
          </div>
          {#if debugStatus}
            <div class="grid grid-cols-2 gap-3">
              {#each flatEntries(debugStatus).filter(([, v]) => !v.startsWith('{') && !v.startsWith('[')) as [key, value]}
                <div>
                  <div class="text-[11px] text-text-muted uppercase tracking-wider">{key}</div>
                  <div class="text-sm text-text-secondary font-mono truncate" title={value}>{value}</div>
                </div>
              {/each}
            </div>
            {#if flatEntries(debugStatus).some(([, v]) => v.startsWith('{') || v.startsWith('['))}
              <div class="mt-4 pt-3 border-t border-border-default">
                <details>
                  <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
                    Full JSON
                  </summary>
                  <pre class="mt-2 p-3 bg-bg-input rounded-lg text-xs font-mono text-text-secondary overflow-auto max-h-48">{JSON.stringify(debugStatus, null, 2)}</pre>
                </details>
              </div>
            {/if}
          {:else}
            <div class="text-sm text-text-muted">No data loaded</div>
          {/if}
        </div>

        <!-- Health Card -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-2 h-2 rounded-full bg-accent-purple"></span>
            <h2 class="text-sm font-semibold text-text-primary">Health</h2>
          </div>
          {#if debugHealth}
            <div class="grid grid-cols-2 gap-3">
              {#each flatEntries(debugHealth).filter(([, v]) => !v.startsWith('{') && !v.startsWith('[')) as [key, value]}
                <div>
                  <div class="text-[11px] text-text-muted uppercase tracking-wider">{key}</div>
                  <div class="text-sm text-text-secondary font-mono truncate" title={value}>{value}</div>
                </div>
              {/each}
            </div>
            {#if flatEntries(debugHealth).some(([, v]) => v.startsWith('{') || v.startsWith('['))}
              <div class="mt-4 pt-3 border-t border-border-default">
                <details>
                  <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
                    Full JSON
                  </summary>
                  <pre class="mt-2 p-3 bg-bg-input rounded-lg text-xs font-mono text-text-secondary overflow-auto max-h-48">{JSON.stringify(debugHealth, null, 2)}</pre>
                </details>
              </div>
            {/if}
          {:else}
            <div class="text-sm text-text-muted">No data loaded</div>
          {/if}
        </div>
      </div>

      <!-- Models + Heartbeat Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Models Card -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-2 h-2 rounded-full bg-accent-amber"></span>
            <h2 class="text-sm font-semibold text-text-primary">Models</h2>
            <span class="ml-auto text-xs text-text-muted font-mono">{debugModels.length} registered</span>
          </div>
          {#if debugModels.length > 0}
            <div class="space-y-1.5 max-h-64 overflow-y-auto">
              {#each debugModels as model, i}
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-input/50 border border-border-default/50
                            hover:border-accent-amber/30 transition-colors group">
                  <span class="text-[10px] text-text-muted font-mono w-5 text-right">{i + 1}</span>
                  <span class="text-sm font-mono text-text-secondary group-hover:text-accent-amber transition-colors truncate">
                    {typeof model === 'object' && model !== null
                      ? (model as Record<string, unknown>).id ?? (model as Record<string, unknown>).name ?? JSON.stringify(model)
                      : String(model)}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="text-sm text-text-muted">No models available</div>
          {/if}
        </div>

        <!-- Heartbeat Card -->
        <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5">
          <div class="flex items-center gap-2 mb-4">
            <span class="w-2 h-2 rounded-full bg-accent-pink animate-pulse"></span>
            <h2 class="text-sm font-semibold text-text-primary">Last Heartbeat</h2>
          </div>
          {#if debugHeartbeat}
            <pre class="p-3 bg-bg-input rounded-lg text-xs font-mono text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">{formatHeartbeat(debugHeartbeat)}</pre>
          {:else}
            <div class="text-sm text-text-muted">No heartbeat data</div>
          {/if}
        </div>
      </div>

    {/if}
  </div>
</div>
