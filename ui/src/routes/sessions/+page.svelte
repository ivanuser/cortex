<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway, type Session, type ChatMessage } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions, type SessionFilters } from '$lib/stores/sessions.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { goto } from '$app/navigation';

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
    // e.g. "agent:main:subagent:abc123" → parent is "agent:main:main"
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
    // Heuristic: if last activity > 5 minutes ago, likely done
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
  <title>Sessions — Cortex</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <div>
          <h1 class="text-xl font-bold text-text-primary glow-text-cyan">Sessions</h1>
          <p class="text-sm text-text-muted">Inspect, control, and manage active sessions</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <button onclick={() => showFilters = !showFilters}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-all
                 {showFilters ? 'border-accent-cyan/50 text-accent-cyan bg-accent-cyan/10' : 'border-border-default text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 bg-bg-tertiary'}">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
        </button>
        <button onclick={refresh} disabled={loading || conn.state.status !== 'connected'}
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          <svg class="w-4 h-4 {loading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4">
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-text-primary font-mono">{stats.total}</div>
        <div class="text-xs text-text-muted">Total</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-purple font-mono">{stats.main}</div>
        <div class="text-xs text-text-muted">Main</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-cyan font-mono">{stats.isolated}</div>
        <div class="text-xs text-text-muted">Isolated</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-amber font-mono">{stats.subagent}</div>
        <div class="text-xs text-text-muted">Sub-agents</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-green font-mono">{formatTokens(stats.totalTokens)}</div>
        <div class="text-xs text-text-muted">Tokens</div>
      </div>
    </div>

    <!-- Filter panel (collapsible) -->
    {#if showFilters}
      <div class="mt-4 rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-fade-in">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label class="block text-xs text-text-muted mb-1">Active Minutes (0=all)</label>
            <input type="number" bind:value={filterActiveMinutes} min="0" step="1"
              class="w-full px-3 py-1.5 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan transition-all" />
          </div>
          <div>
            <label class="block text-xs text-text-muted mb-1">Limit</label>
            <input type="number" bind:value={filterLimit} min="1" max="500" step="1"
              class="w-full px-3 py-1.5 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan transition-all" />
          </div>
          <div class="flex flex-col justify-end gap-2">
            <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input type="checkbox" bind:checked={filterIncludeGlobal}
                class="rounded border-border-default bg-bg-tertiary text-accent-cyan focus:ring-accent-cyan/30" />
              Include Global
            </label>
            <label class="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input type="checkbox" bind:checked={filterIncludeUnknown}
                class="rounded border-border-default bg-bg-tertiary text-accent-cyan focus:ring-accent-cyan/30" />
              Include Unknown
            </label>
          </div>
          <div class="flex items-end">
            <button onclick={applyFilters}
              class="w-full px-3 py-1.5 text-sm rounded-lg bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/20 transition-all">
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <!-- Search + Sort + View Toggle -->
  <div class="flex-shrink-0 px-4 md:px-6 py-3 border-b border-border-default/50">
    <div class="flex gap-3 items-center flex-wrap">
      <div class="relative flex-1">
        <input type="text" bind:value={searchQuery} placeholder="Search sessions by name, key, channel, model, agent..."
          class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary
                 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan transition-all" />
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <select bind:value={sortBy}
        class="px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-secondary">
        <option value="activity">Sort: Activity</option>
        <option value="name">Sort: Name</option>
        <option value="channel">Sort: Channel</option>
        <option value="tokens">Sort: Tokens</option>
      </select>

      <!-- Display mode: List / Tree -->
      <div class="flex rounded-lg border border-border-default overflow-hidden">
        <button onclick={() => displayMode = 'list'}
          class="px-3 py-2 text-xs transition-all flex items-center gap-1.5
                 {displayMode === 'list' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          List
        </button>
        <button onclick={() => displayMode = 'tree'}
          class="px-3 py-2 text-xs transition-all flex items-center gap-1.5
                 {displayMode === 'tree' ? 'bg-accent-purple/10 text-accent-purple' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'}">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h2v16H3zM9 4h2v8H9zM15 8h2v12h-2zM21 4h2v6h-2z" />
          </svg>
          Tree
        </button>
      </div>

      <!-- Grouped / All toggle (list mode only) -->
      {#if displayMode === 'list'}
        <div class="flex rounded-lg border border-border-default overflow-hidden">
          <button onclick={() => viewMode = 'grouped'}
            class="px-3 py-2 text-xs transition-all {viewMode === 'grouped' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'}">
            Grouped
          </button>
          <button onclick={() => viewMode = 'all'}
            class="px-3 py-2 text-xs transition-all {viewMode === 'all' ? 'bg-accent-cyan/10 text-accent-cyan' : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'}">
            All
          </button>
        </div>
      {:else}
        <!-- Tree view controls -->
        <div class="flex items-center gap-1">
          <button onclick={expandAllTreeNodes}
            class="px-2 py-2 text-xs rounded-lg bg-bg-tertiary border border-border-default text-text-muted hover:text-text-secondary transition-all"
            title="Expand all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button onclick={collapseAllTreeNodes}
            class="px-2 py-2 text-xs rounded-lg bg-bg-tertiary border border-border-default text-text-muted hover:text-text-secondary transition-all"
            title="Collapse all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <span class="text-[10px] text-text-muted ml-1">
            {treeStats.roots} roots · {treeStats.nested} nested
          </span>
        </div>
      {/if}
    </div>
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
        <p class="text-text-muted text-sm">Connect to the gateway to view sessions.</p>
      </div>

    {:else if loading && sessions.list.length === 0}
      <div class="flex flex-col gap-3">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5 animate-pulse">
            <div class="h-4 w-48 bg-bg-tertiary rounded mb-3"></div>
            <div class="h-3 w-96 bg-bg-tertiary rounded mb-2"></div>
            <div class="flex gap-2">
              <div class="h-5 w-16 bg-bg-tertiary rounded-full"></div>
              <div class="h-5 w-20 bg-bg-tertiary rounded-full"></div>
              <div class="h-5 w-14 bg-bg-tertiary rounded-full"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if displayMode === 'list' && filtered.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <p class="text-text-muted text-sm">
          {searchQuery ? 'No sessions match your search.' : 'No sessions found.'}
        </p>
      </div>

    {:else if displayMode === 'tree' && treeRoots.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <p class="text-text-muted text-sm">
          {searchQuery ? 'No sessions match your search.' : 'No sessions found.'}
        </p>
      </div>

    {:else if displayMode === 'tree'}
      <!-- ═══════════════ TREE VIEW ═══════════════ -->
      {#snippet treeNodeCard(node: TreeNode, depth: number)}
        {@const session = node.session}
        {@const type = node.sessionType}
        {@const tokens = getTokenCount(session)}
        {@const isPatching = patchingKey === session.key}
        {@const isExpanded = !collapsedTreeNodes.has(session.key)}
        {@const hasChildren = node.children.length > 0}
        {@const color = getTreeTypeColor(type)}

        <div class="animate-fade-in">
          <!-- Node card -->
          <div class="rounded-xl border bg-bg-secondary/50 transition-all
                      {type === 'main' ? 'border-accent-cyan/25 hover:border-accent-cyan/50' :
                       type === 'subagent' ? 'border-accent-purple/25 hover:border-accent-purple/50' :
                       (type === 'cron' || type === 'cron-run') ? 'border-accent-amber/25 hover:border-accent-amber/50' :
                       'border-accent-green/25 hover:border-accent-green/50'}">
            <div class="p-4">
              <div class="flex items-start gap-3">
                <!-- Expand/collapse toggle -->
                {#if hasChildren}
                  <button onclick={() => toggleTreeNode(session.key)}
                    class="mt-0.5 p-1 rounded-lg hover:bg-bg-hover transition-all flex-shrink-0
                           {color === 'cyan' ? 'text-accent-cyan hover:bg-accent-cyan/10' :
                            color === 'purple' ? 'text-accent-purple hover:bg-accent-purple/10' :
                            color === 'amber' ? 'text-accent-amber hover:bg-accent-amber/10' :
                            'text-accent-green hover:bg-accent-green/10'}">
                    <svg class="w-4 h-4 transition-transform duration-200 {isExpanded ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                {:else}
                  <div class="w-6 flex-shrink-0 mt-0.5 flex items-center justify-center">
                    <span class="w-1.5 h-1.5 rounded-full
                      {color === 'cyan' ? 'bg-accent-cyan/40' :
                       color === 'purple' ? 'bg-accent-purple/40' :
                       color === 'amber' ? 'bg-accent-amber/40' :
                       'bg-accent-green/40'}"></span>
                  </div>
                {/if}

                <!-- Info section -->
                <div class="flex-1 min-w-0">
                  <!-- Title row -->
                  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    {#if renamingKey === session.key}
                      <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); submitRename(session.key); }}>
                        <input type="text" bind:value={renameValue} autofocus
                          class="px-2 py-1 text-sm rounded border border-accent-cyan/50 bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan w-48" />
                        <button type="submit" class="text-accent-cyan text-xs hover:underline">Save</button>
                        <button type="button" onclick={cancelRename} class="text-text-muted text-xs hover:text-text-secondary">Cancel</button>
                      </form>
                    {:else}
                      <span class="font-medium text-text-primary truncate max-w-[300px]
                        {depth === 0 ? 'text-base font-semibold' : 'text-sm'}">
                        {sessions.getSessionTitle(session)}
                      </span>
                      <button onclick={() => startRename(session)}
                        class="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" title="Rename">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    {/if}
                    <!-- Type badge -->
                    <span class="px-2 py-0.5 rounded text-[10px] font-medium
                      {type === 'main' ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/20' :
                       type === 'subagent' ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/20' :
                       (type === 'cron' || type === 'cron-run') ? 'bg-accent-amber/20 text-accent-amber border border-accent-amber/20' :
                       'bg-accent-green/20 text-accent-green border border-accent-green/20'}">
                      {type}
                    </span>
                    <!-- Channel badge -->
                    {#if session.channel}
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">
                        {session.channel}
                      </span>
                    {/if}
                    <!-- Agent badge -->
                    {#if session.agentId}
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-purple/10 text-purple-300 border border-accent-purple/10">
                        {session.agentId}
                      </span>
                    {/if}
                    <!-- Child count badge -->
                    {#if hasChildren}
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-bold
                        {color === 'cyan' ? 'bg-accent-cyan/15 text-accent-cyan' :
                         color === 'purple' ? 'bg-accent-purple/15 text-accent-purple' :
                         color === 'amber' ? 'bg-accent-amber/15 text-accent-amber' :
                         'bg-accent-green/15 text-accent-green'}">
                        {node.children.length} child{node.children.length !== 1 ? 'ren' : ''}
                      </span>
                    {/if}
                  </div>

                  <!-- Model + Provider + Tokens row -->
                  <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                    {#if session.model}
                      <span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-purple/10 text-purple-300 border border-accent-purple/10">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {session.model}
                      </span>
                    {/if}
                    {#if session.provider}
                      <span class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted border border-border-default">
                        {session.provider}
                      </span>
                    {/if}
                    {#if tokens > 0}
                      <span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/10">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        {formatTokens(tokens)} tokens
                      </span>
                    {/if}
                  </div>

                  <!-- Last message preview -->
                  {#if session.lastMessage}
                    <p class="text-xs text-text-muted truncate mb-1.5 max-w-[500px]">{session.lastMessage}</p>
                  {/if}

                  <!-- Bottom info row -->
                  <div class="flex items-center gap-3 text-xs text-text-muted">
                    <span class="flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatTime(session.lastActivityAt ?? session.lastActivity)}
                    </span>
                    <span class="font-mono text-text-muted/40 text-[10px] truncate max-w-[250px]" title={session.key}>
                      {session.key}
                    </span>
                  </div>
                </div>

                <!-- Right: Controls -->
                <div class="flex flex-col items-end gap-2 flex-shrink-0">
                  <!-- Thinking / Verbose controls -->
                  <div class="flex items-center gap-1">
                    <button onclick={() => cycleThinking(session)} disabled={isPatching}
                      class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                        {session.thinkingLevel === 'stream' ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 glow-cyan' :
                         session.thinkingLevel === 'on' ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/30' :
                         'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-cyan/30 hover:text-text-secondary'}"
                      title="Thinking: {session.thinkingLevel ?? 'off'} (click to cycle)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      T:{session.thinkingLevel ?? 'off'}
                    </button>
                    <button onclick={() => toggleVerbose(session)} disabled={isPatching}
                      class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                        {session.verboseLevel === 'on' ? 'bg-accent-green/15 text-accent-green border-accent-green/30' :
                         'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-green/30 hover:text-text-secondary'}"
                      title="Verbose: {session.verboseLevel ?? 'off'} (click to toggle)">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      V:{session.verboseLevel ?? 'off'}
                    </button>
                    {#if session.reasoningLevel && session.reasoningLevel !== 'off'}
                      <span class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                        R:{session.reasoningLevel}
                      </span>
                    {/if}
                  </div>

                  <!-- Model override selector -->
                  {#if availableModels.length > 0}
                    <select
                      value={session.model || 'default'}
                      onchange={(e) => changeModel(session, e.currentTarget.value)}
                      disabled={isPatching}
                      class="px-2 py-1 rounded-lg text-[11px] border border-border-default bg-bg-tertiary
                             text-text-secondary hover:border-accent-purple/40 focus:outline-none focus:border-accent-purple
                             transition-all disabled:opacity-50 max-w-[200px] cursor-pointer appearance-none
                             bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2388929e%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
                             bg-[length:12px] bg-[right_6px_center] bg-no-repeat pr-6"
                      title="Override model for this session">
                      <option value="default">🤖 Model: default</option>
                      {#each availableModels as model}
                        <option value={model.id}>{model.name || model.id}</option>
                      {/each}
                    </select>
                  {/if}

                  <!-- Action buttons -->
                  <div class="flex items-center gap-1">
                    <button onclick={() => openChat(session.key)}
                      class="px-3 py-1.5 rounded-lg text-xs border border-accent-cyan/30 text-accent-cyan
                             hover:bg-accent-cyan/10 transition-colors" title="Open in chat">
                      Chat
                    </button>
                    <button onclick={() => { showDeleteConfirm = showDeleteConfirm === session.key ? null : session.key; deleteTranscript = false; }}
                      class="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors"
                      title="Delete session">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Delete confirmation -->
            {#if showDeleteConfirm === session.key}
              <div class="px-4 pb-4">
                <div class="pt-3 border-t border-border-default flex items-center gap-3 flex-wrap">
                  <span class="text-xs text-red-400">Delete this session permanently?</span>
                  <label class="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                    <input type="checkbox" bind:checked={deleteTranscript}
                      class="rounded border-border-default bg-bg-tertiary text-red-400" />
                    Also delete transcript
                  </label>
                  <button onclick={() => deleteSession(session.key)}
                    class="px-3 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                    Confirm Delete
                  </button>
                  <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }}
                    class="px-3 py-1 rounded text-xs bg-bg-tertiary text-text-muted border border-border-default hover:text-text-secondary transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Children (recursive) -->
          {#if hasChildren && isExpanded}
            <div class="ml-6 pl-4 mt-2 space-y-2 border-l-2
              {color === 'cyan' ? 'border-accent-cyan/30' :
               color === 'purple' ? 'border-accent-purple/30' :
               color === 'amber' ? 'border-accent-amber/30' :
               'border-accent-green/30'}">
              {#each node.children as child (child.session.key)}
                {@render treeNodeCard(child, depth + 1)}
              {/each}
            </div>
          {/if}
        </div>
      {/snippet}

      <div class="flex flex-col gap-3">
        {#each treeRoots as root (root.session.key)}
          {@render treeNodeCard(root, 0)}
        {/each}
      </div>

    {:else}
      <!-- ═══════════════ LIST VIEW (original) ═══════════════ -->
      {#if filtered.length === 0}
        <div class="flex flex-col items-center justify-center h-64 text-center">
          <p class="text-text-muted text-sm">
            {searchQuery ? 'No sessions match your search.' : 'No sessions found.'}
          </p>
        </div>
      {:else}
        <div class="flex flex-col gap-3">
          {#each filtered as session, i (session.key)}
            {@const type = getSessionType(session)}
            {@const subs = subagentMap.get(session.key) ?? []}
            {@const tokens = getTokenCount(session)}
            {@const isPatching = patchingKey === session.key}

            <div class="rounded-xl border border-border-default bg-bg-secondary/50 hover:border-accent-cyan/20 transition-all animate-fade-in" style="animation-delay: {i * 30}ms">
              <!-- Main card content -->
              <div class="p-4">
                <div class="flex items-start gap-4">
                  <!-- Left: Info -->
                  <div class="flex-1 min-w-0">
                    <!-- Title row -->
                    <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                      {#if renamingKey === session.key}
                        <form class="flex items-center gap-2" onsubmit={(e) => { e.preventDefault(); submitRename(session.key); }}>
                          <input type="text" bind:value={renameValue} autofocus
                            class="px-2 py-1 text-sm rounded border border-accent-cyan/50 bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan w-48" />
                          <button type="submit" class="text-accent-cyan text-xs hover:underline">Save</button>
                          <button type="button" onclick={cancelRename} class="text-text-muted text-xs hover:text-text-secondary">Cancel</button>
                        </form>
                      {:else}
                        <span class="font-medium text-text-primary truncate max-w-[300px]">{sessions.getSessionTitle(session)}</span>
                        <button onclick={() => startRename(session)}
                          class="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" title="Rename">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      {/if}
                      <!-- Type badge -->
                      <span class="px-2 py-0.5 rounded text-[10px] font-medium
                        {type === 'main' ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/20' :
                         type === 'subagent' ? 'bg-accent-amber/20 text-accent-amber border border-accent-amber/20' :
                         'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/20'}">
                        {type}
                      </span>
                      <!-- Channel badge -->
                      {#if session.channel}
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">
                          {session.channel}
                        </span>
                      {/if}
                      <!-- Agent badge -->
                      {#if session.agentId}
                        <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-purple/10 text-purple-300 border border-accent-purple/10">
                          {session.agentId}
                        </span>
                      {/if}
                      <!-- Subagent count -->
                      {#if viewMode === 'grouped' && subs.length > 0}
                        <button onclick={() => toggleSubagents(session.key)}
                          class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/20 hover:bg-accent-amber/20 transition-colors">
                          <svg class="w-3 h-3 transition-transform {expandedSubagents.has(session.key) ? 'rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                          </svg>
                          {subs.length} sub-agent{subs.length !== 1 ? 's' : ''}
                        </button>
                      {/if}
                    </div>

                    <!-- Model + Provider row -->
                    <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                      {#if session.model}
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-purple/10 text-purple-300 border border-accent-purple/10">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          {session.model}
                        </span>
                      {/if}
                      {#if session.provider}
                        <span class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted border border-border-default">
                          {session.provider}
                        </span>
                      {/if}
                      {#if tokens > 0}
                        <span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/10">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          {formatTokens(tokens)} tokens
                        </span>
                      {/if}
                    </div>

                    <!-- Last message preview -->
                    {#if session.lastMessage}
                      <p class="text-xs text-text-muted truncate mb-1.5 max-w-[500px]">{session.lastMessage}</p>
                    {/if}

                    <!-- Bottom info row -->
                    <div class="flex items-center gap-3 text-xs text-text-muted">
                      <span class="flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatTime(session.lastActivityAt ?? session.lastActivity)}
                      </span>
                      <span class="font-mono text-text-muted/40 text-[10px] truncate max-w-[250px]" title={session.key}>
                        {session.key}
                      </span>
                    </div>
                  </div>

                  <!-- Right: Controls -->
                  <div class="flex flex-col items-end gap-2 flex-shrink-0">
                    <!-- Thinking / Verbose controls -->
                    <div class="flex items-center gap-1">
                      <!-- Thinking level toggle -->
                      <button onclick={() => cycleThinking(session)} disabled={isPatching}
                        class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                          {session.thinkingLevel === 'stream' ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 glow-cyan' :
                           session.thinkingLevel === 'on' ? 'bg-accent-purple/15 text-accent-purple border-accent-purple/30' :
                           'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-cyan/30 hover:text-text-secondary'}"
                        title="Thinking: {session.thinkingLevel ?? 'off'} (click to cycle)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                        T:{session.thinkingLevel ?? 'off'}
                      </button>
                      <!-- Verbose toggle -->
                      <button onclick={() => toggleVerbose(session)} disabled={isPatching}
                        class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50
                          {session.verboseLevel === 'on' ? 'bg-accent-green/15 text-accent-green border-accent-green/30' :
                           'bg-bg-tertiary text-text-muted border-border-default hover:border-accent-green/30 hover:text-text-secondary'}"
                        title="Verbose: {session.verboseLevel ?? 'off'} (click to toggle)">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        V:{session.verboseLevel ?? 'off'}
                      </button>
                      <!-- Reasoning badge (display only) -->
                      {#if session.reasoningLevel && session.reasoningLevel !== 'off'}
                        <span class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                          R:{session.reasoningLevel}
                        </span>
                      {/if}
                    </div>

                    <!-- Model override selector -->
                    {#if availableModels.length > 0}
                      <select
                        value={session.model || 'default'}
                        onchange={(e) => changeModel(session, e.currentTarget.value)}
                        disabled={isPatching}
                        class="px-2 py-1 rounded-lg text-[11px] border border-border-default bg-bg-tertiary
                               text-text-secondary hover:border-accent-purple/40 focus:outline-none focus:border-accent-purple
                               transition-all disabled:opacity-50 max-w-[200px] cursor-pointer appearance-none
                               bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2388929e%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
                               bg-[length:12px] bg-[right_6px_center] bg-no-repeat pr-6"
                        title="Override model for this session">
                        <option value="default">🤖 Model: default</option>
                        {#each availableModels as model}
                          <option value={model.id}>{model.name || model.id}</option>
                        {/each}
                      </select>
                    {/if}

                    <!-- Action buttons -->
                    <div class="flex items-center gap-1">
                      <button onclick={() => openChat(session.key)}
                        class="px-3 py-1.5 rounded-lg text-xs border border-accent-cyan/30 text-accent-cyan
                               hover:bg-accent-cyan/10 transition-colors" title="Open in chat">
                        Chat
                      </button>
                      <button onclick={() => { showDeleteConfirm = showDeleteConfirm === session.key ? null : session.key; deleteTranscript = false; }}
                        class="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors"
                        title="Delete session">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Delete confirmation -->
              {#if showDeleteConfirm === session.key}
                <div class="px-4 pb-4">
                  <div class="pt-3 border-t border-border-default flex items-center gap-3 flex-wrap">
                    <span class="text-xs text-red-400">Delete this session permanently?</span>
                    <label class="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                      <input type="checkbox" bind:checked={deleteTranscript}
                        class="rounded border-border-default bg-bg-tertiary text-red-400" />
                      Also delete transcript
                    </label>
                    <button onclick={() => deleteSession(session.key)}
                      class="px-3 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">
                      Confirm Delete
                    </button>
                    <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }}
                      class="px-3 py-1 rounded text-xs bg-bg-tertiary text-text-muted border border-border-default hover:text-text-secondary transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              {/if}

              <!-- Sub-agent expansion -->
              {#if viewMode === 'grouped' && expandedSubagents.has(session.key) && subs.length > 0}
                <div class="border-t border-border-default bg-bg-primary/30">
                  <div class="px-4 py-2">
                    <div class="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2 flex items-center gap-2">
                      <svg class="w-3.5 h-3.5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Sub-Agents ({subs.length})
                    </div>
                    <div class="space-y-2">
                      {#each subs as sub (sub.key)}
                        {@const subStatus = getSubagentStatus(sub)}
                        {@const subTokens = getTokenCount(sub)}
                        <div class="rounded-lg border border-border-default/50 bg-bg-secondary/30 p-3 ml-4 relative
                                    before:absolute before:left-[-12px] before:top-1/2 before:w-3 before:h-px before:bg-accent-amber/30">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="flex items-center gap-2 mb-1">
                                <!-- Status indicator -->
                                <span class="w-2 h-2 rounded-full flex-shrink-0
                                  {subStatus === 'active' ? 'bg-accent-green glow-pulse' :
                                   subStatus === 'done' ? 'bg-accent-cyan' :
                                   subStatus === 'error' ? 'bg-accent-pink' :
                                   'bg-text-muted'}">
                                </span>
                                <span class="text-sm font-medium text-text-primary truncate">
                                  {sub.label || getSubagentId(sub)}
                                </span>
                                <span class="px-1.5 py-0.5 rounded text-[9px] font-medium
                                  {subStatus === 'active' ? 'bg-accent-green/15 text-accent-green' :
                                   subStatus === 'done' ? 'bg-accent-cyan/15 text-accent-cyan' :
                                   subStatus === 'error' ? 'bg-accent-pink/15 text-accent-pink' :
                                   'bg-bg-tertiary text-text-muted'}">
                                  {subStatus}
                                </span>
                              </div>
                              {#if sub.lastMessage}
                                <p class="text-xs text-text-muted truncate mb-1 max-w-[400px]">{sub.lastMessage}</p>
                              {/if}
                              <div class="flex items-center gap-3 text-[10px] text-text-muted">
                                {#if sub.model}
                                  <span>{sub.model}</span>
                                {/if}
                                {#if subTokens > 0}
                                  <span>{formatTokens(subTokens)} tokens</span>
                                {/if}
                                <span>{formatTime(sub.lastActivityAt ?? sub.lastActivity)}</span>
                              </div>
                            </div>
                            <div class="flex items-center gap-1 flex-shrink-0">
                              <button onclick={() => openChat(sub.key)}
                                class="px-2 py-1 rounded text-[10px] border border-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/10 transition-colors">
                                Chat
                              </button>
                              <button onclick={() => { showDeleteConfirm = showDeleteConfirm === sub.key ? null : sub.key; deleteTranscript = false; }}
                                class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {#if showDeleteConfirm === sub.key}
                            <div class="mt-2 pt-2 border-t border-border-default/50 flex items-center gap-2">
                              <span class="text-[10px] text-red-400">Delete?</span>
                              <label class="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer">
                                <input type="checkbox" bind:checked={deleteTranscript} class="rounded border-border-default bg-bg-tertiary text-red-400 w-3 h-3" />
                                + transcript
                              </label>
                              <button onclick={() => deleteSession(sub.key)}
                                class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                                Confirm
                              </button>
                              <button onclick={() => { showDeleteConfirm = null; deleteTranscript = false; }}
                                class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted hover:text-text-secondary transition-colors">
                                Cancel
                              </button>
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
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