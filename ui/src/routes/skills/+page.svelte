<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  interface Skill {
    name: string;
    description?: string;
    source?: string;
    bundled?: boolean;
    filePath?: string;
    enabled?: boolean;
    installed?: boolean;
    version?: string;
    hasApiKey?: boolean;
    apiKeyRequired?: boolean;
    error?: string;
  }

  let skills = $state<Skill[]>([]);
  let loading = $state(false);
  let loadError = $state<string | null>(null);
  let busyKey = $state<string | null>(null);
  let searchQuery = $state('');
  let debouncedSearch = $state('');
  let filterSource = $state<'all' | 'bundled' | 'workspace' | 'managed'>('all');

  // Install
  let showInstall = $state(false);
  let installName = $state('');
  let installing = $state(false);

  // Debounce search
  $effect(() => {
    const q = searchQuery;
    const timer = setTimeout(() => { debouncedSearch = q; }, 200);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (conn.state.status === 'connected') untrack(() => loadSkills());
  });

  async function loadSkills() {
    if (loading) return;
    loading = true;
    loadError = null;
    try {
      const res = await gateway.call<Record<string, unknown>>('skills.status', {});
      // Response: { workspaceDir, managedSkillsDir, skills: [...] }
      const arr = Array.isArray(res?.skills) ? res.skills
        : Array.isArray(res?.entries) ? res.entries
        : Array.isArray(res) ? res
        : [];
      skills = arr as Skill[];
    } catch (e) {
      const msg = String(e);
      console.error('skills.status failed:', msg);
      loadError = msg;
      toasts.error('Skills Load Failed', msg);
    } finally {
      loading = false;
    }
  }

  async function installSkill() {
    if (!installName.trim()) return;
    installing = true;
    try {
      const res = await gateway.call<{ message?: string }>('skills.install', {
        name: installName.trim(),
        timeoutMs: 120000
      });
      toasts.success('Installed', res?.message ?? `${installName} installed`);
      installName = '';
      showInstall = false;
      await loadSkills();
    } catch (e) {
      toasts.error('Install Failed', String(e));
    } finally {
      installing = false;
    }
  }

  let filtered = $derived.by(() => {
    let list = skills;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false) ||
        (s.source?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filterSource === 'bundled') list = list.filter(s => s.bundled);
    if (filterSource === 'workspace') list = list.filter(s => s.source === 'workspace');
    if (filterSource === 'managed') list = list.filter(s => s.source === 'managed' || s.source === 'clawhub');
    return list;
  });

  let stats = $derived({
    total: skills.length,
    bundled: skills.filter(s => s.bundled).length,
    workspace: skills.filter(s => s.source === 'workspace').length,
    managed: skills.filter(s => s.source === 'managed' || s.source === 'clawhub').length,
  });

  function sourceLabel(source?: string, bundled?: boolean): string {
    if (bundled) return 'bundled';
    if (source === 'workspace') return 'workspace';
    if (source === 'managed' || source === 'clawhub') return 'managed';
    return source ?? 'unknown';
  }

  function sourceColor(source?: string, bundled?: boolean): string {
    if (bundled) return 'source-bundled';
    if (source === 'workspace') return 'source-workspace';
    if (source === 'managed' || source === 'clawhub') return 'source-managed';
    return 'source-unknown';
  }
</script>

