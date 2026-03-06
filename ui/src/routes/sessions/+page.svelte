<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway, type Session, type ChatMessage } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions, type SessionFilters } from '$lib/stores/sessions.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { goto } from '$app/navigation';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const sessions = getSessions();
  const toasts = getToasts();

  // ─── Local state ─────────────────────────────
  let loading = $state(false);
  let searchQuery = $state('');
  let debouncedSearch = $state('');
  let sortBy = $state<'activity' | 'name' | 'channel' | 'tokens'>('activity');
  let showDeleteConfirm = $state<string | null>(null);
  let deleteTranscript = $state(false);
  let showFilters = $state(false);
  let renamingKey = $state<string | null>(null);
  let renameValue = $state('');
  let patchingKey = $state<string | null>(null);
  let expandedSubagents = $state<Set<string>>(new Set());
  let viewMode = $state<'all' | 'grouped'>('grouped');
  let availableModels = $state<Array<{ id: string; name?: string }>>([]);

  // ─── Sub-agent detail viewer state ───────────
  let expandedSubagentDetails = $state<Set<string>>(new Set());
  let subagentHistories = $state<Map<string, ChatMessage[]>>(new Map());
  let subagentHistoryLoading = $state<Set<string>>(new Set());
  let showHistoryModal = $state<string | null>(null);
  let exportingKey = $state<string | null>(null);
  let exportDropdownKey = $state<string | null>(null);

  // ─── Tree view state ─────────────────────────
  let displayMode = $state<'list' | 'tree'>('list');
  let collapsedTreeNodes = $state<Set<string>>(new Set());

  // ─── Filter state ────────────────────────────
  let filterActiveMinutes = $state(sessions.filters.activeMinutes);
  let filterLimit = $state(sessions.filters.limit);
  let filterIncludeGlobal = $state(sessions.filters.includeGlobal);
  let filterIncludeUnknown = $state(sessions.filters.includeUnknown);

  // ─── Debounce search ──────────────────────────
  $effect(() => {
    const q = searchQuery;
    const timer = setTimeout(() => { debouncedSearch = q; }, 200);
    return () => clearTimeout(timer);
  });

  // ─── Effects ─────────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => {
        refresh();
        fetchModels();
      });
    }
  });

  // ─── Actions ─────────────────────────────────
  async function refresh() {
    loading = true;
    await sessions.fetchSessions({
      activeMinutes: filterActiveMinutes,
      limit: filterLimit,
      includeGlobal: filterIncludeGlobal,
      includeUnknown: filterIncludeUnknown,
    });
    loading = false;
  }

  function applyFilters() {
    sessions.setFilters({
      activeMinutes: filterActiveMinutes,
      limit: filterLimit,
      includeGlobal: filterIncludeGlobal,
      includeUnknown: filterIncludeUnknown,
    });
    refresh();
  }

  async function fetchModels() {
    try {
      const result = await gateway.call<{ models?: Array<{ id: string; name?: string }> }>('models.list', {});
      availableModels = result?.models ?? [];
    } catch {
      // models.list may not be available — silently ignore
    }
  }

  async function changeModel(session: Session, model: string) {
    await patchSession(session.key, { model });
  }

  async function deleteSession(key: string) {
    try {
      await gateway.call('sessions.delete', { key, deleteTranscript });
      toasts.success('Deleted', 'Session removed');
      showDeleteConfirm = null;
      deleteTranscript = false;
      await refresh();
    } catch (e) {
      toasts.error('Failed', String(e));
    }
  }

  async function patchSession(key: string, patch: Record<string, unknown>) {
    patchingKey = key;
    try {
      await gateway.call('sessions.patch', { key, ...patch });
      toasts.success('Updated', 'Session settings saved');
      await refresh();
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      patchingKey = null;
    }
  }

  function startRename(session: Session) {
    renamingKey = session.key;
    renameValue = session.label ?? sessions.getSessionTitle(session);
  }

  async function submitRename(key: string) {
    if (renameValue.trim()) {
      await patchSession(key, { label: renameValue.trim() });
    }
    renamingKey = null;
    renameValue = '';
  }

  function cancelRename() {
    renamingKey = null;
    renameValue = '';
  }

  async function cycleThinking(session: Session) {
    const levels = ['off', 'on', 'stream'] as const;
    const current = session.thinkingLevel ?? 'off';
    const idx = levels.indexOf(current as typeof levels[number]);
    const next = levels[(idx + 1) % levels.length];
    await patchSession(session.key, { thinkingLevel: next });
  }

  async function toggleVerbose(session: Session) {
    const current = session.verboseLevel ?? 'off';
    const next = current === 'off' ? 'on' : 'off';
    await patchSession(session.key, { verboseLevel: next });
  }

  function openChat(key: string) {
    sessions.setActiveSession(key);
    goto('/');
  }

  function toggleSubagents(parentKey: string) {
    const next = new Set(expandedSubagents);
    if (next.has(parentKey)) {
      next.delete(parentKey);
    } else {
      next.add(parentKey);
    }
    expandedSubagents = next;
  }

  // ─── Sub-agent detail viewer ──────────────────
  async function toggleSubagentDetail(sessionKey: string) {
    const next = new Set(expandedSubagentDetails);
    if (next.has(sessionKey)) {
      next.delete(sessionKey);
      expandedSubagentDetails = next;
      return;
    }
    next.add(sessionKey);
    expandedSubagentDetails = next;
    // Fetch history if not cached
    if (!subagentHistories.has(sessionKey)) {
      await fetchSubagentHistory(sessionKey);
    }
  }

  async function fetchSubagentHistory(sessionKey: string) {
    const loadSet = new Set(subagentHistoryLoading);
    loadSet.add(sessionKey);
    subagentHistoryLoading = loadSet;
    try {
      const messages = await gateway.chatHistory(sessionKey, 50);
      const nextMap = new Map(subagentHistories);
      nextMap.set(sessionKey, messages);
      subagentHistories = nextMap;
    } catch (e) {
      console.error('Failed to fetch sub-agent history:', e);
      toasts.error('History Load Failed', String(e));
    } finally {
      const doneSet = new Set(subagentHistoryLoading);
      doneSet.delete(sessionKey);
      subagentHistoryLoading = doneSet;
    }
  }

  function getSubagentTask(messages: ChatMessage[]): string {
    // First user message is typically the task/prompt
    const first = messages.find(m => m.role === 'user');
    return first?.content ?? 'No task description available';
  }

  function getSubagentOutput(messages: ChatMessage[]): string {
    // Last assistant message is typically the result
    const assistantMsgs = messages.filter(m => m.role === 'assistant' && m.content);
    if (assistantMsgs.length === 0) return 'No output yet';
    return assistantMsgs[assistantMsgs.length - 1].content ?? 'No output yet';
  }

  function getSubagentRuntime(session: Session): string {
    const created = session.createdAt ? new Date(session.createdAt).getTime() : 0;
    const last = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() :
                 session.lastActivity ? session.lastActivity : 0;
    if (!created || !last) return '—';
    const diff = last - created;
    if (diff < 1000) return '<1s';
    if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`;
    return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
  }

  function truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '…';
  }

  function openHistoryModal(sessionKey: string) {
    showHistoryModal = sessionKey;
  }

  function closeHistoryModal() {
    showHistoryModal = null;
  }

  // ─── Session classification ──────────────────
  function getSessionType(session: Session): string {
    if (session.key.includes(':main')) return 'main';
    if (session.key.includes(':subagent:')) return 'subagent';
    return 'isolated';
  }

  function isSubagent(session: Session): boolean {
    return session.key.includes(':subagent:');
  }

  function getParentKey(session: Session): string | null {
    if (!isSubagent(session)) return null;
    const idx = session.key.indexOf(':subagent:');
    if (idx === -1) return null;
    return session.key.substring(0, idx) + ':main';
  }

  function getSubagentId(session: Session): string {
    const idx = session.key.lastIndexOf(':subagent:');
    if (idx === -1) return session.key;
    return session.key.substring(idx + ':subagent:'.length);
  }

  function getSubagentStatus(session: Session): 'active' | 'done' | 'error' | 'unknown' {
    if (session.status === 'error') return 'error';
    if (session.status === 'done' || session.status === 'completed') return 'done';
    const lastAct = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() :
                    session.lastActivity ? session.lastActivity : 0;
    if (lastAct && (Date.now() - lastAct) > 5 * 60 * 1000) return 'done';
    if (lastAct) return 'active';
    return 'unknown';
  }

  // ─── Tree view helpers ───────────────────────
  interface TreeNode {
    session: Session;
    sessionType: 'main' | 'subagent' | 'cron' | 'cron-run' | 'channel';
    children: TreeNode[];
  }

  function parseSessionType(key: string): { type: 'main' | 'subagent' | 'cron' | 'cron-run' | 'channel', parent?: string } {
    if (key.includes(':subagent:')) return { type: 'subagent', parent: key.split(':subagent:')[0] + ':main' };
    if (key.includes(':cron:') && key.includes(':run:')) return { type: 'cron-run', parent: key.split(':run:')[0] };
    if (key.includes(':cron:')) return { type: 'cron', parent: key.split(':cron:')[0] + ':main' };
    if (key.endsWith(':main')) return { type: 'main' };
    return { type: 'channel' };
  }

  function getTreeTypeColor(type: string): string {
    switch (type) {
      case 'main': return 'cyan';
      case 'subagent': return 'purple';
      case 'cron': return 'amber';
      case 'cron-run': return 'amber';
      case 'channel': return 'green';
      default: return 'cyan';
    }
  }

  function toggleTreeNode(key: string) {
    const next = new Set(collapsedTreeNodes);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedTreeNodes = next;
  }

  function expandAllTreeNodes() {
    collapsedTreeNodes = new Set();
  }

  function collapseAllTreeNodes() {
    const all = new Set<string>();
    const addKeys = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          all.add(n.session.key);
          addKeys(n.children);
        }
      }
    };
    addKeys(treeRoots);
    collapsedTreeNodes = all;
  }

  // ─── Time formatting ────────────────────────
  function formatTime(ts?: number | string): string {
    if (!ts) return 'n/a';
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatTokens(n?: number): string {
    if (!n && n !== 0) return '—';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  // ─── Export ──────────────────────────────────
  function extractContent(msg: Record<string, unknown>): string {
    const c = msg.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .filter((b: Record<string, unknown>) => b.type === 'text')
        .map((b: Record<string, unknown>) => b.text as string)
        .join('\n');
    }
    return String(c ?? '');
  }

  function toggleExportDropdown(key: string) {
    exportDropdownKey = exportDropdownKey === key ? null : key;
  }

  async function exportSession(sessionKey: string, format: 'md' | 'json') {
    exportDropdownKey = null;
    exportingKey = sessionKey;
    try {
      const res = await gateway.call<Record<string, unknown>>('chat.history', { sessionKey, limit: 1000 });
      const messages: Array<Record<string, unknown>> = (res?.messages ?? res?.transcript ?? []) as Array<Record<string, unknown>>;

      if (messages.length === 0) {
        toasts.error('Export', 'No messages found in this session');
        return;
      }

      if (format === 'json') {
        const json = JSON.stringify(messages, null, 2);
        const safeName = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        downloadFile(json, `session_${safeName}.json`, 'application/json');
        toasts.success('Exported', `${messages.length} messages as JSON`);
      } else {
        const date = new Date().toISOString();
        let md = `# Session: ${sessionKey}\nExported: ${date}\n\n---\n\n`;
        for (const msg of messages) {
          const role = String(msg.role ?? 'unknown');
          const heading = role === 'user' ? 'User' : role === 'assistant' ? 'Assistant' : role.charAt(0).toUpperCase() + role.slice(1);
          const content = extractContent(msg);
          md += `## ${heading}\n\n${content}\n\n---\n\n`;
        }
        const safeName = sessionKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        downloadFile(md, `session_${safeName}.md`, 'text/markdown');
        toasts.success('Exported', `${messages.length} messages as Markdown`);
      }
    } catch (e) {
      toasts.error('Export failed', String(e));
    } finally {
      exportingKey = null;
    }
  }

  function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── Computed ────────────────────────────────
  let parentSessions = $derived.by(() => {
    return sessions.list.filter((s: Session) => !isSubagent(s));
  });

  let subagentMap = $derived.by(() => {
    const map = new Map<string, Session[]>();
    for (const s of sessions.list) {
      if (isSubagent(s)) {
        const parent = getParentKey(s);
        if (parent) {
          if (!map.has(parent)) map.set(parent, []);
          map.get(parent)!.push(s);
        }
      }
    }
    return map;
  });

  let filtered = $derived.by(() => {
    let list = viewMode === 'grouped' ? parentSessions : sessions.list;

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((s: Session) =>
        sessions.getSessionTitle(s).toLowerCase().includes(q) ||
        s.key.toLowerCase().includes(q) ||
        (s.channel?.toLowerCase().includes(q) ?? false) ||
        (s.model?.toLowerCase().includes(q) ?? false) ||
        (s.agentId?.toLowerCase().includes(q) ?? false) ||
        (s.provider?.toLowerCase().includes(q) ?? false)
      );
    }

    list = [...list];

    if (sortBy === 'name') {
      list.sort((a: Session, b: Session) => sessions.getSessionTitle(a).localeCompare(sessions.getSessionTitle(b)));
    } else if (sortBy === 'channel') {
      list.sort((a: Session, b: Session) => (a.channel ?? '').localeCompare(b.channel ?? ''));
    } else if (sortBy === 'tokens') {
      list.sort((a: Session, b: Session) => (getTokenCount(b)) - (getTokenCount(a)));
    } else {
      // activity — most recent first
      list.sort((a: Session, b: Session) => {
        const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : (a.lastActivity ?? 0);
        const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : (b.lastActivity ?? 0);
        return bTime - aTime;
      });
    }

    return list;
  });

  function getTokenCount(s: Session): number {
    return s.totalTokens ?? s.tokenCount ?? 0;
  }

  let stats = $derived.by(() => {
    const all = sessions.list;
    const totalTokens = all.reduce((sum: number, s: Session) => sum + getTokenCount(s), 0);
    return {
      total: all.length,
      main: all.filter((s: Session) => s.key.includes(':main') && !s.key.includes(':subagent:')).length,
      isolated: all.filter((s: Session) => !s.key.includes(':main') && !s.key.includes(':subagent:')).length,
      subagent: all.filter((s: Session) => s.key.includes(':subagent:')).length,
      totalTokens,
    };
  });

  // ─── Tree view computed ──────────────────────
  let treeRoots = $derived.by((): TreeNode[] => {
    const allSessions = sessions.list;
    const nodeMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // Create all nodes
    for (const s of allSessions) {
      const parsed = parseSessionType(s.key);
      nodeMap.set(s.key, {
        session: s,
        sessionType: parsed.type,
        children: [],
      });
    }

    // Build parent-child relationships
    for (const s of allSessions) {
      const parsed = parseSessionType(s.key);
      const node = nodeMap.get(s.key)!;

      if (parsed.parent) {
        const parentNode = nodeMap.get(parsed.parent);
        if (parentNode) {
          parentNode.children.push(node);
          continue;
        }
      }
      // No parent or parent not in list → root node
      roots.push(node);
    }

    // Sort all levels by activity (most recent first)
    const sortByActivity = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        const aTime = a.session.lastActivityAt ? new Date(a.session.lastActivityAt).getTime() : (a.session.lastActivity ?? 0);
        const bTime = b.session.lastActivityAt ? new Date(b.session.lastActivityAt).getTime() : (b.session.lastActivity ?? 0);
        return (bTime as number) - (aTime as number);
      });
      for (const n of nodes) {
        if (n.children.length > 0) sortByActivity(n.children);
      }
    };
    sortByActivity(roots);

    // Apply search filter (keep parents if any descendant matches)
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      const matchesSearch = (node: TreeNode): boolean => {
        const s = node.session;
        const selfMatch =
          sessions.getSessionTitle(s).toLowerCase().includes(q) ||
          s.key.toLowerCase().includes(q) ||
          (s.channel?.toLowerCase().includes(q) ?? false) ||
          (s.model?.toLowerCase().includes(q) ?? false) ||
          (s.agentId?.toLowerCase().includes(q) ?? false) ||
          (s.provider?.toLowerCase().includes(q) ?? false);
        const childMatch = node.children.some(c => matchesSearch(c));
        return selfMatch || childMatch;
      };
      return roots.filter(r => matchesSearch(r));
    }

    return roots;
  });

  let treeStats = $derived.by(() => {
    let totalChildren = 0;
    const countChildren = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        totalChildren += n.children.length;
        countChildren(n.children);
      }
    };
    countChildren(treeRoots);
    return { roots: treeRoots.length, nested: totalChildren };
  });
