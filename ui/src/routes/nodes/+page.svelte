<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';
  import { getGatewayWsUrl } from '$lib/config';
  import QRPairModal from '$lib/components/QRPairModal.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── State ─────────────────────────────────────
  let nodes = $state<Array<Record<string, unknown>>>([]);
  let pendingNodes = $state<Array<Record<string, unknown>>>([]);
  let loading = $state(false);
  let lastError = $state<string | null>(null);
  let viewMode = $state<'grid' | 'list'>('grid');
  let expandedNodeId = $state<string | null>(null);
  let searchQuery = $state('');
  let showAddNode = $state(false);
  let showQRPair = $state(false);
  let approvingId = $state<string | null>(null);
  let rejectingId = $state<string | null>(null);

  // ─── Device pairing state ──────────────────────
  let pendingDevices = $state<Array<Record<string, unknown>>>([]);
  let pairedDevices = $state<Array<Record<string, unknown>>>([]);
  let deviceApprovingId = $state<string | null>(null);
  let deviceRejectingId = $state<string | null>(null);
  let deviceRoleChanging = $state<string | null>(null);
  let pendingApproveRole = $state<Record<string, string>>({});

  // ─── Role constants ────────────────────────────
  const DEVICE_ROLES = ['admin', 'operator', 'viewer', 'chat-only'] as const;
  const roleBadgeColors: Record<string, string> = {
    admin: 'bg-accent-pink/20 text-accent-pink border-accent-pink/30',
    operator: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
    viewer: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
    'chat-only': 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  };

  // ─── Invite link state ──────────────────────────
  let showInviteForm = $state(false);
  let invites = $state<Array<Record<string, unknown>>>([]);
  let inviteRole = $state('operator');
  let inviteExpires = $state('24h');
  let inviteMaxUses = $state(0);
  let inviteCreating = $state(false);
  let lastCreatedInvite = $state<string | null>(null);

  // ─── Pairing code state ────────────────────────
  let generatedPairingCode = $state<string | null>(null);
  let pairingCodeRole = $state('operator');
  let pairingCodeExpiry = $state<number>(0);
  let pairingCodeTimer: ReturnType<typeof setInterval> | null = null;
  let pairingCodeGenerating = $state(false);

  // ─── Detail panel state ────────────────────────
  let detailTab = $state<'info' | 'invoke' | 'allowlist'>('info');
  let invokeCommand = $state('');
  let invokeParams = $state('{}');
  let invokeTimeout = $state(30000);
  let invokeRunning = $state(false);
  let invokeResult = $state<string | null>(null);
  let invokeError = $state<string | null>(null);

  // Allowlist state
  let allowlistContent = $state('');
  let allowlistFile = $state('');
  let allowlistBaseHash = $state('');
  let allowlistLoading = $state(false);
  let allowlistSaving = $state(false);
  let allowlistDirty = $state(false);

  // ─── Capability icon map ───────────────────────
  const capIcons: Record<string, { icon: string; color: string; label: string; description: string }> = {
    camera: {
      icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
      color: 'text-accent-pink',
      label: 'Camera',
      description: 'Capture photos and video from device cameras'
    },
    screen: {
      icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      color: 'text-accent-purple',
      label: 'Screen',
      description: 'Screen capture and recording'
    },
    browser: {
      icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
      color: 'text-accent-cyan',
      label: 'Browser',
      description: 'Web browser automation and control'
    },
    system: {
      icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
      color: 'text-accent-green',
      label: 'System/Exec',
      description: 'Execute shell commands and system operations'
    },
    location: {
      icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
      color: 'text-accent-amber',
      label: 'Location',
      description: 'GPS and location services'
    },
    canvas: {
      icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
      color: 'text-accent-cyan',
      label: 'Canvas',
      description: 'Visual canvas rendering and UI display'
    }
  };

  // ─── Gateway URL for QR ─────────────────────────
  let gatewayWsUrl = $derived.by(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('cortex:gatewayUrl') : null;
    if (stored) return stored;
    const configUrl = getGatewayWsUrl();
    if (configUrl) return configUrl;
    if (typeof window !== 'undefined') {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProtocol}//${window.location.host}`;
    }
    return '';
  });

  // ─── Derived ───────────────────────────────────
  let filteredNodes = $derived.by(() => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    return nodes.filter((n) => {
      const name = String(n.displayName || n.nodeId || '').toLowerCase();
      const ip = String(n.remoteIp || '').toLowerCase();
      return name.includes(q) || ip.includes(q);
    });
  });

  let stats = $derived.by(() => {
    const total = nodes.length;
    const online = nodes.filter((n) => Boolean(n.connected)).length;
    const offline = total - online;
    const allCaps = new Set<string>();
    for (const n of nodes) {
      const caps = Array.isArray(n.caps) ? n.caps : [];
      for (const c of caps) allCaps.add(String(c));
    }
    return { total, online, offline, capabilities: allCaps.size };
  });

  let selectedNode = $derived.by(() => {
    if (!expandedNodeId) return null;
    return nodes.find((n) => String(n.nodeId ?? n.id ?? '') === expandedNodeId) ?? null;
  });

  // ─── Actions ───────────────────────────────────
  async function loadNodes() {
    if (!gateway.connected || loading) return;
    loading = true;
    lastError = null;
    try {
      const res = await gateway.call<{ nodes?: Array<Record<string, unknown>> }>('node.list', {});
      nodes = Array.isArray(res.nodes) ? res.nodes : [];
    } catch (err) {
      lastError = String(err);
    } finally {
      loading = false;
    }
    // Also load pending pairing requests
    loadPendingNodes();
  }

  async function loadPendingNodes() {
    if (!gateway.connected) return;
    try {
      const res = await gateway.call<{ pending?: Array<Record<string, unknown>>; paired?: Array<Record<string, unknown>> }>('node.pair.list', {});
      pendingNodes = Array.isArray(res.pending) ? res.pending : [];
    } catch {
      // node.pair.list may not be available in all versions
      pendingNodes = [];
    }
  }

  async function approveNode(requestId: string) {
    approvingId = requestId;
    try {
      await gateway.call('node.pair.approve', { requestId });
      toasts.success('Node Approved', 'Node has been paired successfully');
      loadNodes();
    } catch (err) {
      toasts.error('Approval Failed', String(err));
    } finally {
      approvingId = null;
    }
  }

  async function rejectNode(requestId: string) {
    rejectingId = requestId;
    try {
      await gateway.call('node.pair.reject', { requestId });
      toasts.info('Node Rejected', 'Pairing request was rejected');
      loadPendingNodes();
    } catch (err) {
      toasts.error('Rejection Failed', String(err));
    } finally {
      rejectingId = null;
    }
  }

  // ─── Device pairing actions ─────────────────────
  async function loadDevices() {
    if (!gateway.connected) return;
    try {
      const res = await gateway.call<{ pending?: Array<Record<string, unknown>>; paired?: Array<Record<string, unknown>> }>('device.pair.list', {});
      pendingDevices = Array.isArray(res.pending) ? res.pending : [];
      pairedDevices = Array.isArray(res.paired) ? res.paired : [];
    } catch {
      // device.pair.list may not be available
      pendingDevices = [];
      pairedDevices = [];
    }
  }

  async function approveDevice(requestId: string) {
    deviceApprovingId = requestId;
    try {
      const result = await gateway.call<{ device?: { deviceId?: string } }>('device.pair.approve', { requestId });
      // Set role if user selected one
      const selectedRole = pendingApproveRole[requestId];
      if (selectedRole && result?.device?.deviceId) {
        try {
          await gateway.call('device.role.set', { deviceId: result.device.deviceId, role: selectedRole });
        } catch {
          // Best effort
        }
      }
      toasts.success('Device Approved', `Device has been paired${selectedRole ? ` as ${selectedRole}` : ''}`);
      loadDevices();
    } catch (err) {
      toasts.error('Device Approval Failed', String(err));
    } finally {
      deviceApprovingId = null;
    }
  }

  async function rejectDevice(requestId: string) {
    deviceRejectingId = requestId;
    try {
      await gateway.call('device.pair.reject', { requestId });
      toasts.info('Device Rejected', 'Device pairing request was rejected');
      loadDevices();
    } catch (err) {
      toasts.error('Device Rejection Failed', String(err));
    } finally {
      deviceRejectingId = null;
    }
  }

  async function setDeviceRole(deviceId: string, role: string) {
    deviceRoleChanging = deviceId;
    try {
      await gateway.call('device.role.set', { deviceId, role });
      toasts.success('Role Updated', `Device role changed to ${role}`);
      loadDevices();
    } catch (err) {
      toasts.error('Role Update Failed', String(err));
    } finally {
      deviceRoleChanging = null;
    }
  }

  function getDeviceRole(device: Record<string, unknown>): string {
    return String(device.role ?? 'operator');
  }

  // ─── Invite link actions ────────────────────────
  async function loadInvites() {
    if (!gateway.connected) return;
    try {
      const res = await gateway.call<unknown>('invite.list', {});
      invites = Array.isArray(res) ? res as Array<Record<string, unknown>> : [];
    } catch {
      invites = [];
    }
  }

  async function createInvite() {
    if (!gateway.connected || inviteCreating) return;
    inviteCreating = true;
    lastCreatedInvite = null;
    try {
      const params: Record<string, unknown> = { role: inviteRole };
      if (inviteExpires.trim()) params.expiresIn = inviteExpires.trim();
      if (inviteMaxUses > 0) params.maxUses = inviteMaxUses;
      const res = await gateway.call<{ code?: string }>('invite.create', params);
      lastCreatedInvite = res.code ?? null;
      toasts.success('Invite Created', `Invite code generated for role: ${inviteRole}`);
      loadInvites();
    } catch (err) {
      toasts.error('Failed to create invite', String(err));
    } finally {
      inviteCreating = false;
    }
  }

  async function revokeInvite(code: string) {
    try {
      await gateway.call('invite.revoke', { code });
      toasts.info('Invite Revoked', 'Invite has been revoked');
      loadInvites();
    } catch (err) {
      toasts.error('Revoke Failed', String(err));
    }
  }

  function getInviteUrl(code: string): string {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}?invite=${code}`;
    }
    return `?invite=${code}`;
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      toasts.success('Copied!', 'Copied to clipboard');
    }).catch(() => {
      toasts.error('Copy Failed', 'Could not copy to clipboard');
    });
  }

  // ─── Pairing code actions ──────────────────────
  function stopPairingCodeTimer() {
    if (pairingCodeTimer) {
      clearInterval(pairingCodeTimer);
      pairingCodeTimer = null;
    }
  }

  async function generateNewPairingCode() {
    if (!gateway.connected || pairingCodeGenerating) return;
    pairingCodeGenerating = true;
    stopPairingCodeTimer();
    try {
      const res = await gateway.call<{ code?: string; expiresIn?: number; role?: string }>('pair.code.generate', { role: pairingCodeRole });
      generatedPairingCode = res.code ?? null;
      const expiresInMs = res.expiresIn ?? 300000;
      pairingCodeExpiry = Math.floor(expiresInMs / 1000);
      toasts.success('Pairing Code', `Code generated: ${res.code}`);
      pairingCodeTimer = setInterval(() => {
        pairingCodeExpiry--;
        if (pairingCodeExpiry <= 0) {
          stopPairingCodeTimer();
          generatedPairingCode = null;
        }
      }, 1000);
    } catch (err) {
      toasts.error('Failed to generate code', String(err));
    } finally {
      pairingCodeGenerating = false;
    }
  }

  function toggleExpand(nodeId: string) {
    if (expandedNodeId === nodeId) {
      expandedNodeId = null;
    } else {
      expandedNodeId = nodeId;
      detailTab = 'info';
      // Reset invoke state
      invokeCommand = '';
      invokeParams = '{}';
      invokeResult = null;
      invokeError = null;
      // Reset allowlist state
      allowlistContent = '';
      allowlistFile = '';
      allowlistBaseHash = '';
      allowlistDirty = false;
    }
  }

  function getNodeStatus(node: Record<string, unknown>): 'online' | 'offline' | 'stale' {
    if (Boolean(node.connected)) return 'online';
    const lastSeen = node.lastSeen ?? node.lastSeenMs;
    if (typeof lastSeen === 'number' && lastSeen > 0) {
      const fiveMin = 5 * 60 * 1000;
      if (Date.now() - lastSeen < fiveMin) return 'stale';
    }
    return 'offline';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'online': return 'bg-accent-green';
      case 'stale': return 'bg-accent-amber';
      default: return 'bg-red-500';
    }
  }

  function getStatusGlow(status: string): string {
    switch (status) {
      case 'online': return 'glow-green';
      case 'stale': return 'glow-amber';
      default: return '';
    }
  }

  function getStatusBorderColor(status: string): string {
    switch (status) {
      case 'online': return 'border-accent-green/30';
      case 'stale': return 'border-accent-amber/30';
      default: return 'border-border-default';
    }
  }

  function getNodeCaps(node: Record<string, unknown>): string[] {
    return Array.isArray(node.caps) ? node.caps.map(String) : [];
  }

  function getNodeCommands(node: Record<string, unknown>): string[] {
    return Array.isArray(node.commands) ? node.commands.map(String) : [];
  }

  function formatLastSeen(node: Record<string, unknown>): string {
    const ts = node.lastSeen ?? node.lastSeenMs;
    if (typeof ts === 'number' && ts > 0) return formatRelativeTime(ts);
    if (Boolean(node.connected)) return 'now';
    return 'unknown';
  }

  function formatConnectionDuration(node: Record<string, unknown>): string {
    const connectedAt = node.connectedAt ?? node.connectedAtMs;
    if (typeof connectedAt !== 'number' || connectedAt <= 0) return '—';
    const durationMs = Date.now() - connectedAt;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function formatAbsoluteTime(ts: unknown): string {
    if (typeof ts !== 'number' || ts <= 0) return '—';
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }

  // ─── Invoke command ────────────────────────────
  async function runInvoke() {
    if (!expandedNodeId || !invokeCommand.trim() || invokeRunning) return;
    invokeRunning = true;
    invokeResult = null;
    invokeError = null;
    try {
      let parsedParams: Record<string, unknown> = {};
      if (invokeParams.trim()) {
        parsedParams = JSON.parse(invokeParams);
      }
      const res = await gateway.call<unknown>('node.invoke', {
        nodeId: expandedNodeId,
        command: invokeCommand.trim(),
        params: parsedParams,
        timeoutMs: invokeTimeout
      });
      invokeResult = JSON.stringify(res, null, 2);
      toasts.success('Command executed', `${invokeCommand} completed successfully`);
    } catch (err) {
      invokeError = String(err);
      toasts.error('Invoke failed', String(err));
    } finally {
      invokeRunning = false;
    }
  }

  // ─── Allowlist operations ──────────────────────
  async function loadAllowlist() {
    if (!expandedNodeId) return;
    allowlistLoading = true;
    try {
      const res = await gateway.call<{ file?: string; content?: string; baseHash?: string }>(
        'exec.approvals.node.get', { nodeId: expandedNodeId }
      );
      allowlistFile = res.file ?? '';
      allowlistContent = res.content ?? '';
      allowlistBaseHash = res.baseHash ?? '';
      allowlistDirty = false;
    } catch (err) {
      toasts.error('Failed to load allowlist', String(err));
      allowlistContent = '';
    } finally {
      allowlistLoading = false;
    }
  }

  async function saveAllowlist() {
    if (!expandedNodeId || allowlistSaving) return;
    allowlistSaving = true;
    try {
      await gateway.call('exec.approvals.node.set', {
        nodeId: expandedNodeId,
        file: allowlistFile,
        content: allowlistContent,
        baseHash: allowlistBaseHash
      });
      // Reload to get new baseHash
      await loadAllowlist();
      toasts.success('Allowlist saved', 'Node exec allowlist updated');
    } catch (err) {
      toasts.error('Save failed', String(err));
    } finally {
      allowlistSaving = false;
    }
  }

  function handleTabChange(tab: 'info' | 'invoke' | 'allowlist') {
    detailTab = tab;
    if (tab === 'allowlist' && !allowlistContent && !allowlistLoading) {
      loadAllowlist();
    }
  }

  // ─── Effects ───────────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => { loadNodes(); loadDevices(); loadInvites(); });
    }
  });

  $effect(() => {
    const unsub = gateway.on('system-presence', () => {
      if (gateway.connected) loadNodes();
    });
    return unsub;
  });

  // Listen for real-time node pairing requests
  $effect(() => {
    const unsub1 = gateway.on('node.pair.requested', () => {
      loadPendingNodes();
      toasts.info('New Node', 'A node is requesting to pair');
    });
    const unsub2 = gateway.on('node.pair.resolved', () => {
      loadPendingNodes();
      loadNodes();
    });
    return () => { unsub1(); unsub2(); };
  });

  // Listen for real-time device pairing requests
  $effect(() => {
    const unsub1 = gateway.on('device.pair.requested', () => {
      loadDevices();
      toasts.info('New Device', 'A device is requesting to pair', 10000);
    });
    const unsub2 = gateway.on('device.pair.resolved', () => {
      loadDevices();
    });
    return () => { unsub1(); unsub2(); };
  });
</script>

<svelte:head>
  <title>Node Fleet — Cortex</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary glow-text-cyan">Node Fleet</h1>
            <p class="text-sm text-text-muted">Paired devices, capabilities, and command exposure</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Search -->
        <div class="relative">
          <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search nodes..."
            bind:value={searchQuery}
            class="pl-9 pr-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 w-48 transition-all"
          />
        </div>

        <!-- View toggle -->
        <div class="flex items-center bg-bg-tertiary rounded-lg border border-border-default p-0.5">
          <button
            onclick={() => viewMode = 'grid'}
            class="p-1.5 rounded-md transition-all {viewMode === 'grid' ? 'bg-bg-hover text-accent-cyan' : 'text-text-muted hover:text-text-primary'}"
            title="Grid view"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>
          <button
            onclick={() => viewMode = 'list'}
            class="p-1.5 rounded-md transition-all {viewMode === 'list' ? 'bg-bg-hover text-accent-cyan' : 'text-text-muted hover:text-text-primary'}"
            title="List view"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </button>
        </div>

        <!-- QR Pair -->
        <button
          onclick={() => showQRPair = true}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-cyan/10 border border-accent-cyan/30 rounded-lg text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/50 transition-all"
          title="Generate QR code for device pairing"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          QR Pair
        </button>

        <!-- Add Node -->
        <button
          onclick={() => showAddNode = !showAddNode}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm gradient-bg border border-border-glow rounded-lg text-text-primary hover:brightness-110 transition-all"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Node
        </button>

        <!-- Refresh -->
        <button
          onclick={loadNodes}
          disabled={loading || conn.state.status !== 'connected'}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </div>

    <!-- Stats bar -->
    {#if nodes.length > 0}
      <div class="flex items-center gap-4 mt-4">
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-cyan"></span>
          <span class="text-text-muted">Total</span>
          <span class="text-text-primary font-mono font-semibold">{stats.total}</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-green glow-pulse"></span>
          <span class="text-text-muted">Online</span>
          <span class="text-accent-green font-mono font-semibold">{stats.online}</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-red-500"></span>
          <span class="text-text-muted">Offline</span>
          <span class="text-text-secondary font-mono font-semibold">{stats.offline}</span>
        </div>
        <div class="flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-accent-purple"></span>
          <span class="text-text-muted">Capabilities</span>
          <span class="text-text-secondary font-mono font-semibold">{stats.capabilities}</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Add Node Instructions Panel -->
  {#if showAddNode}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4 p-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-text-primary mb-2">Add a Node</h3>
          <p class="text-xs text-text-secondary mb-3">Run this on the machine you want to pair:</p>
          <div class="bg-bg-primary rounded-lg p-3 font-mono text-xs text-accent-cyan overflow-x-auto">
            <span class="text-text-muted select-none">$ </span>curl -fsSL https://gitlab.honercloud.com/llm/cortex/-/raw/main/node-install.sh | bash
          </div>
          <p class="text-xs text-text-muted mt-2">Or if OpenClaw is already installed:</p>
          <div class="bg-bg-primary rounded-lg p-3 font-mono text-xs text-accent-cyan mt-1 overflow-x-auto">
            <span class="text-text-muted select-none">$ </span>openclaw node install --host {conn.state.status === 'connected' ? 'YOUR_GATEWAY_HOST' : 'YOUR_GATEWAY_HOST'} --port 18789
          </div>
          <p class="text-xs text-text-muted mt-2">The node will appear in <strong>Pending</strong> below. Click <strong>Approve</strong> to pair it.</p>
        </div>
        <button onclick={() => showAddNode = false} class="text-text-muted hover:text-text-primary ml-4">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Pending Nodes Banner -->
  {#if pendingNodes.length > 0}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4">
      <div class="p-4 rounded-xl border border-accent-amber/30 bg-accent-amber/5 animate-pulse-slow">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 class="text-sm font-semibold text-accent-amber">{pendingNodes.length} Pending Pairing Request{pendingNodes.length > 1 ? 's' : ''}</h3>
        </div>
        <div class="space-y-2">
          {#each pendingNodes as req}
            {@const reqId = String(req.requestId ?? req.id ?? '')}
            {@const name = String(req.displayName ?? req.nodeId ?? 'Unknown')}
            {@const ip = String(req.ip ?? req.address ?? '')}
            <div class="flex items-center justify-between p-3 rounded-lg bg-bg-primary/50 border border-border-default">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-accent-amber/20 flex items-center justify-center">
                  <svg class="w-4 h-4 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-text-primary">{name}</p>
                  {#if ip}<p class="text-xs text-text-muted">{ip}</p>{/if}
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  onclick={() => approveNode(reqId)}
                  disabled={approvingId === reqId}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50"
                >
                  {approvingId === reqId ? 'Approving…' : '✓ Approve'}
                </button>
                <button
                  onclick={() => rejectNode(reqId)}
                  disabled={rejectingId === reqId}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50"
                >
                  {rejectingId === reqId ? 'Rejecting…' : '✗ Reject'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Pending Devices Banner -->
  {#if pendingDevices.length > 0}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4">
      <div class="p-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 animate-pulse-slow">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <h3 class="text-sm font-semibold text-accent-cyan">{pendingDevices.length} Pending Device Pairing{pendingDevices.length > 1 ? 's' : ''}</h3>
        </div>
        <div class="space-y-2">
          {#each pendingDevices as req}
            {@const reqId = String(req.requestId ?? req.id ?? '')}
            {@const name = String(req.displayName ?? 'Web Client')}
            {@const ip = String(req.remoteIp ?? req.ip ?? '')}
            {@const role = String(req.role ?? 'operator')}
            <div class="flex items-center justify-between p-3 rounded-lg bg-bg-primary/50 border border-border-default">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
                  <svg class="w-4 h-4 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p class="text-sm font-medium text-text-primary">{name}</p>
                  <p class="text-xs text-text-muted">
                    {role}{#if ip} · {ip}{/if}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <!-- Role selection for approval -->
                <select
                  class="px-2 py-1 text-xs rounded-lg bg-bg-input border border-border-default text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  value={pendingApproveRole[reqId] ?? 'operator'}
                  onchange={(e) => { pendingApproveRole[reqId] = (e.target as HTMLSelectElement).value; pendingApproveRole = pendingApproveRole; }}
                >
                  {#each DEVICE_ROLES as r}
                    <option value={r}>{r}</option>
                  {/each}
                </select>
                <button
                  onclick={() => approveDevice(reqId)}
                  disabled={deviceApprovingId === reqId}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50"
                >
                  {deviceApprovingId === reqId ? 'Approving…' : '✓ Approve'}
                </button>
                <button
                  onclick={() => rejectDevice(reqId)}
                  disabled={deviceRejectingId === reqId}
                  class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50"
                >
                  {deviceRejectingId === reqId ? 'Rejecting…' : '✗ Reject'}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Paired Devices Section -->
  {#if pairedDevices.length > 0}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4">
      <div class="p-4 rounded-xl border border-border-default bg-bg-secondary/50">
        <div class="flex items-center gap-2 mb-3">
          <svg class="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h3 class="text-sm font-semibold text-accent-purple">{pairedDevices.length} Paired Device{pairedDevices.length > 1 ? 's' : ''}</h3>
        </div>
        <div class="space-y-2">
          {#each pairedDevices as device}
            {@const devId = String(device.deviceId ?? '')}
            {@const devName = String(device.displayName ?? device.clientId ?? devId)}
            {@const devRole = getDeviceRole(device)}
            {@const devIp = String(device.remoteIp ?? '')}
            {@const badgeClass = roleBadgeColors[devRole] ?? roleBadgeColors['operator']}
            {@const isLanAutoApproved = String(device.approveReason ?? '') === 'lan-auto-approve'}
            <div class="flex items-center justify-between p-3 rounded-lg bg-bg-primary/50 border border-border-default">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                  <svg class="w-4 h-4 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <p class="text-sm font-medium text-text-primary">{devName}</p>
                    <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border {badgeClass}">
                      {devRole}
                    </span>
                    {#if isLanAutoApproved}
                      <span class="px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent-green/15 text-accent-green border border-accent-green/20" title="Auto-approved from local network">
                        LAN auto-approved
                      </span>
                    {/if}
                  </div>
                  <p class="text-xs text-text-muted">
                    {devId.substring(0, 12)}…{#if devIp} · {devIp}{/if}
                  </p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <select
                  class="px-2 py-1 text-xs rounded-lg bg-bg-input border border-border-default text-text-primary focus:outline-none focus:border-accent-purple/50 disabled:opacity-50"
                  value={devRole}
                  disabled={deviceRoleChanging === devId}
                  onchange={(e) => setDeviceRole(devId, (e.target as HTMLSelectElement).value)}
                >
                  {#each DEVICE_ROLES as r}
                    <option value={r}>{r}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Invite Links & Pairing Codes -->
  {#if conn.state.status === 'connected'}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4">
      <div class="flex gap-3 flex-wrap">
        <button onclick={generateNewPairingCode} disabled={pairingCodeGenerating}
          class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/30 transition-all disabled:opacity-50">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
          {pairingCodeGenerating ? 'Generating…' : 'Generate Pairing Code'}
        </button>
        <button onclick={() => showInviteForm = !showInviteForm}
          class="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          Create Invite Link
        </button>
      </div>

      {#if generatedPairingCode}
        <div class="mt-3 p-4 rounded-xl border border-accent-purple/30 bg-accent-purple/5">
          <div class="flex items-center justify-between">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-semibold uppercase tracking-wider text-accent-purple">Pairing Code</span>
                <span class="px-2 py-0.5 text-[10px] rounded-full bg-accent-purple/20 text-accent-purple border border-accent-purple/30">{pairingCodeExpiry}s remaining</span>
              </div>
              <div class="text-3xl font-mono font-bold text-text-primary tracking-[0.3em] mt-1">{generatedPairingCode}</div>
              <p class="text-xs text-text-muted mt-1">Enter this code on the connecting device</p>
            </div>
            <button onclick={() => { stopPairingCodeTimer(); generatedPairingCode = null; }} class="text-xs text-text-muted hover:text-accent-red transition-colors">Dismiss</button>
          </div>
        </div>
      {/if}

      {#if showInviteForm}
        <div class="mt-3 p-4 rounded-xl border border-accent-green/30 bg-accent-green/5">
          <h3 class="text-sm font-semibold text-accent-green mb-3">Create Invite Link</h3>
          <div class="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label class="text-xs text-text-muted block mb-1">Role</label>
              <select bind:value={inviteRole} class="w-full px-2 py-1.5 text-xs rounded-lg bg-bg-input border border-border-default text-text-primary focus:outline-none focus:border-accent-green/50">
                {#each DEVICE_ROLES as r}<option value={r}>{r}</option>{/each}
              </select>
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Expires In</label>
              <select bind:value={inviteExpires} class="w-full px-2 py-1.5 text-xs rounded-lg bg-bg-input border border-border-default text-text-primary focus:outline-none focus:border-accent-green/50">
                <option value="1h">1 hour</option><option value="24h">24 hours</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="">Never</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Max Uses</label>
              <input type="number" bind:value={inviteMaxUses} min="0" placeholder="0 = unlimited"
                class="w-full px-2 py-1.5 text-xs rounded-lg bg-bg-input border border-border-default text-text-primary focus:outline-none focus:border-accent-green/50" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button onclick={createInvite} disabled={inviteCreating}
              class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50">
              {inviteCreating ? 'Creating…' : '✓ Create'}</button>
            <button onclick={() => { showInviteForm = false; lastCreatedInvite = null; }}
              class="px-3 py-1.5 text-xs rounded-lg border border-border-default text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
          {#if lastCreatedInvite}
            <div class="mt-3 p-3 rounded-lg bg-bg-primary/50 border border-accent-green/20">
              <p class="text-xs text-text-muted mb-1">Invite Code:</p>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-xs font-mono text-accent-green bg-bg-tertiary px-2 py-1 rounded break-all">{lastCreatedInvite}</code>
                <button onclick={() => copyToClipboard(lastCreatedInvite!)} class="px-2 py-1 text-xs rounded bg-bg-tertiary border border-border-default text-text-muted hover:text-accent-cyan transition-colors" title="Copy code">📋</button>
              </div>
              <p class="text-xs text-text-muted mt-2">Invite URL:</p>
              <div class="flex items-center gap-2">
                <code class="flex-1 text-[10px] font-mono text-accent-cyan bg-bg-tertiary px-2 py-1 rounded break-all">{getInviteUrl(lastCreatedInvite)}</code>
                <button onclick={() => copyToClipboard(getInviteUrl(lastCreatedInvite!))} class="px-2 py-1 text-xs rounded bg-bg-tertiary border border-border-default text-text-muted hover:text-accent-cyan transition-colors" title="Copy URL">📋</button>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if invites.length > 0}
        <div class="mt-3 p-4 rounded-xl border border-border-default bg-bg-secondary/50">
          <h3 class="text-sm font-semibold text-text-secondary mb-3">Active Invites <span class="text-xs text-text-muted font-normal ml-1">({invites.length})</span></h3>
          <div class="space-y-2">
            {#each invites as inv}
              {@const invCode = String(inv.code ?? '')}
              {@const invRoleVal = String(inv.role ?? 'operator')}
              {@const invValid = Boolean(inv.valid)}
              {@const invRevoked = Boolean(inv.revoked)}
              {@const invUsedCount = Number(inv.used_count ?? 0)}
              {@const invMaxUsesVal = inv.max_uses != null ? Number(inv.max_uses) : null}
              {@const badgeClass = roleBadgeColors[invRoleVal] ?? roleBadgeColors['operator']}
              <div class="flex items-center justify-between p-2.5 rounded-lg bg-bg-primary/50 border border-border-default {!invValid ? 'opacity-60' : ''}">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-2 h-2 rounded-full flex-shrink-0 {invValid ? 'bg-accent-green' : invRevoked ? 'bg-red-500' : 'bg-text-muted'}"></div>
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <code class="text-xs font-mono text-text-primary truncate">{invCode.slice(0, 16)}…</code>
                      <span class="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full border {badgeClass}">{invRoleVal}</span>
                    </div>
                    <p class="text-[10px] text-text-muted mt-0.5">
                      {invUsedCount} use{invUsedCount !== 1 ? 's' : ''}{invMaxUsesVal != null ? ` / ${invMaxUsesVal}` : ''}
                      {#if inv.expires_at} · expires {new Date(String(inv.expires_at)).toLocaleDateString()}{/if}
                      {#if invRevoked} · <span class="text-red-400">revoked</span>{:else if !invValid} · <span class="text-text-muted">expired</span>{/if}
                    </p>
                  </div>
                </div>
                {#if invValid}
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button onclick={() => copyToClipboard(getInviteUrl(invCode))} class="px-2 py-1 text-[10px] rounded bg-bg-tertiary border border-border-default text-text-muted hover:text-accent-cyan transition-colors" title="Copy invite URL">📋 URL</button>
                    <button onclick={() => revokeInvite(invCode)} class="px-2 py-1 text-[10px] rounded bg-accent-red/10 text-accent-red border border-accent-red/20 hover:bg-accent-red/20 transition-colors">Revoke</button>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

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
        <p class="text-text-muted text-sm">Connect to the gateway to view the node fleet.</p>
      </div>

    {:else if lastError}
      <!-- Error -->
      <div class="glass rounded-xl p-4 border border-accent-pink/30 mb-4">
        <div class="flex items-center gap-2 text-accent-pink text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>

    {:else if loading && nodes.length === 0}
      <!-- Loading skeleton -->
      <div class="{viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4' : 'flex flex-col gap-3'}">
        {#each Array(3) as _}
          <div class="glass rounded-xl p-5 border border-border-default animate-pulse">
            <div class="flex items-center gap-3 mb-3">
              <div class="w-3 h-3 rounded-full bg-bg-tertiary"></div>
              <div class="h-4 w-32 bg-bg-tertiary rounded"></div>
            </div>
            <div class="h-3 w-48 bg-bg-tertiary rounded mb-2"></div>
            <div class="flex gap-2 mt-3">
              <div class="h-6 w-16 bg-bg-tertiary rounded-full"></div>
              <div class="h-6 w-16 bg-bg-tertiary rounded-full"></div>
              <div class="h-6 w-16 bg-bg-tertiary rounded-full"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if filteredNodes.length === 0}
      <!-- Empty state -->
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <div class="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        {#if searchQuery.trim()}
          <p class="text-text-muted text-sm">No nodes matching "<span class="text-accent-cyan">{searchQuery}</span>"</p>
        {:else}
          <p class="text-text-muted text-sm">No nodes found. Pair a device to get started.</p>
        {/if}
      </div>

    {:else}
      <!-- Node list/grid -->
      <div class="flex flex-col gap-4">
        <div class="{viewMode === 'grid'
          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
          : 'flex flex-col gap-3'}">
          {#each filteredNodes as node (String(node.nodeId ?? node.id ?? Math.random()))}
            {@const nodeId = String(node.nodeId ?? node.id ?? '')}
            {@const status = getNodeStatus(node)}
            {@const isExpanded = expandedNodeId === nodeId}
            {@const displayName = (typeof node.displayName === 'string' && node.displayName.trim()) || nodeId}
            {@const caps = getNodeCaps(node)}
            {@const commands = getNodeCommands(node)}

            <div class="{isExpanded && viewMode === 'grid' ? 'col-span-full' : ''}">
              <button
                onclick={() => toggleExpand(nodeId)}
                class="w-full text-left glass rounded-xl border transition-all duration-300 cursor-pointer
                       {isExpanded ? 'border-accent-cyan/40 ' + getStatusGlow(status) : getStatusBorderColor(status) + ' hover:border-accent-cyan/20'}
                       hover:bg-bg-hover/50 animate-fade-in"
              >
                <!-- Card header -->
                <div class="p-4 {viewMode === 'list' ? 'flex items-center gap-4' : ''}">
                  <!-- Status + Name row -->
                  <div class="flex items-center gap-3 {viewMode === 'list' ? 'min-w-[200px]' : 'mb-3'}">
                    <div class="relative">
                      <span class="block w-3 h-3 rounded-full {getStatusColor(status)} {status === 'online' ? 'glow-pulse' : ''}"></span>
                      {#if status === 'online'}
                        <span class="absolute inset-0 w-3 h-3 rounded-full {getStatusColor(status)} animate-ping opacity-30"></span>
                      {/if}
                    </div>
                    <div class="min-w-0">
                      <h3 class="text-sm font-semibold text-text-primary truncate {status === 'online' ? 'glow-text-cyan' : ''}">
                        {displayName}
                      </h3>
                      {#if viewMode === 'grid'}
                        <p class="text-xs text-text-muted truncate font-mono mt-0.5">
                          {nodeId.length > 16 ? nodeId.slice(0, 16) + '…' : nodeId}
                        </p>
                      {/if}
                    </div>
                    <span class="ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                      {status === 'online' ? 'bg-accent-green/15 text-accent-green border border-accent-green/20' :
                       status === 'stale' ? 'bg-accent-amber/15 text-accent-amber border border-accent-amber/20' :
                       'bg-red-500/10 text-red-400 border border-red-500/20'}">
                      {status}
                    </span>
                  </div>

                  <!-- Info row -->
                  <div class="{viewMode === 'list' ? 'flex items-center gap-6 flex-1' : ''}">
                    <div class="{viewMode === 'list' ? 'flex items-center gap-4 text-xs text-text-muted min-w-[200px]' : 'flex items-center gap-3 text-xs text-text-muted mb-3'}">
                      {#if typeof node.remoteIp === 'string'}
                        <span class="flex items-center gap-1 font-mono">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9" />
                          </svg>
                          {node.remoteIp}
                        </span>
                      {/if}
                      <span class="flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatLastSeen(node)}
                      </span>
                      {#if typeof node.version === 'string'}
                        <span class="font-mono">v{node.version}</span>
                      {/if}
                    </div>

                    <!-- Capability badges -->
                    <div class="flex flex-wrap gap-1.5">
                      {#each caps.slice(0, viewMode === 'list' ? 6 : 8) as cap}
                        {@const capInfo = capIcons[cap]}
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                          bg-bg-tertiary border border-border-default {capInfo?.color ?? 'text-text-secondary'}
                          hover:border-accent-cyan/30 transition-colors">
                          {#if capInfo}
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={capInfo.icon} />
                            </svg>
                          {/if}
                          {cap}
                        </span>
                      {/each}
                      {#if caps.length > (viewMode === 'list' ? 6 : 8)}
                        <span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary border border-border-default text-text-muted">
                          +{caps.length - (viewMode === 'list' ? 6 : 8)}
                        </span>
                      {/if}
                    </div>
                  </div>

                  <!-- Expand indicator -->
                  <div class="{viewMode === 'list' ? 'ml-2' : 'mt-3 flex justify-center'}">
                    <svg class="w-4 h-4 text-text-muted transition-transform duration-200 {isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </button>

              <!-- ═══ EXPANDED DETAIL PANEL ═══ -->
              {#if isExpanded && selectedNode}
                <div class="mt-2 rounded-xl border border-accent-cyan/20 bg-bg-secondary/80 overflow-hidden animate-slide-in-up">
                  <!-- Tab bar -->
                  <div class="flex border-b border-border-default bg-bg-tertiary/50">
                    <button
                      onclick={() => handleTabChange('info')}
                      class="px-4 py-2.5 text-sm font-medium transition-all border-b-2
                        {detailTab === 'info' ? 'text-accent-cyan border-accent-cyan' : 'text-text-muted border-transparent hover:text-text-primary hover:border-accent-cyan/30'}"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Details
                      </span>
                    </button>
                    <button
                      onclick={() => handleTabChange('invoke')}
                      class="px-4 py-2.5 text-sm font-medium transition-all border-b-2
                        {detailTab === 'invoke' ? 'text-accent-purple border-accent-purple' : 'text-text-muted border-transparent hover:text-text-primary hover:border-accent-purple/30'}"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Invoke
                      </span>
                    </button>
                    <button
                      onclick={() => handleTabChange('allowlist')}
                      class="px-4 py-2.5 text-sm font-medium transition-all border-b-2
                        {detailTab === 'allowlist' ? 'text-accent-green border-accent-green' : 'text-text-muted border-transparent hover:text-text-primary hover:border-accent-green/30'}"
                    >
                      <span class="flex items-center gap-1.5">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        Exec Allowlist
                      </span>
                    </button>
                  </div>

                  <!-- Tab content -->
                  <div class="p-5">
                    {#if detailTab === 'info'}
                      <!-- ─── INFO TAB ─── -->
                      <div class="space-y-5">
                        <!-- System Info Grid -->
                        <div>
                          <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">System Information</h4>
                          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Node ID</span>
                              <span class="text-xs text-text-primary font-mono break-all">{nodeId}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">IP Address</span>
                              <span class="text-xs text-text-primary font-mono">{typeof selectedNode.remoteIp === 'string' ? selectedNode.remoteIp : '—'}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Version</span>
                              <span class="text-xs text-text-primary font-mono">{typeof selectedNode.version === 'string' ? 'v' + selectedNode.version : '—'}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Platform</span>
                              <span class="text-xs text-text-primary font-mono">{typeof selectedNode.platform === 'string' ? selectedNode.platform : typeof selectedNode.os === 'string' ? selectedNode.os : '—'}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Paired</span>
                              <span class="text-xs {Boolean(selectedNode.paired) ? 'text-accent-green' : 'text-red-400'}">{Boolean(selectedNode.paired) ? '✓ Yes' : '✗ No'}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Connected</span>
                              <span class="text-xs {Boolean(selectedNode.connected) ? 'text-accent-green' : 'text-red-400'}">{Boolean(selectedNode.connected) ? '✓ Online' : '✗ Offline'}</span>
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Last Seen</span>
                              <span class="text-xs text-text-primary">{formatLastSeen(selectedNode)}</span>
                              {#if typeof (selectedNode.lastSeen ?? selectedNode.lastSeenMs) === 'number'}
                                <span class="text-[10px] text-text-muted block mt-0.5">{formatAbsoluteTime(selectedNode.lastSeen ?? selectedNode.lastSeenMs)}</span>
                              {/if}
                            </div>
                            <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3">
                              <span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Uptime</span>
                              <span class="text-xs text-text-primary">{formatConnectionDuration(selectedNode)}</span>
                            </div>
                          </div>
                        </div>

                        <!-- Capabilities with descriptions -->
                        {#if caps.length > 0}
                          <div>
                            <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Capabilities</h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {#each caps as cap}
                                {@const capInfo = capIcons[cap]}
                                <div class="flex items-start gap-3 rounded-lg border border-border-default bg-bg-primary/50 p-3">
                                  <div class="w-8 h-8 rounded-lg bg-bg-tertiary border border-border-default flex items-center justify-center flex-shrink-0 {capInfo?.color ?? 'text-text-secondary'}">
                                    {#if capInfo}
                                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={capInfo.icon} />
                                      </svg>
                                    {:else}
                                      <span class="text-xs">⚡</span>
                                    {/if}
                                  </div>
                                  <div class="min-w-0">
                                    <span class="text-sm font-medium text-text-primary">{capInfo?.label ?? cap}</span>
                                    <p class="text-xs text-text-muted mt-0.5">{capInfo?.description ?? `Provides ${cap} capability`}</p>
                                  </div>
                                </div>
                              {/each}
                            </div>
                          </div>
                        {/if}

                        <!-- Commands -->
                        {#if commands.length > 0}
                          <div>
                            <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Registered Commands</h4>
                            <div class="flex flex-wrap gap-2">
                              {#each commands as cmd}
                                <span class="px-3 py-1.5 rounded-lg text-xs font-mono
                                  bg-accent-purple/10 text-accent-purple border border-accent-purple/20
                                  hover:bg-accent-purple/20 transition-colors">
                                  {cmd}
                                </span>
                              {/each}
                            </div>
                          </div>
                        {/if}
                      </div>

                    {:else if detailTab === 'invoke'}
                      <!-- ─── INVOKE TAB ─── -->
                      <div class="space-y-4">
                        <div>
                          <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Node Command Invocation</h4>
                          <p class="text-xs text-text-muted mb-4">Execute a command on this node via <code class="text-accent-cyan bg-bg-tertiary px-1 rounded">node.invoke</code> RPC.</p>
                        </div>

                        <!-- Command input -->
                        <div class="space-y-3">
                          <div>
                            <label class="text-xs text-text-muted block mb-1.5">Command Name</label>
                            <input
                              type="text"
                              bind:value={invokeCommand}
                              placeholder="e.g. camera_snap, screen_record"
                              class="w-full px-3 py-2 text-sm font-mono bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
                            />
                            {#if commands.length > 0}
                              <div class="flex flex-wrap gap-1.5 mt-2">
                                {#each commands as cmd}
                                  <button
                                    onclick={() => invokeCommand = cmd}
                                    class="px-2 py-0.5 text-[10px] font-mono rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20 hover:bg-accent-purple/20 transition-colors"
                                  >
                                    {cmd}
                                  </button>
                                {/each}
                              </div>
                            {/if}
                          </div>

                          <div>
                            <label class="text-xs text-text-muted block mb-1.5">Parameters (JSON)</label>
                            <textarea
                              bind:value={invokeParams}
                              rows={4}
                              class="w-full px-3 py-2 text-sm font-mono bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all resize-y"
                              placeholder={'{"key": "value"}'}
                            ></textarea>
                          </div>

                          <div>
                            <label class="text-xs text-text-muted block mb-1.5">Timeout (ms)</label>
                            <input
                              type="number"
                              bind:value={invokeTimeout}
                              class="w-32 px-3 py-2 text-sm font-mono bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
                            />
                          </div>

                          <button
                            onclick={runInvoke}
                            disabled={invokeRunning || !invokeCommand.trim()}
                            class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all
                              bg-accent-purple/20 text-accent-purple border border-accent-purple/30
                              hover:bg-accent-purple/30 hover:border-accent-purple/50
                              disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {#if invokeRunning}
                              <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Running…
                            {:else}
                              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Execute
                            {/if}
                          </button>
                        </div>

                        <!-- Result viewer -->
                        {#if invokeResult !== null}
                          <div class="rounded-lg border border-accent-green/30 bg-bg-primary/80 overflow-hidden">
                            <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-accent-green/5">
                              <span class="w-2 h-2 rounded-full bg-accent-green"></span>
                              <span class="text-xs font-semibold text-accent-green">Response</span>
                            </div>
                            <pre class="p-3 text-xs font-mono text-text-primary overflow-x-auto max-h-64 overflow-y-auto">{invokeResult}</pre>
                          </div>
                        {/if}

                        {#if invokeError !== null}
                          <div class="rounded-lg border border-accent-pink/30 bg-bg-primary/80 overflow-hidden">
                            <div class="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-accent-pink/5">
                              <span class="w-2 h-2 rounded-full bg-accent-pink"></span>
                              <span class="text-xs font-semibold text-accent-pink">Error</span>
                            </div>
                            <pre class="p-3 text-xs font-mono text-accent-pink overflow-x-auto">{invokeError}</pre>
                          </div>
                        {/if}
                      </div>

                    {:else if detailTab === 'allowlist'}
                      <!-- ─── ALLOWLIST TAB ─── -->
                      <div class="space-y-4">
                        <div class="flex items-center justify-between">
                          <div>
                            <h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1">Node Exec Allowlist</h4>
                            <p class="text-xs text-text-muted">Commands this node is allowed to execute. One pattern per line.</p>
                          </div>
                          <div class="flex items-center gap-2">
                            <button
                              onclick={loadAllowlist}
                              disabled={allowlistLoading}
                              class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40"
                            >
                              <svg class="w-3.5 h-3.5 {allowlistLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                              Reload
                            </button>
                            <button
                              onclick={saveAllowlist}
                              disabled={allowlistSaving || !allowlistDirty}
                              class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all
                                {allowlistDirty
                                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30'
                                  : 'bg-bg-tertiary text-text-muted border border-border-default opacity-50 cursor-not-allowed'}"
                            >
                              {#if allowlistSaving}
                                <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              {:else}
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                </svg>
                              {/if}
                              Save
                            </button>
                          </div>
                        </div>

                        {#if allowlistFile}
                          <div class="text-xs text-text-muted font-mono bg-bg-primary/50 px-3 py-1.5 rounded border border-border-default">
                            📁 {allowlistFile}
                          </div>
                        {/if}

                        <textarea
                          bind:value={allowlistContent}
                          oninput={() => allowlistDirty = true}
                          rows={12}
                          class="w-full px-3 py-2 text-sm font-mono bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20 transition-all resize-y leading-relaxed"
                          placeholder="# Exec allowlist for this node&#10;# One command pattern per line&#10;# e.g.: ls *&#10;# e.g.: cat /etc/*"
                        ></textarea>

                        {#if allowlistDirty}
                          <div class="flex items-center gap-2 text-xs text-accent-amber">
                            <span class="w-2 h-2 rounded-full bg-accent-amber animate-pulse"></span>
                            Unsaved changes
                          </div>
                        {/if}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- QR Pair Modal -->
<QRPairModal bind:show={showQRPair} gatewayWsUrl={gatewayWsUrl} />