<svelte:head>
  <title>Skills — Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">SKILLS</div>
    <div></div>
  </div>

  <!-- Header actions -->
  <div class="header-actions">
    <div class="header-subtitle">Agent skill library — bundled, workspace, and installed skills.</div>
    <div class="header-buttons">
      <button onclick={() => showInstall = !showInstall} class="hud-btn hud-btn-green">+ INSTALL</button>
      <button onclick={loadSkills} disabled={loading} class="hud-btn">
        {loading ? 'LOADING...' : 'REFRESH'}
      </button>
    </div>
  </div>

  <!-- Install panel -->
  {#if showInstall}
    <div class="hud-panel install-panel">
      <div class="hud-panel-lbl">Install Skill from ClawHub</div>
      <div class="install-row">
        <input
          type="text" bind:value={installName} placeholder="Skill name or URL..."
          class="hud-input"
          onkeydown={(e) => e.key === 'Enter' && installSkill()}
        />
        <button onclick={installSkill} disabled={installing || !installName.trim()} class="hud-btn hud-btn-green">
          {installing ? 'INSTALLING...' : 'INSTALL'}
        </button>
      </div>
    </div>
  {/if}

  <!-- Stats -->
  <div class="stats-grid">
    <div class="hud-panel stat-card">
      <div class="stat-value">{stats.total}</div>
      <div class="stat-label">TOTAL</div>
    </div>
    <div class="hud-panel stat-card">
      <div class="stat-value purple">{stats.bundled}</div>
      <div class="stat-label">BUNDLED</div>
    </div>
    <div class="hud-panel stat-card">
      <div class="stat-value cyan">{stats.workspace}</div>
      <div class="stat-label">WORKSPACE</div>
    </div>
    <div class="hud-panel stat-card">
      <div class="stat-value green">{stats.managed}</div>
      <div class="stat-label">MANAGED</div>
    </div>
  </div>

  <!-- Search + Filter -->
  <div class="search-row">
    <div class="search-wrapper">
      <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input type="text" bind:value={searchQuery} placeholder="Search skills..." class="hud-input search-input" />
    </div>
    <select bind:value={filterSource} class="hud-select">
      <option value="all">All Sources</option>
      <option value="bundled">Bundled</option>
      <option value="workspace">Workspace</option>
      <option value="managed">Managed</option>
    </select>
  </div>

  <!-- Error -->
  {#if loadError}
    <div class="hud-panel error-panel">
      <strong>FAILED TO LOAD SKILLS:</strong> {loadError}
      <button onclick={loadSkills} class="retry-link">Retry</button>
    </div>
  {/if}

  <!-- Skills list -->
  {#if loading && skills.length === 0}
    <div class="skills-list">
      {#each Array(5) as _, i}
        <div class="hud-panel skeleton">
          <div class="skeleton-line skeleton-short"></div>
          <div class="skeleton-line skeleton-long"></div>
        </div>
      {/each}
    </div>
  {:else if skills.length === 0 && !loading}
    <div class="empty-state">
      {conn.state.status !== 'connected' ? 'Connect to the gateway to view skills.' : 'No skills found.'}
    </div>
  {:else if filtered.length === 0}
    <div class="empty-state">
      No skills match "{searchQuery}"
    </div>
  {:else}
    <div class="skills-list">
      {#each filtered as skill, i (skill.name + '-' + i)}
        <div class="hud-panel skill-card">
          <div class="skill-header">
            <span class="skill-name">{skill.name}</span>
            <span class="source-badge {sourceColor(skill.source, skill.bundled)}">
              {sourceLabel(skill.source, skill.bundled)}
            </span>
            {#if skill.version}
              <span class="skill-version">v{skill.version}</span>
            {/if}
          </div>
          {#if skill.description}
            <p class="skill-desc">{skill.description}</p>
          {/if}
          {#if skill.filePath}
            <div class="skill-path" title={skill.filePath}>{skill.filePath}</div>
          {/if}
          {#if skill.error}
            <div class="skill-error">{skill.error}</div>
          {/if}
        </div>
      {/each}
    </div>

    <div class="skills-count">
      Showing {filtered.length} of {skills.length} skills
    </div>
  {/if}
</div>

<style>
  .hud-page {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 22px;
    gap: 14px;
    overflow-y: auto;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-bottom: 9px;
    flex-shrink: 0;
  }

  .hud-back {
    font-size: 0.72rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    text-decoration: none;
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.25em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

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
    top: 0;
    left: 0;
    right: 0;
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
  }

  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    padding: 5px 14px;
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

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .header-subtitle {
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .header-buttons {
    display: flex;
    gap: 8px;
  }

  .install-panel {
    border-color: color-mix(in srgb, var(--color-accent-green) 25%, transparent);
  }

  .install-panel::before {
    background: linear-gradient(90deg, transparent, var(--color-accent-green), transparent);
  }

  .install-row {
    display: flex;
    gap: 8px;
  }

  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    padding: 6px 10px;
    outline: none;
    transition: border-color 0.2s;
    flex: 1;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-input:focus {
    border-color: var(--color-accent-cyan);
  }

  .hud-select {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    padding: 6px 10px;
    outline: none;
    cursor: pointer;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }

  .stat-card {
    text-align: center;
    padding: 16px;
  }

  .stat-value {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.3rem;
    font-weight: 700;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .stat-value.purple {
    color: var(--color-accent-purple);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-purple) 40%, transparent);
  }

  .stat-value.cyan {
    color: var(--color-accent-cyan);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .stat-value.green {
    color: var(--color-accent-green);
    text-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-green) 40%, transparent);
  }

  .stat-label {
    font-size: 0.75rem;
    letter-spacing: 0.3em;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    margin-top: 4px;
  }

  .search-row {
    display: flex;
    gap: 10px;
  }

  .search-wrapper {
    position: relative;
    flex: 1;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  .search-input {
    padding-left: 30px;
    width: 100%;
  }

  .error-panel {
    border-color: color-mix(in srgb, #ef4444 30%, transparent);
    background: color-mix(in srgb, #ef4444 5%, #0a0e1a);
    color: #ef4444;
    font-size: 0.75rem;
  }

  .error-panel::before {
    background: linear-gradient(90deg, transparent, #ef4444, transparent);
  }

  .retry-link {
    background: none;
    border: none;
    color: #ef4444;
    text-decoration: underline;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    margin-left: 8px;
  }

  .retry-link:hover {
    color: #f87171;
  }

  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skill-card {
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .skill-card:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .skill-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 4px;
  }

  .skill-name {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--color-accent-cyan);
    letter-spacing: 0.08em;
  }

  .source-badge {
    font-size: 0.58rem;
    letter-spacing: 0.15em;
    padding: 2px 8px;
    border-radius: 2px;
    border: 1px solid;
    text-transform: uppercase;
  }

  .source-bundled {
    color: var(--color-accent-purple);
    border-color: color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent-purple) 12%, transparent);
  }

  .source-workspace {
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .source-managed {
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent-green) 12%, transparent);
  }

  .source-unknown {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
  }

  .skill-version {
    font-size: 0.62rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    letter-spacing: 0.1em;
  }

  .skill-desc {
    font-size: 0.7rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    line-height: 1.5;
    margin-bottom: 4px;
  }

  .skill-path {
    font-size: 0.58rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skill-error {
    margin-top: 8px;
    font-size: 0.68rem;
    color: #ef4444;
    background: color-mix(in srgb, #ef4444 8%, transparent);
    border-radius: 2px;
    padding: 4px 8px;
  }

  .empty-state {
    text-align: center;
    padding: 48px 0;
    font-size: 0.78rem;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  .skills-count {
    text-align: center;
    font-size: 0.75rem;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    padding-top: 8px;
  }

  .skeleton {
    padding: 16px;
  }

  .skeleton-line {
    height: 10px;
    border-radius: 2px;
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .skeleton-short {
    width: 40%;
    margin-bottom: 8px;
  }

  .skeleton-long {
    width: 75%;
  }

  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
</style>
