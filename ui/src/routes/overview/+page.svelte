<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { gateway, type HelloOk } from '$lib/gateway';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const sessions = getSessions();
  const toasts = getToasts();

  // Overview data
  let helloData = $state<HelloOk | null>(null);
  let presenceCount = $state(0);
  let presenceList = $state<Array<Record<string, unknown>>>([]);
  let cronStatus = $state<{ enabled: boolean; nextRun: number | null; jobCount?: number } | null>(null);
  let cronJobs = $state<Array<Record<string, unknown>>>([]);
  let debugStatus = $state<Record<string, unknown> | null>(null);
  let healthData = $state<Record<string, unknown> | null>(null);
  let modelsCount = $state(0);
  let modelsList = $state<Array<Record<string, unknown>>>([]);
  let nodesList = $state<Array<Record<string, unknown>>>([]);
  let auditRecent = $state<Array<Record<string, unknown>>>([]);
  let channelStatus = $state<Array<{ name: string; connected: boolean }>>([]);
  let loading = $state(false);

  // Avatar
  let avatarError = $state(false);

  // Live clock
  let clockTime = $state('--:--:--');
  let clockDate = $state('');
  let liveUptime = $state('00:00:00');

  $effect(() => {
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      clockTime = `${h}:${m}:${s}`;
      const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
      clockDate = `${days[now.getDay()]} ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

      // Compute live uptime from uptimeMs
      if (uptimeMs) {
        const totalSec = Math.floor(uptimeMs / 1000) + Math.floor((Date.now() - (pageLoadTime)) / 1000);
        const uh = Math.floor(totalSec / 3600);
        const um = Math.floor((totalSec % 3600) / 60);
        const us = totalSec % 60;
        liveUptime = `${String(uh).padStart(2,'0')}:${String(um).padStart(2,'0')}:${String(us).padStart(2,'0')}`;
      }
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  });

  const pageLoadTime = Date.now();

  // Listen for hello events to capture snapshot
  gateway.on('hello', (payload) => {
    helloData = payload as HelloOk;
    const snap = helloData?.snapshot;
    presenceList = Array.isArray(snap?.presence) ? snap!.presence as Array<Record<string, unknown>> : [];
    presenceCount = presenceList.length;
  });

  // Load overview data when connected
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadOverview());
    }
  });

  async function loadOverview() {
    if (!gateway.connected || loading) return;
    loading = true;
    try {
      const [status, health, models, cron, cronList, nodes, audit] = await Promise.all([
        gateway.call<Record<string, unknown>>('status', {}).catch(() => null),
        gateway.call<Record<string, unknown>>('health', {}).catch(() => null),
        gateway.call<{ models?: Array<Record<string, unknown>> }>('models.list', {}).catch(() => null),
        gateway.call<{ enabled?: boolean; nextRunMs?: number; jobCount?: number }>('cron.status', {}).catch(() => null),
        gateway.call<{ jobs?: Array<Record<string, unknown>> }>('cron.list', {}).catch(() => null),
        gateway.call<{ nodes?: Array<Record<string, unknown>> }>('node.list', {}).catch(() => null),
        gateway.call<{ entries?: Array<Record<string, unknown>> }>('audit.query', { limit: 8 }).catch(() => null),
      ]);
      debugStatus = status;
      healthData = health;
      modelsList = Array.isArray(models?.models) ? models!.models : [];
      modelsCount = modelsList.length;
      cronJobs = Array.isArray(cronList?.jobs) ? cronList!.jobs : [];
      if (cron) {
        cronStatus = { enabled: cron.enabled ?? false, nextRun: cron.nextRunMs ?? null, jobCount: cron.jobCount };
      }
      nodesList = Array.isArray(nodes?.nodes) ? nodes!.nodes : [];
      auditRecent = Array.isArray(audit?.entries) ? audit!.entries : [];

      // Derive channel status from health data
      if (health && typeof health === 'object') {
        const channels: Array<{ name: string; connected: boolean }> = [];
        const ch = (health as any).channels;
        if (ch && typeof ch === 'object') {
          for (const [name, info] of Object.entries(ch)) {
            channels.push({ name, connected: !!(info as any)?.connected });
          }
        }
        channelStatus = channels;
      }
    } catch (e) {
      console.error('Failed to load overview:', e);
    } finally {
      loading = false;
    }
  }

  function formatUptime(ms?: number): string {
    if (!ms) return 'n/a';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function formatTimeAgo(ts: string | number): string {
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function formatNextRun(ms: number | null): string {
    if (ms == null) return 'n/a';
    const now = Date.now();
    const diff = ms - now;
    if (diff < 0) return 'overdue';
    if (diff < 60000) return `in ${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `in ${Math.floor(diff / 60000)}m`;
    return `in ${Math.floor(diff / 3600000)}h`;
  }

  function resultColor(result: string): string {
    if (result === 'success') return 'color: var(--color-accent-green)';
    if (result === 'denied') return 'color: var(--color-accent-amber)';
    return 'color: #ff3864';
  }

  function resultTag(result: string): string {
    if (result === 'success') return '[OK]';
    if (result === 'denied') return '[WARN]';
    return '[ERR]';
  }

  function resultTagClass(result: string): string {
    if (result === 'success') return 'text-accent-green';
    if (result === 'denied') return 'text-accent-amber';
    return 'text-[#ff3864]';
  }

  function formatTimestamp(ts: string | number): string {
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  // SVG gauge helpers
  const CIRC = 2 * Math.PI * 27; // r=27, circumference ~169.6

  function gaugeDash(pct: number): string {
    const fill = (pct / 100) * CIRC;
    return `${fill} ${CIRC}`;
  }

  // Derived stats
  let uptimeMs = $derived(helloData?.snapshot?.uptimeMs as number | undefined);
  let serverVersion = $derived(helloData?.server?.version ?? conn.state.serverVersion);
  let protocol = $derived(helloData?.protocol ?? conn.state.protocol);
  let connectedNodes = $derived(nodesList.filter(n => (n as any).connected));
  let activeSessions = $derived(sessions.list.filter(s => (s as any).kind !== 'isolated'));

  // AI Identity derived
  let aiName = $derived((helloData?.branding as any)?.assistantName || (helloData?.server as any)?.name || 'AI PRESENCE');
  let aiModel = $derived((helloData?.server as any)?.model || (modelsList[0] as any)?.id || 'unknown');
  let aiPlatform = $derived((helloData?.server as any)?.platform || '');
  let aiHostname = $derived((helloData?.server as any)?.hostname || '');

  // Gauge percentages (derived from real data)
  let nodesOnlinePct = $derived(nodesList.length > 0 ? Math.round((connectedNodes.length / nodesList.length) * 100) : 0);
  let sessionsPct = $derived(sessions.list.length > 0 ? Math.min(100, Math.round((activeSessions.length / Math.max(sessions.list.length, 1)) * 100)) : 0);
  let cronPct = $derived(cronJobs.length > 0 ? Math.round((cronJobs.filter(j => (j as any).enabled !== false).length / cronJobs.length) * 100) : 0);
  let channelsPct = $derived(channelStatus.length > 0 ? Math.round((channelStatus.filter(c => c.connected).length / channelStatus.length) * 100) : 0);
</script>

<svelte:head>
  <title>Overview -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-container">
  <!-- TOP BAR -->
  <div class="hud-topbar">
    <div class="flex items-center gap-4">
      <div class="hud-logo">CORTEX</div>
      <div class="hud-tagline">COMMAND CENTER // {conn.state.status === 'connected' ? 'ONLINE' : 'OFFLINE'}</div>
    </div>
    <div class="flex items-center gap-4">
      <div class="hud-clock">{clockTime}</div>
      {#if conn.state.status === 'connected'}
        <div class="hud-live-badge">
          <div class="hud-dot"></div>
          LIVE
        </div>
      {/if}
      <button
        onclick={loadOverview}
        disabled={loading || conn.state.status !== 'connected'}
        class="hud-btn"
      >
        {#if loading}
          <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
        REFRESH
      </button>
    </div>
  </div>

  <!-- STAT CARDS ROW -->
  {#if loading && !debugStatus}
    <div class="hud-stats-grid">
      {#each Array(4) as _}
        <div class="hud-panel animate-pulse" style="min-height:80px"></div>
      {/each}
    </div>
  {:else}
    <div class="hud-stats-grid">
      <a href="/sessions" class="hud-mc group">
        <div class="hud-mc-lbl">SESSIONS</div>
        <div class="hud-mc-val">{sessions.list.length}</div>
        <div class="hud-mc-sub">{activeSessions.length} active</div>
      </a>
      <a href="/nodes" class="hud-mc group">
        <div class="hud-mc-lbl">NODES ONLINE</div>
        <div class="hud-mc-val" style="color: var(--color-accent-green)">{connectedNodes.length}</div>
        <div class="hud-mc-sub">/ {nodesList.length} registered</div>
      </a>
      <a href="/settings" class="hud-mc group">
        <div class="hud-mc-lbl">MODELS</div>
        <div class="hud-mc-val" style="color: var(--color-accent-amber)">{modelsCount}</div>
        <div class="hud-mc-sub">providers</div>
      </a>
      <a href="/cron" class="hud-mc group">
        <div class="hud-mc-lbl">CRON JOBS</div>
        <div class="hud-mc-val">{cronJobs.length}</div>
        <div class="hud-mc-sub">{cronStatus?.enabled ? `Next: ${formatNextRun(cronStatus.nextRun)}` : 'disabled'}</div>
      </a>
    </div>
  {/if}

  <!-- THREE COLUMN MAIN GRID -->
  <div class="hud-main-grid">

    <!-- LEFT COLUMN -->
    <div class="hud-col">
      <!-- SVG Arc Gauges -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">SYSTEM GAUGES</div>
        <div class="hud-gauge-row">
          <div class="hud-gauge">
            <svg viewBox="0 0 68 68">
              <circle class="hud-gauge-bg" cx="34" cy="34" r="27"/>
              <circle class="hud-gauge-fill" cx="34" cy="34" r="27"
                stroke="var(--color-accent-green)"
                stroke-dasharray={gaugeDash(nodesOnlinePct)}
                style="filter:drop-shadow(0 0 5px var(--color-accent-green))"/>
              <text class="hud-gauge-txt" x="34" y="36">{nodesOnlinePct}%</text>
            </svg>
            <div class="hud-gauge-lbl">NODES</div>
          </div>
          <div class="hud-gauge">
            <svg viewBox="0 0 68 68">
              <circle class="hud-gauge-bg" cx="34" cy="34" r="27"/>
              <circle class="hud-gauge-fill" cx="34" cy="34" r="27"
                stroke="var(--color-accent-cyan)"
                stroke-dasharray={gaugeDash(sessionsPct)}
                style="filter:drop-shadow(0 0 5px var(--color-accent-cyan))"/>
              <text class="hud-gauge-txt" x="34" y="36">{sessionsPct}%</text>
            </svg>
            <div class="hud-gauge-lbl">SESSIONS</div>
          </div>
          <div class="hud-gauge">
            <svg viewBox="0 0 68 68">
              <circle class="hud-gauge-bg" cx="34" cy="34" r="27"/>
              <circle class="hud-gauge-fill" cx="34" cy="34" r="27"
                stroke="var(--color-accent-amber)"
                stroke-dasharray={gaugeDash(cronPct)}
                style="filter:drop-shadow(0 0 5px var(--color-accent-amber))"/>
              <text class="hud-gauge-txt" x="34" y="36">{cronPct}%</text>
            </svg>
            <div class="hud-gauge-lbl">CRON</div>
          </div>
          <div class="hud-gauge">
            <svg viewBox="0 0 68 68">
              <circle class="hud-gauge-bg" cx="34" cy="34" r="27"/>
              <circle class="hud-gauge-fill" cx="34" cy="34" r="27"
                stroke="var(--color-accent-purple)"
                stroke-dasharray={gaugeDash(channelsPct)}
                style="filter:drop-shadow(0 0 5px var(--color-accent-purple))"/>
              <text class="hud-gauge-txt" x="34" y="36">{channelsPct}%</text>
            </svg>
            <div class="hud-gauge-lbl">CHANNELS</div>
          </div>
        </div>
      </div>

      <!-- System Health -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">
          SYSTEM HEALTH
          {#if conn.state.status === 'connected'}
            <span class="hud-dot" style="width:5px;height:5px"></span>
          {:else}
            <span class="w-[5px] h-[5px] rounded-full bg-[#ff3864]"></span>
          {/if}
        </div>
        <div class="hud-srow"><span class="hud-sk">GATEWAY</span><span class="hud-sv" style={conn.state.status === 'connected' ? 'color:var(--color-accent-green)' : 'color:#ff3864'}>{conn.state.status === 'connected' ? 'HEALTHY' : 'DOWN'}</span></div>
        <div class="hud-srow"><span class="hud-sk">WEBSOCKET</span><span class="hud-sv" style={conn.state.status === 'connected' ? 'color:var(--color-accent-green)' : 'color:var(--color-text-muted)'}>{conn.state.status === 'connected' ? 'CONNECTED' : 'CLOSED'}</span></div>
        <div class="hud-srow"><span class="hud-sk">SCHEDULER</span><span class="hud-sv" style={cronStatus?.enabled ? 'color:var(--color-accent-green)' : 'color:var(--color-text-muted)'}>{cronStatus?.enabled ? 'RUNNING' : 'STOPPED'}</span></div>
        <div class="hud-srow"><span class="hud-sk">CLIENTS</span><span class="hud-sv">{presenceCount} connected</span></div>
        {#if serverVersion}
          <div class="hud-srow"><span class="hud-sk">VERSION</span><span class="hud-sv">v{serverVersion}</span></div>
        {/if}
        {#if protocol}
          <div class="hud-srow"><span class="hud-sk">PROTOCOL</span><span class="hud-sv">{protocol}</span></div>
        {/if}
        <div class="hud-srow"><span class="hud-sk">UPTIME</span><span class="hud-sv" style="color:var(--color-accent-cyan)">{liveUptime}</span></div>
      </div>

      <!-- Channels -->
      {#if channelStatus.length > 0}
        <div class="hud-panel">
          <div class="hud-panel-lbl">CHANNELS</div>
          {#each channelStatus as ch}
            <div class="hud-srow">
              <span class="hud-sk uppercase">{ch.name}</span>
              <span class="hud-sv" style={ch.connected ? 'color:var(--color-accent-green)' : 'color:#ff3864'}>{ch.connected ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
          {/each}
          <a href="/channels" class="hud-link">CONFIGURE &rarr;</a>
        </div>
      {/if}

      <!-- Cron Jobs -->
      {#if cronJobs.length > 0}
        <div class="hud-panel">
          <div class="hud-panel-lbl">SCHEDULED JOBS <span style="color:var(--color-text-muted)">{cronJobs.length}</span></div>
          {#each cronJobs.slice(0, 5) as job}
            {@const name = (job as any).name || (job as any).id || 'Unnamed'}
            {@const enabled = (job as any).enabled !== false}
            <div class="flex items-center gap-2 py-1">
              <div class="w-[6px] h-[6px] rounded-full flex-shrink-0 {enabled ? 'bg-accent-green shadow-[0_0_6px_var(--color-accent-green)]' : 'bg-text-muted'}"></div>
              <span class="text-[0.75rem] truncate flex-1" style="color:rgba(var(--color-accent-cyan),0.6);font-family:'Share Tech Mono',monospace">{name}</span>
            </div>
          {/each}
          {#if cronJobs.length > 5}
            <div class="text-[0.62rem] mt-1" style="color:var(--color-text-muted)">+{cronJobs.length - 5} more</div>
          {/if}
          <a href="/cron" class="hud-link">MANAGE &rarr;</a>
        </div>
      {/if}
    </div>

    <!-- CENTER COLUMN -->
    <div class="hud-col">

      <!-- Activity Log (terminal style) -->
      <div class="hud-activity">
        <div class="hud-panel-lbl">
          <span class="flex items-center gap-2">
            <span class="hud-dot" style="width:5px;height:5px"></span>
            ACTIVITY LOG
          </span>
          <a href="/audit" class="hud-link">VIEW ALL &rarr;</a>
        </div>
        {#if auditRecent.length > 0}
          {#each auditRecent as entry}
            <div class="hud-aline">
              <span class="hud-ats">{formatTimestamp(String(entry.timestamp))}</span>
              <span class="{resultTagClass(String(entry.result))}" style="flex-shrink:0;width:42px;font-size:0.75rem">{resultTag(String(entry.result))}</span>
              <span class="hud-amsg">
                {entry.action}
                {#if entry.actor_id}
                  <span style="color:var(--color-text-muted)"> by {entry.actor_id}</span>
                {/if}
              </span>
            </div>
          {/each}
          <div class="hud-aline">
            <span class="hud-ats">{clockTime}</span>
            <span class="text-accent-green" style="flex-shrink:0;width:42px;font-size:0.75rem">[OK]</span>
            <span class="hud-amsg">monitoring active <span class="hud-cursor"></span></span>
          </div>
        {:else}
          <div class="py-6 text-center" style="color:var(--color-text-muted);font-size:0.75rem;letter-spacing:0.15em">NO RECENT ACTIVITY</div>
        {/if}
      </div>

      <!-- Quick Actions -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">QUICK ACTIONS</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <a href="/" class="hud-action-btn">CHAT</a>
          <a href="/nodes" class="hud-action-btn">NODES</a>
          <a href="/audit" class="hud-action-btn">AUDIT</a>
          <a href="/logs" class="hud-action-btn">LOGS</a>
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN -->
    <div class="hud-col">
      <!-- AI Identity Panel -->
      <div class="hud-panel hud-id-panel">
        <div class="hud-panel-lbl" style="justify-content:center">IDENTITY</div>
        <div class="hud-av-ring">
          <div class="hud-av-wrap">
            {#if !avatarError}
              <img src="/avatar/main" alt={aiName} onerror={() => { avatarError = true; }} />
            {:else}
              <div class="hud-av-fb">{aiName.charAt(0)}</div>
            {/if}
          </div>
        </div>
        <div class="hud-id-name">{aiName}</div>
        <div class="hud-id-sub">AI PRESENCE // AGENT</div>
        <div class="hud-id-tags">
          <span class="hud-tag hud-tag-a">{aiModel}</span>
          <span class="hud-tag {conn.state.status === 'connected' ? 'hud-tag-g' : 'hud-tag-r'}">{conn.state.status === 'connected' ? 'online' : 'offline'}</span>
          <span class="hud-tag hud-tag-g">trusted</span>
        </div>
        <div class="hud-id-info">
          <div class="hud-srow"><span class="hud-sk">USER</span><span class="hud-sv" style="color:var(--color-accent-green)">IVAN</span></div>
          {#if connectedNodes.length > 0}
            {@const firstNode = connectedNodes[0]}
            <div class="hud-srow"><span class="hud-sk">NODE</span><span class="hud-sv">{(firstNode as any).displayName || (firstNode as any).name || 'unknown'}</span></div>
          {/if}
          {#if aiPlatform}
            <div class="hud-srow"><span class="hud-sk">PLATFORM</span><span class="hud-sv">{aiPlatform}</span></div>
          {/if}
          {#if serverVersion}
            <div class="hud-srow"><span class="hud-sk">VERSION</span><span class="hud-sv" style="color:var(--color-accent-green)">v{serverVersion}</span></div>
          {/if}
        </div>
      </div>

      <!-- Clock Panel -->
      <div class="hud-panel" style="text-align:center">
        <div class="hud-panel-lbl" style="justify-content:center">TIMESTAMP</div>
        <div class="hud-big-clock">{clockTime}</div>
        <div style="font-size:0.72rem;letter-spacing:0.22em;color:var(--color-text-muted);margin-top:3px;font-family:'Share Tech Mono',monospace">{clockDate}</div>
        <div style="font-size:0.65rem;letter-spacing:0.18em;color:var(--color-text-muted);margin-top:6px;font-family:'Share Tech Mono',monospace">UPTIME: {liveUptime}</div>
      </div>

      <!-- Node Fleet -->
      {#if nodesList.length > 0}
        <div class="hud-panel" style="flex:1">
          <div class="hud-panel-lbl">
            CONNECTED NODES
            <a href="/nodes" class="hud-link">MANAGE &rarr;</a>
          </div>
          {#each nodesList as node}
            {@const isConnected = !!(node as any).connected}
            {@const displayName = (node as any).displayName || (node as any).name || 'Unknown'}
            {@const platform = (node as any).platform || (node as any).os || ''}
            {@const version = (node as any).version || ''}
            <div class="hud-nitem">
              <div class="hud-ndot {isConnected ? 'on' : 'off'}"></div>
              <div class="flex-1 min-w-0">
                <div class="hud-nname">{displayName}</div>
                <div class="hud-nmeta">{platform}{isConnected ? '' : ' -- offline'}</div>
              </div>
              {#if version}
                <div class="hud-nver">v{version}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- BOTTOM BAR -->
  <div class="hud-bottombar">
    <div class="flex items-center gap-2">
      <div class="hud-dot" style="width:5px;height:5px"></div>
      <span>{conn.state.status === 'connected' ? 'ALL SYSTEMS NOMINAL' : 'GATEWAY OFFLINE'}</span>
      <div class="hud-bdiv"></div>
      <span>CORTEX {conn.state.status === 'connected' ? 'ACTIVE' : 'INACTIVE'}</span>
      <div class="hud-bdiv"></div>
      <span>{connectedNodes.length}/{nodesList.length} NODES</span>
      <div class="hud-bdiv"></div>
      <span>{sessions.list.length} SESSIONS</span>
    </div>
    <div>UPTIME: {liveUptime}</div>
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════
     HUD LAYOUT — SCALED UP
  ═══════════════════════════════════════════════ */
  .hud-container {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 22px;
    gap: 14px;
    overflow-y: auto;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
  }

  /* ─── TOP BAR ─── */
  .hud-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-bottom: 9px;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hud-logo {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.6rem;
    font-weight: 900;
    letter-spacing: 0.25em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent),
                 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
    animation: hud-glow 4s ease-in-out infinite;
  }

  .hud-tagline {
    font-size: 0.72rem;
    letter-spacing: 0.28em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
  }

  .hud-clock {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.05rem;
    letter-spacing: 0.1em;
    color: var(--color-accent-cyan);
  }

  .hud-live-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    letter-spacing: 0.28em;
    color: var(--color-accent-green);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 28%, transparent);
    padding: 3px 9px;
    border-radius: 2px;
  }

  .hud-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
    animation: hud-dp 1.6s ease-in-out infinite;
  }

  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 35%, transparent);
    padding: 4px 12px;
    border-radius: 2px;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* ─── STATS GRID ─── */
  .hud-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    flex-shrink: 0;
  }

  @media (max-width: 767px) {
    .hud-stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .hud-mc {
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
    border-radius: 3px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    text-decoration: none;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s;
  }

  .hud-mc::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }

  .hud-mc:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-mc-lbl {
    font-size: 0.62rem;
    letter-spacing: 0.28em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
  }

  .hud-mc-val {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    line-height: 1;
  }

  .hud-mc-sub {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 45%, transparent);
  }

  /* ─── MAIN GRID (3 columns) ─── */
  .hud-main-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 280px 1fr 280px;
    gap: 14px;
    min-height: 0;
  }

  @media (max-width: 1023px) {
    .hud-main-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (min-width: 1024px) and (max-width: 1279px) {
    .hud-main-grid {
      grid-template-columns: 240px 1fr 240px;
    }
  }

  .hud-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
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

  /* ─── SESSION ROWS ─── */
  .hud-srow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    font-size: 0.75rem;
  }

  .hud-srow:last-child { border-bottom: none; }

  .hud-sk {
    color: color-mix(in srgb, var(--color-accent-cyan) 58%, transparent);
    letter-spacing: 0.08em;
  }

  .hud-sv {
    color: var(--color-accent-cyan);
  }

  /* ─── GAUGES ─── */
  .hud-gauge-row {
    display: flex;
    justify-content: space-around;
    gap: 8px;
    padding: 2px 0;
    flex-wrap: wrap;
  }

  .hud-gauge {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .hud-gauge svg {
    width: 88px;
    height: 88px;
  }

  .hud-gauge-bg {
    fill: none;
    stroke: color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
    stroke-width: 5;
  }

  .hud-gauge-fill {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    transform: rotate(-90deg);
    transform-origin: 34px 34px;
    transition: stroke-dasharray 1s ease-out;
  }

  .hud-gauge-txt {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.78rem;
    font-weight: 700;
    fill: var(--color-accent-cyan);
    text-anchor: middle;
    dominant-baseline: middle;
  }

  .hud-gauge-lbl {
    font-size: 0.65rem;
    letter-spacing: 0.22em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
  }

  /* ─── ACTIVITY LOG ─── */
  .hud-activity {
    flex: 1;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 3px;
    padding: 14px 16px;
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
  }

  .hud-activity::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }

  .hud-aline {
    display: flex;
    gap: 9px;
    font-size: 0.75rem;
    line-height: 1.55;
    overflow: hidden;
  }

  .hud-ats {
    color: color-mix(in srgb, var(--color-accent-cyan) 45%, transparent);
    flex-shrink: 0;
    width: 55px;
  }

  .hud-amsg {
    color: color-mix(in srgb, var(--color-accent-cyan) 78%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hud-cursor {
    display: inline-block;
    width: 7px;
    height: 13px;
    background: var(--color-accent-cyan);
    animation: hud-blink 1s step-end infinite;
    vertical-align: middle;
  }

  /* ─── NODE LIST ─── */
  .hud-nitem {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 12%, transparent);
  }

  .hud-nitem:last-child { border-bottom: none; }

  .hud-ndot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .hud-ndot.on {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
    animation: hud-dp 2s ease-in-out infinite;
  }

  .hud-ndot.off {
    background: color-mix(in srgb, #ff3864 40%, transparent);
  }

  .hud-nname {
    font-size: 0.78rem;
    color: var(--color-accent-cyan);
    letter-spacing: 0.04em;
  }

  .hud-nmeta {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 33%, transparent);
  }

  .hud-nver {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  /* ─── BIG CLOCK ─── */
  .hud-big-clock {
    font-family: 'Orbitron', sans-serif;
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    letter-spacing: 0.08em;
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── BOTTOM BAR ─── */
  .hud-bottombar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-top: 7px;
    flex-shrink: 0;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 33%, transparent);
    flex-wrap: wrap;
    gap: 4px;
  }

  .hud-bdiv {
    width: 1px;
    height: 10px;
    background: color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
  }

  /* ─── ACTION BUTTONS ─── */
  .hud-action-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
    padding: 8px 10px;
    border-radius: 2px;
    text-align: center;
    text-decoration: none;
    transition: all 0.2s;
  }

  .hud-action-btn:hover {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  /* ─── LINKS ─── */
  .hud-link {
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-decoration: none;
    transition: opacity 0.2s;
  }

  .hud-link:hover {
    opacity: 0.8;
  }

  /* ─── AI IDENTITY PANEL ─── */
  .hud-id-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 11px;
    padding: 16px;
  }

  .hud-av-ring {
    position: relative;
    width: 110px;
    height: 110px;
    flex-shrink: 0;
  }

  .hud-av-ring::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: conic-gradient(var(--color-accent-cyan), var(--color-accent-purple), var(--color-accent-amber), var(--color-accent-cyan));
    animation: hud-spin 4s linear infinite;
    z-index: 0;
  }

  .hud-av-ring::after {
    content: '';
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    background: conic-gradient(transparent, color-mix(in srgb, var(--color-accent-cyan) 30%, transparent), transparent);
    animation: hud-spin 7s linear infinite reverse;
    filter: blur(4px);
    z-index: 0;
  }

  .hud-av-wrap {
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    overflow: hidden;
    z-index: 1;
    background: #0a1f1f;
  }

  .hud-av-wrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .hud-av-fb {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
    font-size: 2.2rem;
    font-weight: 900;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-id-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-align: center;
  }

  .hud-id-sub {
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 40%, transparent);
    text-align: center;
  }

  .hud-id-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    justify-content: center;
    margin-top: 3px;
  }

  .hud-tag {
    font-size: 0.6rem;
    letter-spacing: 0.12em;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
  }

  .hud-tag-a { border-color: color-mix(in srgb, var(--color-accent-amber) 30%, transparent); color: color-mix(in srgb, var(--color-accent-amber) 70%, transparent); }
  .hud-tag-g { border-color: color-mix(in srgb, var(--color-accent-green) 30%, transparent); color: color-mix(in srgb, var(--color-accent-green) 70%, transparent); }
  .hud-tag-r { border-color: color-mix(in srgb, #ff3864 30%, transparent); color: color-mix(in srgb, #ff3864 70%, transparent); }

  .hud-id-info {
    width: 100%;
    margin-top: 6px;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-glow {
    0%, 100% { text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent), 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 15%, transparent); }
    50% { text-shadow: 0 0 40px color-mix(in srgb, var(--color-accent-cyan) 95%, transparent), 0 0 120px color-mix(in srgb, var(--color-accent-cyan) 35%, transparent); }
  }

  @keyframes hud-dp {
    0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--color-accent-green); }
    50% { opacity: 0.25; box-shadow: none; }
  }

  @keyframes hud-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes hud-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
