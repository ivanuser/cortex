<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

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
    if (bundled) return 'bg-accent-purple/20 text-accent-purple border-accent-purple/30';
    if (source === 'workspace') return 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30';
    if (source === 'managed' || source === 'clawhub') return 'bg-accent-green/20 text-accent-green border-accent-green/30';
    return 'bg-bg-tertiary text-text-muted border-border-default';
  }
</script>

<svelte:head>
  <title>Skills — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">Skills</h1>
        <p class="text-sm text-text-muted mt-1">Agent skill library — bundled, workspace, and installed skills.</p>
      </div>
      <div class="flex gap-2">
        <button onclick={() => showInstall = !showInstall}
          class="px-3 py-2 rounded-lg text-sm border border-accent-green/30 text-accent-green
                 hover:bg-accent-green/10 transition-all">
          + Install
        </button>
        <button onclick={loadSkills} disabled={loading}
          class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    </div>

    <!-- Install panel -->
    {#if showInstall}
      <div class="rounded-xl border border-accent-green/30 bg-bg-secondary/50 p-4">
        <h3 class="text-sm font-medium text-accent-green mb-3">Install Skill from ClawHub</h3>
        <div class="flex gap-2">
          <input
            type="text" bind:value={installName} placeholder="Skill name or URL..."
            class="flex-1 px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary
                   text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-green transition-all"
            onkeydown={(e) => e.key === 'Enter' && installSkill()}
          />
          <button onclick={installSkill} disabled={installing || !installName.trim()}
            class="px-4 py-2 rounded-lg text-sm bg-accent-green/20 text-accent-green border border-accent-green/30
                   hover:bg-accent-green/30 transition-all disabled:opacity-50">
            {installing ? 'Installing...' : 'Install'}
          </button>
        </div>
      </div>
    {/if}

    <!-- Stats -->
    <div class="grid grid-cols-4 gap-3">
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-text-primary">{stats.total}</div>
        <div class="text-xs text-text-muted">Total</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-purple">{stats.bundled}</div>
        <div class="text-xs text-text-muted">Bundled</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-cyan">{stats.workspace}</div>
        <div class="text-xs text-text-muted">Workspace</div>
      </div>
      <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center">
        <div class="text-xl font-bold text-accent-green">{stats.managed}</div>
        <div class="text-xs text-text-muted">Managed</div>
      </div>
    </div>

    <!-- Search + Filter -->
    <div class="flex gap-3">
      <div class="relative flex-1">
        <input type="text" bind:value={searchQuery} placeholder="Search skills..."
          class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary
                 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan transition-all" />
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <select bind:value={filterSource}
        class="px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-secondary">
        <option value="all">All Sources</option>
        <option value="bundled">Bundled</option>
        <option value="workspace">Workspace</option>
        <option value="managed">Managed</option>
      </select>
    </div>

    <!-- Error -->
    {#if loadError}
      <div class="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-red-400 text-sm">
        <strong>Failed to load skills:</strong> {loadError}
        <button onclick={loadSkills} class="ml-2 underline hover:text-red-300">Retry</button>
      </div>
    {/if}

    <!-- Skills list -->
    {#if loading && skills.length === 0}
      <div class="space-y-2">
        {#each Array(5) as _, i}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-4 w-48 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-96 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>
    {:else if skills.length === 0 && !loading}
      <div class="text-center py-12 text-text-muted">
        {conn.state.status !== 'connected' ? 'Connect to the gateway to view skills.' : 'No skills found.'}
      </div>
    {:else if filtered.length === 0}
      <div class="text-center py-12 text-text-muted">
        No skills match "{searchQuery}"
      </div>
    {:else}
      <div class="space-y-2">
        {#each filtered as skill, i (skill.name + '-' + i)}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 transition-all hover:border-border-default/80">
            <div class="flex items-start gap-3">
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="font-medium text-text-primary">{skill.name}</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono border {sourceColor(skill.source, skill.bundled)}">
                    {sourceLabel(skill.source, skill.bundled)}
                  </span>
                  {#if skill.version}
                    <span class="text-xs text-text-muted font-mono">v{skill.version}</span>
                  {/if}
                </div>
                {#if skill.description}
                  <p class="text-xs text-text-secondary leading-relaxed mb-1.5">{skill.description}</p>
                {/if}
                {#if skill.filePath}
                  <div class="text-[10px] text-text-muted/40 font-mono truncate" title={skill.filePath}>{skill.filePath}</div>
                {/if}
                {#if skill.error}
                  <div class="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{skill.error}</div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <div class="text-xs text-text-muted/40 text-center pt-2">
        Showing {filtered.length} of {skills.length} skills
      </div>
    {/if}
  </div>
</div>
