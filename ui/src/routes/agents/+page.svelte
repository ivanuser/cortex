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

  // ─── Types ─────────────────────────────────
  interface AgentEntry {
    id: string;
    name?: string;
    label?: string;
    description?: string;
    model?: unknown;
    identity?: { name?: string; emoji?: string; avatar?: string };
    workspace?: string;
    skills?: string[];
    tools?: { profile?: string; allow?: string[]; alsoAllow?: string[]; deny?: string[] };
  }

  interface FileEntry { name: string; path?: string; size?: number; updatedAtMs?: number; missing?: boolean; }
  interface FilesListResult { agentId: string; workspace: string; files: FileEntry[] }
  interface IdentityResult { name?: string; emoji?: string; avatar?: string }
  interface ModelOption { value: string; label: string }
  interface SkillEntry { name: string; source?: string; bundled?: boolean; filePath?: string }
  interface CronJob { id?: string; jobId?: string; name?: string; description?: string; enabled?: boolean; agentId?: string; schedule?: Record<string, unknown>; payload?: Record<string, unknown>; sessionTarget?: string }
  interface CronStatus { enabled?: boolean; jobs?: number; nextWakeAtMs?: number }

  // ─── State ─────────────────────────────────
  let agents = $state<AgentEntry[]>([]);
  let defaultAgentId = $state('');
  let selectedAgentId = $state<string | null>(null);
  let loading = $state(false);

  // Tabs
  type TabKey = 'overview' | 'files' | 'tools' | 'skills' | 'channels' | 'cron';
  let activeTab = $state<TabKey>('overview');

  // Identity
  let identity = $state<IdentityResult | null>(null);

  // Config (for overview/model selection)
  let configForm = $state<Record<string, unknown> | null>(null);
  let configSchema = $state<unknown>(null);
  let modelOptions = $state<ModelOption[]>([]);
  let modelPrimary = $state('');
  let modelFallbacks = $state('');
  let configSaving = $state(false);

  // Files
  let filesList = $state<FilesListResult | null>(null);
  let filesLoading = $state(false);
  let activeFile = $state<string | null>(null);
  let fileContent = $state('');
  let fileDraft = $state('');
  let fileEncoding = $state<string | null>(null);
  let fileLoading = $state(false);
  let fileSaving = $state(false);

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp']);
  const MIME_MAP: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.bmp': 'image/bmp',
  };

  function getFileExt(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot).toLowerCase() : '';
  }

  function isImageFile(name: string): boolean {
    return IMAGE_EXTS.has(getFileExt(name));
  }

  function getImageDataUrl(name: string, base64Content: string): string {
    const ext = getFileExt(name);
    const mime = MIME_MAP[ext] || 'application/octet-stream';
    return `data:${mime};base64,${base64Content}`;
  }

  // Skills
  let skills = $state<SkillEntry[]>([]);
  let skillsLoading = $state(false);

  // Channels
  let channelSnapshot = $state<Record<string, unknown> | null>(null);
  let channelsLoading = $state(false);

  // Cron
  let cronJobs = $state<CronJob[]>([]);
  let cronStatus = $state<CronStatus | null>(null);
  let cronLoading = $state(false);

  // ─── Derived ───────────────────────────────
  let selectedAgent = $derived(agents.find(a => a.id === selectedAgentId) ?? null);

  let agentContext = $derived.by(() => {
    if (!selectedAgent) return null;
    const agentConfig = resolveAgentConfig(selectedAgent.id);
    const workspace = filesList?.workspace || agentConfig?.workspace || selectedAgent.workspace || '/home/ihoner';
    const model = resolveModelLabel(agentConfig?.model ?? selectedAgent.model);
    const identityName = identity?.name || selectedAgent.identity?.name || selectedAgent.name || selectedAgent.id;
    const identityEmoji = identity?.emoji || selectedAgent.identity?.emoji || '-';
    const skillFilter = agentConfig?.skills ?? selectedAgent.skills;
    const skillsLabel = Array.isArray(skillFilter) ? `${skillFilter.length} selected` : 'all skills';
    const isDefault = selectedAgent.id === defaultAgentId;
    return { workspace, model, identityName, identityEmoji, skillsLabel, isDefault };
  });

  let isDirty = $derived(fileDraft !== fileContent && activeFile !== null);

  let agentCronJobs = $derived(cronJobs.filter(j => j.agentId === selectedAgentId || (!j.agentId && selectedAgentId === defaultAgentId)));

  // ─── Helpers ───────────────────────────────
  function resolveAgentConfig(agentId: string) {
    if (!configForm) return null;
    const cfg = configForm as Record<string, unknown>;
    const agentsCfg = cfg.agents as Record<string, unknown> | undefined;
    const list = (agentsCfg?.list ?? []) as Array<Record<string, unknown>>;
    return list.find(a => a?.id === agentId) ?? null;
  }

  function resolveModelLabel(model?: unknown): string {
    if (!model) return '-';
    if (typeof model === 'string') return model.trim() || '-';
    if (typeof model === 'object' && model) {
      const m = model as Record<string, unknown>;
      const primary = typeof m.primary === 'string' ? m.primary.trim() : '';
      if (primary) {
        const fallbacks = Array.isArray(m.fallbacks) ? m.fallbacks.length : 0;
        return fallbacks > 0 ? `${primary} (+${fallbacks} fallback)` : primary;
      }
    }
    return '-';
  }

  function resolveAgentEmoji(agent: AgentEntry): string {
    const e = identity?.emoji || agent.identity?.emoji || '';
    return e.trim() || '';
  }

  function formatBytes(bytes?: number): string {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function getFileIcon(name: string): string {
    if (name.endsWith('.md')) return '[DOC]';
    if (name.endsWith('.json')) return '[JSON]';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return '[CFG]';
    if (name.endsWith('.ts') || name.endsWith('.js')) return '[SRC]';
    return '[FILE]';
  }

  // ─── Tabs Config ───────────────────────────
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: 'OVERVIEW', icon: '>' },
    { key: 'files', label: 'FILES', icon: '>' },
    { key: 'tools', label: 'TOOLS', icon: '>' },
    { key: 'skills', label: 'SKILLS', icon: '>' },
    { key: 'channels', label: 'CHANNELS', icon: '>' },
    { key: 'cron', label: 'CRON', icon: '>' },
  ];

  // Tool sections for the Tools tab
  const TOOL_SECTIONS = [
    { id: 'fs', label: 'Files', tools: ['read', 'write', 'edit', 'apply_patch'] },
    { id: 'runtime', label: 'Runtime', tools: ['exec', 'process'] },
    { id: 'web', label: 'Web', tools: ['web_search', 'web_fetch'] },
    { id: 'sessions', label: 'Sessions', tools: ['sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn', 'session_status'] },
    { id: 'ui', label: 'UI', tools: ['browser', 'canvas'] },
    { id: 'messaging', label: 'Messaging', tools: ['message'] },
    { id: 'automation', label: 'Automation', tools: ['cron', 'gateway'] },
    { id: 'nodes', label: 'Nodes', tools: ['nodes'] },
    { id: 'agents', label: 'Agents', tools: ['agents_list'] },
    { id: 'media', label: 'Media', tools: ['image', 'tts'] },
  ];

  // ─── Data Loading ──────────────────────────
  async function loadAgents() {
    loading = true;
    try {
      const res = await gateway.call<{ agents?: AgentEntry[]; defaultId?: string }>('agents.list', {});
      agents = res?.agents ?? [];
      defaultAgentId = res?.defaultId ?? '';
      if (!selectedAgentId && agents.length) {
        selectedAgentId = defaultAgentId || agents[0]?.id || null;
      }
      // Load supporting data
      loadConfig();
      if (selectedAgentId) {
        loadIdentity(selectedAgentId);
        loadFiles(selectedAgentId);
      }
    } catch (e) {
      toasts.error('Failed to load agents', String(e));
    } finally {
      loading = false;
    }
  }

  async function loadIdentity(agentId: string) {
    try {
      const res = await gateway.call<IdentityResult>('agent.identity.get', { agentId });
      identity = res ?? null;
    } catch { identity = null; }
  }

  async function loadConfig() {
    try {
      const [cfgRes, schemaRes, modelsRes] = await Promise.all([
        gateway.call<{ config?: Record<string, unknown> }>('config.get', {}),
        gateway.call<unknown>('config.schema', {}),
        gateway.call<{ models?: ModelOption[] }>('models.list', {}),
      ]);
      configForm = cfgRes?.config ?? cfgRes as Record<string, unknown>;
      configSchema = schemaRes;
      // Build model options from models.list
      const rawModels = modelsRes?.models ?? [];
      modelOptions = Array.isArray(rawModels) ? rawModels.map((m: any) => ({
        value: typeof m === 'string' ? m : m.id || m.value || String(m),
        label: typeof m === 'string' ? m : m.label || m.alias || m.id || String(m),
      })) : [];

      // Load current model for selected agent
      if (selectedAgentId) {
        const agentCfg = resolveAgentConfig(selectedAgentId);
        const model = agentCfg?.model ?? (configForm as any)?.agents?.defaults?.model;
        if (typeof model === 'string') {
          modelPrimary = model;
          modelFallbacks = '';
        } else if (model && typeof model === 'object') {
          const m = model as Record<string, unknown>;
          modelPrimary = typeof m.primary === 'string' ? m.primary : '';
          modelFallbacks = Array.isArray(m.fallbacks) ? m.fallbacks.join(', ') : '';
        }
      }
    } catch (e) {
      console.error('Config load error:', e);
    }
  }

  async function loadFiles(agentId: string) {
    filesLoading = true;
    activeFile = null;
    fileContent = '';
    fileDraft = '';
    try {
      const res = await gateway.call<FilesListResult>('agents.files.list', { agentId });
      filesList = res ?? null;
    } catch (e) {
      toasts.error('Failed to load files', String(e));
    } finally {
      filesLoading = false;
    }
  }

  async function openFile(name: string) {
    if (!selectedAgentId) return;
    activeFile = name;
    fileLoading = true;
    fileEncoding = null;
    try {
      const res = await gateway.call<{ file?: { content?: string; encoding?: string } }>('agents.files.get', { agentId: selectedAgentId, name });
      fileContent = res?.file?.content ?? '';
      fileEncoding = res?.file?.encoding ?? null;
      fileDraft = fileContent;
    } catch (e) {
      toasts.error('Failed to load file', String(e));
    } finally {
      fileLoading = false;
    }
  }

  async function saveFile() {
    if (!selectedAgentId || !activeFile || fileSaving) return;
    fileSaving = true;
    try {
      await gateway.call('agents.files.set', { agentId: selectedAgentId, name: activeFile, content: fileDraft });
      fileContent = fileDraft;
      toasts.success('Saved', `${activeFile} saved successfully`);
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      fileSaving = false;
    }
  }

  async function loadSkills() {
    skillsLoading = true;
    try {
      const res = await gateway.call<{ skills?: SkillEntry[] }>('skills.status', {});
      skills = res?.skills ?? [];
    } catch (e) {
      toasts.error('Failed to load skills', String(e));
    } finally {
      skillsLoading = false;
    }
  }

  async function loadChannels() {
    channelsLoading = true;
    try {
      const res = await gateway.call<Record<string, unknown>>('channels.status', {});
      channelSnapshot = res;
    } catch (e) {
      toasts.error('Failed to load channels', String(e));
    } finally {
      channelsLoading = false;
    }
  }

  async function loadCron() {
    cronLoading = true;
    try {
      const [statusRes, listRes] = await Promise.all([
        gateway.call<CronStatus>('cron.status', {}),
        gateway.call<{ jobs?: CronJob[] }>('cron.list', {}),
      ]);
      cronStatus = statusRes;
      cronJobs = listRes?.jobs ?? [];
    } catch (e) {
      toasts.error('Failed to load cron', String(e));
    } finally {
      cronLoading = false;
    }
  }

  async function saveConfig() {
    if (configSaving || !selectedAgentId) return;
    configSaving = true;
    try {
      // Build model config
      const fallbackList = modelFallbacks.split(',').map(s => s.trim()).filter(Boolean);
      const modelValue = fallbackList.length > 0
        ? { primary: modelPrimary, fallbacks: fallbackList }
        : modelPrimary || undefined;

      // Patch via config.set for the agent's model
      await gateway.call('config.set', {
        path: ['agents', 'list'],
        match: { id: selectedAgentId },
        patch: { model: modelValue }
      });
      toasts.success('Saved', 'Agent config updated');
      await loadConfig();
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      configSaving = false;
    }
  }

  function selectAgent(id: string) {
    selectedAgentId = id;
    activeTab = 'overview';
    activeFile = null;
    identity = null;
    loadIdentity(id);
    loadFiles(id);
  }

  function switchTab(tab: TabKey) {
    activeTab = tab;
    // Lazy-load tab data
    if (tab === 'skills' && skills.length === 0) untrack(() => loadSkills());
    if (tab === 'channels' && !channelSnapshot) untrack(() => loadChannels());
    if (tab === 'cron' && cronJobs.length === 0) untrack(() => loadCron());
  }

  // Tool policy check
  function isToolAllowed(toolName: string): 'allowed' | 'denied' | 'default' {
    const agent = selectedAgent;
    if (!agent?.tools) return 'default';
    const deny = agent.tools.deny ?? [];
    const allow = agent.tools.allow ?? [];
    const alsoAllow = agent.tools.alsoAllow ?? [];
    if (deny.includes(toolName) || deny.includes('*')) return 'denied';
    if (allow.includes(toolName) || allow.includes('*') || alsoAllow.includes(toolName)) return 'allowed';
    return 'default';
  }

  function formatSchedule(job: CronJob): string {
    const s = job.schedule;
    if (!s) return '-';
    if (s.kind === 'cron' && s.expr) return `cron: ${s.expr}`;
    if (s.kind === 'every' && s.everyMs) return `every ${Math.round((s.everyMs as number) / 60000)}m`;
    if (s.kind === 'at' && s.at) return `at: ${new Date(s.at as string).toLocaleString()}`;
    return JSON.stringify(s);
  }

  // ─── Effects ───────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadAgents());
    }
  });
