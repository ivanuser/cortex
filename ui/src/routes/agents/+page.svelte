<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';

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
    return e.trim() || '🤖';
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

  // ─── Tabs Config ───────────────────────────
  const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '📊' },
    { key: 'files', label: 'Files', icon: '📁' },
    { key: 'tools', label: 'Tools', icon: '🔧' },
    { key: 'skills', label: 'Skills', icon: '⚡' },
    { key: 'channels', label: 'Channels', icon: '💬' },
    { key: 'cron', label: 'Cron Jobs', icon: '⏰' },
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

<div class="h-full flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="px-4 md:px-6 py-4 border-b border-border-default flex items-center justify-between flex-shrink-0">
    <div>
      <h1 class="text-xl font-bold text-text-primary flex items-center gap-2">
        <span class="text-accent-cyan">🤖</span> Agents
      </h1>
      <p class="text-sm text-text-muted">Manage agent workspaces, tools, and identities.</p>
    </div>
    <button onclick={() => loadAgents()} disabled={loading}
      class="px-3 py-1.5 rounded-lg text-sm border border-border-default hover:border-accent-cyan
             text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 flex items-center gap-1.5">
      {#if loading}<svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{/if}
      Refresh
    </button>
  </div>

  <div class="flex-1 flex min-h-0 overflow-hidden">
    <!-- Agent list sidebar (hidden on mobile, replaced by dropdown) -->
    <div class="hidden md:flex w-48 border-r border-border-default bg-bg-secondary/30 flex-col flex-shrink-0">
      <div class="p-3 border-b border-border-default">
        <div class="text-xs font-medium text-text-muted uppercase tracking-wider">
          Agents
        </div>
        <div class="text-xs text-text-muted mt-0.5">{agents.length} configured</div>
      </div>
      <div class="flex-1 overflow-y-auto">
        {#each agents as agent (agent.id)}
          <button
            onclick={() => selectAgent(agent.id)}
            class="w-full text-left px-3 py-3 transition-all border-l-2 group
                   {selectedAgentId === agent.id
                     ? 'border-accent-cyan bg-accent-cyan/5'
                     : 'border-transparent hover:bg-bg-hover'}"
          >
            <div class="flex items-center gap-2">
              <span class="text-lg">{resolveAgentEmoji(agent)}</span>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate {selectedAgentId === agent.id ? 'text-accent-cyan' : 'text-text-primary group-hover:text-text-primary'}">
                  {agent.identity?.name || agent.name || agent.id}
                </div>
                <div class="text-[10px] text-text-muted font-mono">{agent.id}</div>
              </div>
            </div>
            {#if agent.id === defaultAgentId}
              <span class="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-accent-purple/20 text-accent-purple">default</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <!-- Main content -->
    <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
      <!-- Mobile agent selector -->
      {#if agents.length > 0}
        <div class="md:hidden flex-shrink-0 p-3 border-b border-border-default bg-bg-secondary/30">
          <select
            value={selectedAgentId ?? ''}
            onchange={(e) => selectAgent(e.currentTarget.value)}
            class="w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan"
          >
            <option value="" disabled>Select agent…</option>
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
        <div class="flex-1 flex items-center justify-center text-text-muted">
          Select an agent to view details
        </div>
      {:else}
        <!-- Agent header + tabs -->
        <div class="flex-shrink-0 border-b border-border-default">
          <!-- Agent identity bar -->
          <div class="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-3">
              <span class="text-2xl">{resolveAgentEmoji(selectedAgent)}</span>
              <div>
                <h2 class="text-lg font-bold text-text-primary">{agentContext?.identityName ?? selectedAgent.id}</h2>
                <p class="text-xs text-text-muted">Agent workspace and routing.</p>
              </div>
            </div>
            <div class="flex items-center gap-2 text-xs text-text-muted">
              <span class="font-mono">{selectedAgent.id}</span>
              {#if agentContext?.isDefault}
                <span class="px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple text-[10px] uppercase font-semibold">default</span>
              {/if}
            </div>
          </div>

          <!-- Tab bar -->
          <div class="flex gap-0 px-4 md:px-6 overflow-x-auto">
            {#each tabs as tab}
              <button
                onclick={() => switchTab(tab.key)}
                class="px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap
                       {activeTab === tab.key
                         ? 'border-accent-cyan text-accent-cyan bg-accent-cyan/5'
                         : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-default'}"
              >
                {tab.label}
              </button>
            {/each}
          </div>
        </div>

        <!-- Tab content -->
        <div class="flex-1 overflow-y-auto">

          <!-- ═══ OVERVIEW TAB ═══ -->
          {#if activeTab === 'overview'}
            <div class="p-6 space-y-6">
              <!-- Overview grid -->
              <div class="glass rounded-xl border border-border-default p-5">
                <h3 class="text-sm font-semibold text-text-primary mb-1">Overview</h3>
                <p class="text-xs text-text-muted mb-4">Workspace paths and identity metadata.</p>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Workspace</div>
                    <div class="text-sm font-mono text-text-primary">{agentContext?.workspace}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Primary Model</div>
                    <div class="text-sm font-mono text-text-primary">{agentContext?.model}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Identity Name</div>
                    <div class="text-sm text-text-primary">{agentContext?.identityName}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Default</div>
                    <div class="text-sm text-text-primary">{agentContext?.isDefault ? 'yes' : 'no'}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Identity Emoji</div>
                    <div class="text-lg">{agentContext?.identityEmoji}</div>
                  </div>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Skills Filter</div>
                    <div class="text-sm text-text-primary">{agentContext?.skillsLabel}</div>
                  </div>
                </div>
              </div>

              <!-- Model Selection -->
              <div class="glass rounded-xl border border-border-default p-5">
                <h3 class="text-sm font-semibold text-text-primary mb-1">Model Selection</h3>
                <p class="text-xs text-text-muted mb-4">Primary model and fallback configuration.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs text-text-muted mb-1.5">Primary model (default)</label>
                    <select bind:value={modelPrimary}
                      class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary
                             focus:outline-none focus:border-accent-cyan transition-all">
                      <option value="">— select —</option>
                      {#each modelOptions as opt}
                        <option value={opt.value}>{opt.label}</option>
                      {/each}
                      {#if modelPrimary && !modelOptions.some(o => o.value === modelPrimary)}
                        <option value={modelPrimary}>{modelPrimary} (current)</option>
                      {/if}
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1.5">Fallbacks (comma-separated)</label>
                    <input bind:value={modelFallbacks} placeholder="provider/model, provider/model"
                      class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary
                             placeholder:text-text-muted/40 focus:outline-none focus:border-accent-cyan transition-all" />
                  </div>
                </div>
                <div class="flex justify-end gap-2 mt-4">
                  <button onclick={() => loadConfig()} disabled={configSaving}
                    class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-text-primary transition-all">
                    Reload Config
                  </button>
                  <button onclick={saveConfig} disabled={configSaving}
                    class="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30
                           hover:bg-accent-cyan/30 transition-all disabled:opacity-50">
                    {configSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

          <!-- ═══ FILES TAB ═══ -->
          {:else if activeTab === 'files'}
            <div class="flex-1 flex min-h-0 h-full">
              <!-- File list -->
              <div class="w-56 border-r border-border-default bg-bg-tertiary/30 overflow-y-auto flex-shrink-0">
                <div class="p-3 border-b border-border-default flex items-center justify-between">
                  <span class="text-xs font-medium text-text-muted">Core Files</span>
                  <button onclick={() => selectedAgentId && loadFiles(selectedAgentId)} disabled={filesLoading}
                    class="text-[10px] text-text-muted hover:text-accent-cyan transition-all">
                    {filesLoading ? '...' : '↻'}
                  </button>
                </div>
                {#if filesList?.workspace}
                  <div class="px-3 py-1.5 text-[10px] font-mono text-text-muted/60 truncate border-b border-border-default/50">
                    {filesList.workspace}
                  </div>
                {/if}
                {#if filesLoading}
                  <div class="p-4 text-text-muted text-sm">Loading…</div>
                {:else if !filesList?.files?.length}
                  <div class="p-4 text-text-muted text-sm">No workspace files</div>
                {:else}
                  {#each filesList.files as file (file.name)}
                    <button
                      onclick={() => openFile(file.name)}
                      class="w-full text-left px-3 py-2 text-sm transition-all flex items-center gap-2
                             {activeFile === file.name
                               ? 'bg-accent-cyan/10 text-accent-cyan'
                               : 'hover:bg-bg-hover text-text-secondary'}"
                    >
                      <span class="text-xs">{getFileIcon(file.name)}</span>
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-mono text-xs">{file.name}</div>
                        <div class="text-[10px] text-text-muted">
                          {file.missing ? 'missing' : formatBytes(file.size)}
                          {#if file.updatedAtMs && !file.missing}
                            · {formatRelativeTime(file.updatedAtMs)}
                          {/if}
                        </div>
                      </div>
                      {#if file.missing}
                        <span class="px-1 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400">missing</span>
                      {/if}
                    </button>
                  {/each}
                {/if}
              </div>

              <!-- File editor -->
              <div class="flex-1 flex flex-col min-w-0">
                {#if !activeFile}
                  <div class="flex-1 flex items-center justify-center text-text-muted text-sm">
                    Select a file to view or edit
                  </div>
                {:else if fileLoading}
                  <div class="flex-1 flex items-center justify-center text-text-muted text-sm">
                    Loading {activeFile}…
                  </div>
                {:else}
                  <div class="flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-secondary/30 flex-shrink-0">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-mono font-medium text-text-primary">{activeFile}</span>
                      {#if isDirty}
                        <span class="w-2 h-2 rounded-full bg-accent-amber"></span>
                      {/if}
                    </div>
                    {#if fileEncoding !== 'base64'}
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
                    {/if}
                  </div>
                  {#if activeFile && isImageFile(activeFile) && fileEncoding === 'base64'}
                    <div class="flex-1 flex items-center justify-center p-6 bg-bg-primary overflow-auto">
                      <img
                        src={getImageDataUrl(activeFile, fileContent)}
                        alt={activeFile}
                        class="max-w-full max-h-full rounded-lg shadow-lg object-contain"
                        style="max-height: calc(100vh - 200px);"
                      />
                    </div>
                  {:else if fileEncoding === 'base64'}
                    <div class="flex-1 flex flex-col items-center justify-center p-6 bg-bg-primary text-text-muted gap-3">
                      <span class="text-3xl">📦</span>
                      <span class="text-sm font-medium">{activeFile}</span>
                      <span class="text-xs">Binary file ({Math.round((fileContent.length * 3/4) / 1024)} KB)</span>
                      <span class="text-xs text-text-muted/60">Preview not available for this file type</span>
                    </div>
                  {:else}
                    <textarea
                      bind:value={fileDraft}
                      class="flex-1 w-full p-4 bg-bg-primary text-text-primary font-mono text-sm resize-none focus:outline-none border-none"
                      spellcheck="false"
                    ></textarea>
                  {/if}
                {/if}
              </div>
            </div>

          <!-- ═══ TOOLS TAB ═══ -->
          {:else if activeTab === 'tools'}
            <div class="p-6 space-y-4">
              <div class="glass rounded-xl border border-border-default p-5">
                <h3 class="text-sm font-semibold text-text-primary mb-1">Tool Policy</h3>
                <p class="text-xs text-text-muted mb-4">
                  Tool access configuration for this agent.
                  {#if selectedAgent?.tools?.profile}
                    <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-accent-cyan/20 text-accent-cyan font-mono">
                      profile: {selectedAgent.tools.profile}
                    </span>
                  {/if}
                </p>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {#each TOOL_SECTIONS as section}
                    <div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3">
                      <div class="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">{section.label}</div>
                      <div class="space-y-1">
                        {#each section.tools as tool}
                          {@const status = isToolAllowed(tool)}
                          <div class="flex items-center justify-between py-1">
                            <span class="text-xs font-mono text-text-secondary">{tool}</span>
                            <span class="text-[10px] px-1.5 py-0.5 rounded font-medium
                                         {status === 'allowed' ? 'bg-accent-green/15 text-accent-green' :
                                          status === 'denied' ? 'bg-red-500/15 text-red-400' :
                                          'bg-bg-tertiary text-text-muted'}">
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

          <!-- ═══ SKILLS TAB ═══ -->
          {:else if activeTab === 'skills'}
            <div class="p-6 space-y-4">
              <div class="glass rounded-xl border border-border-default p-5">
                <div class="flex items-center justify-between mb-4">
                  <div>
                    <h3 class="text-sm font-semibold text-text-primary">Skills</h3>
                    <p class="text-xs text-text-muted">Installed skills available to this agent.</p>
                  </div>
                  <button onclick={loadSkills} disabled={skillsLoading}
                    class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-50">
                    {skillsLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                {#if skillsLoading}
                  <div class="text-text-muted text-sm">Loading skills…</div>
                {:else if skills.length === 0}
                  <div class="text-text-muted text-sm">No skills installed.</div>
                {:else}
                  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {#each skills as skill}
                      <div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3">
                        <div class="flex items-center gap-2 mb-1">
                          <span class="text-xs">⚡</span>
                          <span class="text-sm font-medium text-text-primary">{skill.name}</span>
                          {#if skill.bundled}
                            <span class="px-1 py-0.5 rounded text-[9px] bg-accent-purple/20 text-accent-purple">bundled</span>
                          {/if}
                        </div>
                        {#if skill.source}
                          <div class="text-[10px] text-text-muted font-mono truncate">{skill.source}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            </div>

          <!-- ═══ CHANNELS TAB ═══ -->
          {:else if activeTab === 'channels'}
            <div class="p-6 space-y-4">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Agent context card -->
                {#if agentContext}
                  <div class="glass rounded-xl border border-border-default p-5">
                    <h3 class="text-sm font-semibold text-text-primary mb-1">Agent Context</h3>
                    <p class="text-xs text-text-muted mb-4">Workspace, identity, and model configuration.</p>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Workspace</div>
                        <div class="text-xs font-mono text-text-primary">{agentContext.workspace}</div>
                      </div>
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Model</div>
                        <div class="text-xs font-mono text-text-primary">{agentContext.model}</div>
                      </div>
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Identity</div>
                        <div class="text-xs font-mono text-text-primary">{agentContext.identityName}</div>
                      </div>
                      <div>
                        <div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Default</div>
                        <div class="text-xs font-mono text-text-primary">{agentContext.isDefault ? 'yes' : 'no'}</div>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Channel status -->
                <div class="glass rounded-xl border border-border-default p-5">
                  <div class="flex items-center justify-between mb-4">
                    <div>
                      <h3 class="text-sm font-semibold text-text-primary">Channels</h3>
                      <p class="text-xs text-text-muted">Gateway-wide channel status.</p>
                    </div>
                    <button onclick={loadChannels} disabled={channelsLoading}
                      class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
                      {channelsLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                  {#if !channelSnapshot}
                    <div class="text-text-muted text-sm">Load channels to see live status.</div>
                  {:else}
                    {@const channels = (channelSnapshot.channels ?? {}) as Record<string, Record<string, unknown>>}
                    {@const accounts = (channelSnapshot.channelAccounts ?? {}) as Record<string, Array<Record<string, unknown>>>}
                    {@const channelIds = Object.keys(channels).length ? Object.keys(channels) : Object.keys(accounts)}
                    {#if channelIds.length === 0}
                      <div class="text-text-muted text-sm">No channels found.</div>
                    {:else}
                      <div class="space-y-2">
                        {#each channelIds as chId}
                          {@const ch = channels[chId]}
                          {@const accts = accounts[chId] ?? []}
                          {@const connCount = accts.filter(a => a.connected || a.running).length}
                          <div class="flex items-center justify-between py-1.5 border-b border-border-default/30 last:border-0">
                            <div>
                              <div class="text-sm font-medium text-text-primary">{chId}</div>
                              <div class="text-[10px] text-text-muted">
                                {accts.length ? `${connCount}/${accts.length} connected` : 'no accounts'}
                                · {ch?.configured ? 'configured' : 'not configured'}
                              </div>
                            </div>
                            <span class="w-2 h-2 rounded-full {ch?.configured || ch?.running ? 'bg-accent-green' : 'bg-text-muted/30'}"></span>
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {/if}
                </div>
              </div>
            </div>

          <!-- ═══ CRON TAB ═══ -->
          {:else if activeTab === 'cron'}
            <div class="p-6 space-y-4">
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <!-- Agent context -->
                {#if agentContext}
                  <div class="glass rounded-xl border border-border-default p-5">
                    <h3 class="text-sm font-semibold text-text-primary mb-1">Agent Context</h3>
                    <p class="text-xs text-text-muted mb-3">Workspace and scheduling targets.</p>
                    <div class="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span class="text-text-muted">Workspace</span>
                        <div class="font-mono text-text-primary">{agentContext.workspace}</div>
                      </div>
                      <div>
                        <span class="text-text-muted">Model</span>
                        <div class="font-mono text-text-primary">{agentContext.model}</div>
                      </div>
                    </div>
                  </div>
                {/if}

                <!-- Scheduler status -->
                <div class="glass rounded-xl border border-border-default p-5">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <h3 class="text-sm font-semibold text-text-primary">Scheduler</h3>
                      <p class="text-xs text-text-muted">Gateway cron status.</p>
                    </div>
                    <button onclick={loadCron} disabled={cronLoading}
                      class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
                      {cronLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                  <div class="grid grid-cols-3 gap-4">
                    <div class="text-center">
                      <div class="text-lg font-bold text-text-primary">{cronStatus?.enabled ? 'Yes' : 'No'}</div>
                      <div class="text-[10px] text-text-muted uppercase">Enabled</div>
                    </div>
                    <div class="text-center">
                      <div class="text-lg font-bold text-text-primary">{cronStatus?.jobs ?? '-'}</div>
                      <div class="text-[10px] text-text-muted uppercase">Jobs</div>
                    </div>
                    <div class="text-center">
                      <div class="text-lg font-bold text-text-primary">
                        {cronStatus?.nextWakeAtMs ? formatRelativeTime(cronStatus.nextWakeAtMs) : '-'}
                      </div>
                      <div class="text-[10px] text-text-muted uppercase">Next Wake</div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Agent cron jobs -->
              <div class="glass rounded-xl border border-border-default p-5">
                <h3 class="text-sm font-semibold text-text-primary mb-1">Agent Cron Jobs</h3>
                <p class="text-xs text-text-muted mb-4">Scheduled jobs targeting this agent.</p>
                {#if cronLoading}
                  <div class="text-text-muted text-sm">Loading…</div>
                {:else if agentCronJobs.length === 0}
                  <div class="text-text-muted text-sm">No jobs assigned to this agent.</div>
                {:else}
                  <div class="space-y-2">
                    {#each agentCronJobs as job}
                      <div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3">
                        <div class="flex items-center justify-between mb-1">
                          <span class="text-sm font-medium text-text-primary">{job.name || job.jobId || job.id}</span>
                          <span class="px-1.5 py-0.5 rounded text-[10px] font-medium
                                       {job.enabled !== false ? 'bg-accent-green/15 text-accent-green' : 'bg-amber-500/15 text-amber-400'}">
                            {job.enabled !== false ? 'enabled' : 'disabled'}
                          </span>
                        </div>
                        <div class="flex items-center gap-2 text-[10px] text-text-muted">
                          <span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">{formatSchedule(job)}</span>
                          {#if job.sessionTarget}
                            <span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">{job.sessionTarget}</span>
                          {/if}
                          {#if job.payload?.kind}
                            <span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">{job.payload.kind}</span>
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
