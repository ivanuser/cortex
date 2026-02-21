<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ─────────────────────────────
  interface CronJob {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    notify?: boolean;
    schedule: { kind: string; expr?: string; tz?: string; everyMs?: number; anchorMs?: number; at?: string };
    sessionTarget: string;
    payload: { kind: string; text?: string; message?: string; model?: string; thinking?: string; timeoutSeconds?: number };
    delivery?: { mode: string; channel?: string; to?: string };
    lastRunAt?: number;
    nextRunAt?: number;
    runCount?: number;
    lastError?: string;
  }

  interface CronRun {
    id: string;
    jobId: string;
    startedAt: number;
    finishedAt?: number;
    status: string;
    error?: string;
    durationMs?: number;
  }

  // ─── State ─────────────────────────────
  let jobs = $state<CronJob[]>([]);
  let loading = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let cronStatus = $state<{ enabled: boolean; nextRunMs?: number } | null>(null);

  // Run history
  let selectedJobId = $state<string | null>(null);
  let runs = $state<CronRun[]>([]);
  let runsLoading = $state(false);

  // Expanded job detail
  let expandedJobId = $state<string | null>(null);

  // ─── Editor State ──────────────────────
  let editorOpen = $state(false);
  let editingJobId = $state<string | null>(null);
  let saving = $state(false);

  // Form fields
  let formName = $state('');
  let formScheduleKind = $state<'at' | 'every' | 'cron'>('every');
  let formAtValue = $state('');
  let formEveryMs = $state(300000); // 5min default
  let formCronExpr = $state('');
  let formCronTz = $state('');
  let formSessionTarget = $state<'main' | 'isolated'>('main');
  // systemEvent fields
  let formEventText = $state('');
  // agentTurn fields
  let formAgentMessage = $state('');
  let formAgentModel = $state('');
  let formAgentThinking = $state<'' | 'on' | 'stream'>('');
  let formAgentTimeout = $state<number | undefined>(undefined);
  // delivery
  let formDeliveryMode = $state<'none' | 'announce'>('none');
  let formDeliveryChannel = $state('');
  let formDeliveryTo = $state('');
  // options
  let formEnabled = $state(true);
  let formNotify = $state(false);

  // ─── Derived ───────────────────────────
  let payloadKind = $derived(formSessionTarget === 'main' ? 'systemEvent' : 'agentTurn');

  let cronHumanReadable = $derived.by(() => {
    if (!formCronExpr.trim()) return '';
    return describeCron(formCronExpr.trim());
  });

  let formValid = $derived.by(() => {
    if (formScheduleKind === 'at' && !formAtValue) return false;
    if (formScheduleKind === 'every' && (!formEveryMs || formEveryMs < 1000)) return false;
    if (formScheduleKind === 'cron' && !formCronExpr.trim()) return false;
    if (payloadKind === 'systemEvent' && !formEventText.trim()) return false;
    if (payloadKind === 'agentTurn' && !formAgentMessage.trim()) return false;
    return true;
  });

  // ─── Cron presets ──────────────────────
  const cronPresets = [
    { label: 'Every minute', expr: '* * * * *' },
    { label: 'Every 5 minutes', expr: '*/5 * * * *' },
    { label: 'Every 15 minutes', expr: '*/15 * * * *' },
    { label: 'Every hour', expr: '0 * * * *' },
    { label: 'Daily at midnight', expr: '0 0 * * *' },
    { label: 'Daily at 9am', expr: '0 9 * * *' },
    { label: 'Weekly Mon 9am', expr: '0 9 * * 1' },
    { label: 'Monthly 1st midnight', expr: '0 0 1 * *' },
  ];

  const intervalPresets = [
    { label: '1m', ms: 60000 },
    { label: '5m', ms: 300000 },
    { label: '15m', ms: 900000 },
    { label: '30m', ms: 1800000 },
    { label: '1h', ms: 3600000 },
    { label: '6h', ms: 21600000 },
    { label: '12h', ms: 43200000 },
    { label: '24h', ms: 86400000 },
  ];

  const timezones = [
    '', 'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
    'Australia/Sydney', 'Pacific/Auckland',
  ];

  // ─── Load data ─────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadAll());
    }
  });

  async function loadAll() {
    loading = true;
    error = null;
    try {
      const [statusRes, jobsRes] = await Promise.all([
        gateway.call<{ enabled?: boolean; nextRunMs?: number }>('cron.status', {}).catch(() => null),
        gateway.call<{ jobs?: CronJob[] }>('cron.list', { includeDisabled: true }).catch(() => ({ jobs: [] })),
      ]);
      cronStatus = statusRes;
      jobs = Array.isArray(jobsRes?.jobs) ? jobsRes!.jobs : [];
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  // ─── Job actions ───────────────────────
  async function toggleJob(job: CronJob) {
    if (busy) return;
    busy = true;
    try {
      await gateway.call('cron.update', { id: job.id, patch: { enabled: !job.enabled } });
      toasts.success('Updated', `${job.name || job.id} ${job.enabled ? 'disabled' : 'enabled'}`);
      await loadAll();
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      busy = false;
    }
  }

  async function runJob(job: CronJob) {
    if (busy) return;
    busy = true;
    try {
      await gateway.call('cron.run', { id: job.id, mode: 'force' });
      toasts.success('Triggered', `${job.name || job.id} running now`);
      await loadRuns(job.id);
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      busy = false;
    }
  }

  async function removeJob(job: CronJob) {
    if (busy) return;
    if (!confirm(`Delete "${job.name || job.id}"? This cannot be undone.`)) return;
    busy = true;
    try {
      await gateway.call('cron.remove', { id: job.id });
      toasts.success('Deleted', `${job.name || job.id} removed`);
      if (selectedJobId === job.id) {
        selectedJobId = null;
        runs = [];
      }
      await loadAll();
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      busy = false;
    }
  }

  async function loadRuns(jobId: string) {
    runsLoading = true;
    selectedJobId = jobId;
    try {
      const res = await gateway.call<{ entries?: CronRun[] }>('cron.runs', { id: jobId, limit: 20 });
      runs = Array.isArray(res?.entries) ? res!.entries : [];
    } catch (e) {
      toasts.error('Failed', String(e));
    } finally {
      runsLoading = false;
    }
  }

  // ─── Editor ────────────────────────────
  function openCreateEditor() {
    editingJobId = null;
    resetForm();
    editorOpen = true;
  }

  function openEditEditor(job: CronJob) {
    editingJobId = job.id;
    formName = job.name || '';
    formScheduleKind = job.schedule.kind as 'at' | 'every' | 'cron';
    formAtValue = job.schedule.at ? toDatetimeLocal(job.schedule.at) : '';
    formEveryMs = job.schedule.everyMs ?? 300000;
    formCronExpr = job.schedule.expr ?? '';
    formCronTz = job.schedule.tz ?? '';
    formSessionTarget = (job.sessionTarget as 'main' | 'isolated') || 'main';
    formEventText = job.payload.text ?? '';
    formAgentMessage = job.payload.message ?? '';
    formAgentModel = job.payload.model ?? '';
    formAgentThinking = (job.payload.thinking as '' | 'on' | 'stream') || '';
    formAgentTimeout = job.payload.timeoutSeconds;
    formDeliveryMode = (job.delivery?.mode as 'none' | 'announce') || 'none';
    formDeliveryChannel = job.delivery?.channel ?? '';
    formDeliveryTo = job.delivery?.to ?? '';
    formEnabled = job.enabled ?? true;
    formNotify = job.notify ?? false;
    editorOpen = true;
  }

  function resetForm() {
    formName = '';
    formScheduleKind = 'every';
    formAtValue = '';
    formEveryMs = 300000;
    formCronExpr = '';
    formCronTz = '';
    formSessionTarget = 'main';
    formEventText = '';
    formAgentMessage = '';
    formAgentModel = '';
    formAgentThinking = '';
    formAgentTimeout = undefined;
    formDeliveryMode = 'none';
    formDeliveryChannel = '';
    formDeliveryTo = '';
    formEnabled = true;
    formNotify = false;
  }

  function closeEditor() {
    editorOpen = false;
    editingJobId = null;
  }

  function buildJobPayload() {
    // Build schedule
    let schedule: Record<string, unknown> = { kind: formScheduleKind };
    if (formScheduleKind === 'at') {
      schedule.at = new Date(formAtValue).toISOString();
    } else if (formScheduleKind === 'every') {
      schedule.everyMs = formEveryMs;
    } else if (formScheduleKind === 'cron') {
      schedule.expr = formCronExpr.trim();
      if (formCronTz) schedule.tz = formCronTz;
    }

    // Build payload
    let payload: Record<string, unknown> = {};
    if (payloadKind === 'systemEvent') {
      payload = { kind: 'systemEvent', text: formEventText.trim() };
    } else {
      payload = { kind: 'agentTurn', message: formAgentMessage.trim() };
      if (formAgentModel.trim()) payload.model = formAgentModel.trim();
      if (formAgentThinking) payload.thinking = formAgentThinking;
      if (formAgentTimeout && formAgentTimeout > 0) payload.timeoutSeconds = formAgentTimeout;
    }

    // Build delivery
    let delivery: Record<string, unknown> | undefined;
    if (formSessionTarget === 'isolated') {
      delivery = { mode: formDeliveryMode };
      if (formDeliveryChannel.trim()) delivery.channel = formDeliveryChannel.trim();
      if (formDeliveryTo.trim()) delivery.to = formDeliveryTo.trim();
    }

    const job: Record<string, unknown> = {
      schedule,
      payload,
      sessionTarget: formSessionTarget,
      enabled: formEnabled,
      notify: formNotify,
    };
    if (formName.trim()) job.name = formName.trim();
    if (delivery) job.delivery = delivery;

    return job;
  }

  async function submitForm() {
    if (!formValid || saving) return;
    saving = true;
    try {
      const job = buildJobPayload();
      if (editingJobId) {
        await gateway.call('cron.update', { id: editingJobId, patch: job });
        toasts.success('Updated', `Job "${formName || editingJobId}" updated`);
      } else {
        await gateway.call('cron.add', { job });
        toasts.success('Created', `Job "${formName || 'new job'}" created`);
      }
      closeEditor();
      await loadAll();
    } catch (e) {
      toasts.error('Save failed', String(e));
    } finally {
      saving = false;
    }
  }

  // ─── Formatting helpers ────────────────
  function formatSchedule(s: CronJob['schedule']): string {
    if (s.kind === 'cron') return `cron: ${s.expr}${s.tz ? ` (${s.tz})` : ''}`;
    if (s.kind === 'every') {
      const ms = s.everyMs ?? 0;
      if (ms >= 86400000) return `every ${Math.round(ms / 86400000)}d`;
      if (ms >= 3600000) return `every ${Math.round(ms / 3600000)}h`;
      if (ms >= 60000) return `every ${Math.round(ms / 60000)}m`;
      return `every ${Math.round(ms / 1000)}s`;
    }
    if (s.kind === 'at') return `at: ${s.at ? new Date(s.at).toLocaleString() : 'n/a'}`;
    return s.kind;
  }

  function formatTime(ts?: number): string {
    if (!ts) return 'never';
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (Math.abs(diff) < 60000) return 'just now';
    if (diff > 0 && diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff > 0 && diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 0) {
      const absDiff = Math.abs(diff);
      if (absDiff < 3600000) return `in ${Math.floor(absDiff / 60000)}m`;
      if (absDiff < 86400000) return `in ${Math.floor(absDiff / 3600000)}h`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms?: number): string {
    if (!ms) return 'n/a';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  }

  function formatMs(ms: number): string {
    if (ms >= 86400000) return `${ms / 86400000}d`;
    if (ms >= 3600000) return `${ms / 3600000}h`;
    if (ms >= 60000) return `${ms / 60000}m`;
    return `${ms / 1000}s`;
  }

  function toDatetimeLocal(iso: string): string {
    try {
      const d = new Date(iso);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  }

  function describeCron(expr: string): string {
    const parts = expr.split(/\s+/);
    if (parts.length < 5) return 'Invalid cron expression';
    const [min, hour, dom, mon, dow] = parts;

    // Common patterns
    if (expr === '* * * * *') return 'Every minute';
    if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${min.slice(2)} minutes`;
    }
    if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
      return `Every ${hour.slice(2)} hours`;
    }
    if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
      return 'Every hour at :00';
    }
    if (dom === '*' && mon === '*' && dow === '*') {
      const hStr = hour === '*' ? 'every hour' : `${hour}:${min.padStart(2, '0')}`;
      return `Daily at ${hStr}`;
    }
    if (dom === '*' && mon === '*' && dow !== '*') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[Number(dow)] ?? dow;
      return `Weekly on ${dayName} at ${hour}:${min.padStart(2, '0')}`;
    }
    if (mon === '*' && dow === '*' && dom !== '*') {
      return `Monthly on day ${dom} at ${hour}:${min.padStart(2, '0')}`;
    }
    return `min:${min} hour:${hour} dom:${dom} mon:${mon} dow:${dow}`;
  }
</script>

<svelte:head>
  <title>Cron Jobs — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">Cron Jobs</h1>
        <p class="text-sm text-text-muted mt-1">Schedule wakeups and recurring agent runs.</p>
      </div>
      <div class="flex items-center gap-3">
        {#if cronStatus}
          <span class="px-3 py-1 rounded-full text-xs font-medium
                      {cronStatus.enabled ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                                           : 'bg-red-500/20 text-red-400 border border-red-500/30'}">
            {cronStatus.enabled ? '● Active' : '○ Disabled'}
          </span>
        {/if}
        <button
          onclick={openCreateEditor}
          disabled={conn.state.status !== 'connected'}
          class="px-4 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan
                 border border-accent-cyan/40 hover:bg-accent-cyan/30 hover:shadow-[0_0_12px_rgba(0,229,255,0.25)]
                 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Create Job
        </button>
        <button
          onclick={loadAll}
          disabled={loading || conn.state.status !== 'connected'}
          class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ↻ Refresh
        </button>
      </div>
    </div>

    {#if error}
      <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
    {/if}

    <!-- Job count -->
    <div class="text-xs text-text-muted">
      {jobs.length} job{jobs.length !== 1 ? 's' : ''} · {jobs.filter(j => j.enabled).length} enabled
      {#if cronStatus?.nextRunMs}
        · next tick {formatTime(Date.now() + cronStatus.nextRunMs)}
      {/if}
    </div>

    <!-- ═══ Editor Panel ═══════════════════════ -->
    {#if editorOpen}
      <div class="rounded-xl border border-accent-purple/40 bg-bg-secondary/80 backdrop-blur-sm
                  shadow-[0_0_20px_rgba(124,77,255,0.15)]">
        <!-- Editor header -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h2 class="text-lg font-semibold text-accent-purple">
            {editingJobId ? '✏️ Edit Job' : '✨ Create Job'}
          </h2>
          <button onclick={closeEditor} class="text-text-muted hover:text-text-primary text-lg transition-colors">✕</button>
        </div>

        <div class="p-5 space-y-5">
          <!-- Name -->
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1.5">Job Name</label>
            <input
              type="text"
              bind:value={formName}
              placeholder="e.g. daily-digest, heartbeat-check"
              class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                     text-text-primary placeholder:text-text-muted/50 text-sm
                     focus:outline-none focus:border-accent-purple/60 focus:shadow-[0_0_8px_rgba(124,77,255,0.2)]
                     transition-all"
            />
          </div>

          <!-- Schedule section -->
          <div>
            <label class="block text-xs font-medium text-text-muted mb-2">Schedule Type</label>
            <div class="flex gap-1 p-1 bg-bg-tertiary rounded-lg w-fit mb-3">
              {#each [['at', '📅 One-shot'], ['every', '🔄 Recurring'], ['cron', '⏱ Cron']] as [val, label]}
                <button
                  onclick={() => formScheduleKind = val as 'at' | 'every' | 'cron'}
                  class="px-3 py-1.5 rounded-md text-sm transition-all
                        {formScheduleKind === val
                          ? 'bg-accent-purple/30 text-accent-purple shadow-sm'
                          : 'text-text-muted hover:text-text-secondary'}"
                >
                  {label}
                </button>
              {/each}
            </div>

            <!-- At: datetime picker -->
            {#if formScheduleKind === 'at'}
              <div>
                <label class="block text-xs text-text-muted mb-1">Date & Time</label>
                <input
                  type="datetime-local"
                  bind:value={formAtValue}
                  class="px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                         text-text-primary text-sm focus:outline-none focus:border-accent-purple/60 transition-all"
                />
              </div>
            {/if}

            <!-- Every: interval -->
            {#if formScheduleKind === 'every'}
              <div>
                <label class="block text-xs text-text-muted mb-1.5">Interval</label>
                <div class="flex flex-wrap gap-1.5 mb-2">
                  {#each intervalPresets as preset}
                    <button
                      onclick={() => formEveryMs = preset.ms}
                      class="px-3 py-1 rounded-md text-xs border transition-all
                            {formEveryMs === preset.ms
                              ? 'border-accent-cyan/50 bg-accent-cyan/20 text-accent-cyan'
                              : 'border-border-default text-text-muted hover:border-accent-cyan/30 hover:text-text-secondary'}"
                    >
                      {preset.label}
                    </button>
                  {/each}
                </div>
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    bind:value={formEveryMs}
                    min="1000"
                    step="1000"
                    class="w-40 px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                           text-text-primary text-sm focus:outline-none focus:border-accent-purple/60 transition-all"
                  />
                  <span class="text-xs text-text-muted">ms ({formatMs(formEveryMs)})</span>
                </div>
              </div>
            {/if}

            <!-- Cron: expression -->
            {#if formScheduleKind === 'cron'}
              <div class="space-y-3">
                <div>
                  <label class="block text-xs text-text-muted mb-1.5">Cron Expression</label>
                  <input
                    type="text"
                    bind:value={formCronExpr}
                    placeholder="*/5 * * * *"
                    class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                           text-text-primary font-mono text-sm placeholder:text-text-muted/50
                           focus:outline-none focus:border-accent-purple/60 transition-all"
                  />
                  {#if cronHumanReadable}
                    <p class="mt-1 text-xs text-accent-cyan">→ {cronHumanReadable}</p>
                  {/if}
                </div>

                <!-- Cron presets -->
                <div>
                  <label class="block text-xs text-text-muted mb-1.5">Presets</label>
                  <div class="flex flex-wrap gap-1.5">
                    {#each cronPresets as preset}
                      <button
                        onclick={() => formCronExpr = preset.expr}
                        class="px-2.5 py-1 rounded-md text-xs border transition-all
                              {formCronExpr === preset.expr
                                ? 'border-accent-cyan/50 bg-accent-cyan/20 text-accent-cyan'
                                : 'border-border-default text-text-muted hover:border-accent-cyan/30 hover:text-text-secondary'}"
                      >
                        {preset.label}
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Timezone -->
                <div>
                  <label class="block text-xs text-text-muted mb-1">Timezone</label>
                  <select
                    bind:value={formCronTz}
                    class="px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                           text-text-primary text-sm focus:outline-none focus:border-accent-purple/60 transition-all"
                  >
                    {#each timezones as tz}
                      <option value={tz}>{tz || '(default / UTC)'}</option>
                    {/each}
                  </select>
                </div>
              </div>
            {/if}
          </div>

          <!-- Session Target -->
          <div>
            <label class="block text-xs font-medium text-text-muted mb-2">Session Target</label>
            <div class="flex gap-3">
              {#each [['main', '🏠 Main Session', 'System event in main context'], ['isolated', '🔒 Isolated', 'Separate agent turn with its own session']] as [val, label, desc]}
                <button
                  onclick={() => formSessionTarget = val as 'main' | 'isolated'}
                  class="flex-1 p-3 rounded-lg border text-left transition-all
                        {formSessionTarget === val
                          ? 'border-accent-purple/50 bg-accent-purple/10'
                          : 'border-border-default hover:border-border-default/80'}"
                >
                  <div class="text-sm font-medium {formSessionTarget === val ? 'text-accent-purple' : 'text-text-secondary'}">{label}</div>
                  <div class="text-xs text-text-muted mt-0.5">{desc}</div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Payload -->
          <div>
            <label class="block text-xs font-medium text-text-muted mb-2">
              Payload — <span class="text-accent-cyan">{payloadKind}</span>
            </label>

            {#if payloadKind === 'systemEvent'}
              <textarea
                bind:value={formEventText}
                rows={3}
                placeholder="System event text to send to main session..."
                class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                       text-text-primary text-sm placeholder:text-text-muted/50
                       focus:outline-none focus:border-accent-purple/60 transition-all resize-y"
              ></textarea>
            {:else}
              <div class="space-y-3">
                <textarea
                  bind:value={formAgentMessage}
                  rows={3}
                  placeholder="Message for the agent turn..."
                  class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                         text-text-primary text-sm placeholder:text-text-muted/50
                         focus:outline-none focus:border-accent-purple/60 transition-all resize-y"
                ></textarea>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Model <span class="text-text-muted/60">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formAgentModel}
                      placeholder="e.g. claude-sonnet-4-20250514"
                      class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted/50
                             focus:outline-none focus:border-accent-purple/60 transition-all"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Thinking</label>
                    <select
                      bind:value={formAgentThinking}
                      class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                             text-text-primary text-sm focus:outline-none focus:border-accent-purple/60 transition-all"
                    >
                      <option value="">Off</option>
                      <option value="on">On</option>
                      <option value="stream">Stream</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Timeout <span class="text-text-muted/60">(seconds)</span></label>
                    <input
                      type="number"
                      bind:value={formAgentTimeout}
                      min="0"
                      placeholder="300"
                      class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted/50
                             focus:outline-none focus:border-accent-purple/60 transition-all"
                    />
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Delivery (isolated only) -->
          {#if formSessionTarget === 'isolated'}
            <div>
              <label class="block text-xs font-medium text-text-muted mb-2">Delivery</label>
              <div class="flex gap-3 mb-3">
                {#each [['none', 'None'], ['announce', '📢 Announce']] as [val, label]}
                  <button
                    onclick={() => formDeliveryMode = val as 'none' | 'announce'}
                    class="px-4 py-1.5 rounded-lg text-sm border transition-all
                          {formDeliveryMode === val
                            ? 'border-accent-cyan/50 bg-accent-cyan/15 text-accent-cyan'
                            : 'border-border-default text-text-muted hover:text-text-secondary'}"
                  >
                    {label}
                  </button>
                {/each}
              </div>
              {#if formDeliveryMode === 'announce'}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-text-muted mb-1">Channel <span class="text-text-muted/60">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formDeliveryChannel}
                      placeholder="e.g. discord, telegram"
                      class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted/50
                             focus:outline-none focus:border-accent-purple/60 transition-all"
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-text-muted mb-1">To <span class="text-text-muted/60">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formDeliveryTo}
                      placeholder="Channel ID or user"
                      class="w-full px-3 py-2 rounded-lg bg-bg-tertiary border border-border-default
                             text-text-primary text-sm placeholder:text-text-muted/50
                             focus:outline-none focus:border-accent-purple/60 transition-all"
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Options -->
          <div class="flex items-center gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={formEnabled}
                class="w-4 h-4 rounded border-border-default bg-bg-tertiary text-accent-cyan
                       focus:ring-accent-purple/50 focus:ring-offset-0" />
              <span class="text-sm text-text-secondary">Enabled</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={formNotify}
                class="w-4 h-4 rounded border-border-default bg-bg-tertiary text-accent-cyan
                       focus:ring-accent-purple/50 focus:ring-offset-0" />
              <span class="text-sm text-text-secondary">Notify on run</span>
            </label>
          </div>

          <!-- Submit row -->
          <div class="flex items-center justify-between pt-2 border-t border-border-default/50">
            <button onclick={closeEditor} class="px-4 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary transition-colors">
              Cancel
            </button>
            <button
              onclick={submitForm}
              disabled={!formValid || saving}
              class="px-6 py-2 rounded-lg text-sm font-medium transition-all
                     disabled:opacity-40 disabled:cursor-not-allowed
                     {formValid
                       ? 'bg-accent-purple/25 text-accent-purple border border-accent-purple/50 hover:bg-accent-purple/35 hover:shadow-[0_0_16px_rgba(124,77,255,0.3)]'
                       : 'bg-bg-tertiary text-text-muted border border-border-default'}"
            >
              {#if saving}
                Saving...
              {:else}
                {editingJobId ? '💾 Update Job' : '✨ Create Job'}
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- ═══ Jobs List ═══════════════════════ -->
    {#if loading}
      <div class="space-y-3">
        {#each Array(3) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-5 w-48 bg-bg-tertiary rounded mb-2"></div>
            <div class="h-4 w-32 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>
    {:else if jobs.length === 0}
      <div class="text-center py-16 text-text-muted">
        <div class="text-4xl mb-3">⏰</div>
        <p class="text-lg mb-1">No cron jobs configured</p>
        <p class="text-sm mb-4">Create your first scheduled job to get started.</p>
        <button
          onclick={openCreateEditor}
          class="px-4 py-2 rounded-lg text-sm font-medium bg-accent-purple/20 text-accent-purple
                 border border-accent-purple/40 hover:bg-accent-purple/30 transition-all"
        >
          + Create Job
        </button>
      </div>
    {:else}
      <div class="space-y-3">
        {#each jobs as job (job.id)}
          <div class="rounded-xl border bg-bg-secondary/50 transition-all duration-200
                      {job.enabled ? 'border-border-default hover:border-border-default/80' : 'border-border-default/50 opacity-60'}
                      {expandedJobId === job.id ? 'shadow-[0_0_12px_rgba(0,229,255,0.1)]' : ''}">
            <!-- Job header -->
            <div class="flex items-center gap-3 p-4">
              <!-- Enable/disable toggle -->
              <button
                onclick={() => toggleJob(job)}
                disabled={busy}
                class="w-10 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer
                       {job.enabled ? 'bg-accent-green/30' : 'bg-bg-tertiary'}"
                title="{job.enabled ? 'Disable' : 'Enable'} job"
              >
                <div class="absolute top-1 w-4 h-4 rounded-full transition-all duration-200
                           {job.enabled ? 'left-5 bg-accent-green' : 'left-1 bg-text-muted'}"></div>
              </button>

              <!-- Job info (click to expand) -->
              <button
                onclick={() => expandedJobId = expandedJobId === job.id ? null : job.id}
                class="flex-1 text-left min-w-0"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium text-text-primary truncate">{job.name || job.id}</span>
                  <span class="px-2 py-0.5 rounded text-xs
                              {job.payload.kind === 'agentTurn' ? 'bg-accent-purple/20 text-accent-purple' : 'bg-accent-cyan/20 text-accent-cyan'}">
                    {job.payload.kind === 'agentTurn' ? 'agent' : 'event'}
                  </span>
                  <span class="px-2 py-0.5 rounded text-xs bg-bg-tertiary text-text-muted">
                    {job.sessionTarget}
                  </span>
                </div>
                <div class="text-xs text-text-muted mt-1 flex items-center gap-3 flex-wrap">
                  <span>{formatSchedule(job.schedule)}</span>
                  {#if job.nextRunAt}
                    <span class="text-accent-cyan/70">Next: {formatTime(job.nextRunAt)}</span>
                  {/if}
                  {#if job.lastRunAt}
                    <span>Last: {formatTime(job.lastRunAt)}</span>
                  {/if}
                  {#if job.runCount}
                    <span>{job.runCount} runs</span>
                  {/if}
                </div>
              </button>

              <!-- Action buttons -->
              <div class="flex items-center gap-1 flex-shrink-0">
                <!-- Edit -->
                <button
                  onclick={() => openEditEditor(job)}
                  disabled={busy}
                  class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-purple transition-colors
                         disabled:opacity-50"
                  title="Edit job"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <!-- Run -->
                <button
                  onclick={() => runJob(job)}
                  disabled={busy}
                  class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-green transition-colors
                         disabled:opacity-50"
                  title="Run now"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <!-- History -->
                <button
                  onclick={() => loadRuns(job.id)}
                  disabled={busy}
                  class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors
                         disabled:opacity-50"
                  title="View run history"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <!-- Delete -->
                <button
                  onclick={() => removeJob(job)}
                  disabled={busy}
                  class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors
                         disabled:opacity-50"
                  title="Delete job"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Expanded detail -->
            {#if expandedJobId === job.id}
              <div class="border-t border-border-default p-4 space-y-3 text-sm">
                {#if job.description}
                  <div>
                    <span class="text-text-muted text-xs">Description</span>
                    <p class="text-text-secondary">{job.description}</p>
                  </div>
                {/if}
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <span class="text-text-muted text-xs block">Schedule</span>
                    <span class="text-text-secondary font-mono text-xs">{formatSchedule(job.schedule)}</span>
                  </div>
                  <div>
                    <span class="text-text-muted text-xs block">Target</span>
                    <span class="text-text-secondary">{job.sessionTarget}</span>
                  </div>
                  <div>
                    <span class="text-text-muted text-xs block">Notify</span>
                    <span class="text-text-secondary">{job.notify ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span class="text-text-muted text-xs block">ID</span>
                    <span class="text-text-secondary font-mono text-xs break-all">{job.id}</span>
                  </div>
                </div>
                <div>
                  <span class="text-text-muted text-xs block mb-1">Payload</span>
                  <pre class="p-2 rounded bg-bg-tertiary text-text-secondary font-mono text-xs overflow-x-auto">{JSON.stringify(job.payload, null, 2)}</pre>
                </div>
                {#if job.delivery}
                  <div>
                    <span class="text-text-muted text-xs block mb-1">Delivery</span>
                    <pre class="p-2 rounded bg-bg-tertiary text-text-secondary font-mono text-xs">{JSON.stringify(job.delivery, null, 2)}</pre>
                  </div>
                {/if}
                {#if job.lastError}
                  <div class="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    Last error: {job.lastError}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- ═══ Run History Panel ═══════════════ -->
    {#if selectedJobId}
      {@const selectedJob = jobs.find(j => j.id === selectedJobId)}
      <div class="rounded-xl border border-accent-cyan/30 bg-bg-secondary/50 p-4
                  shadow-[0_0_12px_rgba(0,229,255,0.08)]">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold text-accent-cyan">
            📋 Run History: {selectedJob?.name ?? selectedJobId}
          </h2>
          <div class="flex items-center gap-2">
            <button
              onclick={() => loadRuns(selectedJobId!)}
              disabled={runsLoading}
              class="text-text-muted hover:text-accent-cyan text-xs transition-colors disabled:opacity-50"
            >
              ↻ Refresh
            </button>
            <button
              onclick={() => { selectedJobId = null; runs = []; }}
              class="text-text-muted hover:text-text-primary text-xs transition-colors"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {#if runsLoading}
          <div class="text-text-muted text-sm py-4 text-center">Loading runs...</div>
        {:else if runs.length === 0}
          <div class="text-text-muted text-sm py-4 text-center">No run history available.</div>
        {:else}
          <div class="space-y-2 max-h-80 overflow-y-auto">
            {#each runs as run (run.id)}
              <div class="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-tertiary/50 text-xs">
                <span class="w-2 h-2 rounded-full flex-shrink-0
                            {run.status === 'ok' || run.status === 'success' ? 'bg-accent-green' :
                             run.status === 'error' || run.status === 'failed' ? 'bg-red-500' :
                             run.status === 'running' ? 'bg-accent-cyan animate-pulse' : 'bg-text-muted'}"></span>
                <span class="text-text-muted w-28 flex-shrink-0">{formatTime(run.startedAt)}</span>
                <span class="text-text-secondary flex-shrink-0 w-16">{formatDuration(run.durationMs)}</span>
                <span class="text-text-secondary flex-1 truncate font-mono">
                  {run.status}{run.error ? `: ${run.error}` : ''}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
