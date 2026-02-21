<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ──────────────────────────────────
  interface MemoryEntry {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
    score?: number;
    source?: string;
    timestamp?: number;
    tags?: string[];
  }

  interface MemorySearchResult {
    results?: MemoryEntry[];
    entries?: MemoryEntry[];
    total?: number;
    query?: string;
  }

  interface MemoryConfig {
    enabled?: boolean;
    provider?: string;
    model?: string;
    remote?: { baseUrl?: string };
    store?: string;
  }

  interface FileEntry { name: string; path?: string; size?: number; updatedAtMs?: number; missing?: boolean; }
  interface FilesListResult { agentId: string; workspace: string; files: FileEntry[] }

  // ─── State ──────────────────────────────────
  let loading = $state(false);
  let searchLoading = $state(false);
  let error = $state<string | null>(null);

  let query = $state('');
  let results = $state<MemoryEntry[]>([]);
  let totalResults = $state(0);
  let searchLimit = $state(20);

  // Detail view
  let selectedEntry = $state<MemoryEntry | null>(null);

  // RPC availability
  let rpcAvailable = $state<boolean | null>(null);
  let probing = $state(false);

  // Config-derived memory info
  let memoryConfig = $state<MemoryConfig | null>(null);
  let storePath = $state<string | null>(null);
  let workspacePath = $state<string | null>(null);

  // Memory files via agents.files (same pattern as Agents page)
  let filesList = $state<FilesListResult | null>(null);
  let filesLoading = $state(false);
  let activeFile = $state<string | null>(null);
  let fileContent = $state('');
  let fileDraft = $state('');
  let fileLoading = $state(false);
  let fileSaving = $state(false);

  // ─── Derived ────────────────────────────────
  let memoryFiles = $derived(filesList?.files ?? []);
  let isDirty = $derived(fileDraft !== fileContent && activeFile !== null);

  let fileSummary = $derived.by(() => {
    const files = memoryFiles.filter(f => !f.missing);
    const totalSize = files.reduce((sum, f) => sum + (f.size ?? 0), 0);
    return {
      count: files.length,
      totalCount: memoryFiles.length,
      missingCount: memoryFiles.filter(f => f.missing).length,
      totalSize,
    };
  });

  // ─── Probe RPC availability ─────────────────
  async function probeAndLoad() {
    if (!gateway.connected) return;
    probing = true;
    try {
      // Try memory.status first
      const res = await gateway.call<Record<string, unknown>>('memory.status', {});
      rpcAvailable = true;
    } catch (e) {
      const msg = String(e);
      rpcAvailable = msg.includes('unknown method') ? false : false;
    }

    // Always load config for memory info
    try {
      const cfgRes = await gateway.call<{ config?: Record<string, unknown> }>('config.get', {});
      const cfg = cfgRes?.config ?? cfgRes as Record<string, unknown>;
      const agents = cfg?.agents as Record<string, unknown> | undefined;
      const defaults = agents?.defaults as Record<string, unknown> | undefined;
      const memSearch = defaults?.memorySearch as MemoryConfig | undefined;
      memoryConfig = memSearch ?? null;
      workspacePath = (defaults?.workspace as string) ?? null;
      
      // Derive store path from config
      const storeCfg = (cfg as any)?.memory?.store;
      storePath = typeof storeCfg === 'string' ? storeCfg : null;
    } catch { /* ignore */ }

    // Load agent workspace files (same pattern as Agents page)
    await loadFiles();

    probing = false;
  }

  // ─── File Loading (matches Agents page pattern) ──
  async function loadFiles() {
    filesLoading = true;
    try {
      const res = await gateway.call<FilesListResult>('agents.files.list', { agentId: 'main' });
      filesList = res ?? null;

      // Auto-open MEMORY.md if it exists and nothing is selected
      const allFiles = res?.files ?? [];
      const memFile = allFiles.find(f => f.name === 'MEMORY.md' && !f.missing);
      if (memFile && !activeFile) {
        openFile(memFile.name);
      }
    } catch (e) {
      console.error('Failed to load agent files:', e);
      toasts.error('Failed to load files', String(e));
    } finally {
      filesLoading = false;
    }
  }

  // ─── Search (if RPC available) ──────────────
  async function search() {
    if (!gateway.connected || !query.trim()) return;
    searchLoading = true;
    error = null;
    try {
      const res = await gateway.call<MemorySearchResult>('memory.search', {
        query: query.trim(),
        limit: searchLimit,
      });
      rpcAvailable = true;
      results = res.results ?? res.entries ?? [];
      totalResults = res.total ?? results.length;
    } catch (e) {
      const msg = String(e);
      if (msg.includes('unknown method')) {
        rpcAvailable = false;
      } else {
        error = msg;
      }
    } finally {
      searchLoading = false;
    }
  }

  // ─── File Viewer / Editor ───────────────────
  async function openFile(name: string) {
    activeFile = name;
    fileLoading = true;
    fileContent = '';
    fileDraft = '';
    try {
      const res = await gateway.call<{ file?: { content?: string } }>(
        'agents.files.get', { agentId: 'main', name }
      );
      fileContent = res?.file?.content ?? '';
      fileDraft = fileContent;
    } catch (e) {
      fileContent = '';
      fileDraft = '';
      toasts.error('Failed to load file', String(e));
    } finally {
      fileLoading = false;
    }
  }

  async function saveFile() {
    if (!activeFile || fileSaving) return;
    fileSaving = true;
    try {
      await gateway.call('agents.files.set', { agentId: 'main', name: activeFile, content: fileDraft });
      fileContent = fileDraft;
      toasts.success('Saved', `${activeFile} saved successfully`);
      // Refresh file list to update sizes
      loadFiles();
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      fileSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      search();
    }
  }

  function truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + '…';
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getFileIcon(name: string): string {
    if (name.endsWith('.md')) return '📄';
    if (name.endsWith('.json')) return '📋';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return '⚙️';
    if (name.endsWith('.ts') || name.endsWith('.js')) return '📜';
    return '📎';
  }

  // ─── Auto-load ──────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => probeAndLoad());
    }
  });
