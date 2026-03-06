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
  interface ApprovalRequest {
    id: string;
    request: {
      command: string;
      cwd?: string;
      host?: string;
      security?: string;
      ask?: string;
      agentId?: string;
      sessionKey?: string;
    };
    createdAtMs: number;
    expiresAtMs: number;
  }

  interface ResolvedApproval {
    id: string;
    decision: 'approve' | 'deny';
    request?: ApprovalRequest['request'];
    resolvedAtMs: number;
    command?: string;
  }

  interface AllowlistEntry {
    id?: string;
    pattern: string;
    lastUsedAt?: number;
    lastUsedCommand?: string;
    lastResolvedPath?: string;
  }

  interface ExecApprovalsAgent {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
    allowlist?: AllowlistEntry[];
  }

  interface ExecApprovalsFile {
    version?: number;
    socket?: { path?: string; token?: string };
    defaults?: {
      security?: string;
      ask?: string;
      askFallback?: string;
      autoAllowSkills?: boolean;
    };
    agents?: Record<string, ExecApprovalsAgent>;
  }

  interface ExecApprovalsSnapshot {
    path: string;
    exists: boolean;
    hash: string;
    file: ExecApprovalsFile;
  }

  // ─── State ─────────────────────────────────────
  let pendingApprovals = $state<ApprovalRequest[]>([]);
  let resolvedHistory = $state<ResolvedApproval[]>([]);
  let resolving = $state<Set<string>>(new Set());
  let hasNewRequest = $state(false);
  let activeTab = $state<'queue' | 'allowlist'>('queue');

  // Allowlist structured state
  let approvalsSnapshot = $state<ExecApprovalsSnapshot | null>(null);
  let approvalsForm = $state<ExecApprovalsFile | null>(null);
  let approvalsBaseHash = $state('');
  let approvalsLoading = $state(false);
  let approvalsSaving = $state(false);
  let approvalsDirty = $state(false);
  let selectedScope = $state('__defaults__');
  let newPatternInput = $state('');
  let editingPattern = $state<number | null>(null);
  let editingPatternValue = $state('');

  // Countdown ticker
  let now = $state(Date.now());

  // ─── Derived ───────────────────────────────────
  let pendingCount = $derived(pendingApprovals.length);

  let sortedPending = $derived.by(() => {
    return [...pendingApprovals].sort((a, b) => a.expiresAtMs - b.expiresAtMs);
  });

  let agentScopes = $derived.by(() => {
    if (!approvalsForm?.agents) return [];
    return Object.keys(approvalsForm.agents).sort((a, b) => {
      // '*' (global) first, then alphabetical
      if (a === '*') return -1;
      if (b === '*') return 1;
      return a.localeCompare(b);
    });
  });

  let currentDefaults = $derived.by(() => {
    const d = approvalsForm?.defaults ?? {};
    return {
      security: d.security ?? 'deny',
      ask: d.ask ?? 'on-miss',
      askFallback: d.askFallback ?? 'deny',
      autoAllowSkills: d.autoAllowSkills ?? false
    };
  });

  let currentAgent = $derived.by((): ExecApprovalsAgent | null => {
    if (selectedScope === '__defaults__' || !approvalsForm?.agents) return null;
    return approvalsForm.agents[selectedScope] ?? null;
  });

  let currentAllowlist = $derived.by((): AllowlistEntry[] => {
    if (!currentAgent?.allowlist) return [];
    return currentAgent.allowlist;
  });

  let totalPatterns = $derived.by(() => {
    if (!approvalsForm?.agents) return 0;
    return Object.values(approvalsForm.agents).reduce((sum, agent) => {
      return sum + (agent.allowlist?.length ?? 0);
    }, 0);
  });

  // ─── Queue Actions ─────────────────────────────
  async function resolveApproval(id: string, decision: 'approve' | 'deny') {
    if (resolving.has(id)) return;
    resolving = new Set([...resolving, id]);
    try {
      await gateway.call('exec.approval.resolve', { id, decision });
      pendingApprovals = pendingApprovals.filter((a) => a.id !== id);
      toasts.success(
        decision === 'approve' ? 'Approved' : 'Denied',
        `Exec request ${id.slice(0, 8)}... ${decision === 'approve' ? 'approved' : 'denied'}`
      );
    } catch (err) {
      toasts.error('Resolution failed', String(err));
    } finally {
      const next = new Set(resolving);
      next.delete(id);
      resolving = next;
    }
  }

  function pruneExpired() {
    const nowMs = Date.now();
    const expired = pendingApprovals.filter((a) => a.expiresAtMs < nowMs);
    if (expired.length > 0) {
      pendingApprovals = pendingApprovals.filter((a) => a.expiresAtMs >= nowMs);
      for (const a of expired) {
        resolvedHistory = [
          { id: a.id, decision: 'deny', request: a.request, resolvedAtMs: nowMs, command: a.request.command },
          ...resolvedHistory
        ].slice(0, 50);
      }
    }
  }

  function formatTimeRemaining(expiresAtMs: number): string {
    const remaining = expiresAtMs - now;
    if (remaining <= 0) return 'Expired';
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  function getTimeRemainingPercent(createdAtMs: number, expiresAtMs: number): number {
    const total = expiresAtMs - createdAtMs;
    const remaining = expiresAtMs - now;
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, (remaining / total) * 100));
  }

  function getTimeColor(expiresAtMs: number): string {
    const remaining = expiresAtMs - now;
    if (remaining <= 10000) return 'hud-time-critical';
    if (remaining <= 30000) return 'hud-time-warn';
    return 'hud-time-ok';
  }

  function getTimeBarColor(expiresAtMs: number): string {
    const remaining = expiresAtMs - now;
    if (remaining <= 10000) return 'hud-bar-critical';
    if (remaining <= 30000) return 'hud-bar-warn';
    return 'hud-bar-ok';
  }

  function formatDecisionTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatRelativeTime(ms: number): string {
    const diff = Date.now() - ms;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  // ─── Allowlist Operations ──────────────────────
  async function loadApprovals() {
    approvalsLoading = true;
    try {
      const res = await gateway.call<ExecApprovalsSnapshot>('exec.approvals.get', {});
      approvalsSnapshot = res;
      approvalsForm = structuredClone(res.file ?? {});
      approvalsBaseHash = res.hash ?? '';
      approvalsDirty = false;
      // If selected scope no longer exists, reset
      if (selectedScope !== '__defaults__' && !approvalsForm?.agents?.[selectedScope]) {
        selectedScope = '__defaults__';
      }
    } catch (err) {
      toasts.error('Failed to load exec approvals', String(err));
      approvalsForm = null;
    } finally {
      approvalsLoading = false;
    }
  }

  async function saveApprovals() {
    if (approvalsSaving || !approvalsForm) return;
    approvalsSaving = true;
    try {
      await gateway.call('exec.approvals.set', {
        file: approvalsForm,
        baseHash: approvalsBaseHash
      });
      approvalsDirty = false;
      await loadApprovals();
      toasts.success('Saved', 'Exec approvals updated');
    } catch (err) {
      toasts.error('Save failed', String(err));
    } finally {
      approvalsSaving = false;
    }
  }

  function markDirty() {
    approvalsDirty = true;
    // Force reactivity by reassigning
    approvalsForm = { ...approvalsForm! };
  }

  function setDefaultValue(key: string, value: unknown) {
    if (!approvalsForm) return;
    if (!approvalsForm.defaults) approvalsForm.defaults = {};
    (approvalsForm.defaults as Record<string, unknown>)[key] = value;
    markDirty();
  }

  function setAgentValue(agentId: string, key: string, value: unknown) {
    if (!approvalsForm) return;
    if (!approvalsForm.agents) approvalsForm.agents = {};
    if (!approvalsForm.agents[agentId]) approvalsForm.agents[agentId] = {};
    (approvalsForm.agents[agentId] as Record<string, unknown>)[key] = value;
    markDirty();
  }

  function removeAgentValue(agentId: string, key: string) {
    if (!approvalsForm?.agents?.[agentId]) return;
    delete (approvalsForm.agents[agentId] as Record<string, unknown>)[key];
    markDirty();
  }

  function addPattern() {
    const pattern = newPatternInput.trim();
    if (!pattern || selectedScope === '__defaults__' || !approvalsForm) return;
    if (!approvalsForm.agents) approvalsForm.agents = {};
    if (!approvalsForm.agents[selectedScope]) approvalsForm.agents[selectedScope] = {};
    if (!approvalsForm.agents[selectedScope].allowlist) approvalsForm.agents[selectedScope].allowlist = [];
    approvalsForm.agents[selectedScope].allowlist!.push({ pattern });
    newPatternInput = '';
    markDirty();
  }

  function removePattern(index: number) {
    if (selectedScope === '__defaults__' || !approvalsForm?.agents?.[selectedScope]?.allowlist) return;
    approvalsForm.agents[selectedScope].allowlist!.splice(index, 1);
    if (approvalsForm.agents[selectedScope].allowlist!.length === 0) {
      delete approvalsForm.agents[selectedScope].allowlist;
    }
    markDirty();
  }

  function startEditPattern(index: number, currentValue: string) {
    editingPattern = index;
    editingPatternValue = currentValue;
  }

  function commitEditPattern(index: number) {
    if (selectedScope === '__defaults__' || !approvalsForm?.agents?.[selectedScope]?.allowlist) return;
    const trimmed = editingPatternValue.trim();
    if (trimmed) {
      approvalsForm.agents[selectedScope].allowlist![index].pattern = trimmed;
      markDirty();
    }
    editingPattern = null;
    editingPatternValue = '';
  }

  function cancelEditPattern() {
    editingPattern = null;
    editingPatternValue = '';
  }

  // ─── Effects ───────────────────────────────────
  $effect(() => {
    const interval = setInterval(() => {
      now = Date.now();
      pruneExpired();
    }, 1000);
    return () => clearInterval(interval);
  });

  $effect(() => {
    if (conn.state.status !== 'connected') return;
    const unsubRequested = gateway.on('exec.approval.requested', (payload: unknown) => {
      const req = payload as ApprovalRequest;
      if (!pendingApprovals.find((a) => a.id === req.id)) {
        pendingApprovals = [...pendingApprovals, req];
        hasNewRequest = true;
        setTimeout(() => { hasNewRequest = false; }, 2000);
        toasts.warning('Approval requested', `${req.request?.command ?? 'Unknown command'}`, 8000);
      }
    });
    const unsubResolved = gateway.on('exec.approval.resolved', (payload: unknown) => {
      const res = payload as { id: string; decision: string; request?: ApprovalRequest['request'] };
      const decision = (res.decision === 'approve' ? 'approve' : 'deny') as 'approve' | 'deny';
      pendingApprovals = pendingApprovals.filter((a) => a.id !== res.id);
      resolvedHistory = [
        { id: res.id, decision, request: res.request, resolvedAtMs: Date.now(), command: res.request?.command },
        ...resolvedHistory
      ].slice(0, 50);
    });
    return () => { unsubRequested(); unsubResolved(); };
  });

  // Auto-load approvals when switching to allowlist tab
  $effect(() => {
    if (activeTab === 'allowlist' && conn.state.status === 'connected' && !approvalsForm && !approvalsLoading) {
      untrack(() => loadApprovals());
    }
  });

  // Fetch pending + history from gateway on connect / page load
  async function loadApprovalQueue() {
    try {
      const res = await gateway.call<{
        pending: ApprovalRequest[];
        history: Array<{
          id: string;
          request?: ApprovalRequest['request'];
          decision: string | null;
          createdAtMs: number;
          expiresAtMs: number;
          resolvedAtMs: number | null;
          resolvedBy: string | null;
        }>;
      }>('exec.approval.list', {});
      // Merge pending (avoid duplicates from live events)
      const existingIds = new Set(pendingApprovals.map((a) => a.id));
      for (const p of res.pending ?? []) {
        if (!existingIds.has(p.id)) {
          pendingApprovals = [...pendingApprovals, p];
        }
      }
      // Load history
      const historyIds = new Set(resolvedHistory.map((r) => r.id));
      const newHistory: ResolvedApproval[] = [];
      for (const h of res.history ?? []) {
        if (!historyIds.has(h.id)) {
          newHistory.push({
            id: h.id,
            decision: (h.decision === 'allow-once' || h.decision === 'allow-always') ? 'approve' : 'deny',
            request: h.request,
            resolvedAtMs: h.resolvedAtMs ?? h.createdAtMs,
            command: h.request?.command,
          });
        }
      }
      if (newHistory.length > 0) {
        resolvedHistory = [...newHistory, ...resolvedHistory].slice(0, 50);
      }
    } catch {
      // exec.approval.list may not exist on older gateways -- silent fail
    }
  }

  $effect(() => {
    if (conn.state.status === 'connected' && activeTab === 'queue') {
      untrack(() => loadApprovalQueue());
    }
  });
</script>

<svelte:head>
  <title>Exec Approvals -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; BACK</a>
    <span class="hud-page-title">
      APPROVALS
      {#if pendingCount > 0}
        <span class="hud-badge-pink">{pendingCount}</span>
      {/if}
    </span>

    <!-- Tab switcher -->
    <div class="hud-tab-bar">
      <button
        onclick={() => activeTab = 'queue'}
        class="hud-tab {activeTab === 'queue' ? 'hud-tab-active' : ''}"
      >
        QUEUE
        {#if pendingCount > 0}
          <span class="hud-badge-pink">{pendingCount}</span>
        {/if}
      </button>
      <button
        onclick={() => activeTab = 'allowlist'}
        class="hud-tab {activeTab === 'allowlist' ? 'hud-tab-active-green' : ''}"
      >
        ALLOWLIST
        {#if totalPatterns > 0}
          <span class="hud-badge-green">{totalPatterns}</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Content area -->
  <div class="hud-content">
    {#if conn.state.status !== 'connected'}
      <!-- Not connected -->
      <div class="hud-empty-state">
        <svg class="hud-empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757" />
        </svg>
        <span class="hud-empty-text">Connect to the gateway to manage exec approvals.</span>
      </div>

    {:else if activeTab === 'queue'}
      <!-- APPROVAL QUEUE -->
      <div class="hud-sections">
        <!-- Pending approvals -->
        <div class="hud-panel">
          <div class="hud-panel-lbl">
            <span style="display:flex;align-items:center;gap:6px">
              <span class="hud-dot {pendingCount > 0 ? 'hud-dot-amber' : ''}"></span>
              PENDING APPROVALS
            </span>
            {#if pendingCount > 0}
              <span class="hud-count-amber">({pendingCount})</span>
            {/if}
          </div>

          {#if sortedPending.length === 0}
            <div class="hud-empty-inline">
              <svg style="width:20px;height:20px;color:var(--color-accent-green)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>No pending approval requests</span>
              <span class="hud-sub-text">Requests will appear here in real-time when agents need permission</span>
            </div>
          {:else}
            <div class="hud-approval-list">
              {#each sortedPending as approval (approval.id)}
                {@const timePercent = getTimeRemainingPercent(approval.createdAtMs, approval.expiresAtMs)}
                {@const isResolving = resolving.has(approval.id)}

                <div class="hud-approval-card {timePercent < 20 ? 'hud-approval-urgent' : ''}">
                  <!-- Time bar -->
                  <div class="hud-time-bar-track">
                    <div class="hud-time-bar {getTimeBarColor(approval.expiresAtMs)}" style="width:{timePercent}%"></div>
                  </div>

                  <div class="hud-approval-body">
                    <div class="hud-approval-header">
                      <div class="hud-approval-cmd">
                        <svg style="width:14px;height:14px;color:var(--color-accent-amber);flex-shrink:0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <code class="hud-code-cyan">{approval.request.command}</code>
                      </div>
                      <div class="hud-timer {getTimeColor(approval.expiresAtMs)}">
                        <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatTimeRemaining(approval.expiresAtMs)}
                      </div>
                    </div>

                    <div class="hud-meta-row">
                      {#if approval.request.cwd}
                        <span class="hud-meta-item">CWD: {approval.request.cwd}</span>
                      {/if}
                      {#if approval.request.host}
                        <span class="hud-meta-item">HOST: {approval.request.host}</span>
                      {/if}
                      {#if approval.request.agentId}
                        <span class="hud-meta-item">AGENT: {approval.request.agentId}</span>
                      {/if}
                      {#if approval.request.sessionKey}
                        <span class="hud-meta-item">KEY: {approval.request.sessionKey.length > 20 ? approval.request.sessionKey.slice(0, 20) + '...' : approval.request.sessionKey}</span>
                      {/if}
                      {#if approval.request.security}
                        <span class="hud-meta-badge-purple">{approval.request.security}</span>
                      {/if}
                      <span class="hud-meta-dim">id: {approval.id.slice(0, 12)}...</span>
                    </div>

                    <div class="hud-approval-actions">
                      <button
                        onclick={() => resolveApproval(approval.id, 'approve')}
                        disabled={isResolving}
                        class="hud-btn hud-btn-green"
                      >
                        {#if isResolving}
                          <svg class="hud-spin" style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        {:else}
                          <svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                        {/if}
                        APPROVE
                      </button>
                      <button
                        onclick={() => resolveApproval(approval.id, 'deny')}
                        disabled={isResolving}
                        class="hud-btn hud-btn-pink"
                      >
                        <svg style="width:14px;height:14px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        DENY
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Resolved history -->
        <div class="hud-panel">
          <div class="hud-panel-lbl">
            <span style="display:flex;align-items:center;gap:6px">
              <svg style="width:12px;height:12px;color:color-mix(in srgb, var(--color-accent-cyan) 55%, transparent)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              RECENT DECISIONS
            </span>
          </div>

          {#if resolvedHistory.length === 0}
            <div class="hud-empty-inline">
              <span>No resolved requests yet this session</span>
            </div>
          {:else}
            <div class="hud-resolved-list">
              {#each resolvedHistory as resolved (resolved.id + resolved.resolvedAtMs)}
                <div class="hud-resolved-row">
                  <span class="hud-resolved-icon {resolved.decision === 'approve' ? 'hud-icon-green' : 'hud-icon-pink'}">
                    {#if resolved.decision === 'approve'}
                      <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    {:else}
                      <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    {/if}
                  </span>
                  <code class="hud-resolved-cmd">{resolved.command ?? resolved.request?.command ?? resolved.id.slice(0, 16)}</code>
                  <span class="hud-resolved-badge {resolved.decision === 'approve' ? 'hud-badge-approved' : 'hud-badge-denied'}">
                    {resolved.decision === 'approve' ? 'APPROVED' : 'DENIED'}
                  </span>
                  <span class="hud-resolved-time">{formatDecisionTime(resolved.resolvedAtMs)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

    {:else if activeTab === 'allowlist'}
      <!-- EXEC APPROVALS CONFIG -->
      <div class="hud-sections">
        <!-- Action bar -->
        <div class="hud-action-bar">
          <div>
            <div class="hud-panel-lbl" style="margin-bottom:2px">EXEC APPROVALS CONFIGURATION</div>
            {#if approvalsSnapshot?.path}
              <span class="hud-meta-dim" style="font-size:0.65rem">{approvalsSnapshot.path}</span>
            {:else}
              <span class="hud-meta-dim" style="font-size:0.65rem">Per-agent command allowlists and approval policies</span>
            {/if}
          </div>
          <div class="hud-action-btns">
            {#if approvalsDirty}
              <span class="hud-unsaved-indicator">
                <span class="hud-dot hud-dot-amber"></span>
                UNSAVED
              </span>
            {/if}
            <button
              onclick={() => untrack(() => loadApprovals())}
              disabled={approvalsLoading}
              class="hud-btn"
            >
              <svg class="{approvalsLoading ? 'hud-spin' : ''}" style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {approvalsLoading ? 'LOADING...' : 'RELOAD'}
            </button>
            <button
              onclick={saveApprovals}
              disabled={approvalsSaving || !approvalsDirty}
              class="hud-btn {approvalsDirty ? 'hud-btn-green' : ''}"
            >
              {#if approvalsSaving}
                <svg class="hud-spin" style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {:else}
                <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
              {/if}
              SAVE
            </button>
          </div>
        </div>

        {#if !approvalsForm && !approvalsLoading}
          <!-- Not loaded yet -->
          <div class="hud-panel">
            <div class="hud-empty-inline">
              <svg style="width:24px;height:24px;color:var(--color-text-muted)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span>Load exec approvals to view and edit allowlists</span>
              <button
                onclick={() => untrack(() => loadApprovals())}
                class="hud-btn"
                style="margin-top:8px"
              >
                LOAD APPROVALS
              </button>
            </div>
          </div>

        {:else if approvalsLoading && !approvalsForm}
          <!-- Loading skeleton -->
          <div class="hud-panel hud-skeleton"></div>
          <div class="hud-panel hud-skeleton" style="min-height:120px"></div>

        {:else if approvalsForm}
          <!-- Scope tabs -->
          <div class="hud-scope-bar">
            <span class="hud-panel-lbl" style="margin-bottom:0;margin-right:6px">SCOPE</span>
            <button
              onclick={() => selectedScope = '__defaults__'}
              class="hud-scope-tab {selectedScope === '__defaults__' ? 'hud-scope-tab-active' : ''}"
            >
              DEFAULTS
            </button>
            {#each agentScopes as scope}
              {@const entryCount = approvalsForm?.agents?.[scope]?.allowlist?.length ?? 0}
              <button
                onclick={() => selectedScope = scope}
                class="hud-scope-tab {selectedScope === scope ? 'hud-scope-tab-active' : ''}"
              >
                <span style="font-family:'Share Tech Mono',monospace">{scope === '*' ? '* (global)' : scope}</span>
                {#if entryCount > 0}
                  <span class="hud-badge-cyan">{entryCount}</span>
                {/if}
              </button>
            {/each}
          </div>

          {#if selectedScope === '__defaults__'}
            <!-- DEFAULT POLICY -->
            <div class="hud-panel">
              <div class="hud-panel-lbl">DEFAULT POLICY</div>
              <div class="hud-sub-text" style="margin-bottom:12px">These settings apply to all agents unless overridden per-agent.</div>

              <div class="hud-settings-list">
                <!-- Security -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">SECURITY</div>
                    <div class="hud-setting-desc">Default exec security mode</div>
                  </div>
                  <select
                    value={currentDefaults.security}
                    onchange={(e) => setDefaultValue('security', (e.target as HTMLSelectElement).value)}
                    class="hud-select"
                  >
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Ask -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">ASK</div>
                    <div class="hud-setting-desc">When to prompt for approval</div>
                  </div>
                  <select
                    value={currentDefaults.ask}
                    onchange={(e) => setDefaultValue('ask', (e.target as HTMLSelectElement).value)}
                    class="hud-select"
                  >
                    <option value="off">Off</option>
                    <option value="on-miss">On miss</option>
                    <option value="always">Always</option>
                  </select>
                </div>
                <!-- Ask Fallback -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">ASK FALLBACK</div>
                    <div class="hud-setting-desc">Applied when the UI prompt is unavailable</div>
                  </div>
                  <select
                    value={currentDefaults.askFallback}
                    onchange={(e) => setDefaultValue('askFallback', (e.target as HTMLSelectElement).value)}
                    class="hud-select"
                  >
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Auto-allow skills -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">AUTO-ALLOW SKILL CLIs</div>
                    <div class="hud-setting-desc">Automatically allow executables from installed skills</div>
                  </div>
                  <button
                    onclick={() => setDefaultValue('autoAllowSkills', !currentDefaults.autoAllowSkills)}
                    class="hud-toggle {currentDefaults.autoAllowSkills ? 'hud-toggle-on' : ''}"
                  >
                    <span class="hud-toggle-knob"></span>
                  </button>
                </div>
              </div>
            </div>

          {:else}
            <!-- AGENT-SPECIFIC CONFIG -->
            <!-- Policy overrides -->
            <div class="hud-panel">
              <div class="hud-panel-lbl">
                POLICY OVERRIDES -- <span style="color:var(--color-accent-cyan);font-family:'Share Tech Mono',monospace">{selectedScope === '*' ? '* (global)' : selectedScope}</span>
              </div>
              <div class="hud-sub-text" style="margin-bottom:12px">Leave as "Use default" to inherit from defaults above.</div>

              <div class="hud-settings-list">
                <!-- Security override -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">SECURITY</div>
                    <div class="hud-setting-desc">Default: {currentDefaults.security}</div>
                  </div>
                  <select
                    value={currentAgent?.security ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'security');
                      else setAgentValue(selectedScope, 'security', v);
                    }}
                    class="hud-select"
                  >
                    <option value="__default__">Use default ({currentDefaults.security})</option>
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Ask override -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">ASK</div>
                    <div class="hud-setting-desc">Default: {currentDefaults.ask}</div>
                  </div>
                  <select
                    value={currentAgent?.ask ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'ask');
                      else setAgentValue(selectedScope, 'ask', v);
                    }}
                    class="hud-select"
                  >
                    <option value="__default__">Use default ({currentDefaults.ask})</option>
                    <option value="off">Off</option>
                    <option value="on-miss">On miss</option>
                    <option value="always">Always</option>
                  </select>
                </div>
                <!-- Ask Fallback override -->
                <div class="hud-setting-row">
                  <div>
                    <div class="hud-setting-label">ASK FALLBACK</div>
                    <div class="hud-setting-desc">Default: {currentDefaults.askFallback}</div>
                  </div>
                  <select
                    value={currentAgent?.askFallback ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'askFallback');
                      else setAgentValue(selectedScope, 'askFallback', v);
                    }}
                    class="hud-select"
                  >
                    <option value="__default__">Use default ({currentDefaults.askFallback})</option>
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
              </div>
            </div>

            <!-- Allowlist entries -->
            <div class="hud-panel">
              <div class="hud-panel-lbl">
                ALLOWLIST PATTERNS
                {#if currentAllowlist.length > 0}
                  <span style="color:var(--color-text-muted);font-weight:normal">({currentAllowlist.length})</span>
                {/if}
              </div>
              <div class="hud-sub-text" style="margin-bottom:12px">Case-insensitive glob patterns. Matching commands are auto-approved.</div>

              {#if currentAllowlist.length === 0}
                <div class="hud-empty-inline">
                  <span>No allowlist entries for this scope</span>
                </div>
              {:else}
                <div class="hud-pattern-list">
                  {#each currentAllowlist as entry, index}
                    <div class="hud-pattern-row">
                      <div class="hud-pattern-content">
                        {#if editingPattern === index}
                          <!-- Editing mode -->
                          <div class="hud-pattern-edit">
                            <input
                              type="text"
                              bind:value={editingPatternValue}
                              onkeydown={(e) => {
                                if (e.key === 'Enter') commitEditPattern(index);
                                if (e.key === 'Escape') cancelEditPattern();
                              }}
                              class="hud-input"
                              autofocus
                            />
                            <button
                              onclick={() => commitEditPattern(index)}
                              class="hud-btn hud-btn-green hud-btn-sm"
                              title="Save"
                            >
                              <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                            </button>
                            <button
                              onclick={cancelEditPattern}
                              class="hud-btn hud-btn-sm"
                              title="Cancel"
                            >
                              <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        {:else}
                          <!-- Display mode -->
                          <code class="hud-code-cyan hud-clickable"
                            onclick={() => startEditPattern(index, entry.pattern)}
                            title="Click to edit"
                          >
                            {entry.pattern}
                          </code>
                        {/if}

                        <!-- Metadata -->
                        <div class="hud-pattern-meta">
                          {#if entry.lastUsedAt}
                            <span class="hud-meta-item">
                              <svg style="width:10px;height:10px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {formatRelativeTime(entry.lastUsedAt)}
                            </span>
                          {:else}
                            <span class="hud-meta-dim">never used</span>
                          {/if}
                          {#if entry.lastResolvedPath}
                            <span class="hud-meta-dim hud-truncate" title={entry.lastResolvedPath}>
                              &rarr; {entry.lastResolvedPath}
                            </span>
                          {/if}
                        </div>
                        {#if entry.lastUsedCommand}
                          <div class="hud-meta-dim hud-truncate" style="margin-top:2px" title={entry.lastUsedCommand}>
                            $ {entry.lastUsedCommand}
                          </div>
                        {/if}
                      </div>

                      <!-- Actions -->
                      <div class="hud-pattern-actions">
                        {#if editingPattern !== index}
                          <button
                            onclick={() => startEditPattern(index, entry.pattern)}
                            class="hud-btn hud-btn-sm"
                            title="Edit pattern"
                          >
                            <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        {/if}
                        <button
                          onclick={() => removePattern(index)}
                          class="hud-btn hud-btn-pink hud-btn-sm"
                          title="Remove pattern"
                        >
                          <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Add new pattern -->
              <div class="hud-add-pattern">
                <input
                  type="text"
                  bind:value={newPatternInput}
                  onkeydown={(e) => { if (e.key === 'Enter') addPattern(); }}
                  placeholder="Add new pattern (e.g., /usr/bin/git, **, cat /home/**)"
                  class="hud-input"
                  style="flex:1"
                />
                <button
                  onclick={addPattern}
                  disabled={!newPatternInput.trim()}
                  class="hud-btn hud-btn-green"
                >
                  <svg style="width:12px;height:12px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                  ADD
                </button>
              </div>
            </div>
          {/if}

          <!-- Info card -->
          <div class="hud-panel">
            <div class="hud-panel-lbl">HOW IT WORKS</div>
            <ul class="hud-info-list">
              <li><span class="hud-bullet">&gt;</span> <strong>Defaults</strong> apply to all agents unless overridden per-scope.</li>
              <li><span class="hud-bullet">&gt;</span> <strong>* (global)</strong> matches all agents. Per-agent scopes override global.</li>
              <li><span class="hud-bullet">&gt;</span> Allowlist patterns use case-insensitive <code class="hud-code-inline">glob</code> matching (<code class="hud-code-inline">*</code> = single segment, <code class="hud-code-inline">**</code> = any depth).</li>
              <li><span class="hud-bullet">&gt;</span> Commands not matching any pattern trigger an approval request in the Queue tab.</li>
              <li><span class="hud-bullet">&gt;</span> Changes take effect immediately after saving.</li>
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ─── PAGE LAYOUT ─── */
  .hud-page {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-primary);
    background: #0a0e1a;
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    flex-shrink: 0;
    position: relative;
    z-index: 2;
  }

  .hud-page-topbar::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.5;
  }

  .hud-back {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .hud-back:hover {
    color: var(--color-accent-cyan);
    text-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud-content {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    position: relative;
    z-index: 1;
  }

  .hud-sections {
    display: flex;
    flex-direction: column;
    gap: 16px;
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
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hud-btn-green {
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 35%, transparent);
  }

  .hud-btn-green:hover:not(:disabled) {
    border-color: var(--color-accent-green);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-green) 30%, transparent);
  }

  .hud-btn-pink {
    color: var(--color-accent-pink);
    border-color: color-mix(in srgb, var(--color-accent-pink) 35%, transparent);
  }

  .hud-btn-pink:hover:not(:disabled) {
    border-color: var(--color-accent-pink);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-pink) 30%, transparent);
  }

  .hud-btn-sm {
    padding: 2px 6px;
    font-size: 0.65rem;
  }

  /* ─── TAB BAR ─── */
  .hud-tab-bar {
    display: flex;
    gap: 2px;
    margin-left: auto;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 3px;
    padding: 2px;
  }

  .hud-tab {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: transparent;
    border: none;
    padding: 4px 12px;
    border-radius: 2px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hud-tab:hover {
    color: var(--color-accent-cyan);
  }

  .hud-tab-active {
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    color: var(--color-accent-cyan);
  }

  .hud-tab-active-green {
    background: color-mix(in srgb, var(--color-accent-green) 15%, transparent);
    color: var(--color-accent-green);
  }

  /* ─── BADGES ─── */
  .hud-badge-pink {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-pink) 20%, transparent);
    color: var(--color-accent-pink);
    border: 1px solid color-mix(in srgb, var(--color-accent-pink) 30%, transparent);
  }

  .hud-badge-green {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-green) 20%, transparent);
    color: var(--color-accent-green);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 30%, transparent);
  }

  .hud-badge-cyan {
    font-size: 0.58rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    color: var(--color-accent-cyan);
  }

  /* ─── DOT ─── */
  .hud-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-text-muted);
    flex-shrink: 0;
  }

  .hud-dot-amber {
    background: var(--color-accent-amber);
    box-shadow: 0 0 6px var(--color-accent-amber);
    animation: hud-pulse 1.5s ease-in-out infinite;
  }

  /* ─── EMPTY STATES ─── */
  .hud-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    gap: 12px;
  }

  .hud-empty-icon {
    width: 32px;
    height: 32px;
    color: var(--color-text-muted);
  }

  .hud-empty-text {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    letter-spacing: 0.1em;
  }

  .hud-empty-inline {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 24px 16px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    letter-spacing: 0.08em;
  }

  /* ─── APPROVAL CARDS ─── */
  .hud-approval-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hud-approval-card {
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    border-radius: 3px;
    overflow: hidden;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    transition: border-color 0.2s;
  }

  .hud-approval-card:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-approval-urgent {
    border-color: color-mix(in srgb, var(--color-accent-pink) 40%, transparent) !important;
  }

  .hud-time-bar-track {
    height: 3px;
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-time-bar {
    height: 100%;
    transition: width 1s linear;
  }

  .hud-bar-ok { background: var(--color-accent-green); box-shadow: 0 0 4px var(--color-accent-green); }
  .hud-bar-warn { background: var(--color-accent-amber); box-shadow: 0 0 4px var(--color-accent-amber); }
  .hud-bar-critical { background: var(--color-accent-pink); box-shadow: 0 0 4px var(--color-accent-pink); }

  .hud-approval-body {
    padding: 14px;
  }

  .hud-approval-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .hud-approval-cmd {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  .hud-code-cyan {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
    word-break: break-all;
  }

  .hud-timer {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.7rem;
    font-family: 'Share Tech Mono', monospace;
    flex-shrink: 0;
  }

  .hud-time-ok { color: var(--color-accent-green); }
  .hud-time-warn { color: var(--color-accent-amber); }
  .hud-time-critical { color: var(--color-accent-pink); }

  .hud-meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 0.65rem;
    margin-bottom: 12px;
  }

  .hud-meta-item {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--color-text-muted);
    font-family: 'Share Tech Mono', monospace;
    letter-spacing: 0.05em;
  }

  .hud-meta-dim {
    color: color-mix(in srgb, var(--color-text-muted) 60%, transparent);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
  }

  .hud-meta-badge-purple {
    font-size: 0.75rem;
    padding: 1px 6px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-purple) 15%, transparent);
    color: var(--color-accent-purple);
    border: 1px solid color-mix(in srgb, var(--color-accent-purple) 25%, transparent);
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-approval-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud-count-amber {
    color: var(--color-accent-amber);
    font-size: 0.65rem;
  }

  /* ─── RESOLVED LIST ─── */
  .hud-resolved-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hud-resolved-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    font-size: 0.72rem;
  }

  .hud-resolved-row:last-child {
    border-bottom: none;
  }

  .hud-resolved-icon {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hud-icon-green {
    background: color-mix(in srgb, var(--color-accent-green) 15%, transparent);
    color: var(--color-accent-green);
  }

  .hud-icon-pink {
    background: color-mix(in srgb, var(--color-accent-pink) 15%, transparent);
    color: var(--color-accent-pink);
  }

  .hud-resolved-cmd {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: var(--color-text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-resolved-badge {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    padding: 2px 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .hud-badge-approved {
    background: color-mix(in srgb, var(--color-accent-green) 15%, transparent);
    color: var(--color-accent-green);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 25%, transparent);
  }

  .hud-badge-denied {
    background: color-mix(in srgb, var(--color-accent-pink) 15%, transparent);
    color: var(--color-accent-pink);
    border: 1px solid color-mix(in srgb, var(--color-accent-pink) 25%, transparent);
  }

  .hud-resolved-time {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    color: var(--color-text-muted);
    flex-shrink: 0;
  }

  /* ─── ACTION BAR ─── */
  .hud-action-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .hud-action-btns {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud-unsaved-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-amber);
  }

  /* ─── SCOPE BAR ─── */
  .hud-scope-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .hud-scope-tab {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    padding: 4px 10px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hud-scope-tab:hover {
    color: var(--color-text-primary);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-scope-tab-active {
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  /* ─── SETTINGS ─── */
  .hud-settings-list {
    display: flex;
    flex-direction: column;
  }

  .hud-setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 0;
    gap: 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-setting-row:last-child {
    border-bottom: none;
  }

  .hud-setting-label {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    color: var(--color-text-primary);
  }

  .hud-setting-desc {
    font-size: 0.62rem;
    color: var(--color-text-muted);
    margin-top: 2px;
  }

  .hud-sub-text {
    font-size: 0.65rem;
    color: var(--color-text-muted);
    letter-spacing: 0.05em;
  }

  /* ─── SELECT ─── */
  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    color: var(--color-text-primary);
    outline: none;
  }

  .hud-select:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  /* ─── TOGGLE ─── */
  .hud-toggle {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 8%, #0a0e1a);
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }

  .hud-toggle-on {
    background: color-mix(in srgb, var(--color-accent-green) 25%, #0a0e1a);
    border-color: color-mix(in srgb, var(--color-accent-green) 50%, transparent);
  }

  .hud-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-text-muted);
    transition: all 0.2s;
  }

  .hud-toggle-on .hud-toggle-knob {
    left: 20px;
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
  }

  /* ─── INPUT ─── */
  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    color: var(--color-text-primary);
    outline: none;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-text-muted) 50%, transparent);
  }

  .hud-input:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 6px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  /* ─── PATTERNS ─── */
  .hud-pattern-list {
    display: flex;
    flex-direction: column;
  }

  .hud-pattern-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
  }

  .hud-pattern-row:last-child {
    border-bottom: none;
  }

  .hud-pattern-row:hover .hud-pattern-actions {
    opacity: 1;
  }

  .hud-pattern-content {
    flex: 1;
    min-width: 0;
  }

  .hud-pattern-edit {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hud-pattern-edit .hud-input {
    flex: 1;
  }

  .hud-pattern-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    font-size: 0.62rem;
  }

  .hud-pattern-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  .hud-clickable {
    cursor: pointer;
    transition: text-shadow 0.2s;
  }

  .hud-clickable:hover {
    text-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    text-decoration: underline;
  }

  .hud-add-pattern {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }

  /* ─── INFO LIST ─── */
  .hud-info-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.68rem;
    color: var(--color-text-muted);
  }

  .hud-info-list li {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .hud-info-list strong {
    color: var(--color-text-primary);
  }

  .hud-bullet {
    color: var(--color-accent-green);
    flex-shrink: 0;
  }

  .hud-code-inline {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 18%, transparent);
    padding: 1px 4px;
    border-radius: 2px;
  }

  /* ─── SKELETON ─── */
  .hud-skeleton {
    min-height: 60px;
    animation: hud-skeleton-pulse 1.5s ease-in-out infinite;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  @keyframes hud-skeleton-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }

  .hud-spin {
    animation: hud-spin-kf 1s linear infinite;
  }

  @keyframes hud-spin-kf {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
