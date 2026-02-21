<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

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
      // Gateway/agent first, then by uptime
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

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center">
          <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12h.01" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text-primary glow-text-cyan">Connected Instances</h1>
          <p class="text-sm text-text-muted">Presence beacons from the gateway and clients</p>
        </div>
      </div>

      <button
        onclick={loadPresence}
        disabled={loading || conn.state.status !== 'connected'}
        class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Loading…' : 'Refresh'}
      </button>
    </div>

    {#if entries.length > 0}
      <div class="flex items-center gap-1.5 mt-3 text-xs">
        <span class="w-2 h-2 rounded-full bg-accent-green glow-pulse"></span>
        <span class="text-text-muted">Active instances:</span>
        <span class="text-accent-green font-mono font-semibold">{entries.length}</span>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    {#if conn.state.status !== 'connected'}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">Connect to the gateway to view instances.</p>
      </div>

    {:else if lastError}
      <div class="glass rounded-xl p-4 border border-accent-pink/30 mb-4">
        <div class="flex items-center gap-2 text-accent-pink text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>

    {:else if loading && entries.length === 0}
      <div class="flex flex-col gap-3">
        {#each Array(3) as _}
          <div class="glass rounded-xl p-5 border border-border-default animate-pulse">
            <div class="h-4 w-40 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-64 bg-bg-tertiary rounded mb-3"></div>
            <div class="flex gap-2">
              <div class="h-5 w-14 bg-bg-tertiary rounded-full"></div>
              <div class="h-5 w-14 bg-bg-tertiary rounded-full"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if entries.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <p class="text-text-muted text-sm">No instances reported yet.</p>
      </div>

    {:else}
      <div class="flex flex-col gap-3">
        {#each sortedEntries as entry, i}
          {@const status = getInstanceStatus(entry)}
          {@const isExpanded = expandedIdx === i}
          {@const isPatching = patchingIdx === i}

          <div class="rounded-xl border border-border-default bg-bg-secondary/50 hover:border-accent-cyan/20 transition-all animate-fade-in" style="animation-delay: {i * 50}ms">
            <!-- Main row -->
            <div class="p-4">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <!-- Host + status -->
                  <div class="flex items-center gap-2 mb-1.5">
                    <span class="w-2 h-2 rounded-full flex-shrink-0
                      {status === 'online' ? 'bg-accent-green glow-pulse' :
                       status === 'idle' ? 'bg-accent-amber' :
                       'bg-text-muted'}">
                    </span>
                    <h3 class="text-sm font-semibold text-text-primary truncate">
                      {entry.displayName ?? entry.host ?? 'unknown host'}
                    </h3>
                    {#if entry.displayName && entry.host && entry.displayName !== entry.host}
                      <span class="text-xs text-text-muted">({entry.host})</span>
                    {/if}
                  </div>

                  <!-- Platform details line -->
                  <p class="text-xs text-text-muted mb-2">
                    {#if entry.platform}{entry.platform}{/if}
                    {#if entry.deviceFamily} · {entry.deviceFamily}{/if}
                    {#if entry.modelIdentifier} · {entry.modelIdentifier}{/if}
                    {#if entry.clientId && entry.clientId !== entry.host}
                      <span class="text-text-muted/50"> · {entry.clientId}</span>
                    {/if}
                  </p>

                  <!-- Chips row -->
                  <div class="flex flex-wrap gap-1.5">
                    {#if entry.mode}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">
                        {entry.mode}
                      </span>
                    {/if}
                    {#each (entry.roles ?? []) as role}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-purple/10 text-accent-purple border border-accent-purple/20">
                        {role}
                      </span>
                    {/each}
                    {#if entry.version || entry.clientVersion}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">
                        v{entry.clientVersion ?? entry.version}
                      </span>
                    {/if}
                    {#if (entry.capabilities ?? []).length > 0}
                      {#each (entry.capabilities ?? []) as cap}
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-green/10 text-accent-green border border-accent-green/10">
                          {cap}
                        </span>
                      {/each}
                    {:else if (entry.scopes ?? []).length > 0}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">
                        {(entry.scopes ?? []).length} scopes
                      </span>
                    {/if}
                    {#if entry.model}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-purple/10 text-purple-300 border border-accent-purple/10">
                        {entry.model}
                      </span>
                    {/if}
                    {#if entry.agentId}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/10">
                        {entry.agentId}
                      </span>
                    {/if}
                  </div>
                </div>

                <!-- Right side: meta + controls -->
                <div class="flex flex-col items-end gap-2 flex-shrink-0">
                  <!-- Uptime / input info -->
                  <div class="text-right text-xs text-text-muted space-y-0.5">
                    {#if entry.uptimeMs}
                      <div class="flex items-center gap-1 justify-end">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Up {formatUptime(entry.uptimeMs)}
                      </div>
                    {/if}
                    {#if entry.lastInputSeconds != null}
                      <div>Input {formatInputAge(entry.lastInputSeconds)}</div>
                    {/if}
                    {#if entry.reason}
                      <div class="text-text-muted/60">{entry.reason}</div>
                    {/if}
                  </div>

                  <!-- Session controls (if session key exists) -->
                  {#if entry.sessionKey}
                    <div class="flex items-center gap-1">
                      <button onclick={() => cycleThinking(entry, i)} disabled={isPatching}
                        class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                          {entry.thinkingLevel === 'stream' ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30' :
                           entry.thinkingLevel === 'on' ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/30' :
                           'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-cyan/30'}"
                        title="Thinking: {entry.thinkingLevel ?? 'off'}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        T:{entry.thinkingLevel ?? 'off'}
                      </button>
                      <button onclick={() => toggleVerbose(entry, i)} disabled={isPatching}
                        class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                          {entry.verboseLevel === 'on' ? 'bg-accent-green/15 text-accent-green border-accent-green/30' :
                           'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-green/30'}"
                        title="Verbose: {entry.verboseLevel ?? 'off'}">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        V:{entry.verboseLevel ?? 'off'}
                      </button>
                    </div>
                  {/if}

                  <!-- Expand button -->
                  <button onclick={() => expandedIdx = isExpanded ? null : i}
                    class="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-cyan transition-colors">
                    <svg class="w-3.5 h-3.5 transition-transform {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                    {isExpanded ? 'Less' : 'Details'}
                  </button>
                </div>
              </div>
            </div>

            <!-- Expanded detail section -->
            {#if isExpanded}
              <div class="px-4 pb-4 border-t border-border-default/50 pt-3 animate-fade-in">
                <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span class="text-text-muted block mb-0.5">Mode</span>
                    <span class="text-text-primary font-mono">{entry.mode ?? '—'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted block mb-0.5">Platform</span>
                    <span class="text-text-primary font-mono">{entry.platform ?? '—'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted block mb-0.5">Device</span>
                    <span class="text-text-primary font-mono">{entry.deviceFamily ?? '—'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted block mb-0.5">Model ID</span>
                    <span class="text-text-primary font-mono">{entry.modelIdentifier ?? '—'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted block mb-0.5">Client Version</span>
                    <span class="text-text-primary font-mono">{entry.clientVersion ?? entry.version ?? '—'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted block mb-0.5">Client ID</span>
                    <span class="text-text-primary font-mono">{entry.clientId ?? '—'}</span>
                  </div>
                  {#if entry.sessionKey}
                    <div class="col-span-2 md:col-span-3">
                      <span class="text-text-muted block mb-0.5">Session Key</span>
                      <span class="text-text-primary font-mono text-[10px] break-all">{entry.sessionKey}</span>
                    </div>
                  {/if}
                  {#if entry.model}
                    <div>
                      <span class="text-text-muted block mb-0.5">Model</span>
                      <span class="text-accent-purple font-mono">{entry.model}</span>
                    </div>
                  {/if}
                  {#if (entry.scopes ?? []).length > 0}
                    <div class="col-span-2 md:col-span-3">
                      <span class="text-text-muted block mb-0.5">Scopes</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each (entry.scopes ?? []) as scope}
                          <span class="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted border border-border-default font-mono">{scope}</span>
                        {/each}
                      </div>
                    </div>
                  {/if}
                  {#if (entry.capabilities ?? []).length > 0}
                    <div class="col-span-2 md:col-span-3">
                      <span class="text-text-muted block mb-0.5">Capabilities</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        {#each (entry.capabilities ?? []) as cap}
                          <span class="px-1.5 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/10 font-mono">{cap}</span>
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
