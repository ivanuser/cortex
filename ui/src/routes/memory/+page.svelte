<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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
    return text.slice(0, max) + '...';
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getFileIcon(name: string): string {
    if (name.endsWith('.md')) return 'DOC';
    if (name.endsWith('.json')) return 'JSON';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'YAML';
    if (name.endsWith('.ts') || name.endsWith('.js')) return 'CODE';
    return 'FILE';
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

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top Bar -->
  <div class="hud-page-topbar">
    <div style="display:flex;align-items:center;gap:14px">
      <a href="/overview" class="hud-back">&#x25C0; BACK</a>
      <span class="hud-page-title">MEMORY</span>
      {#if rpcAvailable}
        <span class="hud-status-badge hud-status-ok">RPC AVAILABLE</span>
      {:else if rpcAvailable === false}
        <span class="hud-status-badge hud-status-warn">CLI ONLY</span>
      {/if}
    </div>
    <button onclick={() => probeAndLoad()} disabled={probing} class="hud-btn">
      {probing ? 'LOADING...' : 'REFRESH'}
    </button>
  </div>

  <!-- Scrollable content -->
  <div class="hud-scroll">

    <!-- Search Bar -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">SEARCH MEMORY</div>
      <div class="hud-search-row">
        <input
          type="text"
          bind:value={query}
          onkeydown={handleKeydown}
          placeholder={rpcAvailable ? "Search memory... (Enter to search)" : "Memory search requires CLI"}
          disabled={rpcAvailable === false}
          class="hud-input"
          style="flex:1"
        />
        <select bind:value={searchLimit} disabled={rpcAvailable === false} class="hud-select">
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
        <button onclick={search} disabled={searchLoading || !query.trim() || rpcAvailable === false} class="hud-btn hud-btn-primary">
          {searchLoading ? 'SEARCHING...' : 'SEARCH'}
        </button>
      </div>
    </div>

    {#if error}
      <div class="hud-error">{error}</div>
    {/if}

    <!-- Search Results -->
    {#if results.length > 0}
      <div class="hud-panel">
        <div class="hud-panel-lbl">RESULTS <span style="color:var(--color-accent-purple)">{totalResults}</span></div>
        <div class="hud-results-info">{totalResults} result{totalResults !== 1 ? 's' : ''} for "<span style="color:var(--color-accent-purple)">{query}</span>"</div>
        {#each results as entry, i}
          <button
            onclick={() => selectedEntry = selectedEntry?.id === entry.id ? null : entry}
            class="hud-result-row {selectedEntry?.id === entry.id ? 'active' : ''}"
          >
            <div class="hud-result-meta">
              <span class="hud-result-idx">#{i + 1}</span>
              {#if entry.score !== undefined}
                <span class="hud-result-score">{(entry.score * 100).toFixed(1)}%</span>
              {/if}
              {#if entry.source}
                <span class="hud-result-source">{entry.source}</span>
              {/if}
            </div>
            <p class="hud-result-content">
              {selectedEntry?.id === entry.id ? entry.content : truncate(entry.content, 300)}
            </p>
            {#if selectedEntry?.id === entry.id && entry.metadata}
              <pre class="hud-result-meta-json">{JSON.stringify(entry.metadata, null, 2)}</pre>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <!-- Dashboard Grid -->
    <div class="hud-grid-2col">

      <!-- Configuration Panel -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">CONFIGURATION</div>
        {#if memoryConfig}
          <div class="hud-kv-list">
            <div class="hud-kv-row">
              <span class="hud-kv-key">ENABLED</span>
              <span class="hud-kv-val" style="color:{memoryConfig.enabled !== false ? 'var(--color-accent-green)' : '#f44'}">
                {memoryConfig.enabled !== false ? 'YES' : 'NO'}
              </span>
            </div>
            <div class="hud-kv-row">
              <span class="hud-kv-key">PROVIDER</span>
              <span class="hud-kv-val">{memoryConfig.provider ?? '-'}</span>
            </div>
            <div class="hud-kv-row">
              <span class="hud-kv-key">EMBEDDING MODEL</span>
              <span class="hud-kv-val">{memoryConfig.model ?? '-'}</span>
            </div>
            {#if memoryConfig.remote?.baseUrl}
              <div class="hud-kv-row">
                <span class="hud-kv-key">EMBEDDING SERVER</span>
                <span class="hud-kv-val" title={memoryConfig.remote.baseUrl}>{memoryConfig.remote.baseUrl}</span>
              </div>
            {/if}
            {#if workspacePath}
              <div class="hud-kv-row">
                <span class="hud-kv-key">WORKSPACE</span>
                <span class="hud-kv-val">{workspacePath}</span>
              </div>
            {/if}
          </div>
        {:else}
          <div class="hud-empty">Memory search not configured.</div>
        {/if}
      </div>

      <!-- CLI Commands Panel -->
      <div class="hud-panel">
        <div class="hud-panel-lbl">CLI COMMANDS</div>
        <p class="hud-sub-text">
          {#if rpcAvailable === false}
            Memory is managed via the OpenClaw CLI. Use these commands on the gateway host.
          {:else}
            Available CLI commands for memory management.
          {/if}
        </p>
        <div class="hud-cli-list">
          <div class="hud-cli-block">
            <div class="hud-cli-label">CHECK STATUS</div>
            <code class="hud-cli-cmd">openclaw memory status</code>
            <div class="hud-cli-desc">Shows index stats, store path, embedding info</div>
          </div>
          <div class="hud-cli-block">
            <div class="hud-cli-label">SEARCH</div>
            <code class="hud-cli-cmd">openclaw memory search "your query"</code>
            <div class="hud-cli-desc">Hybrid BM25 + vector search across indexed files</div>
          </div>
          <div class="hud-cli-block">
            <div class="hud-cli-label">RE-INDEX</div>
            <code class="hud-cli-cmd">openclaw memory index</code>
            <div class="hud-cli-desc">Rebuild the memory index from workspace files</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Workspace Files Panel -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">
        WORKSPACE FILES
        <button onclick={() => loadFiles()} disabled={filesLoading} class="hud-btn" style="font-size:0.6rem;padding:2px 8px">
          {filesLoading ? 'LOADING...' : 'REFRESH'}
        </button>
      </div>
      <p class="hud-sub-text" style="margin-bottom:10px">Agent workspace files -- MEMORY.md is your long-term memory store.</p>

      <!-- File summary stats -->
      {#if filesList}
        <div class="hud-file-stats">
          <div class="hud-file-stat">
            <span class="hud-file-stat-lbl">FILES</span>
            <span class="hud-file-stat-val">{fileSummary.count}</span>
            {#if fileSummary.missingCount > 0}
              <span class="hud-file-stat-warn">({fileSummary.missingCount} missing)</span>
            {/if}
          </div>
          <div class="hud-file-stat-sep"></div>
          <div class="hud-file-stat">
            <span class="hud-file-stat-lbl">TOTAL SIZE</span>
            <span class="hud-file-stat-val">{formatBytes(fileSummary.totalSize)}</span>
          </div>
          {#if filesList.workspace}
            <div class="hud-file-stat-sep"></div>
            <div class="hud-file-stat">
              <span class="hud-file-stat-lbl">WORKSPACE</span>
              <span class="hud-file-stat-val" style="font-size:0.68rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title={filesList.workspace}>{filesList.workspace}</span>
            </div>
          {/if}
        </div>
      {/if}

      {#if filesLoading && memoryFiles.length === 0}
        <div class="hud-file-layout">
          <div class="hud-file-sidebar">
            {#each Array(4) as _}
              <div class="hud-skeleton" style="height:36px;margin-bottom:4px"></div>
            {/each}
          </div>
          <div class="hud-file-editor hud-skeleton" style="min-height:200px"></div>
        </div>
      {:else if memoryFiles.length === 0}
        <div class="hud-empty" style="padding:30px 0">
          {conn.state.status !== 'connected' ? 'Connect to the gateway to view files.' : 'No workspace files found.'}
        </div>
      {:else}
        <div class="hud-file-layout">
          <!-- File list sidebar -->
          <div class="hud-file-sidebar">
            {#each memoryFiles as file (file.name)}
              <button
                onclick={() => openFile(file.name)}
                class="hud-file-item {activeFile === file.name ? 'active' : ''}"
              >
                <span class="hud-file-icon">{getFileIcon(file.name)}</span>
                <div class="hud-file-info">
                  <div class="hud-file-name">{file.name}</div>
                  <div class="hud-file-meta">
                    {file.missing ? 'MISSING' : formatBytes(file.size)}
                    {#if file.updatedAtMs && !file.missing}
                      | {formatRelativeTime(file.updatedAtMs)}
                    {/if}
                  </div>
                </div>
                {#if file.missing}
                  <span class="hud-file-missing-badge">MISSING</span>
                {/if}
              </button>
            {/each}
          </div>

          <!-- File editor -->
          <div class="hud-file-editor-wrap">
            {#if !activeFile}
              <div class="hud-file-placeholder">
                Select a file to view or edit
              </div>
            {:else if fileLoading}
              <div class="hud-file-placeholder">
                <svg class="hud-spinner" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Loading {activeFile}...
              </div>
            {:else}
              <div class="hud-editor-container">
                <!-- Editor toolbar -->
                <div class="hud-editor-toolbar">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span class="hud-editor-filename">{activeFile}</span>
                    {#if isDirty}
                      <span class="hud-dirty-dot" title="Unsaved changes"></span>
                    {/if}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px">
                    <button onclick={() => { fileDraft = fileContent; }} disabled={!isDirty} class="hud-btn" style="font-size:0.62rem;padding:2px 8px">
                      RESET
                    </button>
                    <button onclick={saveFile} disabled={!isDirty || fileSaving} class="hud-btn {isDirty ? 'hud-btn-primary' : ''}">
                      {fileSaving ? 'SAVING...' : 'SAVE'}
                    </button>
                  </div>
                </div>
                <textarea
                  bind:value={fileDraft}
                  class="hud-editor-textarea"
                  spellcheck="false"
                ></textarea>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Architecture Info Panel -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">HOW MEMORY WORKS</div>
      <div class="hud-arch-grid">
        <div class="hud-arch-card">
          <div class="hud-arch-title" style="color:var(--color-accent-cyan)">INDEXING</div>
          <p class="hud-arch-desc">
            Workspace files (markdown, configs, logs) are chunked and embedded into vectors using the configured embedding model. Stored in a local SQLite database with both BM25 and vector indices.
          </p>
        </div>
        <div class="hud-arch-card">
          <div class="hud-arch-title" style="color:var(--color-accent-purple)">HYBRID SEARCH</div>
          <p class="hud-arch-desc">
            Queries use both BM25 keyword matching (exact terms) and vector cosine similarity (semantic meaning). Results are ranked by combined score for best relevance.
          </p>
        </div>
        <div class="hud-arch-card">
          <div class="hud-arch-title" style="color:var(--color-accent-amber)">AGENT INTEGRATION</div>
          <p class="hud-arch-desc">
            The agent automatically searches memory during conversations when relevant context might exist. Memories are indexed on heartbeat cycles and during compaction flushes.
          </p>
        </div>
      </div>
    </div>

  </div>
</div>

<style>
  /* ─── PAGE LAYOUT ─── */
  .hud-page {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-primary);
  }

  .hud-page-topbar {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
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
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.35em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
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
  }

  .hud-btn:hover:not(:disabled) {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hud-btn-primary {
    color: var(--color-accent-purple);
    border-color: color-mix(in srgb, var(--color-accent-purple) 40%, transparent);
  }

  .hud-btn-primary:hover:not(:disabled) {
    border-color: var(--color-accent-purple);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
  }

  /* ─── STATUS BADGES ─── */
  .hud-status-badge {
    font-size: 0.58rem;
    letter-spacing: 0.2em;
    padding: 2px 8px;
    border-radius: 2px;
  }

  .hud-status-ok {
    color: var(--color-accent-green);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent-green) 8%, transparent);
  }

  .hud-status-warn {
    color: var(--color-accent-amber);
    border: 1px solid color-mix(in srgb, var(--color-accent-amber) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent-amber) 8%, transparent);
  }

  /* ─── SEARCH ─── */
  .hud-search-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    padding: 8px 12px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, #080c16);
    color: var(--color-text-primary);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .hud-input:focus {
    border-color: var(--color-accent-purple);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-purple) 20%, transparent);
  }

  .hud-input:disabled {
    opacity: 0.5;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-text-muted) 50%, transparent);
  }

  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    padding: 8px 10px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, #080c16);
    color: var(--color-text-primary);
    outline: none;
  }

  .hud-select:disabled {
    opacity: 0.5;
  }

  /* ─── ERROR ─── */
  .hud-error {
    font-size: 0.78rem;
    padding: 10px 14px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, #f44 30%, transparent);
    background: color-mix(in srgb, #f44 6%, #0a0e1a);
    color: #f66;
  }

  /* ─── RESULTS ─── */
  .hud-results-info {
    font-size: 0.72rem;
    color: var(--color-text-muted);
    margin-bottom: 10px;
  }

  .hud-result-row {
    display: block;
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    margin-bottom: 6px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-result-row:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-result-row.active {
    border-color: color-mix(in srgb, var(--color-accent-purple) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-purple) 6%, transparent);
  }

  .hud-result-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 5px;
  }

  .hud-result-idx {
    font-size: 0.68rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-purple);
  }

  .hud-result-score {
    font-size: 0.62rem;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-purple) 12%, transparent);
    color: var(--color-accent-purple);
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-result-source {
    font-size: 0.62rem;
    padding: 1px 5px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    color: var(--color-text-muted);
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-result-content {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .hud-result-meta-json {
    margin-top: 8px;
    padding: 8px 10px;
    font-size: 0.68rem;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-text-secondary);
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, #080c16);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    overflow-x: auto;
    white-space: pre;
  }

  /* ─── GRID ─── */
  .hud-grid-2col {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  @media (max-width: 767px) {
    .hud-grid-2col {
      grid-template-columns: 1fr;
    }
  }

  /* ─── KEY-VALUE ROWS ─── */
  .hud-kv-list {
    display: flex;
    flex-direction: column;
  }

  .hud-kv-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    font-size: 0.75rem;
  }

  .hud-kv-row:last-child {
    border-bottom: none;
  }

  .hud-kv-key {
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-kv-val {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
  }

  /* ─── EMPTY STATE ─── */
  .hud-empty {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    text-align: center;
    padding: 12px 0;
  }

  /* ─── SUB TEXT ─── */
  .hud-sub-text {
    font-size: 0.68rem;
    color: var(--color-text-muted);
    margin-bottom: 8px;
  }

  /* ─── CLI BLOCKS ─── */
  .hud-cli-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hud-cli-block {
    padding: 10px 12px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 3%, #080c16);
  }

  .hud-cli-label {
    font-size: 0.56rem;
    letter-spacing: 0.3em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    margin-bottom: 4px;
  }

  .hud-cli-cmd {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    color: var(--color-accent-cyan);
  }

  .hud-cli-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    margin-top: 3px;
  }

  /* ─── FILE STATS BAR ─── */
  .hud-file-stats {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    margin-bottom: 12px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
  }

  .hud-file-stat {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .hud-file-stat-lbl {
    font-size: 0.56rem;
    letter-spacing: 0.25em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
  }

  .hud-file-stat-val {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
  }

  .hud-file-stat-warn {
    font-size: 0.75rem;
    color: var(--color-accent-amber);
  }

  .hud-file-stat-sep {
    width: 1px;
    height: 16px;
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  /* ─── FILE LAYOUT ─── */
  .hud-file-layout {
    display: flex;
    gap: 12px;
    min-height: 0;
  }

  .hud-file-sidebar {
    width: 200px;
    flex-shrink: 0;
    overflow-y: auto;
    max-height: 500px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .hud-file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 6px 8px;
    border-radius: 2px;
    border: 1px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--color-text-secondary);
  }

  .hud-file-item:hover {
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  .hud-file-item.active {
    background: color-mix(in srgb, var(--color-accent-purple) 10%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
    color: var(--color-accent-purple);
  }

  .hud-file-icon {
    font-size: 0.56rem;
    letter-spacing: 0.1em;
    flex-shrink: 0;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-file-item.active .hud-file-icon {
    color: var(--color-accent-purple);
  }

  .hud-file-info {
    min-width: 0;
    flex: 1;
  }

  .hud-file-name {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hud-file-meta {
    font-size: 0.58rem;
    color: var(--color-text-muted);
    margin-top: 1px;
  }

  .hud-file-missing-badge {
    font-size: 0.65rem;
    letter-spacing: 0.15em;
    padding: 1px 4px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-amber) 15%, transparent);
    color: var(--color-accent-amber);
    flex-shrink: 0;
  }

  /* ─── FILE EDITOR ─── */
  .hud-file-editor-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .hud-file-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    font-size: 0.75rem;
    color: var(--color-text-muted);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
    gap: 6px;
  }

  .hud-spinner {
    width: 16px;
    height: 16px;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .hud-editor-container {
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-radius: 2px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .hud-editor-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 5%, #080c16);
  }

  .hud-editor-filename {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: var(--color-accent-cyan);
    letter-spacing: 0.1em;
  }

  .hud-dirty-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--color-accent-amber);
    box-shadow: 0 0 6px var(--color-accent-amber);
  }

  .hud-editor-textarea {
    width: 100%;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--color-accent-cyan) 2%, #080c16);
    color: var(--color-text-secondary);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    line-height: 1.6;
    border: none;
    outline: none;
    resize: none;
    min-height: 300px;
    max-height: 500px;
  }

  /* ─── ARCHITECTURE GRID ─── */
  .hud-arch-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }

  @media (max-width: 767px) {
    .hud-arch-grid {
      grid-template-columns: 1fr;
    }
  }

  .hud-arch-card {
    padding: 12px 14px;
    border-radius: 2px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 7%, #0a0e1a);
  }

  .hud-arch-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    margin-bottom: 6px;
  }

  .hud-arch-desc {
    font-size: 0.68rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  /* ─── SKELETON ─── */
  .hud-skeleton {
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-radius: 2px;
    animation: hud-pulse 1.8s ease-in-out infinite;
  }

  @keyframes hud-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }
</style>
