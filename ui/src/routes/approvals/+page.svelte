<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

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
        `Exec request ${id.slice(0, 8)}… ${decision === 'approve' ? 'approved' : 'denied'}`
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
    if (remaining <= 10000) return 'text-accent-pink';
    if (remaining <= 30000) return 'text-accent-amber';
    return 'text-accent-green';
  }

  function getTimeBarColor(expiresAtMs: number): string {
    const remaining = expiresAtMs - now;
    if (remaining <= 10000) return 'bg-accent-pink';
    if (remaining <= 30000) return 'bg-accent-amber';
    return 'bg-accent-green';
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
</script>

<svelte:head>
  <title>Exec Approvals — Cortex</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl border border-border-glow flex items-center justify-center relative
            {hasNewRequest ? 'approval-pulse' : ''}"
            style="background: linear-gradient(135deg, rgba(0, 229, 255, 0.1), rgba(124, 77, 255, 0.1));"
          >
            <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            {#if pendingCount > 0}
              <span class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent-pink text-white text-[10px] font-bold flex items-center justify-center border-2 border-bg-primary {hasNewRequest ? 'animate-bounce' : ''}">
                {pendingCount}
              </span>
            {/if}
          </div>
          <div>
            <h1 class="text-xl font-bold text-text-primary glow-text-cyan">Exec Approvals</h1>
            <p class="text-sm text-text-muted">Real-time command approval queue and allowlist management</p>
          </div>
        </div>
      </div>

      <!-- Tab switcher -->
      <div class="flex items-center bg-bg-tertiary rounded-lg border border-border-default p-0.5">
        <button
          onclick={() => activeTab = 'queue'}
          class="px-3 py-1.5 text-sm rounded-md transition-all flex items-center gap-1.5
            {activeTab === 'queue' ? 'bg-bg-hover text-accent-cyan font-medium' : 'text-text-muted hover:text-text-primary'}"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Queue
          {#if pendingCount > 0}
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-accent-pink/20 text-accent-pink text-[10px] font-bold">
              {pendingCount}
            </span>
          {/if}
        </button>
        <button
          onclick={() => activeTab = 'allowlist'}
          class="px-3 py-1.5 text-sm rounded-md transition-all flex items-center gap-1.5
            {activeTab === 'allowlist' ? 'bg-bg-hover text-accent-green font-medium' : 'text-text-muted hover:text-text-primary'}"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Allowlist
          {#if totalPatterns > 0}
            <span class="ml-1 px-1.5 py-0.5 rounded-full bg-accent-green/20 text-accent-green text-[10px] font-bold">
              {totalPatterns}
            </span>
          {/if}
        </button>
      </div>
    </div>
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
        <p class="text-text-muted text-sm">Connect to the gateway to manage exec approvals.</p>
      </div>

    {:else if activeTab === 'queue'}
      <!-- ═══ APPROVAL QUEUE ═══ -->
      <div class="space-y-6">
        <!-- Pending approvals -->
        <div>
          <h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full {pendingCount > 0 ? 'bg-accent-amber animate-pulse' : 'bg-text-muted'}"></span>
            Pending Approvals
            {#if pendingCount > 0}
              <span class="text-accent-amber">({pendingCount})</span>
            {/if}
          </h2>

          {#if sortedPending.length === 0}
            <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center">
              <div class="w-12 h-12 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-3">
                <svg class="w-6 h-6 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="text-text-muted text-sm">No pending approval requests</p>
              <p class="text-text-muted text-xs mt-1">Requests will appear here in real-time when agents need permission</p>
            </div>
          {:else}
            <div class="space-y-3">
              {#each sortedPending as approval (approval.id)}
                {@const timePercent = getTimeRemainingPercent(approval.createdAtMs, approval.expiresAtMs)}
                {@const isResolving = resolving.has(approval.id)}

                <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden animate-fade-in
                  {timePercent < 20 ? 'border-accent-pink/40' : 'hover:border-accent-cyan/20'} transition-all">
                  <div class="h-1 bg-bg-tertiary">
                    <div class="h-full {getTimeBarColor(approval.expiresAtMs)} transition-all duration-1000 ease-linear" style="width: {timePercent}%"></div>
                  </div>
                  <div class="p-4">
                    <div class="flex items-start justify-between gap-4 mb-3">
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <svg class="w-4 h-4 text-accent-amber flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <code class="text-sm font-mono text-accent-cyan break-all">{approval.request.command}</code>
                        </div>
                      </div>
                      <div class="flex items-center gap-1.5 {getTimeColor(approval.expiresAtMs)} text-xs font-mono flex-shrink-0">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatTimeRemaining(approval.expiresAtMs)}
                      </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted mb-4">
                      {#if approval.request.cwd}
                        <span class="flex items-center gap-1 font-mono">📁 {approval.request.cwd}</span>
                      {/if}
                      {#if approval.request.host}
                        <span class="flex items-center gap-1">🖥️ {approval.request.host}</span>
                      {/if}
                      {#if approval.request.agentId}
                        <span class="flex items-center gap-1">🤖 {approval.request.agentId}</span>
                      {/if}
                      {#if approval.request.sessionKey}
                        <span class="font-mono">🔑 {approval.request.sessionKey.length > 20 ? approval.request.sessionKey.slice(0, 20) + '…' : approval.request.sessionKey}</span>
                      {/if}
                      {#if approval.request.security}
                        <span class="px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20 font-mono">{approval.request.security}</span>
                      {/if}
                      <span class="font-mono text-text-muted/60">id: {approval.id.slice(0, 12)}…</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        onclick={() => resolveApproval(approval.id, 'approve')}
                        disabled={isResolving}
                        class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all
                          bg-accent-green/15 text-accent-green border border-accent-green/30
                          hover:bg-accent-green/25 hover:border-accent-green/50 hover:shadow-[0_0_12px_rgba(0,255,136,0.15)]
                          disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {#if isResolving}
                          <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        {:else}
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                        {/if}
                        Approve
                      </button>
                      <button
                        onclick={() => resolveApproval(approval.id, 'deny')}
                        disabled={isResolving}
                        class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all
                          bg-accent-pink/15 text-accent-pink border border-accent-pink/30
                          hover:bg-accent-pink/25 hover:border-accent-pink/50 hover:shadow-[0_0_12px_rgba(244,63,158,0.15)]
                          disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Resolved history -->
        <div>
          <h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recent Decisions
          </h2>
          {#if resolvedHistory.length === 0}
            <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-6 text-center">
              <p class="text-text-muted text-xs">No resolved requests yet this session</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each resolvedHistory as resolved (resolved.id + resolved.resolvedAtMs)}
                <div class="flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary/30 px-4 py-2.5 text-sm">
                  <span class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0
                    {resolved.decision === 'approve' ? 'bg-accent-green/15 text-accent-green' : 'bg-accent-pink/15 text-accent-pink'}">
                    {#if resolved.decision === 'approve'}
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                    {:else}
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    {/if}
                  </span>
                  <code class="text-xs font-mono text-text-primary truncate flex-1">{resolved.command ?? resolved.request?.command ?? resolved.id.slice(0, 16)}</code>
                  <span class="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
                    {resolved.decision === 'approve' ? 'bg-accent-green/15 text-accent-green border border-accent-green/20' : 'bg-accent-pink/15 text-accent-pink border border-accent-pink/20'}">
                    {resolved.decision === 'approve' ? 'approved' : 'denied'}
                  </span>
                  <span class="text-xs text-text-muted font-mono flex-shrink-0">{formatDecisionTime(resolved.resolvedAtMs)}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

    {:else if activeTab === 'allowlist'}
      <!-- ═══ EXEC APPROVALS CONFIG ═══ -->
      <div class="space-y-6">
        <!-- Action bar -->
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted mb-1">Exec Approvals Configuration</h2>
            {#if approvalsSnapshot?.path}
              <p class="text-xs text-text-muted font-mono">📁 {approvalsSnapshot.path}</p>
            {:else}
              <p class="text-xs text-text-muted">Per-agent command allowlists and approval policies</p>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            {#if approvalsDirty}
              <span class="flex items-center gap-1.5 text-xs text-accent-amber">
                <span class="w-2 h-2 rounded-full bg-accent-amber animate-pulse"></span>
                Unsaved
              </span>
            {/if}
            <button
              onclick={() => untrack(() => loadApprovals())}
              disabled={approvalsLoading}
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40"
            >
              <svg class="w-3.5 h-3.5 {approvalsLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {approvalsLoading ? 'Loading…' : 'Reload'}
            </button>
            <button
              onclick={saveApprovals}
              disabled={approvalsSaving || !approvalsDirty}
              class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all
                {approvalsDirty
                  ? 'bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30'
                  : 'bg-bg-tertiary text-text-muted border border-border-default opacity-50 cursor-not-allowed'}"
            >
              {#if approvalsSaving}
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {:else}
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
              {/if}
              Save
            </button>
          </div>
        </div>

        {#if !approvalsForm && !approvalsLoading}
          <!-- Not loaded yet -->
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center">
            <div class="w-12 h-12 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p class="text-text-muted text-sm mb-3">Load exec approvals to view and edit allowlists</p>
            <button
              onclick={() => untrack(() => loadApprovals())}
              class="px-4 py-2 text-sm font-medium rounded-lg bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/25 transition-all"
            >
              Load Approvals
            </button>
          </div>

        {:else if approvalsLoading && !approvalsForm}
          <!-- Loading skeleton -->
          <div class="space-y-4 animate-pulse">
            <div class="h-10 bg-bg-tertiary rounded-lg"></div>
            <div class="h-32 bg-bg-tertiary rounded-lg"></div>
            <div class="h-48 bg-bg-tertiary rounded-lg"></div>
          </div>

        {:else if approvalsForm}
          <!-- Scope tabs -->
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs text-text-muted uppercase tracking-wider font-semibold mr-1">Scope</span>
            <button
              onclick={() => selectedScope = '__defaults__'}
              class="px-3 py-1.5 text-xs rounded-lg border transition-all
                {selectedScope === '__defaults__'
                  ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 font-medium'
                  : 'bg-bg-tertiary text-text-muted border-border-default hover:text-text-primary hover:border-border-glow'}"
            >
              ⚙️ Defaults
            </button>
            {#each agentScopes as scope}
              {@const entryCount = approvalsForm?.agents?.[scope]?.allowlist?.length ?? 0}
              <button
                onclick={() => selectedScope = scope}
                class="px-3 py-1.5 text-xs rounded-lg border transition-all flex items-center gap-1.5
                  {selectedScope === scope
                    ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 font-medium'
                    : 'bg-bg-tertiary text-text-muted border-border-default hover:text-text-primary hover:border-border-glow'}"
              >
                <span class="font-mono">{scope === '*' ? '* (global)' : scope}</span>
                {#if entryCount > 0}
                  <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold
                    {selectedScope === scope ? 'bg-accent-cyan/20 text-accent-cyan' : 'bg-bg-hover text-text-muted'}">
                    {entryCount}
                  </span>
                {/if}
              </button>
            {/each}
          </div>

          {#if selectedScope === '__defaults__'}
            <!-- ═══ DEFAULT POLICY ═══ -->
            <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
              <div class="px-4 py-3 border-b border-border-default bg-bg-tertiary/50">
                <h3 class="text-sm font-semibold text-text-primary">Default Policy</h3>
                <p class="text-xs text-text-muted mt-0.5">These settings apply to all agents unless overridden per-agent.</p>
              </div>
              <div class="divide-y divide-border-default">
                <!-- Security -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Security</div>
                    <div class="text-xs text-text-muted mt-0.5">Default exec security mode</div>
                  </div>
                  <select
                    value={currentDefaults.security}
                    onchange={(e) => setDefaultValue('security', (e.target as HTMLSelectElement).value)}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  >
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Ask -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Ask</div>
                    <div class="text-xs text-text-muted mt-0.5">When to prompt for approval</div>
                  </div>
                  <select
                    value={currentDefaults.ask}
                    onchange={(e) => setDefaultValue('ask', (e.target as HTMLSelectElement).value)}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  >
                    <option value="off">Off</option>
                    <option value="on-miss">On miss</option>
                    <option value="always">Always</option>
                  </select>
                </div>
                <!-- Ask Fallback -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Ask Fallback</div>
                    <div class="text-xs text-text-muted mt-0.5">Applied when the UI prompt is unavailable</div>
                  </div>
                  <select
                    value={currentDefaults.askFallback}
                    onchange={(e) => setDefaultValue('askFallback', (e.target as HTMLSelectElement).value)}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  >
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Auto-allow skills -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Auto-allow skill CLIs</div>
                    <div class="text-xs text-text-muted mt-0.5">Automatically allow executables from installed skills</div>
                  </div>
                  <button
                    onclick={() => setDefaultValue('autoAllowSkills', !currentDefaults.autoAllowSkills)}
                    class="relative w-11 h-6 rounded-full transition-colors duration-200
                      {currentDefaults.autoAllowSkills ? 'bg-accent-green' : 'bg-bg-tertiary border border-border-default'}"
                  >
                    <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200
                      {currentDefaults.autoAllowSkills ? 'translate-x-5' : 'translate-x-0'}"></span>
                  </button>
                </div>
              </div>
            </div>

          {:else}
            <!-- ═══ AGENT-SPECIFIC CONFIG ═══ -->
            <!-- Policy overrides -->
            <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
              <div class="px-4 py-3 border-b border-border-default bg-bg-tertiary/50">
                <h3 class="text-sm font-semibold text-text-primary">
                  Policy Overrides — <span class="font-mono text-accent-cyan">{selectedScope === '*' ? '* (global)' : selectedScope}</span>
                </h3>
                <p class="text-xs text-text-muted mt-0.5">Leave as "Use default" to inherit from defaults above.</p>
              </div>
              <div class="divide-y divide-border-default">
                <!-- Security override -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Security</div>
                    <div class="text-xs text-text-muted mt-0.5">Default: {currentDefaults.security}</div>
                  </div>
                  <select
                    value={currentAgent?.security ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'security');
                      else setAgentValue(selectedScope, 'security', v);
                    }}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  >
                    <option value="__default__">Use default ({currentDefaults.security})</option>
                    <option value="deny">Deny</option>
                    <option value="allowlist">Allowlist</option>
                    <option value="full">Full</option>
                  </select>
                </div>
                <!-- Ask override -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Ask</div>
                    <div class="text-xs text-text-muted mt-0.5">Default: {currentDefaults.ask}</div>
                  </div>
                  <select
                    value={currentAgent?.ask ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'ask');
                      else setAgentValue(selectedScope, 'ask', v);
                    }}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
                  >
                    <option value="__default__">Use default ({currentDefaults.ask})</option>
                    <option value="off">Off</option>
                    <option value="on-miss">On miss</option>
                    <option value="always">Always</option>
                  </select>
                </div>
                <!-- Ask Fallback override -->
                <div class="flex items-center justify-between px-4 py-3 gap-4">
                  <div>
                    <div class="text-sm font-medium text-text-primary">Ask Fallback</div>
                    <div class="text-xs text-text-muted mt-0.5">Default: {currentDefaults.askFallback}</div>
                  </div>
                  <select
                    value={currentAgent?.askFallback ?? '__default__'}
                    onchange={(e) => {
                      const v = (e.target as HTMLSelectElement).value;
                      if (v === '__default__') removeAgentValue(selectedScope, 'askFallback');
                      else setAgentValue(selectedScope, 'askFallback', v);
                    }}
                    class="px-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-cyan/50"
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
            <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
              <div class="px-4 py-3 border-b border-border-default bg-bg-tertiary/50 flex items-center justify-between">
                <div>
                  <h3 class="text-sm font-semibold text-text-primary">
                    Allowlist Patterns
                    {#if currentAllowlist.length > 0}
                      <span class="text-text-muted font-normal">({currentAllowlist.length})</span>
                    {/if}
                  </h3>
                  <p class="text-xs text-text-muted mt-0.5">Case-insensitive glob patterns. Matching commands are auto-approved.</p>
                </div>
              </div>

              {#if currentAllowlist.length === 0}
                <div class="p-6 text-center">
                  <p class="text-text-muted text-sm">No allowlist entries for this scope</p>
                </div>
              {:else}
                <div class="divide-y divide-border-default">
                  {#each currentAllowlist as entry, index}
                    <div class="px-4 py-3 hover:bg-bg-hover/30 transition-colors group">
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex-1 min-w-0">
                          {#if editingPattern === index}
                            <!-- Editing mode -->
                            <div class="flex items-center gap-2">
                              <input
                                type="text"
                                bind:value={editingPatternValue}
                                onkeydown={(e) => {
                                  if (e.key === 'Enter') commitEditPattern(index);
                                  if (e.key === 'Escape') cancelEditPattern();
                                }}
                                class="flex-1 px-2 py-1 text-sm font-mono bg-bg-input border border-accent-cyan/50 rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-cyan/30"
                                autofocus
                              />
                              <button
                                onclick={() => commitEditPattern(index)}
                                class="p-1 text-accent-green hover:bg-accent-green/10 rounded transition-colors"
                                title="Save"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                              </button>
                              <button
                                onclick={cancelEditPattern}
                                class="p-1 text-text-muted hover:bg-bg-hover rounded transition-colors"
                                title="Cancel"
                              >
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          {:else}
                            <!-- Display mode -->
                            <div class="flex items-center gap-2">
                              <code class="text-sm font-mono text-accent-cyan cursor-pointer hover:underline"
                                onclick={() => startEditPattern(index, entry.pattern)}
                                title="Click to edit"
                              >
                                {entry.pattern}
                              </code>
                            </div>
                          {/if}

                          <!-- Metadata -->
                          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-text-muted">
                            {#if entry.lastUsedAt}
                              <span class="flex items-center gap-1">
                                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {formatRelativeTime(entry.lastUsedAt)}
                              </span>
                            {:else}
                              <span class="text-text-muted/50">never used</span>
                            {/if}
                            {#if entry.lastResolvedPath}
                              <span class="font-mono text-text-muted/70 truncate max-w-xs" title={entry.lastResolvedPath}>
                                → {entry.lastResolvedPath}
                              </span>
                            {/if}
                          </div>
                          {#if entry.lastUsedCommand}
                            <div class="mt-1 text-xs font-mono text-text-muted/60 truncate max-w-lg" title={entry.lastUsedCommand}>
                              $ {entry.lastUsedCommand}
                            </div>
                          {/if}
                        </div>

                        <!-- Actions -->
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {#if editingPattern !== index}
                            <button
                              onclick={() => startEditPattern(index, entry.pattern)}
                              class="p-1.5 text-text-muted hover:text-accent-cyan hover:bg-accent-cyan/10 rounded-lg transition-colors"
                              title="Edit pattern"
                            >
                              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          {/if}
                          <button
                            onclick={() => removePattern(index)}
                            class="p-1.5 text-text-muted hover:text-accent-pink hover:bg-accent-pink/10 rounded-lg transition-colors"
                            title="Remove pattern"
                          >
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}

              <!-- Add new pattern -->
              <div class="px-4 py-3 border-t border-border-default bg-bg-tertiary/30">
                <div class="flex items-center gap-2">
                  <input
                    type="text"
                    bind:value={newPatternInput}
                    onkeydown={(e) => { if (e.key === 'Enter') addPattern(); }}
                    placeholder="Add new pattern (e.g., /usr/bin/git, **, cat /home/**)"
                    class="flex-1 px-3 py-1.5 text-sm font-mono bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-accent-green/50 focus:ring-1 focus:ring-accent-green/20"
                  />
                  <button
                    onclick={addPattern}
                    disabled={!newPatternInput.trim()}
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all
                      {newPatternInput.trim()
                        ? 'bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25'
                        : 'bg-bg-tertiary text-text-muted border border-border-default opacity-50 cursor-not-allowed'}"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                    Add
                  </button>
                </div>
              </div>
            </div>
          {/if}

          <!-- Info card -->
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
            <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">How it works</h3>
            <ul class="text-xs text-text-muted space-y-1.5">
              <li class="flex items-start gap-2">
                <span class="text-accent-green mt-0.5">•</span>
                <span><strong class="text-text-secondary">Defaults</strong> apply to all agents unless overridden per-scope.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-accent-green mt-0.5">•</span>
                <span><strong class="text-text-secondary">* (global)</strong> matches all agents. Per-agent scopes (e.g., "main") override global.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-accent-green mt-0.5">•</span>
                <span>Allowlist patterns use case-insensitive <code class="text-accent-cyan bg-bg-tertiary px-1 rounded">glob</code> matching (<code class="text-accent-cyan bg-bg-tertiary px-1 rounded">*</code> = single segment, <code class="text-accent-cyan bg-bg-tertiary px-1 rounded">**</code> = any depth).</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-accent-green mt-0.5">•</span>
                <span>Commands not matching any pattern trigger an approval request in the Queue tab.</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-accent-green mt-0.5">•</span>
                <span>Changes take effect immediately after saving.</span>
              </li>
            </ul>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes approval-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255, 179, 0, 0.4); }
    50% { box-shadow: 0 0 16px 4px rgba(255, 179, 0, 0.2); }
  }
  .approval-pulse {
    animation: approval-pulse 1.5s ease-in-out infinite;
  }
</style>
