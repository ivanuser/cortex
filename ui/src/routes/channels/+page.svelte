<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ─────────────────────────────────────
  interface ChannelStatus {
    configured?: boolean;
    running?: boolean;
    connected?: boolean;
    linked?: boolean;
    lastError?: string;
    lastConnectedAt?: number;
    lastMessageAt?: number;
    lastStartAt?: number;
    lastProbeAt?: number;
    authAgeMs?: number;
    mode?: string;
    baseUrl?: string;
    probe?: { ok?: boolean; status?: string; error?: string; bot?: { username?: string } };
  }

  interface ChannelMeta {
    id: string;
    label?: string;
  }

  interface ChannelAccount {
    accountId: string;
    name?: string;
    configured?: boolean;
    running?: boolean;
    connected?: boolean;
    lastInboundAt?: number;
    lastError?: string;
    probe?: Record<string, unknown>;
  }

  interface ChannelsSnapshot {
    channels?: Record<string, ChannelStatus>;
    channelMeta?: ChannelMeta[];
    channelOrder?: string[];
    channelLabels?: Record<string, string>;
    channelAccounts?: Record<string, ChannelAccount[]>;
  }

  // ─── Channel theme config ─────────────────────
  const channelThemes: Record<string, { color: string; cssColor: string; icon: string }> = {
    discord: {
      color: '#7289da',
      cssColor: '#7289da',
      icon: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z'
    },
    telegram: {
      color: '#0088cc',
      cssColor: '#0088cc',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z'
    },
    whatsapp: {
      color: '#25d366',
      cssColor: '#25d366',
      icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z'
    },
    signal: {
      color: '#3a76f0',
      cssColor: '#3a76f0',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z'
    },
    slack: {
      color: '#e01e5a',
      cssColor: '#e01e5a',
      icon: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.164 0a2.528 2.528 0 012.521 2.522v6.312zM15.164 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.164 24a2.528 2.528 0 01-2.521-2.522v-2.522h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.314A2.528 2.528 0 0124 15.164a2.528 2.528 0 01-2.522 2.521h-6.314z'
    },
    imessage: {
      color: '#34c759',
      cssColor: '#34c759',
      icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z'
    },
    nostr: {
      color: '#7c4dff',
      cssColor: '#7c4dff',
      icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'
    },
    googlechat: {
      color: '#00ac47',
      cssColor: '#00ac47',
      icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z'
    },
    'nextcloud-talk': {
      color: '#0082c9',
      cssColor: '#0082c9',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 16.09V20H8.54v-1.91c-1.75-.32-3.29-1.46-3.4-3.33h1.82c.13 1.05.97 1.72 2.59 1.72 1.72 0 2.1-.81 2.1-1.32 0-.69-.42-1.33-2.17-1.79C7.76 12.91 6 12.15 6 10.24c0-1.57 1.27-2.66 2.54-2.98V5.35h2.05v1.93c1.61.42 2.57 1.66 2.62 3.03h-1.82c-.05-.96-.73-1.72-2.12-1.72-1.32 0-2.21.59-2.21 1.48 0 .93.65 1.28 2.42 1.76 1.96.53 3.83 1.14 3.83 3.41 0 1.78-1.36 2.76-2.72 3.15V18.09z'
    }
  };

  const defaultTheme = {
    color: 'var(--color-accent-cyan)',
    cssColor: 'var(--color-accent-cyan)',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
  };

  const channelDescriptions: Record<string, string> = {
    discord: 'Bot status and server configuration',
    telegram: 'Bot status and message polling',
    whatsapp: 'WhatsApp Web link and connection health',
    signal: 'signal-cli daemon status',
    slack: 'Slack app and workspace connection',
    imessage: 'iMessage bridge status',
    nostr: 'Nostr relay and profile management',
    googlechat: 'Google Chat app status',
    'nextcloud-talk': 'Nextcloud Talk webhook bot'
  };

  // ─── State ─────────────────────────────────────
  let snapshot = $state<ChannelsSnapshot | null>(null);
  let loading = $state(false);
  let lastError = $state<string | null>(null);
  let lastSuccessAt = $state<number | null>(null);

  // WhatsApp login flow
  let waLoginBusy = $state(false);
  let waLoginMessage = $state<string | null>(null);
  let waLoginQrDataUrl = $state<string | null>(null);
  let waLoginConnected = $state<boolean | null>(null);

  // Per-channel logout busy state
  let logoutBusy = $state<Record<string, boolean>>({});

  // Expanded details
  let expandedChannel = $state<string | null>(null);

  // ─── Derived ───────────────────────────────────
  let channelOrder = $derived.by(() => {
    if (snapshot?.channelMeta?.length) {
      return snapshot.channelMeta.map((e) => e.id);
    }
    if (snapshot?.channelOrder?.length) {
      return snapshot.channelOrder;
    }
    return ['whatsapp', 'telegram', 'discord', 'googlechat', 'slack', 'signal', 'imessage', 'nostr'];
  });

  let sortedChannels = $derived.by(() => {
    const channels = snapshot?.channels ?? {};
    const accounts = snapshot?.channelAccounts ?? {};

    return channelOrder
      .map((key, idx) => {
        const status = channels[key] as ChannelStatus | undefined;
        const accts = accounts[key] ?? [];
        const enabled = !!(
          status?.configured || status?.running || status?.connected ||
          accts.some((a) => a.configured || a.running || a.connected)
        );
        return { key, status, accounts: accts, enabled, order: idx };
      })
      .toSorted((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.order - b.order;
      });
  });

  let stats = $derived.by(() => {
    const total = sortedChannels.length;
    const connected = sortedChannels.filter((c) => getConnectionStatus(c.status, c.accounts) === 'connected').length;
    const configured = sortedChannels.filter((c) => c.enabled).length;
    const errors = sortedChannels.filter((c) => c.status?.lastError).length;
    return { total, connected, configured, errors };
  });

  // ─── Actions ───────────────────────────────────
  async function loadChannels(probe = false) {
    if (!gateway.connected || loading) return;
    loading = true;
    lastError = null;
    try {
      const res = await gateway.call<ChannelsSnapshot>('channels.status', {
        probe,
        timeoutMs: 8000
      });
      snapshot = res;
      lastSuccessAt = Date.now();
      if (probe) toasts.success('Channels probed', 'All channel statuses refreshed');
    } catch (err) {
      lastError = String(err);
      toasts.error('Failed to load channels', String(err));
    } finally {
      loading = false;
    }
  }

  async function logoutChannel(channelId: string) {
    if (!gateway.connected || logoutBusy[channelId]) return;
    logoutBusy = { ...logoutBusy, [channelId]: true };
    try {
      await gateway.call('channels.logout', { channelId });
      toasts.success('Logged out', `${resolveLabel(channelId)} has been disconnected`);
      // Reset WA state if it's whatsapp
      if (channelId === 'whatsapp') {
        waLoginMessage = 'Logged out.';
        waLoginQrDataUrl = null;
        waLoginConnected = null;
      }
      await loadChannels(false);
    } catch (err) {
      toasts.error('Logout failed', String(err));
    } finally {
      logoutBusy = { ...logoutBusy, [channelId]: false };
    }
  }

  async function startWhatsAppLogin(force = false) {
    if (!gateway.connected || waLoginBusy) return;
    waLoginBusy = true;
    waLoginMessage = null;
    waLoginQrDataUrl = null;
    waLoginConnected = null;
    try {
      const res = await gateway.call<{ message?: string; qrDataUrl?: string }>(
        'web.login.start',
        { force, timeoutMs: 30000 }
      );
      waLoginMessage = res.message ?? null;
      waLoginQrDataUrl = res.qrDataUrl ?? null;
      if (waLoginQrDataUrl) {
        toasts.info('QR Code ready', 'Scan with WhatsApp to connect');
        // Auto-wait for scan after showing QR
        waitWhatsAppLogin();
      }
    } catch (err) {
      waLoginMessage = String(err);
      toasts.error('WhatsApp login failed', String(err));
    } finally {
      waLoginBusy = false;
    }
  }

  async function waitWhatsAppLogin() {
    if (!gateway.connected || waLoginBusy) return;
    waLoginBusy = true;
    try {
      const res = await gateway.call<{ message?: string; connected?: boolean; error?: string }>(
        'web.login.wait',
        { timeoutMs: 120000 }
      );
      waLoginMessage = res.message ?? null;
      waLoginConnected = res.connected ?? null;
      if (res.connected) {
        waLoginQrDataUrl = null;
        toasts.success('WhatsApp connected', 'Successfully linked via QR scan');
        await loadChannels(false);
      } else if (res.error) {
        toasts.error('WhatsApp login failed', res.error);
      }
    } catch (err) {
      waLoginMessage = String(err);
      waLoginConnected = null;
    } finally {
      waLoginBusy = false;
    }
  }

  function resolveLabel(key: string): string {
    const meta = snapshot?.channelMeta?.find((m) => m.id === key);
    return meta?.label ?? snapshot?.channelLabels?.[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
  }

  function getTheme(key: string) {
    return channelThemes[key] ?? defaultTheme;
  }

  function getConnectionStatus(status?: ChannelStatus, accounts?: ChannelAccount[]): 'connected' | 'connecting' | 'disconnected' {
    // Explicit connected flag (WhatsApp, Signal, etc.)
    if (status?.connected) return 'connected';
    // Check accounts for connected flag
    if (accounts?.some(a => a.connected)) return 'connected';
    // Running + configured = effectively connected (Discord bots, etc.)
    if (status?.running && status?.configured) return 'connected';
    // Configured but not running — webhook-based channels (Nextcloud Talk, etc.)
    // These are passive listeners on the gateway; configured = ready to receive
    if (status?.configured && !status?.lastError) return 'connected';
    // Running but not configured (unlikely but handle it)
    if (status?.running) return 'connecting';
    // Configured but has an error
    if (status?.configured && status?.lastError) return 'disconnected';
    return 'disconnected';
  }

  function getStatusColor(connStatus: string): string {
    switch (connStatus) {
      case 'connected': return 'var(--color-accent-green)';
      case 'connecting': return 'var(--color-accent-amber)';
      default: return '#ef4444';
    }
  }

  function toggleExpand(key: string) {
    expandedChannel = expandedChannel === key ? null : key;
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  // ─── Effects ───────────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadChannels(false));
    }
  });