</script>

<svelte:head>
  <title>Agents — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- Top bar -->
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">AGENTS</div>
    <div></div>
  </div>

  <!-- Header -->
  <div class="hud-header">
    <div>
      <h1 class="hud-h1">AGENTS</h1>
      <p class="hud-subtitle">Manage agent workspaces, tools, and identities.</p>
    </div>
    <button onclick={() => loadAgents()} disabled={loading} class="hud-btn">
      {#if loading}<span class="hud-spinner"></span>{/if}
      REFRESH
    </button>
  </div>

  <div class="hud-main">
    <!-- Agent list sidebar (hidden on mobile, replaced by dropdown) -->
    <div class="hud-sidebar">
      <div class="hud-sidebar-header">
        <div class="hud-panel-lbl">AGENTS</div>
        <div class="hud-count">{agents.length} configured</div>
      </div>
      <div class="hud-sidebar-list">
        {#each agents as agent (agent.id)}
          <button
            onclick={() => selectAgent(agent.id)}
            class="hud-agent-item {selectedAgentId === agent.id ? 'active' : ''}"
          >
            <div class="hud-agent-item-inner">
              <div class="sidebar-avatar">
                {#if agent.identity?.avatar}
                  <img class="sidebar-avatar-img" src="/avatar/{agent.id}" alt="" />
                {:else}
                  <span class="sidebar-avatar-letter">{(agent.identity?.emoji || agent.identity?.name?.[0] || agent.id[0] || '>').toUpperCase()}</span>
                {/if}
              </div>
              <div class="hud-agent-info">
                <div class="hud-agent-name">{agent.identity?.name || agent.name || agent.id}</div>
                <div class="hud-agent-id">{resolveModelLabel(agent.model)}</div>
              </div>
            </div>
            {#if agent.id === defaultAgentId}
              <span class="hud-badge hud-badge-purple">DEFAULT</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Main content -->
    <div class="hud-content">
      <!-- Mobile agent selector -->
      {#if agents.length > 0}
        <div class="hud-mobile-select">
          <select
            value={selectedAgentId ?? ''}
            onchange={(e) => selectAgent(e.currentTarget.value)}
            class="hud-select"
          >
            <option value="" disabled>Select agent...</option>
            {#each agents as agent (agent.id)}
              <option value={agent.id}>
                {agent.identity?.name ?? agent.name ?? agent.id}
                {agent.id === defaultAgentId ? ' (default)' : ''}
              </option>
            {/each}
          </select>
        </div>
      {/if}

      {#if !selectedAgent}
        <div class="hud-empty">
          <span class="hud-empty-text">// SELECT AN AGENT TO VIEW DETAILS</span>
        </div>
      {:else}
        <!-- Agent header + tabs -->
        <div class="hud-agent-header">
          <!-- Identity Card -->
          <div class="hud-identity-card">
            <div class="identity-header-label">IDENTITY</div>
            <div class="identity-card-body">
              <div class="identity-card-avatar-wrap">
                {#if identity?.avatar || selectedAgent.identity?.avatar}
                  <img class="identity-card-avatar" src="/avatar/{selectedAgent.id}" alt="" />
                {:else}
                  <div class="identity-card-avatar-placeholder">{(resolveAgentEmoji(selectedAgent) || agentContext?.identityName?.[0] || '>').toUpperCase()}</div>
                {/if}
              </div>
              <div class="identity-card-info">
                <h2 class="identity-card-name">{agentContext?.identityName ?? selectedAgent.id}</h2>
                <div class="identity-card-role">AI PRESENCE // {selectedAgent.description || 'AGENT'}</div>
                <div class="identity-card-model-badge">{agentContext?.model ?? '—'}</div>
                <div class="identity-card-badges">
                  <span class="identity-badge identity-badge-online">ONLINE</span>
                  {#if agentContext?.isDefault}
                    <span class="identity-badge identity-badge-trusted">DEFAULT</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="identity-card-divider"></div>
            <div class="identity-card-fields">
              <div class="identity-field-row">
                <span class="identity-field-label">USER</span>
                <span class="identity-field-value">IVAN</span>
              </div>
              <div class="identity-field-row">
                <span class="identity-field-label">AGENT ID</span>
                <span class="identity-field-value">{selectedAgent.id}</span>
              </div>
              <div class="identity-field-row">
                <span class="identity-field-label">WORKSPACE</span>
                <span class="identity-field-value">{agentContext?.workspace ?? '—'}</span>
              </div>
              <div class="identity-field-row">
                <span class="identity-field-label">SKILLS</span>
                <span class="identity-field-value">{agentContext?.skillsLabel ?? '—'}</span>
              </div>
            </div>
          </div>

          <!-- Tab bar -->
          <div class="hud-tab-bar">
            {#each tabs as tab}
              <button
                onclick={() => switchTab(tab.key)}
                class="hud-tab {activeTab === tab.key ? 'active' : ''}"
              >
                {tab.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Tab content -->
        <div class="hud-tab-content">

          <!-- OVERVIEW TAB -->
          {#if activeTab === 'overview'}
            <div class="hud-tab-inner">
              <!-- Overview grid -->
              <div class="hud-panel">
                <h3 class="hud-panel-lbl">OVERVIEW</h3>
                <p class="hud-subtitle">Workspace paths and identity metadata.</p>
                <div class="hud-grid hud-grid-6">
                  <div>
                    <div class="hud-field-label">WORKSPACE</div>
                    <div class="hud-field-value hud-mono">{agentContext?.workspace}</div>
                  </div>
                  <div>
                    <div class="hud-field-label">PRIMARY MODEL</div>
                    <div class="hud-field-value hud-mono">{agentContext?.model}</div>
                  </div>
                  <div>
                    <div class="hud-field-label">IDENTITY NAME</div>
                    <div class="hud-field-value">{agentContext?.identityName}</div>
                  </div>
                  <div>
                    <div class="hud-field-label">DEFAULT</div>
                    <div class="hud-field-value">{agentContext?.isDefault ? 'YES' : 'NO'}</div>
                  </div>
                  <div>
                    <div class="hud-field-label">IDENTITY EMOJI</div>
                    <div class="hud-field-value" style="font-size:1.2rem;">{agentContext?.identityEmoji}</div>
                  </div>
                  <div>
                    <div class="hud-field-label">SKILLS FILTER</div>
                    <div class="hud-field-value">{agentContext?.skillsLabel}</div>
                  </div>
                </div>
              </div>

              <!-- Model Selection -->
              <div class="hud-panel">
                <h3 class="hud-panel-lbl">MODEL SELECTION</h3>
                <p class="hud-subtitle">Primary model and fallback configuration.</p>
                <div class="hud-grid hud-grid-2">
                  <div>
                    <label class="hud-field-label">Primary model (default)</label>
                    <select bind:value={modelPrimary} class="hud-select">
                      <option value="">-- SELECT --</option>
                      {#each modelOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                      {#if modelPrimary && !modelOptions.some(o => o.value === modelPrimary)}
                        <option value={modelPrimary}>{modelPrimary} (current)</option>
                      {/if}
                    </select>
                  </div>
                  <div>
                    <label class="hud-field-label">Fallbacks (comma-separated)</label>
                    <input bind:value={modelFallbacks} placeholder="provider/model, provider/model"
                      class="hud-input" />
                  </div>
                </div>
                <div class="hud-actions">
                  <button onclick={() => loadConfig()} disabled={configSaving} class="hud-btn hud-btn-secondary">
                    RELOAD CONFIG
                  </button>
                  <button onclick={saveConfig} disabled={configSaving} class="hud-btn">
                    {configSaving ? 'SAVING...' : 'SAVE'}
                  </button>
                </div>
              </div>
            </div>

          <!-- FILES TAB -->
          {:else if activeTab === 'files'}
            <div class="hud-files-layout">
              <!-- File list -->
              <div class="hud-file-sidebar">
                <div class="hud-file-sidebar-header">
                  <span class="hud-panel-lbl">CORE FILES</span>
                  <button onclick={() => selectedAgentId && loadFiles(selectedAgentId)} disabled={filesLoading}
                    class="hud-btn-icon">
                    {filesLoading ? '...' : '>>'}
                  </button>
                </div>
                {#if filesList?.workspace}
                  <div class="hud-file-workspace">{filesList.workspace}</div>
                {/if}
                {#if filesLoading}
                  <div class="hud-empty-text hud-pad">Loading...</div>
                {:else if !filesList?.files?.length}
                  <div class="hud-empty-text hud-pad">No workspace files</div>
                {:else}
                  {#each filesList.files as file (file.name)}
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
                            &middot; {formatRelativeTime(file.updatedAtMs)}
                          {/if}
                        </div>
                      </div>
                      {#if file.missing}
                        <span class="hud-badge hud-badge-amber">MISSING</span>
                      {/if}
                    </button>
                  {/each}
                {/if}
              </div>

              <!-- File editor -->
              <div class="hud-file-editor">
                {#if !activeFile}
                  <div class="hud-empty">
                    <span class="hud-empty-text">// SELECT A FILE TO VIEW OR EDIT</span>
                  </div>
                {:else if fileLoading}
                  <div class="hud-empty">
                    <span class="hud-empty-text">Loading {activeFile}...</span>
                  </div>
                {:else}
                  <div class="hud-file-toolbar">
                    <div class="hud-file-toolbar-left">
                      <span class="hud-mono hud-file-active-name">{activeFile}</span>
                      {#if isDirty}
                        <span class="hud-dirty-dot"></span>
                      {/if}
                    </div>
                    {#if fileEncoding !== 'base64'}
                    <div class="hud-file-toolbar-right">
                      <button onclick={() => { fileDraft = fileContent; }} disabled={!isDirty}
                        class="hud-btn hud-btn-secondary hud-btn-sm">
                        RESET
                      </button>
                      <button onclick={saveFile} disabled={!isDirty || fileSaving}
                        class="hud-btn hud-btn-sm {isDirty ? '' : 'disabled'}">
                        {fileSaving ? 'SAVING...' : 'SAVE'}
                      </button>
                    </div>
                    {/if}
                  </div>
                  {#if activeFile && isImageFile(activeFile) && fileEncoding === 'base64'}
                    <div class="hud-file-preview">
                      <img
                        src={getImageDataUrl(activeFile, fileContent)}
                        alt={activeFile}
                        class="hud-file-image"
                      />
                    </div>
                  {:else if fileEncoding === 'base64'}
                    <div class="hud-file-binary">
                      <span class="hud-binary-icon">[BIN]</span>
                      <span class="hud-mono">{activeFile}</span>
                      <span class="hud-file-meta">Binary file ({Math.round((fileContent.length * 3/4) / 1024)} KB)</span>
                      <span class="hud-file-meta">Preview not available for this file type</span>
                    </div>
                  {:else}
                    <textarea
                      bind:value={fileDraft}
                      class="hud-textarea"
                      spellcheck="false"
                    ></textarea>
                  {/if}
                {/if}
              </div>
            </div>

          <!-- TOOLS TAB -->
          {:else if activeTab === 'tools'}
            <div class="hud-tab-inner">
              <div class="hud-panel">
                <h3 class="hud-panel-lbl">TOOL POLICY</h3>
                <p class="hud-subtitle">
                  Tool access configuration for this agent.
                  {#if selectedAgent?.tools?.profile}
                    <span class="hud-badge hud-badge-cyan">
                      profile: {selectedAgent.tools.profile}
                    </span>
                  {/if}
                </p>
                <div class="hud-grid hud-grid-3">
                  {#each TOOL_SECTIONS as section}
                    <div class="hud-tool-section">
                      <div class="hud-tool-section-label">{section.label}</div>
                      <div class="hud-tool-list">
                        {#each section.tools as tool}
                          {@const status = isToolAllowed(tool)}
                          <div class="hud-tool-row">
                            <span class="hud-mono hud-tool-name">{tool}</span>
                            <span class="hud-tool-status {status === 'allowed' ? 'hud-status-green' : status === 'denied' ? 'hud-status-red' : 'hud-status-muted'}">
                              {status}
                            </span>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>

          <!-- SKILLS TAB -->
          {:else if activeTab === 'skills'}
            <div class="hud-tab-inner">
              <div class="hud-panel">
                <div class="hud-panel-header">
                  <div>
                    <h3 class="hud-panel-lbl">SKILLS</h3>
                    <p class="hud-subtitle">Installed skills available to this agent.</p>
                  </div>
                  <button onclick={loadSkills} disabled={skillsLoading} class="hud-btn hud-btn-secondary">
                    {skillsLoading ? 'LOADING...' : 'REFRESH'}
                  </button>
                </div>
                {#if skillsLoading}
                  <div class="hud-empty-text">Loading skills...</div>
                {:else if skills.length === 0}
                  <div class="hud-empty-text">No skills installed.</div>
                {:else}
                  <div class="hud-grid hud-grid-3">
                    {#each skills as skill}
                      <div class="hud-skill-card">
                        <div class="hud-skill-header">
                          <span class="hud-accent-cyan">&gt;</span>
                          <span class="hud-skill-name">{skill.name}</span>
                          {#if skill.bundled}
                            <span class="hud-badge hud-badge-purple">BUNDLED</span>
                          {/if}
                        </div>
                        {#if skill.source}
                          <div class="hud-mono hud-file-meta">{skill.source}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

          <!-- CHANNELS TAB -->
          {:else if activeTab === 'channels'}
            <div class="hud-tab-inner">
              <div class="hud-grid hud-grid-2-lg">
                <!-- Agent context card -->
                {#if agentContext}
                  <div class="hud-panel">
                    <h3 class="hud-panel-lbl">AGENT CONTEXT</h3>
                    <p class="hud-subtitle">Workspace, identity, and model configuration.</p>
                    <div class="hud-grid hud-grid-2">
                      <div>
                        <div class="hud-field-label">WORKSPACE</div>
                        <div class="hud-field-value hud-mono">{agentContext.workspace}</div>
                      </div>
                      <div>
                        <div class="hud-field-label">MODEL</div>
                        <div class="hud-field-value hud-mono">{agentContext.model}</div>
                      </div>
                      <div>
                        <div class="hud-field-label">IDENTITY</div>
                        <div class="hud-field-value hud-mono">{agentContext.identityName}</div>
                      </div>
                      <div>
                        <div class="hud-field-label">DEFAULT</div>
                        <div class="hud-field-value hud-mono">{agentContext.isDefault ? 'YES' : 'NO'}</div>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Channel status -->
                <div class="hud-panel">
                  <div class="hud-panel-header">
                    <div>
                      <h3 class="hud-panel-lbl">CHANNELS</h3>
                      <p class="hud-subtitle">Gateway-wide channel status.</p>
                    </div>
                    <button onclick={loadChannels} disabled={channelsLoading} class="hud-btn hud-btn-secondary">
                      {channelsLoading ? 'LOADING...' : 'REFRESH'}
                    </button>
                  </div>
                  {#if !channelSnapshot}
                    <div class="hud-empty-text">Load channels to see live status.</div>
                  {:else}
                    {@const channels = (channelSnapshot.channels ?? {}) as Record<string, Record<string, unknown>>}
                    {@const accounts = (channelSnapshot.channelAccounts ?? {}) as Record<string, Array<Record<string, unknown>>>}
                    {@const channelIds = Object.keys(channels).length ? Object.keys(channels) : Object.keys(accounts)}
                    {#if channelIds.length === 0}
                      <div class="hud-empty-text">No channels found.</div>
                    {:else}
                      <div class="hud-channel-list">
                        {#each channelIds as chId}
                          {@const ch = channels[chId]}
                          {@const accts = accounts[chId] ?? []}
                          {@const connCount = accts.filter(a => a.connected || a.running).length}
                          <div class="hud-channel-row">
                            <div>
                              <div class="hud-channel-name">{chId}</div>
                              <div class="hud-file-meta">
                                {accts.length ? `${connCount}/${accts.length} connected` : 'no accounts'}
                                &middot; {ch?.configured ? 'configured' : 'not configured'}
                              </div>
                            </div>
                            <span class="hud-status-dot {ch?.configured || ch?.running ? 'online' : 'offline'}"></span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>

          <!-- CRON TAB -->
          {:else if activeTab === 'cron'}
            <div class="hud-tab-inner">
              <div class="hud-grid hud-grid-2-lg">
                <!-- Agent context -->
                {#if agentContext}
                  <div class="hud-panel">
                    <h3 class="hud-panel-lbl">AGENT CONTEXT</h3>
                    <p class="hud-subtitle">Workspace and scheduling targets.</p>
                    <div class="hud-grid hud-grid-2">
                      <div>
                        <div class="hud-field-label">WORKSPACE</div>
                        <div class="hud-field-value hud-mono">{agentContext.workspace}</div>
                      </div>
                      <div>
                        <div class="hud-field-label">MODEL</div>
                        <div class="hud-field-value hud-mono">{agentContext.model}</div>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Scheduler status -->
                <div class="hud-panel">
                  <div class="hud-panel-header">
                    <div>
                      <h3 class="hud-panel-lbl">SCHEDULER</h3>
                      <p class="hud-subtitle">Gateway cron status.</p>
                    </div>
                    <button onclick={loadCron} disabled={cronLoading} class="hud-btn hud-btn-secondary">
                      {cronLoading ? 'LOADING...' : 'REFRESH'}
                    </button>
                  </div>
                  <div class="hud-cron-stats">
                    <div class="hud-cron-stat">
                      <div class="hud-cron-stat-value">{cronStatus?.enabled ? 'YES' : 'NO'}</div>
                      <div class="hud-field-label">ENABLED</div>
                    </div>
                    <div class="hud-cron-stat">
                      <div class="hud-cron-stat-value">{cronStatus?.jobs ?? '-'}</div>
                      <div class="hud-field-label">JOBS</div>
                    </div>
                    <div class="hud-cron-stat">
                      <div class="hud-cron-stat-value">
                        {cronStatus?.nextWakeAtMs ? formatRelativeTime(cronStatus.nextWakeAtMs) : '-'}
                      </div>
                      <div class="hud-field-label">NEXT WAKE</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Agent cron jobs -->
              <div class="hud-panel">
                <h3 class="hud-panel-lbl">AGENT CRON JOBS</h3>
                <p class="hud-subtitle">Scheduled jobs targeting this agent.</p>
                {#if cronLoading}
                  <div class="hud-empty-text">Loading...</div>
                {:else if agentCronJobs.length === 0}
                  <div class="hud-empty-text">No jobs assigned to this agent.</div>
                {:else}
                  <div class="hud-cron-list">
                    {#each agentCronJobs as job}
                      <div class="hud-cron-job">
                        <div class="hud-cron-job-header">
                          <span class="hud-cron-job-name">{job.name || job.jobId || job.id}</span>
                          <span class="hud-badge {job.enabled !== false ? 'hud-badge-green' : 'hud-badge-amber'}">
                            {job.enabled !== false ? 'ENABLED' : 'DISABLED'}
                          </span>
                        </div>
                        <div class="hud-cron-job-meta">
                          <span class="hud-badge-mono">{formatSchedule(job)}</span>
                          {#if job.sessionTarget}
                            <span class="hud-badge-mono">{job.sessionTarget}</span>
                          {/if}
                          {#if job.payload?.kind}
                            <span class="hud-badge-mono">{job.payload.kind}</span>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  /* ─── HUD Page Layout ─────────────────────── */
  .hud-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    position: relative;
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1.5rem;
    border-bottom: 1px solid var(--color-accent-cyan);
    background: rgba(0, 0, 0, 0.6);
    flex-shrink: 0;
    z-index: 2;
  }

  .hud-back {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
    text-decoration: none;
    letter-spacing: 0.1em;
    transition: color 0.2s, text-shadow 0.2s;
  }

  .hud-back:hover {
    color: var(--color-accent-green);
    text-shadow: 0 0 8px var(--color-accent-green);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.85rem;
    letter-spacing: 0.2em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 10px var(--color-accent-cyan);
  }

  /* ─── Header ──────────────────────────────── */
  .hud-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.4);
    flex-shrink: 0;
    z-index: 2;
  }

  .hud-h1 {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px var(--color-accent-cyan);
    margin: 0;
  }

  .hud-h2 {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 8px var(--color-accent-cyan);
    margin: 0;
  }

  .hud-subtitle {
    font-size: 0.7rem;
    color: rgba(0, 255, 255, 0.4);
    margin-top: 0.2rem;
  }

  .hud-accent-cyan {
    color: var(--color-accent-cyan);
  }

  .hud-mono {
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Main Layout ─────────────────────────── */
  .hud-main {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    z-index: 2;
  }

  /* ─── Sidebar ─────────────────────────────── */
  .hud-sidebar {
    display: none;
    width: 12rem;
    border-right: 1px solid rgba(0, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.5);
    flex-direction: column;
    flex-shrink: 0;
  }

  @media (min-width: 768px) {
    .hud-sidebar {
      display: flex;
    }
  }

  .hud-sidebar-header {
    padding: 0.75rem;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
  }

  .hud-count {
    font-size: 0.65rem;
    color: rgba(0, 255, 255, 0.35);
    margin-top: 0.15rem;
  }

  .hud-sidebar-list {
    flex: 1;
    overflow-y: auto;
  }

  .hud-agent-item {
    width: 100%;
    text-align: left;
    padding: 0.75rem;
    transition: all 0.2s;
    border-left: 2px solid transparent;
    background: transparent;
    border-top: none;
    border-right: none;
    border-bottom: none;
    cursor: pointer;
    display: block;
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-agent-item:hover {
    background: rgba(0, 255, 255, 0.05);
  }

  .hud-agent-item.active {
    border-left-color: var(--color-accent-cyan);
    background: rgba(0, 255, 255, 0.08);
  }

  .hud-agent-item-inner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  /* ── Sidebar Avatar ── */
  .sidebar-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 2px solid var(--color-accent-cyan);
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    background: rgba(0, 229, 255, 0.08);
  }

  .sidebar-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sidebar-avatar-letter {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 8px var(--color-accent-cyan);
  }

  .hud-agent-item.active .sidebar-avatar {
    box-shadow: 0 0 15px rgba(0, 229, 255, 0.5), 0 0 30px rgba(0, 229, 255, 0.2);
  }

  .hud-agent-info {
    min-width: 0;
    flex: 1;
  }

  .hud-agent-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--color-accent-cyan);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hud-agent-item.active .hud-agent-name {
    text-shadow: 0 0 6px var(--color-accent-cyan);
  }

  .hud-agent-id {
    font-size: 0.75rem;
    color: rgba(0, 255, 255, 0.3);
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Badges ──────────────────────────────── */
  .hud-badge {
    display: inline-block;
    margin-top: 0.25rem;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
    font-size: 0.55rem;
    letter-spacing: 0.1em;
    font-weight: 600;
    font-family: 'Orbitron', sans-serif;
  }

  .hud-badge-purple {
    background: rgba(168, 85, 247, 0.2);
    color: #a855f7;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .hud-badge-cyan {
    background: rgba(0, 255, 255, 0.15);
    color: var(--color-accent-cyan);
    border: 1px solid rgba(0, 255, 255, 0.25);
  }

  .hud-badge-green {
    background: rgba(0, 255, 100, 0.15);
    color: var(--color-accent-green);
    border: 1px solid rgba(0, 255, 100, 0.25);
  }

  .hud-badge-amber {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .hud-badge-mono {
    display: inline-block;
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
    font-size: 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    background: rgba(0, 255, 255, 0.08);
    color: rgba(0, 255, 255, 0.5);
    border: 1px solid rgba(0, 255, 255, 0.1);
  }

  /* ─── Content ─────────────────────────────── */
  .hud-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .hud-mobile-select {
    display: block;
    padding: 0.75rem;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.4);
    flex-shrink: 0;
  }

  @media (min-width: 768px) {
    .hud-mobile-select {
      display: none;
    }
  }

  .hud-empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hud-empty-text {
    font-size: 0.8rem;
    color: rgba(0, 255, 255, 0.3);
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-pad {
    padding: 1rem;
  }

  /* ─── Agent Header & Tabs ─────────────────── */
  .hud-agent-header {
    flex-shrink: 0;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
  }

  /* ── Identity Card (Detail Header) ── */
  .hud-identity-card {
    background: color-mix(in srgb, var(--color-accent-cyan) 5%, #0a0a0f 95%);
    border: 1px solid rgba(0, 229, 255, 0.2);
    border-radius: 8px;
    padding: 1.25rem;
    margin: 1rem 1.5rem 0.75rem;
    position: relative;
    overflow: hidden;
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.1);
  }

  .hud-identity-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.8;
  }

  .identity-header-label {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.35em;
    color: var(--color-accent-cyan);
    text-transform: uppercase;
    opacity: 0.5;
    text-align: center;
    margin-bottom: 0.75rem;
  }

  .identity-card-body {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }

  @media (max-width: 600px) {
    .identity-card-body {
      flex-direction: column;
      text-align: center;
    }
  }

  .identity-card-avatar-wrap {
    flex-shrink: 0;
  }

  .identity-card-avatar {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 3px solid var(--color-accent-cyan);
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.5),
                0 0 40px rgba(0, 229, 255, 0.25);
    object-fit: cover;
  }

  .identity-card-avatar-placeholder {
    width: 100px;
    height: 100px;
    border-radius: 50%;
    border: 3px solid var(--color-accent-cyan);
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Orbitron', sans-serif;
    font-size: 2.5rem;
    color: var(--color-accent-cyan);
    background: rgba(0, 229, 255, 0.08);
  }

  .identity-card-info {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .identity-card-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px var(--color-accent-cyan);
    margin: 0;
    letter-spacing: 0.1em;
  }

  .identity-card-role {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: rgba(0, 255, 255, 0.4);
    letter-spacing: 0.1em;
  }

  .identity-card-model-badge {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: rgba(0, 255, 255, 0.6);
    border: 1px solid rgba(0, 229, 255, 0.3);
    border-radius: 3px;
    background: rgba(0, 229, 255, 0.08);
    width: fit-content;
  }

  .identity-card-badges {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.15rem;
  }

  .identity-badge {
    display: inline-block;
    padding: 0.2rem 0.8rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.15em;
    border: 1px solid;
    border-radius: 2px;
  }

  .identity-badge-online {
    color: #00e676;
    border-color: #00e676;
    text-shadow: 0 0 6px #00e676;
    box-shadow: 0 0 8px rgba(0, 230, 118, 0.3);
  }

  .identity-badge-trusted {
    color: #00e5ff;
    border-color: #00e5ff;
    text-shadow: 0 0 6px #00e5ff;
  }

  .identity-card-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.3;
    margin: 0.75rem 0;
  }

  .identity-card-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
  }

  @media (max-width: 600px) {
    .identity-card-fields {
      grid-template-columns: 1fr;
    }
  }

  .identity-field-row {
    display: flex;
    justify-content: space-between;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }

  .identity-field-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.1em;
  }

  .identity-field-value {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: var(--color-accent-cyan);
  }

  .hud-tab-bar {
    display: flex;
    gap: 0;
    padding: 0 1.5rem;
    overflow-x: auto;
  }

  .hud-tab {
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    font-family: 'Orbitron', sans-serif;
    font-weight: 500;
    letter-spacing: 0.08em;
    transition: all 0.2s;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    background: transparent;
    border-top: none;
    border-left: none;
    border-right: none;
    cursor: pointer;
    color: rgba(0, 255, 255, 0.35);
  }

  .hud-tab:hover {
    color: rgba(0, 255, 255, 0.6);
    border-bottom-color: rgba(0, 255, 255, 0.2);
  }

  .hud-tab.active {
    color: var(--color-accent-cyan);
    border-bottom-color: var(--color-accent-cyan);
    background: rgba(0, 255, 255, 0.05);
    text-shadow: 0 0 8px var(--color-accent-cyan);
  }

  .hud-tab-content {
    flex: 1;
    overflow-y: auto;
  }

  .hud-tab-inner {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ─── Panel ───────────────────────────────── */
  .hud-panel {
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 4px;
    padding: 1.25rem;
    position: relative;
  }

  .hud-panel::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.6;
  }

  .hud-panel-lbl {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 6px var(--color-accent-cyan);
    margin-bottom: 0.25rem;
  }

  .hud-panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  /* ─── Grid ────────────────────────────────── */
  .hud-grid {
    display: grid;
    gap: 1rem;
    margin-top: 1rem;
  }

  .hud-grid-2 {
    grid-template-columns: repeat(1, 1fr);
  }
  @media (min-width: 768px) {
    .hud-grid-2 { grid-template-columns: repeat(2, 1fr); }
  }

  .hud-grid-3 {
    grid-template-columns: repeat(1, 1fr);
  }
  @media (min-width: 768px) {
    .hud-grid-3 { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1024px) {
    .hud-grid-3 { grid-template-columns: repeat(3, 1fr); }
  }

  .hud-grid-6 {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 768px) {
    .hud-grid-6 { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 1024px) {
    .hud-grid-6 { grid-template-columns: repeat(6, 1fr); }
  }

  .hud-grid-2-lg {
    grid-template-columns: 1fr;
  }
  @media (min-width: 1024px) {
    .hud-grid-2-lg { grid-template-columns: repeat(2, 1fr); }
  }

  /* ─── Fields ──────────────────────────────── */
  .hud-field-label {
    font-size: 0.75rem;
    letter-spacing: 0.15em;
    color: rgba(0, 255, 255, 0.35);
    margin-bottom: 0.25rem;
    font-family: 'Orbitron', sans-serif;
  }

  .hud-field-value {
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
  }

  /* ─── Buttons ─────────────────────────────── */
  .hud-btn {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    padding: 0.4rem 1rem;
    border: 1px solid var(--color-accent-cyan);
    background: rgba(0, 255, 255, 0.1);
    color: var(--color-accent-cyan);
    cursor: pointer;
    transition: all 0.2s;
    border-radius: 2px;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .hud-btn:hover {
    background: rgba(0, 255, 255, 0.2);
    text-shadow: 0 0 8px var(--color-accent-cyan);
    box-shadow: 0 0 12px rgba(0, 255, 255, 0.2);
  }

  .hud-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hud-btn.disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .hud-btn-secondary {
    background: rgba(0, 255, 255, 0.03);
    border-color: rgba(0, 255, 255, 0.25);
    color: rgba(0, 255, 255, 0.6);
  }

  .hud-btn-secondary:hover {
    background: rgba(0, 255, 255, 0.08);
    color: var(--color-accent-cyan);
  }

  .hud-btn-sm {
    font-size: 0.75rem;
    padding: 0.25rem 0.6rem;
  }

  .hud-btn-icon {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: rgba(0, 255, 255, 0.4);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.2s;
  }

  .hud-btn-icon:hover {
    color: var(--color-accent-cyan);
  }

  .hud-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .hud-spinner {
    display: inline-block;
    width: 0.7rem;
    height: 0.7rem;
    border: 2px solid rgba(0, 255, 255, 0.2);
    border-top-color: var(--color-accent-cyan);
    border-radius: 50%;
    animation: hud-spin 0.6s linear infinite;
  }

  @keyframes hud-spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Inputs ──────────────────────────────── */
  .hud-select {
    width: 100%;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s;
  }

  .hud-select:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.15);
  }

  .hud-select option {
    background: #0a0a0f;
    color: var(--color-accent-cyan);
  }

  .hud-input {
    width: 100%;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(0, 255, 255, 0.25);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .hud-input::placeholder {
    color: rgba(0, 255, 255, 0.2);
  }

  .hud-input:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 8px rgba(0, 255, 255, 0.15);
  }

  .hud-textarea {
    flex: 1;
    width: 100%;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.6);
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    resize: none;
    outline: none;
    border: none;
    box-sizing: border-box;
  }

  /* ─── Files Layout ────────────────────────── */
  .hud-files-layout {
    flex: 1;
    display: flex;
    min-height: 0;
    height: 100%;
  }

  .hud-file-sidebar {
    width: 14rem;
    border-right: 1px solid rgba(0, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.5);
    overflow-y: auto;
    flex-shrink: 0;
  }

  .hud-file-sidebar-header {
    padding: 0.75rem;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hud-file-workspace {
    padding: 0.4rem 0.75rem;
    font-size: 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    color: rgba(0, 255, 255, 0.2);
    border-bottom: 1px solid rgba(0, 255, 255, 0.08);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hud-file-item {
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.15s;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    color: rgba(0, 255, 255, 0.5);
  }

  .hud-file-item:hover {
    background: rgba(0, 255, 255, 0.05);
    color: var(--color-accent-cyan);
  }

  .hud-file-item.active {
    background: rgba(0, 255, 255, 0.1);
    color: var(--color-accent-cyan);
  }

  .hud-file-icon {
    font-size: 0.75rem;
    color: rgba(0, 255, 255, 0.4);
    flex-shrink: 0;
  }

  .hud-file-info {
    min-width: 0;
    flex: 1;
  }

  .hud-file-name {
    font-size: 0.7rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hud-file-meta {
    font-size: 0.75rem;
    color: rgba(0, 255, 255, 0.25);
  }

  .hud-file-editor {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .hud-file-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
    background: rgba(0, 0, 0, 0.4);
    flex-shrink: 0;
  }

  .hud-file-toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-file-toolbar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-file-active-name {
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
  }

  .hud-dirty-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #f59e0b;
    box-shadow: 0 0 6px #f59e0b;
  }

  .hud-file-preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.6);
    overflow: auto;
  }

  .hud-file-image {
    max-width: 100%;
    max-height: calc(100vh - 200px);
    border-radius: 4px;
    border: 1px solid rgba(0, 255, 255, 0.2);
    object-fit: contain;
  }

  .hud-file-binary {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    background: rgba(0, 0, 0, 0.6);
    gap: 0.5rem;
  }

  .hud-binary-icon {
    font-size: 1.5rem;
    color: rgba(0, 255, 255, 0.3);
  }

  /* ─── Tools Tab ───────────────────────────── */
  .hud-tool-section {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(0, 255, 255, 0.12);
    border-radius: 2px;
    padding: 0.75rem;
  }

  .hud-tool-section-label {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    margin-bottom: 0.5rem;
  }

  .hud-tool-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .hud-tool-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0;
  }

  .hud-tool-name {
    font-size: 0.7rem;
    color: rgba(0, 255, 255, 0.5);
  }

  .hud-tool-status {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    border-radius: 2px;
    font-weight: 500;
    font-family: 'Share Tech Mono', monospace;
  }

  .hud-status-green {
    background: rgba(0, 255, 100, 0.12);
    color: var(--color-accent-green);
  }

  .hud-status-red {
    background: rgba(255, 50, 50, 0.12);
    color: #f87171;
  }

  .hud-status-muted {
    background: rgba(0, 255, 255, 0.05);
    color: rgba(0, 255, 255, 0.3);
  }

  /* ─── Skills Tab ──────────────────────────── */
  .hud-skill-card {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(0, 255, 255, 0.12);
    border-radius: 2px;
    padding: 0.75rem;
  }

  .hud-skill-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-bottom: 0.25rem;
  }

  .hud-skill-name {
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
  }

  /* ─── Channels Tab ────────────────────────── */
  .hud-channel-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .hud-channel-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(0, 255, 255, 0.06);
  }

  .hud-channel-row:last-child {
    border-bottom: none;
  }

  .hud-channel-name {
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
  }

  .hud-status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }

  .hud-status-dot.online {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
  }

  .hud-status-dot.offline {
    background: rgba(0, 255, 255, 0.15);
  }

  /* ─── Cron Tab ────────────────────────────── */
  .hud-cron-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .hud-cron-stat {
    text-align: center;
  }

  .hud-cron-stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 8px var(--color-accent-cyan);
  }

  .hud-cron-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .hud-cron-job {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(0, 255, 255, 0.12);
    border-radius: 2px;
    padding: 0.75rem;
  }

  .hud-cron-job-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.4rem;
  }

  .hud-cron-job-name {
    font-size: 0.8rem;
    color: var(--color-accent-cyan);
  }

  .hud-cron-job-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
</style>