</script>

<svelte:head>
  <title>Memory — Cortex</title>
</svelte:head>

<div class="h-full flex flex-col overflow-hidden">
  <div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-xl font-bold text-text-primary flex items-center gap-2">
          <span class="text-accent-purple">🧠</span> Memory
        </h1>
        <p class="text-sm text-text-muted">Agent memory system — hybrid BM25 + vector retrieval</p>
      </div>
      <div class="flex items-center gap-2">
        {#if rpcAvailable}
          <span class="px-2 py-1 rounded text-[10px] bg-accent-green/15 text-accent-green border border-accent-green/20">RPC Available</span>
        {:else if rpcAvailable === false}
          <span class="px-2 py-1 rounded text-[10px] bg-accent-amber/15 text-accent-amber border border-accent-amber/20">CLI Only</span>
        {/if}
        <button onclick={() => probeAndLoad()} disabled={probing}
          class="px-3 py-1.5 rounded-lg text-sm border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
          {probing ? 'Loading…' : 'Refresh'}
        </button>
      </div>
    </div>
  </div>

  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    <div class="max-w-6xl mx-auto space-y-6">

      <!-- ═══ Search Bar ════════════════════════ -->
      <div class="glass rounded-xl border border-border-default p-4">
        <div class="flex items-center gap-3">
          <div class="flex-1 relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              bind:value={query}
              onkeydown={handleKeydown}
              placeholder={rpcAvailable ? "Search memory… (Enter to search)" : "Memory search requires CLI — see below"}
              disabled={rpcAvailable === false}
              class="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border-default bg-bg-input
                     text-sm text-text-primary placeholder:text-text-muted/50
                     focus:outline-none focus:border-accent-purple focus:shadow-[0_0_8px_rgba(124,77,255,0.15)]
                     transition-all disabled:opacity-50"
            />
          </div>
          <select bind:value={searchLimit} disabled={rpcAvailable === false}
            class="px-3 py-2.5 rounded-lg border border-border-default bg-bg-input text-sm text-text-primary
                   focus:outline-none focus:border-accent-purple disabled:opacity-50">
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <button onclick={search} disabled={searchLoading || !query.trim() || rpcAvailable === false}
            class="px-5 py-2.5 rounded-lg text-sm font-medium bg-accent-purple/20 border border-accent-purple/30
                   text-accent-purple hover:bg-accent-purple/30 transition-all disabled:opacity-40">
            {searchLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
      </div>

      {#if error}
        <div class="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">{error}</div>
      {/if}

      <!-- ═══ Search Results (if RPC works) ════ -->
      {#if results.length > 0}
        <div class="space-y-3">
          <div class="text-sm text-text-muted">
            {totalResults} result{totalResults !== 1 ? 's' : ''} for "<span class="text-accent-purple">{query}</span>"
          </div>
          {#each results as entry, i}
            <button
              onclick={() => selectedEntry = selectedEntry?.id === entry.id ? null : entry}
              class="w-full text-left glass rounded-xl border transition-all
                     {selectedEntry?.id === entry.id
                       ? 'border-accent-purple/50 bg-accent-purple/5'
                       : 'border-border-default hover:border-border-hover'}"
            >
              <div class="p-4">
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-xs font-mono text-accent-purple">#{i + 1}</span>
                  {#if entry.score !== undefined}
                    <span class="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple font-mono">
                      {(entry.score * 100).toFixed(1)}%
                    </span>
                  {/if}
                  {#if entry.source}
                    <span class="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">{entry.source}</span>
                  {/if}
                </div>
                <p class="text-sm text-text-primary leading-relaxed">
                  {selectedEntry?.id === entry.id ? entry.content : truncate(entry.content, 300)}
                </p>
                {#if selectedEntry?.id === entry.id && entry.metadata}
                  <pre class="mt-3 pt-3 border-t border-border-default text-xs text-text-secondary font-mono bg-bg-primary rounded-lg p-3 overflow-x-auto">{JSON.stringify(entry.metadata, null, 2)}</pre>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}

      <!-- ═══ Dashboard Grid ═══════════════════ -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Memory Configuration -->
        <div class="glass rounded-xl border border-border-default p-5">
          <h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            <span class="text-accent-cyan">⚙️</span> Configuration
          </h3>
          <p class="text-xs text-text-muted mb-4">Memory search engine settings from gateway config.</p>

          {#if memoryConfig}
            <div class="space-y-3">
              <div class="flex items-center justify-between py-2 border-b border-border-default/30">
                <span class="text-xs text-text-muted">Enabled</span>
                <span class="text-sm font-medium {memoryConfig.enabled !== false ? 'text-accent-green' : 'text-red-400'}">
                  {memoryConfig.enabled !== false ? 'Yes' : 'No'}
                </span>
              </div>
              <div class="flex items-center justify-between py-2 border-b border-border-default/30">
                <span class="text-xs text-text-muted">Provider</span>
                <span class="text-sm font-mono text-text-primary">{memoryConfig.provider ?? '-'}</span>
              </div>
              <div class="flex items-center justify-between py-2 border-b border-border-default/30">
                <span class="text-xs text-text-muted">Embedding Model</span>
                <span class="text-sm font-mono text-text-primary">{memoryConfig.model ?? '-'}</span>
              </div>
              {#if memoryConfig.remote?.baseUrl}
                <div class="flex items-center justify-between py-2 border-b border-border-default/30">
                  <span class="text-xs text-text-muted">Embedding Server</span>
                  <span class="text-sm font-mono text-text-primary truncate max-w-[200px]" title={memoryConfig.remote.baseUrl}>
                    {memoryConfig.remote.baseUrl}
                  </span>
                </div>
              {/if}
              {#if workspacePath}
                <div class="flex items-center justify-between py-2">
                  <span class="text-xs text-text-muted">Workspace</span>
                  <span class="text-sm font-mono text-text-primary">{workspacePath}</span>
                </div>
              {/if}
            </div>
          {:else}
            <div class="text-text-muted text-sm">Memory search not configured.</div>
          {/if}
        </div>

        <!-- CLI Reference -->
        <div class="glass rounded-xl border border-border-default p-5">
          <h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
            <span class="text-accent-purple">💻</span> CLI Commands
          </h3>
          <p class="text-xs text-text-muted mb-4">
            {#if rpcAvailable === false}
              Memory is managed via the OpenClaw CLI. Use these commands on the gateway host.
            {:else}
              Available CLI commands for memory management.
            {/if}
          </p>
          <div class="space-y-3">
            <div class="rounded-lg bg-bg-primary border border-border-default p-3">
              <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Check Status</div>
              <code class="text-sm text-accent-cyan font-mono">openclaw memory status</code>
              <p class="text-[10px] text-text-muted mt-1">Shows index stats, store path, embedding info</p>
            </div>
            <div class="rounded-lg bg-bg-primary border border-border-default p-3">
              <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Search</div>
              <code class="text-sm text-accent-cyan font-mono">openclaw memory search "your query"</code>
              <p class="text-[10px] text-text-muted mt-1">Hybrid BM25 + vector search across indexed files</p>
            </div>
            <div class="rounded-lg bg-bg-primary border border-border-default p-3">
              <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Re-index</div>
              <code class="text-sm text-accent-cyan font-mono">openclaw memory index</code>
              <p class="text-[10px] text-text-muted mt-1">Rebuild the memory index from workspace files</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Memory Files ═════════════════════ -->
      <div class="glass rounded-xl border border-border-default p-5">
        <div class="flex items-center justify-between mb-1">
          <h3 class="text-sm font-semibold text-text-primary flex items-center gap-2">
            <span class="text-accent-amber">📝</span> Workspace Files
          </h3>
          <button onclick={() => loadFiles()} disabled={filesLoading}
            class="text-[10px] text-text-muted hover:text-accent-cyan transition-all disabled:opacity-50">
            {filesLoading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>
        <p class="text-xs text-text-muted mb-4">Agent workspace files — MEMORY.md is your long-term memory store.</p>

        <!-- File summary stats -->
        {#if filesList}
          <div class="flex flex-wrap items-center gap-4 mb-4 px-3 py-2.5 rounded-lg bg-bg-tertiary/30 border border-border-default/50">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">Files</span>
              <span class="text-sm font-bold text-text-primary">{fileSummary.count}</span>
              {#if fileSummary.missingCount > 0}
                <span class="text-[10px] text-amber-400">({fileSummary.missingCount} missing)</span>
              {/if}
            </div>
            <div class="w-px h-4 bg-border-default"></div>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] uppercase tracking-wider text-text-muted">Total Size</span>
              <span class="text-sm font-bold text-text-primary">{formatBytes(fileSummary.totalSize)}</span>
            </div>
            {#if filesList.workspace}
              <div class="w-px h-4 bg-border-default"></div>
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] uppercase tracking-wider text-text-muted">Workspace</span>
                <span class="text-xs font-mono text-text-secondary truncate max-w-[300px]" title={filesList.workspace}>{filesList.workspace}</span>
              </div>
            {/if}
          </div>
        {/if}

        {#if filesLoading && memoryFiles.length === 0}
          <!-- Loading skeleton -->
          <div class="flex gap-4 min-h-0">
            <div class="w-52 flex-shrink-0 space-y-1">
              {#each Array(4) as _}
                <div class="px-3 py-2.5 rounded-lg animate-pulse">
                  <div class="h-3 w-24 bg-bg-tertiary rounded mb-1.5"></div>
                  <div class="h-2.5 w-16 bg-bg-tertiary rounded"></div>
                </div>
              {/each}
            </div>
            <div class="flex-1 rounded-lg border border-border-default bg-bg-tertiary/30 animate-pulse min-h-[200px]"></div>
          </div>
        {:else if memoryFiles.length === 0}
          <div class="text-center py-8 text-text-muted text-sm">
            {conn.state.status !== 'connected' ? 'Connect to the gateway to view files.' : 'No workspace files found.'}
          </div>
        {:else}
          <div class="flex gap-4 min-h-0">
            <!-- File list -->
            <div class="w-52 flex-shrink-0 space-y-1 overflow-y-auto max-h-[500px]">
              {#each memoryFiles as file (file.name)}
                <button
                  onclick={() => openFile(file.name)}
                  class="w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2
                         {activeFile === file.name
                           ? 'bg-accent-purple/10 text-accent-purple border border-accent-purple/20'
                           : 'hover:bg-bg-hover text-text-secondary border border-transparent'}"
                >
                  <span class="text-xs flex-shrink-0">{getFileIcon(file.name)}</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-mono truncate">{file.name}</div>
                    <div class="text-[10px] text-text-muted mt-0.5">
                      {file.missing ? 'missing' : formatBytes(file.size)}
                      {#if file.updatedAtMs && !file.missing}
                        · {formatRelativeTime(file.updatedAtMs)}
                      {/if}
                    </div>
                  </div>
                  {#if file.missing}
                    <span class="px-1 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 flex-shrink-0">missing</span>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- File editor -->
            <div class="flex-1 min-w-0 flex flex-col">
              {#if !activeFile}
                <div class="flex items-center justify-center h-48 text-text-muted text-sm rounded-lg border border-border-default/50 bg-bg-tertiary/30">
                  Select a file to view or edit
                </div>
              {:else if fileLoading}
                <div class="flex items-center justify-center h-48 text-text-muted text-sm rounded-lg border border-border-default/50 bg-bg-tertiary/30">
                  <svg class="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Loading {activeFile}…
                </div>
              {:else}
                <div class="rounded-lg border border-border-default bg-bg-primary flex flex-col">
                  <!-- Editor toolbar -->
                  <div class="px-3 py-2 border-b border-border-default bg-bg-secondary/30 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-mono font-medium text-text-primary">{activeFile}</span>
                      {#if isDirty}
                        <span class="w-2 h-2 rounded-full bg-accent-amber" title="Unsaved changes"></span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2">
                      <button onclick={() => { fileDraft = fileContent; }} disabled={!isDirty}
                        class="px-2.5 py-1 rounded text-xs text-text-muted hover:text-text-primary transition-all disabled:opacity-30">
                        Reset
                      </button>
                      <button onclick={saveFile} disabled={!isDirty || fileSaving}
                        class="px-3 py-1 rounded text-xs transition-all
                               {isDirty ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30' : 'bg-bg-tertiary text-text-muted cursor-not-allowed'}">
                        {fileSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                  <!-- Editable textarea -->
                  <textarea
                    bind:value={fileDraft}
                    class="w-full p-4 bg-bg-primary text-text-secondary font-mono text-xs resize-none focus:outline-none border-none min-h-[300px] max-h-[500px] leading-relaxed"
                    spellcheck="false"
                  ></textarea>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <!-- ═══ Architecture Info ════════════════ -->
      <div class="glass rounded-xl border border-border-default p-5">
        <h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
          <span>🏗️</span> How Memory Works
        </h3>
        <p class="text-xs text-text-muted mb-4">Architecture of the agent memory system.</p>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4">
            <div class="text-sm font-medium text-accent-cyan mb-2">📥 Indexing</div>
            <p class="text-xs text-text-secondary leading-relaxed">
              Workspace files (markdown, configs, logs) are chunked and embedded into vectors using the configured embedding model. Stored in a local SQLite database with both BM25 and vector indices.
            </p>
          </div>
          <div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4">
            <div class="text-sm font-medium text-accent-purple mb-2">🔍 Hybrid Search</div>
            <p class="text-xs text-text-secondary leading-relaxed">
              Queries use both BM25 keyword matching (exact terms) and vector cosine similarity (semantic meaning). Results are ranked by combined score for best relevance.
            </p>
          </div>
          <div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4">
            <div class="text-sm font-medium text-accent-amber mb-2">🤖 Agent Integration</div>
            <p class="text-xs text-text-secondary leading-relaxed">
              The agent automatically searches memory during conversations when relevant context might exist. Memories are indexed on heartbeat cycles and during compaction flushes.
            </p>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>