</script>

<svelte:head>
  <title>Channels — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">CHANNELS</div>
    <div></div>
  </div>

  <!-- Header bar -->
  <div class="hud-header">
    <div class="hud-header-left">
      <div class="hud-header-icon">
        <svg width="20" height="20" fill="none" stroke="var(--color-accent-cyan)" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <div>
        <div class="hud-subtitle">Messaging platform connections and health</div>
      </div>
    </div>

    <div class="hud-header-actions">
      {#if lastSuccessAt}
        <span class="hud-timestamp">{formatRelativeTime(lastSuccessAt)}</span>
      {/if}

      <button
        onclick={() => loadChannels(false)}
        disabled={loading || conn.state.status !== 'connected'}
        class="hud-btn"
      >
        <svg class="hud-btn-icon {loading ? 'spin' : ''}" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Loading...' : 'Refresh'}
      </button>

      <button
        onclick={() => loadChannels(true)}
        disabled={loading || conn.state.status !== 'connected'}
        class="hud-btn hud-btn-primary"
      >
        <svg class="hud-btn-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        Probe All
      </button>
    </div>
  </div>

  <!-- Stats bar -->
  {#if snapshot && sortedChannels.length > 0}
    <div class="hud-stats-bar">
      <div class="hud-stat">
        <span class="hud-stat-dot" style="background: var(--color-accent-cyan);"></span>
        <span class="hud-stat-label">Total</span>
        <span class="hud-stat-value">{stats.total}</span>
      </div>
      <div class="hud-stat">
        <span class="hud-stat-dot pulse" style="background: var(--color-accent-green);"></span>
        <span class="hud-stat-label">Connected</span>
        <span class="hud-stat-value" style="color: var(--color-accent-green);">{stats.connected}</span>
      </div>
      <div class="hud-stat">
        <span class="hud-stat-dot" style="background: var(--color-accent-amber);"></span>
        <span class="hud-stat-label">Configured</span>
        <span class="hud-stat-value">{stats.configured}</span>
      </div>
      {#if stats.errors > 0}
        <div class="hud-stat">
          <span class="hud-stat-dot" style="background: #ef4444;"></span>
          <span class="hud-stat-label">Errors</span>
          <span class="hud-stat-value" style="color: #ef4444;">{stats.errors}</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Content area -->
  <div class="hud-content">
    {#if conn.state.status !== 'connected'}
      <div class="hud-empty">
        <div class="hud-empty-icon">
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--color-text-muted);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757" />
          </svg>
        </div>
        <p class="hud-empty-text">Connect to the gateway to view channel status.</p>
      </div>

    {:else if lastError && !snapshot}
      <div class="hud-panel hud-panel-error">
        <div class="hud-error-row">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #ef4444; flex-shrink: 0;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>

    {:else if loading && !snapshot}
      <div class="hud-grid">
        {#each Array(4) as _}
          <div class="hud-panel hud-skeleton">
            <div class="hud-skeleton-header">
              <div class="hud-skeleton-icon"></div>
              <div>
                <div class="hud-skeleton-line" style="width: 6rem;"></div>
                <div class="hud-skeleton-line" style="width: 9rem; margin-top: 0.4rem;"></div>
              </div>
            </div>
            <div class="hud-skeleton-body">
              <div class="hud-skeleton-line" style="width: 100%;"></div>
              <div class="hud-skeleton-line" style="width: 75%;"></div>
              <div class="hud-skeleton-line" style="width: 50%;"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if sortedChannels.length === 0}
      <div class="hud-empty">
        <div class="hud-empty-icon">
          <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--color-text-muted);">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p class="hud-empty-text">No channels configured. Add channels in your gateway config.</p>
      </div>

    {:else}
      <div class="hud-grid">
        {#each sortedChannels as channel (channel.key)}
          {@const theme = getTheme(channel.key)}
          {@const connStatus = getConnectionStatus(channel.status, channel.accounts)}
          {@const isExpanded = expandedChannel === channel.key}
          {@const isWhatsApp = channel.key === 'whatsapp'}
          {@const label = resolveLabel(channel.key)}
          {@const description = channelDescriptions[channel.key] ?? 'Channel status and configuration'}
          {@const statusColor = getStatusColor(connStatus)}

          <div
            class="hud-panel hud-channel-card"
            class:hud-channel-expanded={isExpanded}
            class:hud-channel-disabled={!channel.enabled}
            style="--channel-color: {theme.cssColor};"
          >
            <!-- Card header -->
            <div class="hud-channel-header">
              <div class="hud-channel-identity">
                <div class="hud-channel-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="color: {theme.cssColor};">
                    <path d={theme.icon} />
                  </svg>
                </div>
                <div class="hud-channel-info">
                  <h3 class="hud-channel-name">{label}</h3>
                  <p class="hud-channel-desc">{description}</p>
                </div>
              </div>

              <span class="hud-status-badge" style="--status-color: {statusColor};">
                <span class="hud-status-dot" class:pulse={connStatus === 'connected'} style="background: {statusColor};"></span>
                {connStatus.toUpperCase()}
              </span>
            </div>

            <!-- Account count -->
            {#if channel.accounts.length > 1}
              <div class="hud-account-count" style="color: {theme.cssColor};">
                {channel.accounts.length} accounts
              </div>
            {/if}

            <!-- Status fields -->
            <div class="hud-channel-fields">
              <div class="hud-field-row">
                <span class="hud-field-label">Configured</span>
                <span class="hud-field-value" class:hud-field-ok={channel.status?.configured}>{channel.status?.configured ? 'Yes' : 'No'}</span>
              </div>
              <div class="hud-field-row">
                <span class="hud-field-label">Running</span>
                <span class="hud-field-value" class:hud-field-ok={channel.status?.running}>{channel.status?.running ? 'Yes' : 'No'}</span>
              </div>
              <div class="hud-field-row">
                <span class="hud-field-label">Connected</span>
                <span class="hud-field-value" class:hud-field-ok={channel.status?.connected}>{channel.status?.connected ? 'Yes' : 'No'}</span>
              </div>
              {#if isWhatsApp && channel.status?.linked !== undefined}
                <div class="hud-field-row">
                  <span class="hud-field-label">Linked</span>
                  <span class="hud-field-value" class:hud-field-ok={channel.status?.linked}>{channel.status?.linked ? 'Yes' : 'No'}</span>
                </div>
              {/if}
              {#if channel.status?.mode}
                <div class="hud-field-row">
                  <span class="hud-field-label">Mode</span>
                  <span class="hud-field-value hud-field-mono">{channel.status.mode}</span>
                </div>
              {/if}
            </div>

            <!-- Error callout -->
            {#if channel.status?.lastError}
              <div class="hud-callout hud-callout-error">
                <p>{channel.status.lastError}</p>
              </div>
            {/if}

            <!-- Probe result -->
            {#if channel.status?.probe}
              <div class="hud-callout" class:hud-callout-ok={channel.status.probe.ok} class:hud-callout-warn={!channel.status.probe.ok}>
                <p>
                  Probe {channel.status.probe.ok ? 'ok' : 'failed'}
                  {#if channel.status.probe.status} &middot; {channel.status.probe.status}{/if}
                  {#if channel.status.probe.error} &middot; {channel.status.probe.error}{/if}
                  {#if channel.status.probe.bot?.username} &middot; @{channel.status.probe.bot.username}{/if}
                </p>
              </div>
            {/if}

            <!-- WhatsApp QR login section -->
            {#if isWhatsApp}
              {#if waLoginMessage}
                <div class="hud-callout hud-callout-info">
                  <p>{waLoginMessage}</p>
                </div>
              {/if}

              {#if waLoginConnected}
                <div class="hud-callout hud-callout-ok">
                  <div class="hud-callout-row">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--color-accent-green);">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>WhatsApp connected successfully!</p>
                  </div>
                </div>
              {/if}

              {#if waLoginQrDataUrl}
                <div class="hud-qr-container">
                  <div class="hud-qr-frame">
                    <img src={waLoginQrDataUrl} alt="WhatsApp QR Code" class="hud-qr-img" />
                  </div>
                </div>
                {#if waLoginBusy}
                  <div class="hud-qr-waiting">
                    <p>Waiting for scan...</p>
                  </div>
                {/if}
              {/if}

              <div class="hud-wa-actions">
                <button
                  onclick={() => startWhatsAppLogin(false)}
                  disabled={waLoginBusy}
                  class="hud-btn hud-btn-wa"
                >
                  {#if waLoginBusy}
                    <svg class="hud-btn-icon spin" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Working...
                  {:else}
                    <svg class="hud-btn-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    Show QR
                  {/if}
                </button>
                <button
                  onclick={() => startWhatsAppLogin(true)}
                  disabled={waLoginBusy}
                  class="hud-btn"
                >
                  Relink
                </button>
                {#if !waLoginQrDataUrl}
                  <button
                    onclick={waitWhatsAppLogin}
                    disabled={waLoginBusy}
                    class="hud-btn"
                  >
                    Wait for scan
                  </button>
                {/if}
              </div>
            {/if}

            <!-- Multi-account cards -->
            {#if channel.accounts.length > 1}
              <div class="hud-accounts-list">
                {#each channel.accounts as account}
                  {@const botUsername = (account.probe as Record<string, Record<string, string>> | undefined)?.bot?.username}
                  <div class="hud-account-card">
                    <div class="hud-account-header">
                      <span class="hud-account-name">
                        {botUsername ? `@${botUsername}` : account.name || account.accountId}
                      </span>
                      <span class="hud-account-id">{account.accountId}</span>
                    </div>
                    <div class="hud-account-fields">
                      <div>
                        <span class="hud-field-label">Running</span>
                        <span class="hud-field-value" class:hud-field-ok={account.running}>{account.running ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span class="hud-field-label">Config</span>
                        <span class="hud-field-value" class:hud-field-ok={account.configured}>{account.configured ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span class="hud-field-label">Inbound</span>
                        <span class="hud-field-value">{account.lastInboundAt ? formatRelativeTime(account.lastInboundAt) : 'n/a'}</span>
                      </div>
                    </div>
                    {#if account.lastError}
                      <p class="hud-account-error">{account.lastError}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Action buttons -->
            <div class="hud-channel-actions">
              <button
                onclick={() => toggleExpand(channel.key)}
                class="hud-btn hud-btn-ghost"
              >
                <svg class="hud-btn-icon" style="transition: transform 0.2s; {isExpanded ? 'transform: rotate(180deg);' : ''}" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                Details
              </button>

              <div style="flex: 1;"></div>

              {#if channel.status?.connected || channel.status?.running}
                <button
                  onclick={() => logoutChannel(channel.key)}
                  disabled={logoutBusy[channel.key]}
                  class="hud-btn hud-btn-danger"
                >
                  <svg class="hud-btn-icon" width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {logoutBusy[channel.key] ? 'Logging out...' : 'Logout'}
                </button>
              {/if}
            </div>

            <!-- Expanded details -->
            {#if isExpanded}
              <div class="hud-channel-details">
                <div class="hud-details-grid">
                  {#if channel.status?.lastConnectedAt}
                    <div>
                      <span class="hud-field-label">Last connected</span>
                      <span class="hud-field-value">{formatRelativeTime(channel.status.lastConnectedAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastMessageAt}
                    <div>
                      <span class="hud-field-label">Last message</span>
                      <span class="hud-field-value">{formatRelativeTime(channel.status.lastMessageAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastStartAt}
                    <div>
                      <span class="hud-field-label">Last start</span>
                      <span class="hud-field-value">{formatRelativeTime(channel.status.lastStartAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastProbeAt}
                    <div>
                      <span class="hud-field-label">Last probe</span>
                      <span class="hud-field-value">{formatRelativeTime(channel.status.lastProbeAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.authAgeMs != null}
                    <div>
                      <span class="hud-field-label">Auth age</span>
                      <span class="hud-field-value hud-field-mono">{formatDuration(channel.status.authAgeMs)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.baseUrl}
                    <div>
                      <span class="hud-field-label">Base URL</span>
                      <span class="hud-field-value hud-field-mono" style="font-size: 0.68rem; word-break: break-all;">{channel.status.baseUrl}</span>
                    </div>
                  {/if}
                  {#if channel.status?.mode}
                    <div>
                      <span class="hud-field-label">Mode</span>
                      <span class="hud-field-value hud-field-mono">{channel.status.mode}</span>
                    </div>
                  {/if}
                </div>

                <details class="hud-raw-json">
                  <summary>Raw status JSON</summary>
                  <pre>{JSON.stringify(channel.status, null, 2)}</pre>
                </details>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Raw snapshot section -->
      {#if snapshot}
        <details class="hud-raw-snapshot">
          <summary class="hud-panel">
            <div class="hud-raw-summary">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: var(--color-text-muted);">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span>Channel health snapshot</span>
              {#if lastSuccessAt}
                <span class="hud-timestamp">{formatRelativeTime(lastSuccessAt)}</span>
              {/if}
            </div>
          </summary>
          <div class="hud-panel" style="margin-top: 0.5rem;">
            {#if lastError}
              <div class="hud-callout hud-callout-error">
                <p>{lastError}</p>
              </div>
            {/if}
            <pre class="hud-raw-pre">{JSON.stringify(snapshot, null, 2)}</pre>
          </div>
        </details>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ─── HUD Page Layout ─────────────────────────── */
  .hud-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-bg-primary) 85%, transparent);
    position: relative;
    z-index: 2;
  }

  .hud-page-topbar::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
  }

  .hud-back {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--color-accent-cyan);
    text-decoration: none;
    transition: text-shadow 0.2s;
  }

  .hud-back:hover {
    text-shadow: 0 0 8px var(--color-accent-cyan);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── HUD Panel ────────────────────────────────── */
  .hud-panel {
    background: color-mix(in srgb, var(--color-bg-secondary) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 0.75rem;
    position: relative;
    overflow: hidden;
  }

  .hud-panel::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.5;
  }

  .hud-panel-lbl {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-accent-cyan);
  }

  .hud-panel-error {
    border-color: color-mix(in srgb, #ef4444 30%, transparent);
  }

  .hud-panel-error::before {
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
  }

  /* ─── HUD Button ───────────────────────────────── */
  .hud-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-btn:hover:not(:disabled) {
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    text-shadow: 0 0 6px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hud-btn-primary {
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--color-text-muted);
  }

  .hud-btn-ghost:hover:not(:disabled) {
    color: var(--color-text-primary);
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
  }

  .hud-btn-danger {
    color: color-mix(in srgb, #ef4444 80%, transparent);
    border-color: transparent;
    background: transparent;
  }

  .hud-btn-danger:hover:not(:disabled) {
    color: #ef4444;
    background: color-mix(in srgb, #ef4444 10%, transparent);
    border-color: color-mix(in srgb, #ef4444 25%, transparent);
  }

  .hud-btn-wa {
    background: color-mix(in srgb, #25d366 15%, transparent);
    color: #25d366;
    border-color: color-mix(in srgb, #25d366 25%, transparent);
  }

  .hud-btn-wa:hover:not(:disabled) {
    background: color-mix(in srgb, #25d366 25%, transparent);
    border-color: color-mix(in srgb, #25d366 40%, transparent);
    text-shadow: 0 0 6px color-mix(in srgb, #25d366 40%, transparent);
  }

  .hud-btn-icon {
    flex-shrink: 0;
  }

  /* ─── Header ───────────────────────────────────── */
  .hud-header {
    flex-shrink: 0;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
    background: color-mix(in srgb, var(--color-bg-primary) 80%, transparent);
    position: relative;
    z-index: 2;
  }

  .hud-header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .hud-header-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hud-subtitle {
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }

  .hud-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-timestamp {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Stats Bar ────────────────────────────────── */
  .hud-stats-bar {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 0.6rem 1.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-bg-primary) 70%, transparent);
    position: relative;
    z-index: 2;
  }

  .hud-stat {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.72rem;
  }

  .hud-stat-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  .hud-stat-dot.pulse {
    animation: glow-pulse 2s ease-in-out infinite;
  }

  .hud-stat-label {
    color: var(--color-text-muted);
  }

  .hud-stat-value {
    color: var(--color-text-primary);
    font-weight: 600;
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Content ──────────────────────────────────── */
  .hud-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem 1.5rem;
    position: relative;
    z-index: 2;
  }

  .hud-grid {
    display: grid;
    grid-template-columns: repeat(1, 1fr);
    gap: 1rem;
  }

  @media (min-width: 768px) {
    .hud-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (min-width: 1280px) {
    .hud-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* ─── Empty State ──────────────────────────────── */
  .hud-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
  }

  .hud-empty-icon {
    width: 4rem;
    height: 4rem;
    border-radius: 1rem;
    background: color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .hud-empty-text {
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }

  .hud-error-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    font-size: 0.8rem;
    color: #ef4444;
  }

  /* ─── Channel Card ─────────────────────────────── */
  .hud-channel-card {
    transition: all 0.3s;
    border-color: color-mix(in srgb, var(--channel-color) 25%, transparent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--channel-color) 15%, transparent);
  }

  .hud-channel-card::before {
    background: linear-gradient(90deg, transparent, var(--channel-color), transparent);
    opacity: 0.6;
  }

  .hud-channel-card:hover {
    border-color: color-mix(in srgb, var(--channel-color) 40%, transparent);
    box-shadow: 0 0 18px color-mix(in srgb, var(--channel-color) 20%, transparent);
  }

  .hud-channel-disabled {
    opacity: 0.5;
    border-color: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent) !important;
    box-shadow: none !important;
  }

  .hud-channel-disabled::before {
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.2;
  }

  .hud-channel-expanded {
    grid-column: span 2;
  }

  .hud-channel-header {
    padding: 1rem 1rem 0.75rem;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .hud-channel-identity {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .hud-channel-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--channel-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--channel-color) 25%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hud-channel-info {
    min-width: 0;
  }

  .hud-channel-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0;
  }

  .hud-channel-desc {
    font-size: 0.7rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0.15rem 0 0;
  }

  /* ─── Status Badge ─────────────────────────────── */
  .hud-status-badge {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-family: 'Orbitron', sans-serif;
    font-size: 0.55rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.2rem 0.5rem;
    border-radius: 9999px;
    color: var(--status-color);
    background: color-mix(in srgb, var(--status-color) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--status-color) 25%, transparent);
  }

  .hud-status-dot {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
  }

  .hud-status-dot.pulse {
    animation: glow-pulse 2s ease-in-out infinite;
  }

  @keyframes glow-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
    50% { opacity: 0.5; box-shadow: 0 0 8px currentColor; }
  }

  /* ─── Account Count ────────────────────────────── */
  .hud-account-count {
    padding: 0 1rem;
    margin-top: 0.25rem;
    font-family: 'Orbitron', sans-serif;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* ─── Field Rows ───────────────────────────────── */
  .hud-channel-fields {
    padding: 0 1rem 0.75rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.25rem 1rem;
  }

  .hud-field-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
  }

  .hud-field-label {
    color: var(--color-text-muted);
    font-size: 0.7rem;
  }

  .hud-field-value {
    color: var(--color-text-secondary);
    font-size: 0.72rem;
  }

  .hud-field-ok {
    color: var(--color-accent-green);
  }

  .hud-field-mono {
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Callouts ─────────────────────────────────── */
  .hud-callout {
    margin: 0 1rem 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.72rem;
    line-height: 1.5;
    word-break: break-word;
  }

  .hud-callout p {
    margin: 0;
  }

  .hud-callout-error {
    background: color-mix(in srgb, #ef4444 8%, transparent);
    border: 1px solid color-mix(in srgb, #ef4444 20%, transparent);
    color: #f87171;
  }

  .hud-callout-ok {
    background: color-mix(in srgb, var(--color-accent-green) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 20%, transparent);
    color: var(--color-accent-green);
  }

  .hud-callout-warn {
    background: color-mix(in srgb, var(--color-accent-amber) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-amber) 20%, transparent);
    color: var(--color-accent-amber);
  }

  .hud-callout-info {
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    color: var(--color-accent-cyan);
  }

  .hud-callout-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ─── WhatsApp QR ──────────────────────────────── */
  .hud-qr-container {
    margin: 0 1rem 0.75rem;
    display: flex;
    justify-content: center;
  }

  .hud-qr-frame {
    padding: 0.75rem;
    background: white;
    border-radius: 0.75rem;
    border: 2px solid color-mix(in srgb, #25d366 25%, transparent);
  }

  .hud-qr-img {
    width: 12rem;
    height: 12rem;
  }

  .hud-qr-waiting {
    margin: 0 1rem 0.75rem;
    text-align: center;
  }

  .hud-qr-waiting p {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    animation: blink 1.5s ease-in-out infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .hud-wa-actions {
    padding: 0 1rem 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* ─── Multi-account ────────────────────────────── */
  .hud-accounts-list {
    padding: 0 1rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hud-account-card {
    padding: 0.6rem 0.75rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--color-bg-tertiary) 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-account-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .hud-account-name {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .hud-account-id {
    font-size: 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-muted);
  }

  .hud-account-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    font-size: 0.68rem;
  }

  .hud-account-error {
    margin-top: 0.4rem;
    font-size: 0.68rem;
    color: #f87171;
    word-break: break-word;
  }

  /* ─── Channel Actions ──────────────────────────── */
  .hud-channel-actions {
    padding: 0.5rem 1rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    margin-top: 0.25rem;
  }

  /* ─── Expanded Details ─────────────────────────── */
  .hud-channel-details {
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding: 1rem;
    animation: slide-in 0.2s ease-out;
  }

  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-0.5rem); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hud-details-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
    font-size: 0.72rem;
  }

  @media (min-width: 1024px) {
    .hud-details-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .hud-details-grid .hud-field-label {
    display: block;
    margin-bottom: 0.15rem;
  }

  .hud-raw-json {
    margin-top: 1rem;
  }

  .hud-raw-json summary {
    font-size: 0.68rem;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color 0.2s;
  }

  .hud-raw-json summary:hover {
    color: var(--color-text-secondary);
  }

  .hud-raw-json pre {
    margin-top: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--color-bg-tertiary) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    font-size: 0.68rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-secondary);
    overflow-x: auto;
    max-height: 16rem;
    overflow-y: auto;
    line-height: 1.6;
  }

  /* ─── Raw Snapshot ──────────────────────────────── */
  .hud-raw-snapshot {
    margin-top: 1.5rem;
  }

  .hud-raw-snapshot > summary {
    cursor: pointer;
    list-style: none;
  }

  .hud-raw-snapshot > summary::-webkit-details-marker {
    display: none;
  }

  .hud-raw-summary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--color-text-muted);
    padding: 1rem;
  }

  .hud-raw-pre {
    font-size: 0.68rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-secondary);
    overflow-x: auto;
    max-height: 24rem;
    overflow-y: auto;
    line-height: 1.6;
    padding: 1rem;
    margin: 0;
  }

  /* ─── Skeleton ─────────────────────────────────── */
  .hud-skeleton {
    padding: 1.25rem;
  }

  .hud-skeleton-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .hud-skeleton-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    background: var(--color-bg-tertiary);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .hud-skeleton-line {
    height: 0.75rem;
    border-radius: 0.25rem;
    background: var(--color-bg-tertiary);
    animation: skeleton-pulse 1.5s ease-in-out infinite;
  }

  .hud-skeleton-body {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  @keyframes skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }

  /* ─── Spin Animation ───────────────────────────── */
  .spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
