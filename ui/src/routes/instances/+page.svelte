<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ─────────────────────────────────────
  type PresenceEntry = {
    host?: string;
    mode?: string;
    roles?: string[];
    scopes?: string[];
    platform?: string;
    deviceFamily?: string;
    modelIdentifier?: string;
    version?: string;
    reason?: string;
    lastInputSeconds?: number;
    uptimeMs?: number;
    connectedAt?: number;
    ts?: number;
    capabilities?: string[];
    sessionKey?: string;
    clientId?: string;
    clientVersion?: string;
    displayName?: string;
    agentId?: string;
    model?: string;
    thinkingLevel?: string;
    verboseLevel?: string;
  };

  // ─── State ─────────────────────────────────────
  let entries = $state<PresenceEntry[]>([]);
  let loading = $state(false);
  let lastError = $state<string | null>(null);
  let expandedIdx = $state<number | null>(null);
  let patchingIdx = $state<number | null>(null);

  // ─── Actions ───────────────────────────────────
  async function loadPresence() {
    if (!gateway.connected || loading) return;
    loading = true;
    lastError = null;
    try {
      const res = await gateway.call<PresenceEntry[] | { entries?: PresenceEntry[] }>('system-presence', {});
      if (Array.isArray(res)) {
        entries = res;
      } else if (res && Array.isArray((res as Record<string, unknown>).entries)) {
        entries = (res as Record<string, unknown>).entries as PresenceEntry[];
      } else {
        entries = [];
      }
    } catch (err) {
      lastError = String(err);
    } finally {
      loading = false;
    }
  }

  async function patchInstanceSession(entry: PresenceEntry, idx: number, patch: Record<string, unknown>) {
    if (!entry.sessionKey) {
      toasts.error('No Session', 'This instance has no active session to patch');
      return;
    }
    patchingIdx = idx;
    try {
      await gateway.call('sessions.patch', { key: entry.sessionKey, ...patch });
      toasts.success('Updated', 'Session settings saved');
      await loadPresence();
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      patchingIdx = null;
    }
  }

  async function cycleThinking(entry: PresenceEntry, idx: number) {
    const levels = ['off', 'on', 'stream'] as const;
    const current = entry.thinkingLevel ?? 'off';
    const i = levels.indexOf(current as typeof levels[number]);
    const next = levels[(i + 1) % levels.length];
    await patchInstanceSession(entry, idx, { thinkingLevel: next });
  }

  async function toggleVerbose(entry: PresenceEntry, idx: number) {
    const current = entry.verboseLevel ?? 'off';
    const next = current === 'off' ? 'on' : 'off';
    await patchInstanceSession(entry, idx, { verboseLevel: next });
  }

  function formatUptime(ms?: number): string {
    if (typeof ms !== 'number' || ms <= 0) return '—';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  function formatInputAge(seconds?: number): string {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function getInstanceStatus(entry: PresenceEntry): 'online' | 'idle' | 'stale' {
    if (entry.lastInputSeconds != null) {
      if (entry.lastInputSeconds < 300) return 'online';
      if (entry.lastInputSeconds < 3600) return 'idle';
      return 'stale';
    }
    return 'online';
  }

  // ─── Computed ──────────────────────────────────
  let sortedEntries = $derived.by(() => {
    return [...entries].sort((a, b) => {
      const aScore = (a.mode === 'gateway' ? 0 : 1);
      const bScore = (b.mode === 'gateway' ? 0 : 1);
      if (aScore !== bScore) return aScore - bScore;
      return (b.uptimeMs ?? 0) - (a.uptimeMs ?? 0);
    });
  });

  // ─── Effects ───────────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadPresence());
    }
  });

  $effect(() => {
    const unsub = gateway.on('system-presence', (payload) => {
      if (Array.isArray(payload)) {
        entries = payload as PresenceEntry[];
      }
    });
    return unsub;
  });
</script>

