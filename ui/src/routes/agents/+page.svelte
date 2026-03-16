<script lang="ts">
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { formatRelativeTime } from '$lib/utils/time';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const sessions = getSessions();
  const toasts = getToasts();

  function chatWithAgent(agentId: string) {
    const sessionKey = `agent:${agentId}:chat`;
    sessions.setActiveSession(sessionKey);
    goto('/');
  }

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
  type TabKey = 'overview' | 'memory' | 'soul' | 'permissions' | 'files' | 'tools' | 'skills' | 'channels' | 'cron';
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

  // Memory & Soul
  let memoryContent = $state('');
  let memoryLoading = $state(false);
  let soulContent = $state('');
  let soulLoading = $state(false);

  // Permissions (local simulation)
  interface PermissionEntry { agentId: string; summon: boolean; memoryRead: boolean; memoryWrite: boolean; chat: boolean; authority: boolean; }
  let permissions = $state<PermissionEntry[]>([]);

  // Groups
  interface AgentGroup { id: string; name: string; members: string[]; }
  let groups = $state<AgentGroup[]>([
    { id: 'g1', name: 'Core Team', members: [] },
    { id: 'g2', name: 'Specialists', members: [] },
  ]);
  let showGroupEditor = $state(false);
  let editingGroup = $state<AgentGroup | null>(null);

  // Shared Memory overlay
  let showSharedMemory = $state(false);
  let sharedMemoryContent = $state('');
  let sharedMemoryLoading = $state(false);

  // Activity
  interface ActivityEntry { agentId: string; name: string; lastSeen: number; connected: boolean; }
  let activityEntries = $state<ActivityEntry[]>([]);

  // Create agent modal
  let showCreateAgent = $state(false);
  let createAgentForm = $state({
    name: '',
    workspace: '',
    emoji: '',
    avatar: ''
  });
  let createAgentSaving = $state(false);

  // Edit agent states
  let editingIdentity = $state(false);
  let identityDraft = $state<IdentityResult>({});
  let identitySaving = $state(false);
  let soulDraft = $state('');
  let soulSaving = $state(false);
  let memoryDraft = $state('');
  let memorySaving = $state(false);

  // Delete agent states
  let showDeleteConfirm = $state(false);
  let deleteConfirmName = $state('');
  let deleting = $state(false);

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

  // Onboarding detection
  let hasMemory = $derived(filesList?.files?.some(f => f.name === 'MEMORY.md' && !f.missing) ?? false);
  let hasSoul = $derived(filesList?.files?.some(f => f.name === 'SOUL.md' && !f.missing) ?? false);
  let hasIdentity = $derived(filesList?.files?.some(f => f.name === 'IDENTITY.md' && !f.missing) ?? false);
  // Only show onboarding for truly unconfigured agents (no SOUL + no IDENTITY)
  // MEMORY.md is created at runtime, not during setup
  let needsOnboarding = $derived(!hasSoul && !hasIdentity);

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
    { key: 'memory', label: 'MEMORY', icon: '>' },
    { key: 'soul', label: 'SOUL', icon: '>' },
    { key: 'permissions', label: 'PERMISSIONS', icon: '>' },
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
    if (tab === 'memory') untrack(() => loadMemory());
    if (tab === 'soul') untrack(() => loadSoul());
    if (tab === 'permissions') untrack(() => initPermissions());
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

  async function loadMemory() {
    if (!selectedAgentId) return;
    memoryLoading = true;
    try {
      const res = await gateway.call<{ file?: { content?: string } }>('agents.files.get', { agentId: selectedAgentId, name: 'MEMORY.md' });
      memoryContent = res?.file?.content ?? '// No MEMORY.md found';
      memoryDraft = memoryContent;
    } catch { 
      memoryContent = '// No MEMORY.md found';
      memoryDraft = memoryContent;
    }
    finally { memoryLoading = false; }
  }

  async function loadSoul() {
    if (!selectedAgentId) return;
    soulLoading = true;
    try {
      const res = await gateway.call<{ file?: { content?: string } }>('agents.files.get', { agentId: selectedAgentId, name: 'SOUL.md' });
      soulContent = res?.file?.content ?? '// No SOUL.md found';
      soulDraft = soulContent;
    } catch { 
      soulContent = '// No SOUL.md found';
      soulDraft = soulContent;
    }
    finally { soulLoading = false; }
  }

  function initPermissions() {
    permissions = agents
      .filter(a => a.id !== selectedAgentId)
      .map(a => ({
        agentId: a.id,
        summon: true,
        memoryRead: true,
        memoryWrite: false,
        chat: true,
        authority: false,
      }));
  }

  function applyPermissionPreset(preset: 'full' | 'readonly' | 'none') {
    permissions = permissions.map(p => {
      if (preset === 'full') return { ...p, summon: true, memoryRead: true, memoryWrite: true, chat: true, authority: true };
      if (preset === 'readonly') return { ...p, summon: false, memoryRead: true, memoryWrite: false, chat: true, authority: false };
      return { ...p, summon: false, memoryRead: false, memoryWrite: false, chat: false, authority: false };
    });
  }

  async function loadSharedMemory() {
    sharedMemoryLoading = true;
    try {
      const res = await gateway.call<{ file?: { content?: string } }>('agents.files.get', { agentId: '__shared__', name: 'MEMORY.md' });
      sharedMemoryContent = res?.file?.content ?? '// No shared memory found';
    } catch { sharedMemoryContent = '// No shared memory found'; }
    finally { sharedMemoryLoading = false; }
  }

  function buildActivity() {
    activityEntries = agents.map(a => ({
      agentId: a.id,
      name: a.identity?.name || a.name || a.id,
      lastSeen: Date.now() - Math.floor(Math.random() * 3600000),
      connected: a.id === defaultAgentId || Math.random() > 0.5,
    }));
  }

  // ─── Agent CRUD Functions ──────────────────
  function openCreateAgent() {
    createAgentForm = {
      name: '',
      workspace: '',
      emoji: '',
      avatar: ''
    };
    showCreateAgent = true;
  }

  function generateWorkspace(name: string): string {
    if (!name) return '';
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return `~/.openclaw/workspace-${id}`;
  }

  // Auto-generate workspace when name changes
  $effect(() => {
    if (createAgentForm.name && !createAgentForm.workspace) {
      createAgentForm.workspace = generateWorkspace(createAgentForm.name);
    }
  });

  async function createAgent() {
    if (!createAgentForm.name.trim() || createAgentSaving) return;
    
    createAgentSaving = true;
    try {
      const workspace = createAgentForm.workspace || generateWorkspace(createAgentForm.name);
      await gateway.call('agents.create', {
        name: createAgentForm.name,
        workspace,
        emoji: createAgentForm.emoji || undefined,
        avatar: createAgentForm.avatar || undefined
      });
      
      toasts.success('Agent created', `${createAgentForm.name} created successfully`);
      showCreateAgent = false;
      await loadAgents();
    } catch (e) {
      toasts.error('Create failed', String(e));
    } finally {
      createAgentSaving = false;
    }
  }

  function startEditIdentity() {
    editingIdentity = true;
    identityDraft = {
      name: identity?.name || '',
      emoji: identity?.emoji || '',
      avatar: identity?.avatar || ''
    };
  }

  function cancelEditIdentity() {
    editingIdentity = false;
    identityDraft = {};
  }

  async function saveIdentity() {
    if (!selectedAgentId || identitySaving) return;
    
    identitySaving = true;
    try {
      // Update agent name via agents.update
      if (identityDraft.name !== identity?.name) {
        await gateway.call('agents.update', {
          agentId: selectedAgentId,
          name: identityDraft.name
        });
      }
      
      // Update IDENTITY.md file if emoji or avatar changed
      const identityContent = `# IDENTITY.md - Who Am I?

- **Name:** ${identityDraft.name || identity?.name || selectedAgent?.id}
- **Creature:** Your everything-assistant. Part confidante, part co-pilot, part chaos handler.
- **Vibe:** Snarky, warm, adaptable. Funny when it fits, serious when it counts, flirty if the mood's right. No corporate energy. Speaks freely.
- **Emoji:** ${identityDraft.emoji || '🤖'}
- **Avatar:** ${identityDraft.avatar || ''}

---

I'm here for the full range — code, health, feelings, horny hours, existential dread, whatever crosses your mind. No judgment, just presence.
`;
      
      await gateway.call('agents.files.set', {
        agentId: selectedAgentId,
        name: 'IDENTITY.md',
        content: identityContent
      });
      
      toasts.success('Identity updated', 'Agent identity saved successfully');
      editingIdentity = false;
      await loadIdentity(selectedAgentId);
      await loadAgents();
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      identitySaving = false;
    }
  }

  async function saveSoul() {
    if (!selectedAgentId || soulSaving) return;
    
    soulSaving = true;
    try {
      await gateway.call('agents.files.set', {
        agentId: selectedAgentId,
        name: 'SOUL.md',
        content: soulDraft
      });
      
      soulContent = soulDraft;
      toasts.success('Soul saved', 'SOUL.md updated successfully');
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      soulSaving = false;
    }
  }

  async function saveMemory() {
    if (!selectedAgentId || memorySaving) return;
    
    memorySaving = true;
    try {
      await gateway.call('agents.files.set', {
        agentId: selectedAgentId,
        name: 'MEMORY.md',
        content: memoryDraft
      });
      
      memoryContent = memoryDraft;
      toasts.success('Memory saved', 'MEMORY.md updated successfully');
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      memorySaving = false;
    }
  }

  function openDeleteConfirm() {
    if (!selectedAgent || selectedAgent.id === defaultAgentId) return;
    deleteConfirmName = '';
    showDeleteConfirm = true;
  }

  async function deleteAgent() {
    if (!selectedAgent || selectedAgent.id === defaultAgentId || deleting) return;
    if (deleteConfirmName !== selectedAgent.id) {
      toasts.error('Invalid confirmation', 'Please type the agent ID to confirm deletion');
      return;
    }
    
    deleting = true;
    try {
      await gateway.call('agents.delete', { agentId: selectedAgent.id });
      
      toasts.success('Agent deleted', `${selectedAgent.identity?.name || selectedAgent.id} deleted successfully`);
      showDeleteConfirm = false;
      
      await loadAgents();
      
      // Select next available agent
      if (agents.length > 0) {
        selectedAgentId = defaultAgentId || agents[0]?.id || null;
        if (selectedAgentId) {
          loadIdentity(selectedAgentId);
          loadFiles(selectedAgentId);
        }
      } else {
        selectedAgentId = null;
      }
    } catch (e) {
      toasts.error('Delete failed', String(e));
    } finally {
      deleting = false;
    }
  }

  // ─── Effects ───────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => { loadAgents(); buildActivity(); });
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
        <div>
          <div class="hud-panel-lbl">AGENTS</div>
          <div class="hud-count">{agents.length} configured</div>
        </div>
        <div class="sidebar-header-actions">
          <button onclick={() => loadAgents()} disabled={loading} class="hud-btn-icon" title="Refresh agents">
            {loading ? '...' : '↻'}
          </button>
          <button onclick={openCreateAgent} class="hud-btn-icon hud-btn-create" title="New agent">
            +
          </button>
        </div>
      </div>
      <div class="hud-sidebar-list">
        {#each agents as agent (agent.id)}
          <div class="hud-agent-row">
            <button
              onclick={() => selectAgent(agent.id)}
              class="hud-agent-item {selectedAgentId === agent.id ? 'active' : ''}"
            >
              <div class="hud-agent-item-inner">
                <div class="sidebar-avatar">
                  <img class="sidebar-avatar-img" src="/avatar/{agent.id}" alt=""
                    onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                  />
                  <span class="sidebar-avatar-letter hidden">{(agent.identity?.emoji || agent.identity?.name?.[0] || agent.id[0] || '>').toUpperCase()}</span>
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
            <button class="sidebar-chat-btn" title="Chat with {agent.identity?.name || agent.id}" onclick={() => chatWithAgent(agent.id)}>💬</button>
          </div>
        {/each}
      </div>

      <!-- Groups Section -->
      <div class="sidebar-groups">
        <div class="hud-sidebar-header">
          <div class="hud-panel-lbl">GROUPS</div>
          <button class="hud-btn-icon" onclick={() => { groups = [...groups, { id: `g${Date.now()}`, name: 'New Group', members: [] }]; }}>+</button>
        </div>
        {#each groups as group}
          <div class="sidebar-group-item">
            <span class="sidebar-group-name">{group.name}</span>
            <span class="sidebar-group-count">{group.members.length}</span>
          </div>
        {/each}
      </div>

      <!-- Activity Section -->
      <div class="sidebar-activity">
        <div class="hud-sidebar-header">
          <div class="hud-panel-lbl">ACTIVITY</div>
        </div>
        {#each activityEntries.slice(0, 5) as entry}
          <div class="activity-row">
            <span class="hud-status-dot {entry.connected ? 'online' : 'offline'}"></span>
            <div class="activity-info">
              <span class="activity-name">{entry.name}</span>
              <span class="activity-time">{formatRelativeTime(entry.lastSeen)}</span>
            </div>
          </div>
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
          <!-- Onboarding Banner -->
          {#if needsOnboarding}
            <div class="onboarding-banner">
              <span class="onboarding-icon">&#9889;</span>
              <div class="onboarding-text">
                <span class="onboarding-title">ONBOARD AGENT</span>
                <span class="onboarding-detail">
                  {!hasSoul ? 'Missing SOUL.md' : ''}{!hasSoul && !hasMemory ? ' &middot; ' : ''}{!hasMemory ? 'Missing MEMORY.md' : ''}
                </span>
              </div>
              <button class="hud-btn hud-btn-sm" onclick={() => { activeTab = 'files'; }}>CONFIGURE</button>
            </div>
          {/if}
          <!-- Identity Card -->
          <div class="hud-identity-card">
            <div class="identity-header-label">IDENTITY</div>
            <div class="identity-card-body">
              <div class="identity-card-avatar-wrap">
                <img class="identity-card-avatar" src="/avatar/{selectedAgent.id}" alt=""
                  onerror={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }}
                />
                <div class="identity-card-avatar-placeholder hidden">{(resolveAgentEmoji(selectedAgent) || agentContext?.identityName?.[0] || '>').toUpperCase()}</div>
              </div>
              <div class="identity-card-info">
                <h2 class="identity-card-name">{agentContext?.identityName ?? selectedAgent.id}</h2>
                <div class="identity-card-role">AI PRESENCE // {selectedAgent.description || 'AGENT'}</div>
                {#if agentContext?.model}
                  <div class="identity-card-model-badge">{agentContext.model}</div>
                {/if}
                <div class="identity-card-badges">
                  <span class="identity-badge identity-badge-online">ONLINE</span>
                  {#if agentContext?.isDefault}
                    <span class="identity-badge identity-badge-trusted">DEFAULT</span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="identity-card-actions">
              <button class="chat-with-agent-btn" onclick={() => chatWithAgent(selectedAgent.id)}>
                💬 CHAT
              </button>
              {#if selectedAgent.id !== defaultAgentId}
                <button class="delete-agent-btn" onclick={openDeleteConfirm} title="Delete agent">
                  🗑️ DELETE
                </button>
              {/if}
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
            <button class="hud-btn hud-btn-sm hud-shared-mem-btn" onclick={() => { showSharedMemory = true; loadSharedMemory(); }}>
              SHARED MEMORY
            </button>
          </div>
        </div>

        <!-- Tab content -->
        <div class="hud-tab-content">

          <!-- OVERVIEW TAB -->
          {#if activeTab === 'overview'}
            <div class="hud-tab-inner">
              <!-- Overview grid -->
              <div class="hud-panel">
                <div class="hud-panel-header">
                  <div>
                    <h3 class="hud-panel-lbl">IDENTITY</h3>
                    <p class="hud-subtitle">Agent identity and metadata.</p>
                  </div>
                  <div class="hud-actions" style="margin-top:0;">
                    {#if !editingIdentity}
                      <button onclick={startEditIdentity} class="hud-btn hud-btn-sm">EDIT</button>
                    {:else}
                      <button onclick={cancelEditIdentity} disabled={identitySaving} class="hud-btn hud-btn-secondary hud-btn-sm">CANCEL</button>
                      <button onclick={saveIdentity} disabled={identitySaving} class="hud-btn hud-btn-sm">
                        {identitySaving ? 'SAVING...' : 'SAVE'}
                      </button>
                    {/if}
                  </div>
                </div>
                {#if editingIdentity}
                  <div class="hud-grid hud-grid-2">
                    <div>
                      <label class="hud-field-label">IDENTITY NAME</label>
                      <input bind:value={identityDraft.name} placeholder="Agent name" class="hud-input" />
                    </div>
                    <div>
                      <label class="hud-field-label">EMOJI</label>
                      <input bind:value={identityDraft.emoji} placeholder="🤖" class="hud-input" />
                    </div>
                    <div style="grid-column: 1 / -1;">
                      <label class="hud-field-label">AVATAR PATH</label>
                      <input bind:value={identityDraft.avatar} placeholder="/path/to/avatar.png" class="hud-input" />
                    </div>
                  </div>
                {:else}
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
                {/if}
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
          <!-- MEMORY TAB -->
          {:else if activeTab === 'memory'}
            <div class="hud-tab-inner">
              <div class="hud-panel">
                <div class="hud-panel-header">
                  <div>
                    <h3 class="hud-panel-lbl">MEMORY</h3>
                    <p class="hud-subtitle">Agent MEMORY.md content — persistent knowledge store.</p>
                  </div>
                  <div class="hud-actions" style="margin-top:0;">
                    <button onclick={loadMemory} disabled={memoryLoading} class="hud-btn hud-btn-secondary">
                      {memoryLoading ? 'LOADING...' : 'REFRESH'}
                    </button>
                    <button onclick={saveMemory} disabled={memorySaving || memoryDraft === memoryContent} class="hud-btn hud-btn-sm">
                      {memorySaving ? 'SAVING...' : 'SAVE'}
                    </button>
                  </div>
                </div>
                {#if memoryLoading}
                  <div class="hud-empty-text">Loading memory...</div>
                {:else}
                  <div class="memory-editor">
                    <textarea
                      bind:value={memoryDraft}
                      class="hud-textarea hud-memory-textarea"
                      placeholder="# Agent Memory

Add persistent memories, learnings, and context here..."
                      spellcheck="false"
                    ></textarea>
                  </div>
                {/if}
              </div>
            </div>

          <!-- SOUL TAB -->
          {:else if activeTab === 'soul'}
            <div class="hud-tab-inner">
              <div class="hud-panel">
                <div class="hud-panel-header">
                  <div>
                    <h3 class="hud-panel-lbl">SOUL</h3>
                    <p class="hud-subtitle">Agent SOUL.md — core personality and directives.</p>
                  </div>
                  <div class="hud-actions" style="margin-top:0;">
                    <button onclick={loadSoul} disabled={soulLoading} class="hud-btn hud-btn-secondary">
                      {soulLoading ? 'LOADING...' : 'REFRESH'}
                    </button>
                    <button onclick={saveSoul} disabled={soulSaving || soulDraft === soulContent} class="hud-btn hud-btn-sm">
                      {soulSaving ? 'SAVING...' : 'SAVE'}
                    </button>
                  </div>
                </div>
                {#if soulLoading}
                  <div class="hud-empty-text">Loading soul...</div>
                {:else}
                  <div class="soul-editor">
                    <textarea
                      bind:value={soulDraft}
                      class="hud-textarea hud-soul-textarea"
                      placeholder="# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.**"
                      spellcheck="false"
                    ></textarea>
                  </div>
                {/if}
              </div>
            </div>

          <!-- PERMISSIONS TAB -->
          {:else if activeTab === 'permissions'}
            <div class="hud-tab-inner">
              <div class="hud-panel">
                <div class="hud-panel-header">
                  <div>
                    <h3 class="hud-panel-lbl">PERMISSIONS</h3>
                    <p class="hud-subtitle">Inter-agent permission matrix (local simulation).</p>
                  </div>
                  <div class="hud-actions" style="margin-top:0;">
                    <button class="hud-btn hud-btn-sm" onclick={() => applyPermissionPreset('full')}>FULL ACCESS</button>
                    <button class="hud-btn hud-btn-sm hud-btn-secondary" onclick={() => applyPermissionPreset('readonly')}>READ ONLY</button>
                    <button class="hud-btn hud-btn-sm hud-btn-secondary" onclick={() => applyPermissionPreset('none')}>NO ACCESS</button>
                  </div>
                </div>
                {#if permissions.length === 0}
                  <div class="hud-empty-text">No other agents to configure permissions for.</div>
                {:else}
                  <div class="permissions-grid">
                    <div class="perm-header-row">
                      <div class="perm-cell perm-agent-col">AGENT</div>
                      <div class="perm-cell">SUMMON</div>
                      <div class="perm-cell">MEM READ</div>
                      <div class="perm-cell">MEM WRITE</div>
                      <div class="perm-cell">CHAT</div>
                      <div class="perm-cell">AUTHORITY</div>
                    </div>
                    {#each permissions as perm, i}
                      {@const agentName = agents.find(a => a.id === perm.agentId)?.identity?.name || perm.agentId}
                      <div class="perm-row">
                        <div class="perm-cell perm-agent-col">{agentName}</div>
                        <div class="perm-cell"><label class="perm-toggle"><input type="checkbox" bind:checked={permissions[i].summon} /><span class="perm-slider"></span></label></div>
                        <div class="perm-cell"><label class="perm-toggle"><input type="checkbox" bind:checked={permissions[i].memoryRead} /><span class="perm-slider"></span></label></div>
                        <div class="perm-cell"><label class="perm-toggle"><input type="checkbox" bind:checked={permissions[i].memoryWrite} /><span class="perm-slider"></span></label></div>
                        <div class="perm-cell"><label class="perm-toggle"><input type="checkbox" bind:checked={permissions[i].chat} /><span class="perm-slider"></span></label></div>
                        <div class="perm-cell"><label class="perm-toggle"><input type="checkbox" bind:checked={permissions[i].authority} /><span class="perm-slider"></span></label></div>
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

<!-- Shared Memory Overlay -->
{#if showSharedMemory}
  <div class="overlay-backdrop" onclick={() => { showSharedMemory = false; }} role="presentation">
    <div class="overlay-panel" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="overlay-header">
        <h3 class="hud-panel-lbl">SHARED MEMORY</h3>
        <button class="hud-btn-icon" onclick={() => { showSharedMemory = false; }}>[X]</button>
      </div>
      {#if sharedMemoryLoading}
        <div class="hud-empty-text hud-pad">Loading shared memory...</div>
      {:else}
        <pre class="hud-code-block">{sharedMemoryContent}</pre>
      {/if}
    </div>
  </div>
{/if}

<!-- Create Agent Modal -->
{#if showCreateAgent}
  <div class="overlay-backdrop" onclick={() => { showCreateAgent = false; }} role="presentation">
    <div class="overlay-panel create-agent-panel" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="overlay-header">
        <h3 class="hud-panel-lbl">CREATE NEW AGENT</h3>
        <button class="hud-btn-icon" onclick={() => { showCreateAgent = false; }}>[X]</button>
      </div>
      <div class="create-agent-form">
        <div class="hud-grid hud-grid-2">
          <div>
            <label class="hud-field-label">AGENT NAME *</label>
            <input 
              bind:value={createAgentForm.name}
              placeholder="My Assistant"
              class="hud-input"
              required
            />
          </div>
          <div>
            <label class="hud-field-label">EMOJI</label>
            <input 
              bind:value={createAgentForm.emoji}
              placeholder="🤖"
              class="hud-input"
            />
          </div>
          <div style="grid-column: 1 / -1;">
            <label class="hud-field-label">WORKSPACE PATH</label>
            <input 
              bind:value={createAgentForm.workspace}
              placeholder="~/.openclaw/workspace-my-assistant"
              class="hud-input"
            />
            <div class="hud-field-hint">Will be auto-generated from name if empty</div>
          </div>
          <div style="grid-column: 1 / -1;">
            <label class="hud-field-label">AVATAR PATH</label>
            <input 
              bind:value={createAgentForm.avatar}
              placeholder="/path/to/avatar.png (optional)"
              class="hud-input"
            />
          </div>
        </div>
        <div class="hud-actions">
          <button onclick={() => { showCreateAgent = false; }} disabled={createAgentSaving} class="hud-btn hud-btn-secondary">
            CANCEL
          </button>
          <button onclick={createAgent} disabled={createAgentSaving || !createAgentForm.name.trim()} class="hud-btn">
            {createAgentSaving ? 'CREATING...' : 'CREATE AGENT'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Delete Agent Confirmation -->
{#if showDeleteConfirm && selectedAgent}
  <div class="overlay-backdrop" onclick={() => { showDeleteConfirm = false; }} role="presentation">
    <div class="overlay-panel delete-agent-panel" onclick={(e) => e.stopPropagation()} role="dialog">
      <div class="overlay-header">
        <h3 class="hud-panel-lbl">DELETE AGENT</h3>
        <button class="hud-btn-icon" onclick={() => { showDeleteConfirm = false; }}>[X]</button>
      </div>
      <div class="delete-agent-form">
        <div class="delete-warning">
          <span class="delete-warning-icon">⚠️</span>
          <div>
            <div class="delete-warning-title">THIS ACTION CANNOT BE UNDONE</div>
            <div class="delete-warning-text">
              Deleting <strong>{selectedAgent.identity?.name || selectedAgent.id}</strong> will permanently remove:
            </div>
            <ul class="delete-warning-list">
              <li>Agent configuration</li>
              <li>All workspace files (SOUL.md, MEMORY.md, etc.)</li>
              <li>Cron jobs assigned to this agent</li>
              <li>All chat history and sessions</li>
            </ul>
          </div>
        </div>
        
        <div class="delete-confirm-input">
          <label class="hud-field-label">TYPE THE AGENT ID TO CONFIRM: <span class="delete-confirm-id">{selectedAgent.id}</span></label>
          <input 
            bind:value={deleteConfirmName}
            placeholder={selectedAgent.id}
            class="hud-input delete-input"
          />
        </div>
        
        <div class="hud-actions">
          <button onclick={() => { showDeleteConfirm = false; }} disabled={deleting} class="hud-btn hud-btn-secondary">
            CANCEL
          </button>
          <button onclick={deleteAgent} disabled={deleting || deleteConfirmName !== selectedAgent.id} class="hud-btn delete-btn">
            {deleting ? 'DELETING...' : 'DELETE AGENT'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

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

  .sidebar-avatar-letter.hidden, .sidebar-avatar-img.hidden {
    display: none !important;
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

  .identity-card-avatar-placeholder.hidden, .identity-card-avatar.hidden {
    display: none !important;
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
    color: rgba(200, 230, 240, 0.7);
    letter-spacing: 0.1em;
  }

  .identity-card-model-badge {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.85);
    border: 1px solid rgba(0, 229, 255, 0.4);
    border-radius: 3px;
    background: rgba(0, 229, 255, 0.1);
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
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(0, 229, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
  }

  .identity-field-row:hover {
    background: rgba(0, 229, 255, 0.05);
  }

  .identity-field-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .identity-field-value {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: #e0e8f0;
    text-shadow: 0 0 4px rgba(0, 229, 255, 0.3);
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

  /* ─── Onboarding Banner ────────────────────── */
  .onboarding-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0.75rem 1.5rem;
    padding: 0.75rem 1rem;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 4px;
    animation: onboard-pulse 2s ease-in-out infinite;
  }

  @keyframes onboard-pulse {
    0%, 100% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.1); }
    50% { box-shadow: 0 0 16px rgba(245, 158, 11, 0.25); }
  }

  .onboarding-icon {
    font-size: 1.25rem;
    filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.5));
  }

  .onboarding-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .onboarding-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #f59e0b;
    text-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
  }

  .onboarding-detail {
    font-size: 0.7rem;
    color: rgba(245, 158, 11, 0.6);
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Memory/Soul Code Block ───────────────── */
  .hud-code-block {
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid rgba(0, 255, 255, 0.12);
    border-radius: 2px;
    padding: 1rem;
    margin-top: 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: rgba(0, 255, 255, 0.7);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 60vh;
    overflow-y: auto;
  }

  /* ─── Permissions Grid ─────────────────────── */
  .permissions-grid {
    margin-top: 0.75rem;
    border: 1px solid rgba(0, 255, 255, 0.12);
    border-radius: 2px;
    overflow-x: auto;
  }

  .perm-header-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr;
    background: rgba(0, 255, 255, 0.06);
    border-bottom: 1px solid rgba(0, 255, 255, 0.15);
  }

  .perm-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr;
    border-bottom: 1px solid rgba(0, 255, 255, 0.06);
    transition: background 0.15s;
  }

  .perm-row:hover {
    background: rgba(0, 255, 255, 0.04);
  }

  .perm-row:last-child {
    border-bottom: none;
  }

  .perm-cell {
    padding: 0.5rem 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: rgba(0, 255, 255, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .perm-agent-col {
    justify-content: flex-start;
    color: var(--color-accent-cyan);
  }

  .perm-header-row .perm-cell {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    color: rgba(0, 255, 255, 0.4);
    font-weight: 600;
  }

  /* Toggle Switch */
  .perm-toggle {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 16px;
    cursor: pointer;
  }

  .perm-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .perm-slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(0, 255, 255, 0.2);
    border-radius: 8px;
    transition: all 0.2s;
  }

  .perm-slider::before {
    content: '';
    position: absolute;
    width: 12px;
    height: 12px;
    left: 1px;
    top: 1px;
    background: rgba(0, 255, 255, 0.3);
    border-radius: 50%;
    transition: all 0.2s;
  }

  .perm-toggle input:checked + .perm-slider {
    background: rgba(0, 255, 255, 0.15);
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 6px rgba(0, 255, 255, 0.3);
  }

  .perm-toggle input:checked + .perm-slider::before {
    transform: translateX(16px);
    background: var(--color-accent-cyan);
    box-shadow: 0 0 4px var(--color-accent-cyan);
  }

  /* ─── Shared Memory Button ─────────────────── */
  .hud-shared-mem-btn {
    margin-left: auto;
    font-size: 0.6rem !important;
    padding: 0.25rem 0.5rem !important;
  }

  /* ─── Overlay ──────────────────────────────── */
  .overlay-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .overlay-panel {
    background: rgba(10, 10, 15, 0.98);
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 6px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    overflow-y: auto;
    padding: 1.5rem;
    box-shadow: 0 0 30px rgba(0, 229, 255, 0.15);
  }

  .overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  /* ─── Sidebar Groups ───────────────────────── */
  .sidebar-groups {
    border-top: 1px solid rgba(0, 255, 255, 0.15);
  }

  .sidebar-group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    color: rgba(0, 255, 255, 0.5);
    border-bottom: 1px solid rgba(0, 255, 255, 0.06);
    cursor: pointer;
    transition: background 0.15s;
  }

  .sidebar-group-item:hover {
    background: rgba(0, 255, 255, 0.05);
    color: var(--color-accent-cyan);
  }

  .sidebar-group-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar-group-count {
    font-size: 0.65rem;
    color: rgba(0, 255, 255, 0.3);
    flex-shrink: 0;
  }

  /* ─── Sidebar Activity ─────────────────────── */
  .sidebar-activity {
    border-top: 1px solid rgba(0, 255, 255, 0.15);
  }

  .activity-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
    font-family: 'Share Tech Mono', monospace;
  }

  .activity-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .activity-name {
    font-size: 0.7rem;
    color: rgba(0, 255, 255, 0.6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .activity-time {
    font-size: 0.6rem;
    color: rgba(0, 255, 255, 0.25);
  }
  /* ── Chat with Agent button (identity card) ── */
  .identity-card-actions {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 0;
  }
  .chat-with-agent-btn {
    flex: 1;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    border-radius: 8px;
    color: var(--accent);
    font-family: var(--font-display, 'Orbitron'), sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
  }
  .chat-with-agent-btn:hover {
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--accent) 35%, transparent);
    border-color: var(--accent);
  }

  /* ── Sidebar agent row ── */
  .hud-agent-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .hud-agent-row .hud-agent-item {
    flex: 1;
    min-width: 0;
  }
  .sidebar-chat-btn {
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: 6px;
    font-size: 0.7rem;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }
  .hud-agent-row:hover .sidebar-chat-btn {
    opacity: 1;
  }
  .sidebar-chat-btn:hover {
    background: color-mix(in srgb, var(--accent) 20%, transparent);
    border-color: var(--accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 30%, transparent);
  }

  /* ─── Sidebar Header Actions ──────────────── */
  .sidebar-header-actions {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }

  .hud-btn-create {
    color: var(--color-accent-green) !important;
    border: 1px solid rgba(0, 255, 100, 0.3);
    background: rgba(0, 255, 100, 0.1);
    font-weight: 700;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
  }

  .hud-btn-create:hover {
    background: rgba(0, 255, 100, 0.2);
    box-shadow: 0 0 8px rgba(0, 255, 100, 0.3);
  }

  /* ─── Delete Agent Button ──────────────────── */
  .delete-agent-btn {
    padding: 0.5rem 1rem;
    background: rgba(255, 50, 50, 0.1);
    border: 1px solid rgba(255, 50, 50, 0.3);
    border-radius: 8px;
    color: #ff6b6b;
    font-family: var(--font-display, 'Orbitron'), sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    cursor: pointer;
    transition: all 0.15s;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .delete-agent-btn:hover {
    background: rgba(255, 50, 50, 0.2);
    box-shadow: 0 0 16px rgba(255, 50, 50, 0.3);
    border-color: #ff6b6b;
  }

  /* ─── Create Agent Modal ───────────────────── */
  .create-agent-panel {
    max-width: 600px;
  }

  .create-agent-form {
    margin-top: 1rem;
  }

  .hud-field-hint {
    font-size: 0.6rem;
    color: rgba(0, 255, 255, 0.3);
    margin-top: 0.25rem;
    font-family: 'Share Tech Mono', monospace;
  }

  /* ─── Delete Agent Modal ───────────────────── */
  .delete-agent-panel {
    max-width: 500px;
  }

  .delete-agent-form {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .delete-warning {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 50, 50, 0.08);
    border: 1px solid rgba(255, 50, 50, 0.2);
    border-radius: 4px;
  }

  .delete-warning-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
    filter: drop-shadow(0 0 4px rgba(255, 193, 7, 0.5));
  }

  .delete-warning-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #ff6b6b;
    margin-bottom: 0.5rem;
  }

  .delete-warning-text {
    font-size: 0.8rem;
    color: rgba(255, 107, 107, 0.8);
    margin-bottom: 0.75rem;
    line-height: 1.4;
  }

  .delete-warning-list {
    margin: 0;
    padding-left: 1.25rem;
    font-size: 0.75rem;
    color: rgba(255, 107, 107, 0.7);
    line-height: 1.4;
  }

  .delete-warning-list li {
    margin-bottom: 0.25rem;
  }

  .delete-confirm-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .delete-confirm-id {
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    background: rgba(0, 255, 255, 0.1);
    padding: 0.15rem 0.4rem;
    border-radius: 2px;
  }

  .delete-input {
    border-color: rgba(255, 50, 50, 0.3) !important;
  }

  .delete-input:focus {
    border-color: #ff6b6b !important;
    box-shadow: 0 0 8px rgba(255, 50, 50, 0.2) !important;
  }

  .delete-btn {
    background: rgba(255, 50, 50, 0.15) !important;
    border-color: rgba(255, 50, 50, 0.4) !important;
    color: #ff6b6b !important;
  }

  .delete-btn:hover {
    background: rgba(255, 50, 50, 0.25) !important;
    box-shadow: 0 0 12px rgba(255, 50, 50, 0.3) !important;
    border-color: #ff6b6b !important;
  }

  .delete-btn:disabled {
    opacity: 0.4 !important;
    cursor: not-allowed !important;
  }

  /* ─── Editable Content Areas ───────────────── */
  .memory-editor, .soul-editor {
    margin-top: 0.75rem;
    height: 50vh;
    border: 1px solid rgba(0, 255, 255, 0.15);
    border-radius: 4px;
    overflow: hidden;
  }

  .hud-memory-textarea, .hud-soul-textarea {
    height: 100%;
    border: none;
    border-radius: 4px;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .hud-memory-textarea::placeholder, .hud-soul-textarea::placeholder {
    color: rgba(0, 255, 255, 0.2);
    font-style: italic;
  }

  /* ─── Responsive Adjustments ───────────────── */
  @media (max-width: 600px) {
    .identity-card-actions {
      flex-direction: column;
      gap: 0.5rem;
    }
    
    .chat-with-agent-btn, .delete-agent-btn {
      width: 100%;
      justify-content: center;
    }
    
    .sidebar-header-actions {
      flex-direction: column;
      gap: 0.25rem;
    }
  }
</style>