</script>

<svelte:head>
  <title>Sessions -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- TOP BAR -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">SESSIONS</div>
    <div></div>
  </div>

  <!-- Header controls -->
  <div class="hud-header-row">
    <div class="hud-header-actions">
      <button onclick={() => showFilters = !showFilters}
        class="hud-btn {showFilters ? 'hud-btn-active' : ''}">
        FILTERS
      </button>
      <button onclick={refresh} disabled={loading || conn.state.status !== 'connected'}
        class="hud-btn">
        {#if loading}
          <svg class="hud-spin-icon" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
        {loading ? 'LOADING...' : 'REFRESH'}
      </button>
    </div>
  </div>

  <!-- Stats row -->
  <div class="hud-stats-row">
    <div class="hud-stat-card">
      <div class="hud-stat-val">{stats.total}</div>
      <div class="hud-stat-lbl">TOTAL</div>
    </div>
    <div class="hud-stat-card">
      <div class="hud-stat-val" style="color: var(--color-accent-purple)">{stats.main}</div>
      <div class="hud-stat-lbl">MAIN</div>
    </div>
    <div class="hud-stat-card">
      <div class="hud-stat-val" style="color: var(--color-accent-cyan)">{stats.isolated}</div>
      <div class="hud-stat-lbl">ISOLATED</div>
    </div>
    <div class="hud-stat-card">
      <div class="hud-stat-val" style="color: var(--color-accent-amber)">{stats.subagent}</div>
      <div class="hud-stat-lbl">SUB-AGENTS</div>
    </div>
    <div class="hud-stat-card">
      <div class="hud-stat-val" style="color: var(--color-accent-green)">{formatTokens(stats.totalTokens)}</div>
      <div class="hud-stat-lbl">TOKENS</div>
    </div>
  </div>

  <!-- Filter panel (collapsible) -->
  {#if showFilters}
    <div class="hud-panel hud-filter-panel">
      <div class="hud-panel-lbl">FILTER PARAMETERS</div>
      <div class="hud-filter-grid">
        <div class="hud-filter-field">
          <label class="hud-field-lbl">ACTIVE MINUTES (0=ALL)</label>
          <input type="number" bind:value={filterActiveMinutes} min="0" step="1" class="hud-input" />
        </div>
        <div class="hud-filter-field">
          <label class="hud-field-lbl">LIMIT</label>
          <input type="number" bind:value={filterLimit} min="1" max="500" step="1" class="hud-input" />
        </div>
        <div class="hud-filter-field">
          <label class="hud-checkbox-lbl">
            <input type="checkbox" bind:checked={filterIncludeGlobal} class="hud-checkbox" />
            INCLUDE GLOBAL
          </label>
          <label class="hud-checkbox-lbl">
            <input type="checkbox" bind:checked={filterIncludeUnknown} class="hud-checkbox" />
            INCLUDE UNKNOWN
          </label>
        </div>
        <div class="hud-filter-field" style="display:flex;align-items:flex-end">
          <button onclick={applyFilters} class="hud-btn hud-btn-primary" style="width:100%">
            APPLY FILTERS
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Search + Sort + View Toggle -->
  <div class="hud-toolbar">
    <div class="hud-search-wrap">
      <svg class="hud-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input type="text" bind:value={searchQuery} placeholder="Search sessions..."
        class="hud-search" />
    </div>
    <select bind:value={sortBy} class="hud-select">
      <option value="activity">SORT: ACTIVITY</option>
      <option value="name">SORT: NAME</option>
      <option value="channel">SORT: CHANNEL</option>
      <option value="tokens">SORT: TOKENS</option>
    </select>

    <!-- Display mode: List / Tree -->
    <div class="hud-toggle-group">
      <button onclick={() => displayMode = 'list'}
        class="hud-toggle-btn {displayMode === 'list' ? 'active' : ''}">
        LIST
      </button>
      <button onclick={() => displayMode = 'tree'}
        class="hud-toggle-btn {displayMode === 'tree' ? 'active purple' : ''}">
        TREE
      </button>
    </div>

    <!-- Grouped / All toggle (list mode only) -->
    {#if displayMode === 'list'}
      <div class="hud-toggle-group">
        <button onclick={() => viewMode = 'grouped'}
          class="hud-toggle-btn {viewMode === 'grouped' ? 'active' : ''}">
          GROUPED
        </button>
        <button onclick={() => viewMode = 'all'}
          class="hud-toggle-btn {viewMode === 'all' ? 'active' : ''}">
          ALL
        </button>
      </div>
    {:else}
      <!-- Tree view controls -->
      <div class="hud-tree-controls">
        <button onclick={expandAllTreeNodes} class="hud-btn-sm" title="Expand all">
          <svg class="hud-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button onclick={collapseAllTreeNodes} class="hud-btn-sm" title="Collapse all">
          <svg class="hud-icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <span class="hud-tree-stats">
          {treeStats.roots} roots // {treeStats.nested} nested
        </span>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="hud-content">
    {#if conn.state.status !== 'connected'}
      <div class="hud-empty">
        <div class="hud-empty-text">GATEWAY OFFLINE -- CONNECT TO VIEW SESSIONS</div>
      </div>

    {:else if loading && sessions.list.length === 0}
      <div class="hud-loading-list">
        {#each Array(4) as _}
          <div class="hud-panel hud-skeleton"></div>
        {/each}
      </div>

    {:else if displayMode === 'list' && filtered.length === 0}
      <div class="hud-empty">
        <div class="hud-empty-text">
          {searchQuery ? 'NO SESSIONS MATCH QUERY' : 'NO SESSIONS FOUND'}
        </div>
      </div>

    {:else if displayMode === 'tree' && treeRoots.length === 0}
      <div class="hud-empty">
        <div class="hud-empty-text">
          {searchQuery ? 'NO SESSIONS MATCH QUERY' : 'NO SESSIONS FOUND'}
        </div>
      </div>

    {:else if displayMode === 'tree'}
      <!-- TREE VIEW -->
      {#snippet treeNodeCard(node: TreeNode, depth: number)}
        {@const session = node.session}
        {@const type = node.sessionType}
        {@const tokens = getTokenCount(session)}
        {@const isPatching = patchingKey === session.key}
        {@const isExpanded = !collapsedTreeNodes.has(session.key)}
        {@const hasChildren = node.children.length > 0}
        {@const color = getTreeTypeColor(type)}

        <div class="hud-tree-node">
          <!-- Node card -->
          <div class="hud-session-card hud-border-{color}">
            <div class="hud-session-body">
              <div class="hud-session-main">
                <!-- Expand/collapse toggle -->
                {#if hasChildren}
                  <button onclick={() => toggleTreeNode(session.key)}
                    class="hud-expand-btn hud-color-{color}">
                    <svg class="hud-icon-sm {isExpanded ? 'rotated' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {:else}
                  <div class="hud-tree-dot">
                    <span class="hud-dot-sm hud-dot-{color}"></span>
                  </div>
                {/if}

                <!-- Info section -->
                <div class="hud-session-info">
                  <!-- Title row -->
                  <div class="hud-session-title-row">
                    {#if renamingKey === session.key}
                      <form class="hud-rename-form" onsubmit={(e) => { e.preventDefault(); submitRename(session.key); }}>
                        <input type="text" bind:value={renameValue} autofocus class="hud-input hud-input-sm" />
                        <button type="submit" class="hud-btn-inline">SAVE</button>
                        <button type="button" onclick={cancelRename} class="hud-btn-inline muted">CANCEL</button>
                      </form>
                    {:else}
                      <span class="hud-session-name {depth === 0 ? 'primary' : ''}">
                        {sessions.getSessionTitle(session)}
                      </span>
                      <button onclick={() => startRename(session)} class="hud-btn-icon" title="Rename">
                        <svg class="hud-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    {/if}
                    <!-- Type badge -->
                    <span class="hud-badge hud-badge-{color}">{type}</span>
                    <!-- Channel badge -->
                    {#if session.channel}
                      <span class="hud-badge hud-badge-muted">{session.channel}</span>
                    {/if}
                    <!-- Agent badge -->
                    {#if session.agentId}
                      <span class="hud-badge hud-badge-purple">{session.agentId}</span>
                    {/if}
                    <!-- Child count badge -->
                    {#if hasChildren}
                      <span class="hud-badge hud-badge-{color}">
                        {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
                      </span>
                    {/if}
                  </div>

                  <!-- Model + Provider + Tokens row -->
                  <div class="hud-session-meta">
                    {#if session.model}
                      <span class="hud-badge hud-badge-purple">{session.model}</span>
                    {/if}
                    {#if session.provider}
                      <span class="hud-badge hud-badge-muted">{session.provider}</span>
                    {/if}
                    {#if tokens > 0}
                      <span class="hud-badge hud-badge-green">{formatTokens(tokens)} tokens</span>
                    {/if}
                  </div>

                  <!-- Last message preview -->
                  {#if session.lastMessage}
                    <p class="hud-session-preview">{session.lastMessage}</p>
                  {/if}

                  <!-- Bottom info row -->
                  <div class="hud-session-footer">
                    <span class="hud-session-time">{formatTime(session.lastActivityAt ?? session.lastActivity)}</span>
                    <span class="hud-session-key" title={session.key}>{session.key}</span>
                  </div>
                </div>

                <!-- Right: Controls -->
                <div class="hud-session-controls">
                  <!-- Thinking / Verbose controls -->
                  <div class="hud-control-row">
                    <button onclick={() => cycleThinking(session)} disabled={isPatching}
                      class="hud-ctrl-btn {session.thinkingLevel === 'stream' ? 'hud-ctrl-cyan' : session.thinkingLevel === 'on' ? 'hud-ctrl-purple' : ''}"
                      title="Thinking: {session.thinkingLevel ?? 'off'} (click to cycle)">
                      T:{session.thinkingLevel ?? 'off'}
                    </button>
                    <button onclick={() => toggleVerbose(session)} disabled={isPatching}
                      class="hud-ctrl-btn {session.verboseLevel === 'on' ? 'hud-ctrl-green' : ''}"
                      title="Verbose: {session.verboseLevel ?? 'off'} (click to toggle)">
                      V:{session.verboseLevel ?? 'off'}
                    </button>
                    {#if session.reasoningLevel && session.reasoningLevel !== 'off'}
                      <span class="hud-ctrl-btn hud-ctrl-amber">R:{session.reasoningLevel}</span>
                    {/if}
                  </div>

                  <!-- Model override selector -->
                  {#if availableModels.length > 0}
                    <select
                      value={session.model || 'default'}
                      onchange={(e) => changeModel(session, e.currentTarget.value)}
                      disabled={isPatching}
                      class="hud-select hud-select-sm"
                      title="Override model for this session">
                      <option value="default">MODEL: DEFAULT</option>
                      {#each availableModels as model}
                        <option value={model.id}>{model.name || model.id}</option>
                      {/each}
                    </select>
                  {/if}

                  <!-- Action buttons -->
                  <div class="hud-control-row">
                    <button onclick={() => openChat(session.key)} class="hud-btn-sm hud-btn-cyan" title="Open in chat">
                      CHAT
                    </button>
                    <button onclick={() => { showDeleteConfirm = showDeleteConfirm === session.key ? null : session.key; deleteTranscript = false; }}
                      class="hud-btn-sm hud-btn-danger" title="Delete session">
                      DEL
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Delete confirmation -->
            {#if showDeleteConfirm === session.key}
              <div class="hud-delete-confirm">
                <span class="hud-delete-warn">DELETE THIS SESSION PERMANENTLY?</span>
                <label class="hud-checkbox-lbl">
                  <input type="checkbox" bind:checked={deleteTranscript} class="hud-checkbox" />
                  + TRANSCRIPT
                </label>
                <button onclick={() => deleteSession(session.key)} class="hud-btn-sm hud-btn-danger">CONFIRM</button>
                <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }} class="hud-btn-sm">CANCEL</button>
              </div>
            {/if}
          </div>

          <!-- Children (recursive) -->
          {#if hasChildren && isExpanded}
            <div class="hud-tree-children hud-tree-line-{color}">
              {#each node.children as child (child.session.key)}
                {@render treeNodeCard(child, depth + 1)}
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}

      <div class="hud-session-list">
        {#each treeRoots as root (root.session.key)}
          {@render treeNodeCard(root, 0)}
        {/each}
      </div>

    {:else}
      <!-- LIST VIEW -->
      {#if filtered.length === 0}
        <div class="hud-empty">
          <div class="hud-empty-text">
            {searchQuery ? 'NO SESSIONS MATCH QUERY' : 'NO SESSIONS FOUND'}
          </div>
        </div>
      {:else}
        <div class="hud-session-list">
          {#each filtered as session, i (session.key)}
            {@const type = getSessionType(session)}
            {@const subs = subagentMap.get(session.key) ?? []}
            {@const tokens = getTokenCount(session)}
            {@const isPatching = patchingKey === session.key}

            <div class="hud-session-card" style="animation-delay: {i * 30}ms">
              <!-- Main card content -->
              <div class="hud-session-body">
                <div class="hud-session-main">
                  <!-- Left: Info -->
                  <div class="hud-session-info">
                    <!-- Title row -->
                    <div class="hud-session-title-row">
                      {#if renamingKey === session.key}
                        <form class="hud-rename-form" onsubmit={(e) => { e.preventDefault(); submitRename(session.key); }}>
                          <input type="text" bind:value={renameValue} autofocus class="hud-input hud-input-sm" />
                          <button type="submit" class="hud-btn-inline">SAVE</button>
                          <button type="button" onclick={cancelRename} class="hud-btn-inline muted">CANCEL</button>
                        </form>
                      {:else}
                        <span class="hud-session-name">{sessions.getSessionTitle(session)}</span>
                        <button onclick={() => startRename(session)} class="hud-btn-icon" title="Rename">
                          <svg class="hud-icon-xs" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      {/if}
                      <!-- Type badge -->
                      <span class="hud-badge {type === 'main' ? 'hud-badge-purple' : type === 'subagent' ? 'hud-badge-amber' : 'hud-badge-cyan'}">
                        {type}
                      </span>
                      <!-- Channel badge -->
                      {#if session.channel}
                        <span class="hud-badge hud-badge-muted">{session.channel}</span>
                      {/if}
                      <!-- Agent badge -->
                      {#if session.agentId}
                        <span class="hud-badge hud-badge-purple">{session.agentId}</span>
                      {/if}
                      <!-- Subagent count -->
                      {#if viewMode === 'grouped' && subs.length > 0}
                        <button onclick={() => toggleSubagents(session.key)}
                          class="hud-badge hud-badge-amber hud-badge-btn">
                          <svg class="hud-icon-xs {expandedSubagents.has(session.key) ? 'rotated' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                          </svg>
                          {subs.length} sub-agent{subs.length !== 1 ? 's' : ''}
                        </button>
                      {/if}
                    </div>

                    <!-- Model + Provider row -->
                    <div class="hud-session-meta">
                      {#if session.model}
                        <span class="hud-badge hud-badge-purple">{session.model}</span>
                      {/if}
                      {#if session.provider}
                        <span class="hud-badge hud-badge-muted">{session.provider}</span>
                      {/if}
                      {#if tokens > 0}
                        <span class="hud-badge hud-badge-green">{formatTokens(tokens)} tokens</span>
                      {/if}
                    </div>

                    <!-- Last message preview -->
                    {#if session.lastMessage}
                      <p class="hud-session-preview">{session.lastMessage}</p>
                    {/if}

                    <!-- Bottom info row -->
                    <div class="hud-session-footer">
                      <span class="hud-session-time">{formatTime(session.lastActivityAt ?? session.lastActivity)}</span>
                      <span class="hud-session-key" title={session.key}>{session.key}</span>
                    </div>
                  </div>

                  <!-- Right: Controls -->
                  <div class="hud-session-controls">
                    <!-- Thinking / Verbose controls -->
                    <div class="hud-control-row">
                      <button onclick={() => cycleThinking(session)} disabled={isPatching}
                        class="hud-ctrl-btn {session.thinkingLevel === 'stream' ? 'hud-ctrl-cyan' : session.thinkingLevel === 'on' ? 'hud-ctrl-purple' : ''}"
                        title="Thinking: {session.thinkingLevel ?? 'off'} (click to cycle)">
                        T:{session.thinkingLevel ?? 'off'}
                      </button>
                      <button onclick={() => toggleVerbose(session)} disabled={isPatching}
                        class="hud-ctrl-btn {session.verboseLevel === 'on' ? 'hud-ctrl-green' : ''}"
                        title="Verbose: {session.verboseLevel ?? 'off'} (click to toggle)">
                        V:{session.verboseLevel ?? 'off'}
                      </button>
                      {#if session.reasoningLevel && session.reasoningLevel !== 'off'}
                        <span class="hud-ctrl-btn hud-ctrl-amber">R:{session.reasoningLevel}</span>
                      {/if}
                    </div>

                    <!-- Model override selector -->
                    {#if availableModels.length > 0}
                      <select
                        value={session.model || 'default'}
                        onchange={(e) => changeModel(session, e.currentTarget.value)}
                        disabled={isPatching}
                        class="hud-select hud-select-sm"
                        title="Override model for this session">
                        <option value="default">MODEL: DEFAULT</option>
                        {#each availableModels as model}
                          <option value={model.id}>{model.name || model.id}</option>
                        {/each}
                      </select>
                    {/if}

                    <!-- Action buttons -->
                    <div class="hud-control-row">
                      <button onclick={() => openChat(session.key)} class="hud-btn-sm hud-btn-cyan" title="Open in chat">
                        CHAT
                      </button>
                      <button onclick={() => { showDeleteConfirm = showDeleteConfirm === session.key ? null : session.key; deleteTranscript = false; }}
                        class="hud-btn-sm hud-btn-danger" title="Delete session">
                        DEL
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Delete confirmation -->
              {#if showDeleteConfirm === session.key}
                <div class="hud-delete-confirm">
                  <span class="hud-delete-warn">DELETE THIS SESSION PERMANENTLY?</span>
                  <label class="hud-checkbox-lbl">
                    <input type="checkbox" bind:checked={deleteTranscript} class="hud-checkbox" />
                    + TRANSCRIPT
                  </label>
                  <button onclick={() => deleteSession(session.key)} class="hud-btn-sm hud-btn-danger">CONFIRM</button>
                  <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }} class="hud-btn-sm">CANCEL</button>
                </div>
              {/if}

              <!-- Sub-agent expansion -->
              {#if viewMode === 'grouped' && expandedSubagents.has(session.key) && subs.length > 0}
                <div class="hud-subagent-section">
                  <div class="hud-panel-lbl">SUB-AGENTS ({subs.length})</div>
                  <div class="hud-subagent-list">
                    {#each subs as sub (sub.key)}
                      {@const subStatus = getSubagentStatus(sub)}
                      {@const subTokens = getTokenCount(sub)}
                      <div class="hud-subagent-card">
                        <div class="hud-subagent-main">
                          <div class="hud-subagent-info">
                            <div class="hud-subagent-title-row">
                              <!-- Status indicator -->
                              <span class="hud-status-dot {subStatus}"></span>
                              <span class="hud-subagent-name">
                                {sub.label || getSubagentId(sub)}
                              </span>
                              <span class="hud-badge hud-badge-{subStatus === 'active' ? 'green' : subStatus === 'done' ? 'cyan' : subStatus === 'error' ? 'danger' : 'muted'}">
                                {subStatus}
                              </span>
                            </div>
                            {#if sub.lastMessage}
                              <p class="hud-session-preview">{sub.lastMessage}</p>
                            {/if}
                            <div class="hud-session-footer">
                              {#if sub.model}
                                <span>{sub.model}</span>
                              {/if}
                              {#if subTokens > 0}
                                <span>{formatTokens(subTokens)} tokens</span>
                              {/if}
                              <span>{formatTime(sub.lastActivityAt ?? sub.lastActivity)}</span>
                            </div>
                          </div>
                          <div class="hud-control-row">
                            <button onclick={() => openChat(sub.key)} class="hud-btn-sm hud-btn-cyan">CHAT</button>
                            <button onclick={() => { showDeleteConfirm = showDeleteConfirm === sub.key ? null : sub.key; deleteTranscript = false; }}
                              class="hud-btn-sm hud-btn-danger">DEL</button>
                          </div>
                        </div>

                        {#if showDeleteConfirm === sub.key}
                          <div class="hud-delete-confirm">
                            <span class="hud-delete-warn">DELETE?</span>
                            <label class="hud-checkbox-lbl">
                              <input type="checkbox" bind:checked={deleteTranscript} class="hud-checkbox" />
                              + TRANSCRIPT
                            </label>
                            <button onclick={() => deleteSession(sub.key)} class="hud-btn-sm hud-btn-danger">CONFIRM</button>
                            <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }} class="hud-btn-sm">CANCEL</button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════
     HUD PAGE LAYOUT
  ═══════════════════════════════════════════════ */
  .hud-page {
    position: relative; z-index: 10; width: 100%; height: 100%;
    display: flex; flex-direction: column; padding: 18px 22px; gap: 14px;
    overflow-y: auto; font-family: 'Share Tech Mono', monospace; color: var(--color-accent-cyan);
  }
  .hud-page-topbar {
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-bottom: 9px; flex-shrink: 0;
  }
  .hud-back {
    font-size: 0.72rem; letter-spacing: 0.15em; color: var(--color-accent-cyan);
    text-decoration: none; transition: opacity 0.2s;
  }
  .hud-back:hover { opacity: 0.7; }
  .hud-page-title {
    font-family: 'Orbitron', sans-serif; font-size: 1.1rem; font-weight: 700;
    letter-spacing: 0.25em; color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
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
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }
  .hud-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .hud-btn-active {
    border-color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  .hud-btn-primary {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }
  .hud-btn-primary:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  /* ─── HEADER ─── */
  .hud-header-row {
    display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0;
  }
  .hud-header-actions {
    display: flex; align-items: center; gap: 8px;
  }

  /* ─── STATS ROW ─── */
  .hud-stats-row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    flex-shrink: 0;
  }
  @media (max-width: 767px) {
    .hud-stats-row { grid-template-columns: repeat(3, 1fr); }
  }
  .hud-stat-card {
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 3px;
    padding: 10px 12px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .hud-stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }
  .hud-stat-val {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.2rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    line-height: 1;
  }
  .hud-stat-lbl {
    font-size: 0.75rem;
    letter-spacing: 0.25em;
    color: var(--color-text-muted);
    margin-top: 4px;
  }

  /* ─── FILTER PANEL ─── */
  .hud-filter-panel { margin-top: 0; }
  .hud-filter-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  @media (max-width: 767px) {
    .hud-filter-grid { grid-template-columns: repeat(2, 1fr); }
  }
  .hud-filter-field { display: flex; flex-direction: column; gap: 6px; }
  .hud-field-lbl {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: var(--color-text-muted);
  }
  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s;
  }
  .hud-input:focus {
    border-color: var(--color-accent-cyan);
  }
  .hud-input-sm { padding: 3px 8px; font-size: 0.72rem; }
  .hud-checkbox-lbl {
    display: flex; align-items: center; gap: 6px;
    font-size: 0.68rem; letter-spacing: 0.1em;
    color: var(--color-text-muted); cursor: pointer;
  }
  .hud-checkbox {
    accent-color: var(--color-accent-cyan);
  }

  /* ─── TOOLBAR ─── */
  .hud-toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex-shrink: 0;
    padding-bottom: 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  .hud-search-wrap {
    position: relative; flex: 1; min-width: 180px;
  }
  .hud-search-icon {
    position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
    width: 14px; height: 14px; color: var(--color-text-muted);
  }
  .hud-search {
    width: 100%;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    padding: 6px 10px 6px 28px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s;
  }
  .hud-search::placeholder { color: var(--color-text-muted); }
  .hud-search:focus { border-color: var(--color-accent-cyan); }

  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    color: var(--color-accent-cyan);
    outline: none;
    cursor: pointer;
  }
  .hud-select-sm { font-size: 0.65rem; padding: 3px 8px; max-width: 200px; }

  .hud-toggle-group {
    display: flex;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }
  .hud-toggle-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    padding: 5px 10px;
    border: none;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-toggle-btn:hover { color: var(--color-accent-cyan); }
  .hud-toggle-btn.active {
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    color: var(--color-accent-cyan);
  }
  .hud-toggle-btn.active.purple {
    background: color-mix(in srgb, var(--color-accent-purple) 12%, transparent);
    color: var(--color-accent-purple);
  }

  .hud-tree-controls {
    display: flex; align-items: center; gap: 6px;
  }
  .hud-tree-stats {
    font-size: 0.75rem; letter-spacing: 0.12em; color: var(--color-text-muted);
  }

  /* ─── CONTENT ─── */
  .hud-content {
    flex: 1; overflow-y: auto; min-height: 0;
  }
  .hud-empty {
    display: flex; align-items: center; justify-content: center;
    height: 200px;
  }
  .hud-empty-text {
    font-size: 0.78rem; letter-spacing: 0.2em; color: var(--color-text-muted);
  }
  .hud-loading-list {
    display: flex; flex-direction: column; gap: 10px;
  }
  .hud-skeleton {
    min-height: 80px;
    animation: hud-pulse 1.5s ease-in-out infinite;
  }

  /* ─── SESSION CARDS ─── */
  .hud-session-list {
    display: flex; flex-direction: column; gap: 10px;
  }
  .hud-session-card {
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 3px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s;
    animation: hud-fade-in 0.3s ease-out both;
  }
  .hud-session-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }
  .hud-session-card:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* Border color variants */
  .hud-border-cyan { border-color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent); }
  .hud-border-cyan:hover { border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-border-purple { border-color: color-mix(in srgb, var(--color-accent-purple) 25%, transparent); }
  .hud-border-purple:hover { border-color: color-mix(in srgb, var(--color-accent-purple) 50%, transparent); }
  .hud-border-amber { border-color: color-mix(in srgb, var(--color-accent-amber) 25%, transparent); }
  .hud-border-amber:hover { border-color: color-mix(in srgb, var(--color-accent-amber) 50%, transparent); }
  .hud-border-green { border-color: color-mix(in srgb, var(--color-accent-green) 25%, transparent); }
  .hud-border-green:hover { border-color: color-mix(in srgb, var(--color-accent-green) 50%, transparent); }

  .hud-session-body { padding: 14px 16px; }
  .hud-session-main {
    display: flex; align-items: flex-start; gap: 14px;
  }
  .hud-session-info { flex: 1; min-width: 0; }
  .hud-session-title-row {
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;
  }
  .hud-session-name {
    font-size: 0.82rem;
    color: var(--color-accent-cyan);
    letter-spacing: 0.04em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 300px;
  }
  .hud-session-name.primary {
    font-size: 0.88rem;
    font-weight: 600;
  }
  .hud-session-meta {
    display: flex; align-items: center; gap: 6px; margin-bottom: 6px; flex-wrap: wrap;
  }
  .hud-session-preview {
    font-size: 0.68rem;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 500px;
    margin-bottom: 6px;
  }
  .hud-session-footer {
    display: flex; align-items: center; gap: 10px;
    font-size: 0.65rem; color: var(--color-text-muted);
  }
  .hud-session-time { letter-spacing: 0.08em; }
  .hud-session-key {
    font-size: 0.58rem;
    color: color-mix(in srgb, var(--color-text-muted) 50%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 250px;
  }

  /* ─── CONTROLS ─── */
  .hud-session-controls {
    display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0;
  }
  .hud-control-row {
    display: flex; align-items: center; gap: 4px;
  }
  .hud-ctrl-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    padding: 3px 8px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-ctrl-btn:hover:not(:disabled) { color: var(--color-accent-cyan); border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-ctrl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .hud-ctrl-cyan {
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  .hud-ctrl-purple {
    background: color-mix(in srgb, var(--color-accent-purple) 12%, transparent);
    color: var(--color-accent-purple);
    border-color: color-mix(in srgb, var(--color-accent-purple) 35%, transparent);
  }
  .hud-ctrl-green {
    background: color-mix(in srgb, var(--color-accent-green) 12%, transparent);
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 35%, transparent);
  }
  .hud-ctrl-amber {
    background: color-mix(in srgb, var(--color-accent-amber) 12%, transparent);
    color: var(--color-accent-amber);
    border-color: color-mix(in srgb, var(--color-accent-amber) 35%, transparent);
  }

  /* ─── SMALL BUTTONS ─── */
  .hud-btn-sm {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-btn-sm:hover { color: var(--color-accent-cyan); border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-btn-cyan {
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }
  .hud-btn-cyan:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }
  .hud-btn-danger {
    color: #ff3864;
    border-color: color-mix(in srgb, #ff3864 30%, transparent);
  }
  .hud-btn-danger:hover {
    background: color-mix(in srgb, #ff3864 10%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, #ff3864 20%, transparent);
  }

  .hud-btn-icon {
    padding: 2px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color 0.2s;
  }
  .hud-btn-icon:hover { color: var(--color-accent-cyan); }

  .hud-btn-inline {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-accent-cyan);
    cursor: pointer;
  }
  .hud-btn-inline.muted { color: var(--color-text-muted); }
  .hud-btn-inline:hover { opacity: 0.7; }

  /* ─── BADGES ─── */
  .hud-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    border-radius: 2px;
    color: color-mix(in srgb, var(--color-accent-cyan) 65%, transparent);
    text-transform: uppercase;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .hud-badge-cyan {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    color: var(--color-accent-cyan);
  }
  .hud-badge-purple {
    border-color: color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
    color: var(--color-accent-purple);
  }
  .hud-badge-amber {
    border-color: color-mix(in srgb, var(--color-accent-amber) 30%, transparent);
    color: var(--color-accent-amber);
  }
  .hud-badge-green {
    border-color: color-mix(in srgb, var(--color-accent-green) 30%, transparent);
    color: var(--color-accent-green);
  }
  .hud-badge-danger {
    border-color: color-mix(in srgb, #ff3864 30%, transparent);
    color: #ff3864;
  }
  .hud-badge-muted {
    border-color: color-mix(in srgb, var(--color-text-muted) 25%, transparent);
    color: var(--color-text-muted);
  }
  .hud-badge-btn {
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
  }
  .hud-badge-btn:hover {
    background: color-mix(in srgb, var(--color-accent-amber) 10%, transparent);
  }

  /* ─── DELETE CONFIRM ─── */
  .hud-delete-confirm {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 16px;
    border-top: 1px solid color-mix(in srgb, #ff3864 15%, transparent);
    background: color-mix(in srgb, #ff3864 3%, transparent);
  }
  .hud-delete-warn {
    font-size: 0.62rem; letter-spacing: 0.12em; color: #ff3864;
  }

  /* ─── RENAME FORM ─── */
  .hud-rename-form {
    display: flex; align-items: center; gap: 8px;
  }

  /* ─── TREE VIEW ─── */
  .hud-tree-node { }
  .hud-tree-children {
    margin-left: 20px;
    padding-left: 14px;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-left: 2px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
  }
  .hud-tree-line-cyan { border-left-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-tree-line-purple { border-left-color: color-mix(in srgb, var(--color-accent-purple) 30%, transparent); }
  .hud-tree-line-amber { border-left-color: color-mix(in srgb, var(--color-accent-amber) 30%, transparent); }
  .hud-tree-line-green { border-left-color: color-mix(in srgb, var(--color-accent-green) 30%, transparent); }

  .hud-expand-btn {
    padding: 3px;
    border: none;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
    margin-top: 2px;
  }
  .hud-color-cyan { color: var(--color-accent-cyan); }
  .hud-color-purple { color: var(--color-accent-purple); }
  .hud-color-amber { color: var(--color-accent-amber); }
  .hud-color-green { color: var(--color-accent-green); }
  .hud-expand-btn:hover { opacity: 0.7; }

  .hud-tree-dot {
    width: 20px; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 2px;
  }
  .hud-dot-sm {
    width: 5px; height: 5px; border-radius: 50%;
  }
  .hud-dot-cyan { background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent); }
  .hud-dot-purple { background: color-mix(in srgb, var(--color-accent-purple) 40%, transparent); }
  .hud-dot-amber { background: color-mix(in srgb, var(--color-accent-amber) 40%, transparent); }
  .hud-dot-green { background: color-mix(in srgb, var(--color-accent-green) 40%, transparent); }

  /* ─── SUB-AGENTS ─── */
  .hud-subagent-section {
    border-top: 1px solid color-mix(in srgb, var(--color-accent-amber) 15%, transparent);
    background: color-mix(in srgb, var(--color-accent-amber) 3%, transparent);
    padding: 12px 16px;
  }
  .hud-subagent-list {
    display: flex; flex-direction: column; gap: 8px;
  }
  .hud-subagent-card {
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-amber) 18%, transparent);
    border-radius: 2px;
    padding: 10px 12px;
    margin-left: 14px;
    position: relative;
  }
  .hud-subagent-card::before {
    content: '';
    position: absolute;
    left: -14px; top: 50%;
    width: 10px; height: 1px;
    background: color-mix(in srgb, var(--color-accent-amber) 30%, transparent);
  }
  .hud-subagent-main {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  }
  .hud-subagent-info { flex: 1; min-width: 0; }
  .hud-subagent-title-row {
    display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
  }
  .hud-subagent-name {
    font-size: 0.78rem; color: var(--color-accent-cyan);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ─── STATUS DOT ─── */
  .hud-status-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .hud-status-dot.active {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
    animation: hud-pulse-dot 1.6s ease-in-out infinite;
  }
  .hud-status-dot.done { background: var(--color-accent-cyan); }
  .hud-status-dot.error { background: #ff3864; }
  .hud-status-dot.unknown { background: var(--color-text-muted); }

  /* ─── ICONS ─── */
  .hud-icon-sm { width: 14px; height: 14px; transition: transform 0.2s; }
  .hud-icon-xs { width: 12px; height: 12px; transition: transform 0.2s; }
  .hud-icon-sm.rotated, .hud-icon-xs.rotated { transform: rotate(90deg); }
  .hud-spin-icon { width: 12px; height: 12px; animation: hud-spin 1s linear infinite; }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-fade-in {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes hud-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }
  @keyframes hud-pulse-dot {
    0%, 100% { opacity: 1; box-shadow: 0 0 6px var(--color-accent-green); }
    50% { opacity: 0.3; box-shadow: none; }
  }
  @keyframes hud-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