<svelte:head>
  <title>Instances — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&#8592; BACK</a>
    <span class="hud-page-title">INSTANCES</span>
    <button class="hud-btn" onclick={loadPresence} disabled={loading || conn.state.status !== 'connected'}>
      {loading ? 'LOADING...' : 'REFRESH'}
    </button>
  </div>

  {#if entries.length > 0}
    <div class="hud-instance-count">
      <span class="hud-dot hud-dot--green"></span>
      <span class="hud-panel-lbl">ACTIVE:</span>
      <span class="hud-count">{entries.length}</span>
    </div>
  {/if}

  <!-- Content -->
  <div class="hud-content">
    {#if conn.state.status !== 'connected'}
      <div class="hud-panel hud-empty">
        <p class="hud-panel-lbl">CONNECT TO GATEWAY TO VIEW INSTANCES</p>
      </div>

    {:else if lastError}
      <div class="hud-panel hud-panel--error">
        <span class="hud-panel-lbl">ERROR:</span> {lastError}
      </div>

    {:else if loading && entries.length === 0}
      <div class="hud-panel hud-empty">
        <p class="hud-panel-lbl">SCANNING...</p>
      </div>

    {:else if entries.length === 0}
      <div class="hud-panel hud-empty">
        <p class="hud-panel-lbl">NO INSTANCES REPORTED</p>
      </div>

    {:else}
      <div class="hud-instance-list">
        {#each sortedEntries as entry, i}
          {@const status = getInstanceStatus(entry)}
          {@const isExpanded = expandedIdx === i}
          {@const isPatching = patchingIdx === i}

          <div class="hud-panel hud-instance-card">
            <!-- Main row -->
            <div class="hud-instance-main">
              <div class="hud-instance-info">
                <!-- Host + status -->
                <div class="hud-instance-host">
                  <span class="hud-dot {status === 'online' ? 'hud-dot--green' : status === 'idle' ? 'hud-dot--amber' : 'hud-dot--dim'}"></span>
                  <span class="hud-host-name">
                    {entry.displayName ?? entry.host ?? 'UNKNOWN HOST'}
                  </span>
                  {#if entry.displayName && entry.host && entry.displayName !== entry.host}
                    <span class="hud-host-sub">({entry.host})</span>
                  {/if}
                </div>

                <!-- Platform details line -->
                <div class="hud-instance-platform">
                  {#if entry.platform}{entry.platform}{/if}
                  {#if entry.deviceFamily} / {entry.deviceFamily}{/if}
                  {#if entry.modelIdentifier} / {entry.modelIdentifier}{/if}
                  {#if entry.clientId && entry.clientId !== entry.host}
                    <span class="hud-dim"> / {entry.clientId}</span>
                  {/if}
                </div>

                <!-- Chips row -->
                <div class="hud-chips">
                  {#if entry.mode}
                    <span class="hud-chip hud-chip--cyan">{entry.mode}</span>
                  {/if}
                  {#each (entry.roles ?? []) as role}
                    <span class="hud-chip hud-chip--purple">{role}</span>
                  {/each}
                  {#if entry.version || entry.clientVersion}
                    <span class="hud-chip">v{entry.clientVersion ?? entry.version}</span>
                  {/if}
                  {#if (entry.capabilities ?? []).length > 0}
                    {#each (entry.capabilities ?? []) as cap}
                      <span class="hud-chip hud-chip--green">{cap}</span>
                    {/each}
                  {:else if (entry.scopes ?? []).length > 0}
                    <span class="hud-chip">{(entry.scopes ?? []).length} scopes</span>
                  {/if}
                  {#if entry.model}
                    <span class="hud-chip hud-chip--purple">{entry.model}</span>
                  {/if}
                  {#if entry.agentId}
                    <span class="hud-chip hud-chip--amber">{entry.agentId}</span>
                  {/if}
                </div>
              </div>

              <!-- Right side: meta + controls -->
              <div class="hud-instance-meta">
                <div class="hud-instance-stats">
                  {#if entry.uptimeMs}
                    <div>UP {formatUptime(entry.uptimeMs)}</div>
                  {/if}
                  {#if entry.lastInputSeconds != null}
                    <div>INPUT {formatInputAge(entry.lastInputSeconds)}</div>
                  {/if}
                  {#if entry.reason}
                    <div class="hud-dim">{entry.reason}</div>
                  {/if}
                </div>

                <!-- Session controls -->
                {#if entry.sessionKey}
                  <div class="hud-session-controls">
                    <button class="hud-btn hud-btn--sm {entry.thinkingLevel === 'stream' ? 'hud-btn--cyan' : entry.thinkingLevel === 'on' ? 'hud-btn--purple' : ''}"
                      onclick={() => cycleThinking(entry, i)} disabled={isPatching}
                      title="Thinking: {entry.thinkingLevel ?? 'off'}">
                      T:{entry.thinkingLevel ?? 'off'}
                    </button>
                    <button class="hud-btn hud-btn--sm {entry.verboseLevel === 'on' ? 'hud-btn--green' : ''}"
                      onclick={() => toggleVerbose(entry, i)} disabled={isPatching}
                      title="Verbose: {entry.verboseLevel ?? 'off'}">
                      V:{entry.verboseLevel ?? 'off'}
                    </button>
                  </div>
                {/if}

                <button class="hud-btn hud-btn--sm" onclick={() => expandedIdx = isExpanded ? null : i}>
                  {isExpanded ? '[-] LESS' : '[+] DETAILS'}
                </button>
              </div>
            </div>

            <!-- Expanded detail section -->
            {#if isExpanded}
              <div class="hud-instance-details">
                <div class="hud-detail-grid">
                  <div><span class="hud-panel-lbl">MODE</span><span class="hud-detail-val">{entry.mode ?? '—'}</span></div>
                  <div><span class="hud-panel-lbl">PLATFORM</span><span class="hud-detail-val">{entry.platform ?? '—'}</span></div>
                  <div><span class="hud-panel-lbl">DEVICE</span><span class="hud-detail-val">{entry.deviceFamily ?? '—'}</span></div>
                  <div><span class="hud-panel-lbl">MODEL ID</span><span class="hud-detail-val">{entry.modelIdentifier ?? '—'}</span></div>
                  <div><span class="hud-panel-lbl">CLIENT VER</span><span class="hud-detail-val">{entry.clientVersion ?? entry.version ?? '—'}</span></div>
                  <div><span class="hud-panel-lbl">CLIENT ID</span><span class="hud-detail-val">{entry.clientId ?? '—'}</span></div>
                  {#if entry.sessionKey}
                    <div class="hud-detail-wide">
                      <span class="hud-panel-lbl">SESSION KEY</span>
                      <span class="hud-detail-val hud-detail-val--break">{entry.sessionKey}</span>
                    </div>
                  {/if}
                  {#if entry.model}
                    <div><span class="hud-panel-lbl">MODEL</span><span class="hud-detail-val hud-detail-val--purple">{entry.model}</span></div>
                  {/if}
                  {#if (entry.scopes ?? []).length > 0}
                    <div class="hud-detail-wide">
                      <span class="hud-panel-lbl">SCOPES</span>
                      <div class="hud-chips">
                        {#each (entry.scopes ?? []) as scope}
                          <span class="hud-chip">{scope}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if (entry.capabilities ?? []).length > 0}
                    <div class="hud-detail-wide">
                      <span class="hud-panel-lbl">CAPABILITIES</span>
                      <div class="hud-chips">
                        {#each (entry.capabilities ?? []) as cap}
                          <span class="hud-chip hud-chip--green">{cap}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .hud-page {
    position: relative;
    z-index: 1;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    gap: 1rem;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    color: #b0ffc8;
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid #0ff3;
    padding-bottom: 0.75rem;
  }

  .hud-back {
    color: #0ff;
    text-decoration: none;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.7;
    transition: opacity 0.2s;
  }
  .hud-back:hover { opacity: 1; text-shadow: 0 0 6px #0ff; }

  .hud-page-title {
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #0ff;
    text-shadow: 0 0 10px #0ff6, 0 0 30px #0ff3;
  }

  .hud-panel {
    background: #0a0a0aee;
    border: 1px solid #0ff3;
    border-radius: 4px;
    padding: 0.75rem 1rem;
  }

  .hud-panel--error {
    border-color: #f0a;
    color: #f0a;
  }

  .hud-panel-lbl {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #0ff9;
    display: block;
    margin-bottom: 0.15rem;
  }

  .hud-btn {
    background: transparent;
    border: 1px solid #0ff4;
    color: #0ff;
    font-family: inherit;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    padding: 0.35rem 0.75rem;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
  }
  .hud-btn:hover:not(:disabled) {
    background: #0ff1;
    border-color: #0ff;
    text-shadow: 0 0 6px #0ff;
  }
  .hud-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .hud-btn--sm {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
  }
  .hud-btn--cyan { border-color: #0ff8; color: #0ff; text-shadow: 0 0 4px #0ff6; }
  .hud-btn--purple { border-color: #a855f78a; color: #c084fc; text-shadow: 0 0 4px #a855f74d; }
  .hud-btn--green { border-color: #22c55e8a; color: #4ade80; text-shadow: 0 0 4px #22c55e4d; }

  .hud-instance-count {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.7rem;
  }
  .hud-count {
    color: #4ade80;
    font-weight: 700;
  }

  .hud-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    background: #555;
  }
  .hud-dot--green { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
  .hud-dot--amber { background: #fbbf24; box-shadow: 0 0 6px #fbbf24; }
  .hud-dot--dim { background: #555; }

  .hud-content {
    flex: 1;
    overflow-y: auto;
  }

  .hud-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 12rem;
  }

  .hud-instance-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hud-instance-card {
    padding: 0;
  }

  .hud-instance-main {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
  }

  .hud-instance-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .hud-instance-host {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .hud-host-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: #e0ffe8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hud-host-sub {
    font-size: 0.65rem;
    color: #0ff6;
  }

  .hud-instance-platform {
    font-size: 0.65rem;
    color: #b0ffc877;
  }

  .hud-dim { opacity: 0.6; }

  .hud-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .hud-chip {
    padding: 0.1rem 0.4rem;
    border: 1px solid #0ff2;
    border-radius: 2px;
    font-size: 0.55rem;
    font-family: inherit;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #b0ffc8aa;
  }
  .hud-chip--cyan { border-color: #0ff4; color: #0ff; }
  .hud-chip--purple { border-color: #a855f74d; color: #c084fc; }
  .hud-chip--green { border-color: #22c55e4d; color: #4ade80; }
  .hud-chip--amber { border-color: #fbbf244d; color: #fbbf24; }

  .hud-instance-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    flex-shrink: 0;
  }

  .hud-instance-stats {
    text-align: right;
    font-size: 0.75rem;
    color: #b0ffc877;
    line-height: 1.4;
  }

  .hud-session-controls {
    display: flex;
    gap: 0.25rem;
  }

  .hud-instance-details {
    border-top: 1px solid #0ff2;
    padding: 0.75rem 1rem;
  }

  .hud-detail-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.6rem;
  }
  @media (max-width: 640px) {
    .hud-detail-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .hud-detail-wide {
    grid-column: 1 / -1;
  }

  .hud-detail-val {
    display: block;
    font-size: 0.7rem;
    color: #e0ffe8;
  }
  .hud-detail-val--break {
    font-size: 0.75rem;
    word-break: break-all;
  }
  .hud-detail-val--purple {
    color: #c084fc;
  }
</style>
