<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';

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
  const channelThemes: Record<string, { color: string; bg: string; border: string; glow: string; icon: string }> = {
    discord: {
      color: 'text-[#7289da]',
      bg: 'bg-[#7289da]/10',
      border: 'border-[#7289da]/25',
      glow: 'shadow-[0_0_12px_rgba(114,137,218,0.2)]',
      icon: 'M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z'
    },
    telegram: {
      color: 'text-[#0088cc]',
      bg: 'bg-[#0088cc]/10',
      border: 'border-[#0088cc]/25',
      glow: 'shadow-[0_0_12px_rgba(0,136,204,0.2)]',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z'
    },
    whatsapp: {
      color: 'text-[#25d366]',
      bg: 'bg-[#25d366]/10',
      border: 'border-[#25d366]/25',
      glow: 'shadow-[0_0_12px_rgba(37,211,102,0.2)]',
      icon: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z'
    },
    signal: {
      color: 'text-[#3a76f0]',
      bg: 'bg-[#3a76f0]/10',
      border: 'border-[#3a76f0]/25',
      glow: 'shadow-[0_0_12px_rgba(58,118,240,0.2)]',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z'
    },
    slack: {
      color: 'text-[#e01e5a]',
      bg: 'bg-[#e01e5a]/10',
      border: 'border-[#e01e5a]/25',
      glow: 'shadow-[0_0_12px_rgba(224,30,90,0.2)]',
      icon: 'M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.164 0a2.528 2.528 0 012.521 2.522v6.312zM15.164 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.164 24a2.528 2.528 0 01-2.521-2.522v-2.522h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.314A2.528 2.528 0 0124 15.164a2.528 2.528 0 01-2.522 2.521h-6.314z'
    },
    imessage: {
      color: 'text-[#34c759]',
      bg: 'bg-[#34c759]/10',
      border: 'border-[#34c759]/25',
      glow: 'shadow-[0_0_12px_rgba(52,199,89,0.2)]',
      icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z'
    },
    nostr: {
      color: 'text-accent-purple',
      bg: 'bg-accent-purple/10',
      border: 'border-accent-purple/25',
      glow: 'shadow-[0_0_12px_rgba(124,77,255,0.2)]',
      icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'
    },
    googlechat: {
      color: 'text-[#00ac47]',
      bg: 'bg-[#00ac47]/10',
      border: 'border-[#00ac47]/25',
      glow: 'shadow-[0_0_12px_rgba(0,172,71,0.2)]',
      icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z'
    },
    'nextcloud-talk': {
      color: 'text-[#0082c9]',
      bg: 'bg-[#0082c9]/10',
      border: 'border-[#0082c9]/25',
      glow: 'shadow-[0_0_12px_rgba(0,130,201,0.2)]',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 16.09V20H8.54v-1.91c-1.75-.32-3.29-1.46-3.4-3.33h1.82c.13 1.05.97 1.72 2.59 1.72 1.72 0 2.1-.81 2.1-1.32 0-.69-.42-1.33-2.17-1.79C7.76 12.91 6 12.15 6 10.24c0-1.57 1.27-2.66 2.54-2.98V5.35h2.05v1.93c1.61.42 2.57 1.66 2.62 3.03h-1.82c-.05-.96-.73-1.72-2.12-1.72-1.32 0-2.21.59-2.21 1.48 0 .93.65 1.28 2.42 1.76 1.96.53 3.83 1.14 3.83 3.41 0 1.78-1.36 2.76-2.72 3.15V18.09z'
    }
  };

  const defaultTheme = {
    color: 'text-accent-cyan',
    bg: 'bg-accent-cyan/10',
    border: 'border-accent-cyan/25',
    glow: 'shadow-[0_0_12px_rgba(0,229,255,0.2)]',
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

  function getStatusDotColor(connStatus: string): string {
    switch (connStatus) {
      case 'connected': return 'bg-accent-green';
      case 'connecting': return 'bg-accent-amber';
      default: return 'bg-red-500';
    }
  }

  function getStatusBadgeClasses(connStatus: string): string {
    switch (connStatus) {
      case 'connected': return 'bg-accent-green/15 text-accent-green border border-accent-green/20';
      case 'connecting': return 'bg-accent-amber/15 text-accent-amber border border-accent-amber/20';
      default: return 'bg-red-500/10 text-red-400 border border-red-500/20';
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

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary glow-text-cyan">Channels</h1>
            <p class="text-sm text-text-muted">Messaging platform connections and health</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Last updated -->
        {#if lastSuccessAt}
          <span class="text-xs text-text-muted font-mono">
            {formatRelativeTime(lastSuccessAt)}
          </span>
        {/if}

        <!-- Refresh -->
        <button
          onclick={() => loadChannels(false)}
          disabled={loading || conn.state.status !== 'connected'}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        <!-- Probe -->
        <button
          onclick={() => loadChannels(true)}
          disabled={loading || conn.state.status !== 'connected'}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-cyan/10 border border-accent-cyan/25 rounded-lg text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Probe All
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    {#if snapshot && sortedChannels.length > 0}
      <div class="flex items-center gap-4 mt-4">
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-cyan"></span>
          <span class="text-text-muted">Total</span>
          <span class="text-text-primary font-mono font-semibold">{stats.total}</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-green glow-pulse"></span>
          <span class="text-text-muted">Connected</span>
          <span class="text-accent-green font-mono font-semibold">{stats.connected}</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-amber"></span>
          <span class="text-text-muted">Configured</span>
          <span class="text-text-secondary font-mono font-semibold">{stats.configured}</span>
        </div>
        {#if stats.errors > 0}
          <div class="flex items-center gap-1.5 text-xs">
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span class="text-text-muted">Errors</span>
            <span class="text-red-400 font-mono font-semibold">{stats.errors}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Content area -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    {#if conn.state.status !== 'connected'}
      <!-- Not connected -->
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">Connect to the gateway to view channel status.</p>
      </div>

    {:else if lastError && !snapshot}
      <!-- Error (no data at all) -->
      <div class="glass rounded-xl p-4 border border-accent-pink/30 mb-4">
        <div class="flex items-center gap-2 text-accent-pink text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>

    {:else if loading && !snapshot}
      <!-- Loading skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each Array(4) as _}
          <div class="glass rounded-xl p-5 border border-border-default animate-pulse">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 rounded-xl bg-bg-tertiary"></div>
              <div>
                <div class="h-4 w-24 bg-bg-tertiary rounded mb-1.5"></div>
                <div class="h-3 w-36 bg-bg-tertiary rounded"></div>
              </div>
            </div>
            <div class="space-y-2.5">
              <div class="h-3 w-full bg-bg-tertiary rounded"></div>
              <div class="h-3 w-3/4 bg-bg-tertiary rounded"></div>
              <div class="h-3 w-1/2 bg-bg-tertiary rounded"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if sortedChannels.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <div class="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">No channels configured. Add channels in your gateway config.</p>
      </div>

    {:else}
      <!-- Channel grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each sortedChannels as channel (channel.key)}
          {@const theme = getTheme(channel.key)}
          {@const connStatus = getConnectionStatus(channel.status, channel.accounts)}
          {@const isExpanded = expandedChannel === channel.key}
          {@const isWhatsApp = channel.key === 'whatsapp'}
          {@const label = resolveLabel(channel.key)}
          {@const description = channelDescriptions[channel.key] ?? 'Channel status and configuration'}

          <div
            class="glass rounded-xl border transition-all duration-300 animate-fade-in
                   {channel.enabled ? theme.border + ' ' + theme.glow : 'border-border-default opacity-60'}
                   {isExpanded ? 'md:col-span-2 xl:col-span-2' : ''}
                   hover:border-opacity-50"
          >
            <!-- Card header -->
            <div class="p-4 pb-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0">
                  <!-- Channel icon -->
                  <div class="w-10 h-10 rounded-xl {theme.bg} {theme.border} border flex items-center justify-center flex-shrink-0">
                    <svg class="w-5 h-5 {theme.color}" viewBox="0 0 24 24" fill="currentColor">
                      <path d={theme.icon} />
                    </svg>
                  </div>
                  <div class="min-w-0">
                    <h3 class="text-sm font-semibold text-text-primary truncate">{label}</h3>
                    <p class="text-xs text-text-muted truncate">{description}</p>
                  </div>
                </div>

                <!-- Status badge -->
                <span class="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full {getStatusBadgeClasses(connStatus)}">
                  <span class="inline-flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full {getStatusDotColor(connStatus)} {connStatus === 'connected' ? 'glow-pulse' : ''}"></span>
                    {connStatus}
                  </span>
                </span>
              </div>

              <!-- Account count -->
              {#if channel.accounts.length > 1}
                <div class="mt-2 text-[10px] font-medium uppercase tracking-wider text-text-muted {theme.color}">
                  {channel.accounts.length} accounts
                </div>
              {/if}
            </div>

            <!-- Status fields -->
            <div class="px-4 pb-3">
              <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div class="flex justify-between">
                  <span class="text-text-muted">Configured</span>
                  <span class="{channel.status?.configured ? 'text-accent-green' : 'text-text-secondary'}">{channel.status?.configured ? 'Yes' : 'No'}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-text-muted">Running</span>
                  <span class="{channel.status?.running ? 'text-accent-green' : 'text-text-secondary'}">{channel.status?.running ? 'Yes' : 'No'}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-text-muted">Connected</span>
                  <span class="{channel.status?.connected ? 'text-accent-green' : 'text-text-secondary'}">{channel.status?.connected ? 'Yes' : 'No'}</span>
                </div>
                {#if isWhatsApp && channel.status?.linked !== undefined}
                  <div class="flex justify-between">
                    <span class="text-text-muted">Linked</span>
                    <span class="{channel.status?.linked ? 'text-accent-green' : 'text-text-secondary'}">{channel.status?.linked ? 'Yes' : 'No'}</span>
                  </div>
                {/if}
                {#if channel.status?.mode}
                  <div class="flex justify-between">
                    <span class="text-text-muted">Mode</span>
                    <span class="text-text-primary font-mono">{channel.status.mode}</span>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Error callout -->
            {#if channel.status?.lastError}
              <div class="mx-4 mb-3 p-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                <p class="text-xs text-red-400 leading-relaxed break-words">{channel.status.lastError}</p>
              </div>
            {/if}

            <!-- Probe result -->
            {#if channel.status?.probe}
              <div class="mx-4 mb-3 p-2.5 rounded-lg {channel.status.probe.ok ? 'bg-accent-green/8 border border-accent-green/20' : 'bg-accent-amber/8 border border-accent-amber/20'}">
                <p class="text-xs {channel.status.probe.ok ? 'text-accent-green' : 'text-accent-amber'}">
                  Probe {channel.status.probe.ok ? 'ok' : 'failed'}
                  {#if channel.status.probe.status} · {channel.status.probe.status}{/if}
                  {#if channel.status.probe.error} · {channel.status.probe.error}{/if}
                  {#if channel.status.probe.bot?.username} · @{channel.status.probe.bot.username}{/if}
                </p>
              </div>
            {/if}

            <!-- WhatsApp QR login section -->
            {#if isWhatsApp}
              <!-- WA login message -->
              {#if waLoginMessage}
                <div class="mx-4 mb-3 p-2.5 rounded-lg bg-accent-cyan/8 border border-accent-cyan/20">
                  <p class="text-xs text-accent-cyan">{waLoginMessage}</p>
                </div>
              {/if}

              <!-- WA connected success -->
              {#if waLoginConnected}
                <div class="mx-4 mb-3 p-2.5 rounded-lg bg-accent-green/8 border border-accent-green/20">
                  <div class="flex items-center gap-2">
                    <svg class="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p class="text-xs text-accent-green font-medium">WhatsApp connected successfully!</p>
                  </div>
                </div>
              {/if}

              <!-- QR Code display -->
              {#if waLoginQrDataUrl}
                <div class="mx-4 mb-3 flex justify-center">
                  <div class="p-3 bg-white rounded-xl border-2 {theme.border}">
                    <img src={waLoginQrDataUrl} alt="WhatsApp QR Code" class="w-48 h-48" />
                  </div>
                </div>
                {#if waLoginBusy}
                  <div class="mx-4 mb-3 text-center">
                    <p class="text-xs text-text-muted animate-pulse">Waiting for scan…</p>
                  </div>
                {/if}
              {/if}

              <!-- WA action buttons -->
              <div class="px-4 pb-3 flex flex-wrap gap-2">
                <button
                  onclick={() => startWhatsAppLogin(false)}
                  disabled={waLoginBusy}
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                         bg-[#25d366]/15 text-[#25d366] border border-[#25d366]/25
                         hover:bg-[#25d366]/25 hover:border-[#25d366]/40
                         disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {#if waLoginBusy}
                    <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Working…
                  {:else}
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    Show QR
                  {/if}
                </button>
                <button
                  onclick={() => startWhatsAppLogin(true)}
                  disabled={waLoginBusy}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                         bg-bg-tertiary text-text-secondary border border-border-default
                         hover:text-accent-cyan hover:border-accent-cyan/30
                         disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Relink
                </button>
                {#if !waLoginQrDataUrl}
                  <button
                    onclick={waitWhatsAppLogin}
                    disabled={waLoginBusy}
                    class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                           bg-bg-tertiary text-text-secondary border border-border-default
                           hover:text-accent-cyan hover:border-accent-cyan/30
                           disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Wait for scan
                  </button>
                {/if}
              </div>
            {/if}

            <!-- Multi-account cards -->
            {#if channel.accounts.length > 1}
              <div class="px-4 pb-3 space-y-2">
                {#each channel.accounts as account}
                  {@const botUsername = (account.probe as Record<string, Record<string, string>> | undefined)?.bot?.username}
                  <div class="p-2.5 rounded-lg bg-bg-tertiary/50 border border-border-default">
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-xs font-medium text-text-primary">
                        {botUsername ? `@${botUsername}` : account.name || account.accountId}
                      </span>
                      <span class="text-[10px] font-mono text-text-muted">{account.accountId}</span>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span class="text-text-muted">Running</span>
                        <span class="ml-1 {account.running ? 'text-accent-green' : 'text-text-secondary'}">{account.running ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span class="text-text-muted">Config</span>
                        <span class="ml-1 {account.configured ? 'text-accent-green' : 'text-text-secondary'}">{account.configured ? 'Yes' : 'No'}</span>
                      </div>
                      <div>
                        <span class="text-text-muted">Inbound</span>
                        <span class="ml-1 text-text-primary">{account.lastInboundAt ? formatRelativeTime(account.lastInboundAt) : 'n/a'}</span>
                      </div>
                    </div>
                    {#if account.lastError}
                      <p class="mt-1.5 text-[11px] text-red-400 break-words">{account.lastError}</p>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Action buttons -->
            <div class="px-4 pb-4 pt-1 flex items-center gap-2 border-t border-border-default mt-1">
              <!-- Details toggle -->
              <button
                onclick={() => toggleExpand(channel.key)}
                class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all
                       text-text-muted hover:text-text-primary hover:bg-bg-hover"
              >
                <svg class="w-3.5 h-3.5 transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
                Details
              </button>

              <div class="flex-1"></div>

              <!-- Logout -->
              {#if channel.status?.connected || channel.status?.running}
                <button
                  onclick={() => logoutChannel(channel.key)}
                  disabled={logoutBusy[channel.key]}
                  class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all
                         text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20
                         disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  {logoutBusy[channel.key] ? 'Logging out…' : 'Logout'}
                </button>
              {/if}
            </div>

            <!-- Expanded details -->
            {#if isExpanded}
              <div class="border-t border-border-default p-4 animate-slide-in-up">
                <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                  {#if channel.status?.lastConnectedAt}
                    <div>
                      <span class="text-text-muted block mb-0.5">Last connected</span>
                      <span class="text-text-primary">{formatRelativeTime(channel.status.lastConnectedAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastMessageAt}
                    <div>
                      <span class="text-text-muted block mb-0.5">Last message</span>
                      <span class="text-text-primary">{formatRelativeTime(channel.status.lastMessageAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastStartAt}
                    <div>
                      <span class="text-text-muted block mb-0.5">Last start</span>
                      <span class="text-text-primary">{formatRelativeTime(channel.status.lastStartAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.lastProbeAt}
                    <div>
                      <span class="text-text-muted block mb-0.5">Last probe</span>
                      <span class="text-text-primary">{formatRelativeTime(channel.status.lastProbeAt)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.authAgeMs != null}
                    <div>
                      <span class="text-text-muted block mb-0.5">Auth age</span>
                      <span class="text-text-primary font-mono">{formatDuration(channel.status.authAgeMs)}</span>
                    </div>
                  {/if}
                  {#if channel.status?.baseUrl}
                    <div>
                      <span class="text-text-muted block mb-0.5">Base URL</span>
                      <span class="text-text-primary font-mono text-[11px] break-all">{channel.status.baseUrl}</span>
                    </div>
                  {/if}
                  {#if channel.status?.mode}
                    <div>
                      <span class="text-text-muted block mb-0.5">Mode</span>
                      <span class="text-text-primary font-mono">{channel.status.mode}</span>
                    </div>
                  {/if}
                </div>

                <!-- Raw JSON -->
                <details class="mt-4">
                  <summary class="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary transition-colors">
                    Raw status JSON
                  </summary>
                  <pre class="mt-2 p-3 rounded-lg bg-bg-tertiary/60 border border-border-default text-[11px] text-text-secondary font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">{JSON.stringify(channel.status, null, 2)}</pre>
                </details>
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Raw snapshot section -->
      {#if snapshot}
        <details class="mt-6">
          <summary class="glass rounded-xl p-4 border border-border-default cursor-pointer hover:border-accent-cyan/20 transition-all">
            <div class="inline-flex items-center gap-2">
              <svg class="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span class="text-sm text-text-muted">Channel health snapshot</span>
              {#if lastSuccessAt}
                <span class="text-xs text-text-muted font-mono ml-2">{formatRelativeTime(lastSuccessAt)}</span>
              {/if}
            </div>
          </summary>
          <div class="mt-2 glass rounded-xl p-4 border border-border-default">
            {#if lastError}
              <div class="p-2.5 rounded-lg bg-red-500/8 border border-red-500/20 mb-3">
                <p class="text-xs text-red-400">{lastError}</p>
              </div>
            {/if}
            <pre class="text-[11px] text-text-secondary font-mono overflow-x-auto max-h-96 overflow-y-auto leading-relaxed">{JSON.stringify(snapshot, null, 2)}</pre>
          </div>
        </details>
      {/if}
    {/if}
  </div>
</div>
