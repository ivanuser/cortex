<script lang="ts">
  import { gateway } from '$lib/gateway';
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <div class="hud-page-topbar">
    <a href="/overview" class="hud-back">&larr; OVERVIEW</a>
    <div class="hud-page-title">CRON SCHEDULER</div>
    <div></div>
  </div>

  <div class="hud-content">
    <!-- Header actions -->
    <div class="hud-header-row">
      <div class="hud-status-group">
        {#if cronStatus}
          <span class="hud-status-badge" class:active={cronStatus.enabled} class:inactive={!cronStatus.enabled}>
            {cronStatus.enabled ? '// ACTIVE' : '// DISABLED'}
          </span>
        {/if}
      </div>
      <div class="hud-action-group">
        <button
          onclick={openCreateEditor}
          disabled={conn.state.status !== 'connected'}
          class="hud-btn hud-btn-primary"
        >
          + CREATE JOB
        </button>
        <button
          onclick={loadAll}
          disabled={loading || conn.state.status !== 'connected'}
          class="hud-btn"
        >
          REFRESH
        </button>
      </div>
    </div>

    {#if error}
      <div class="hud-error">{error}</div>
    {/if}

    <!-- Job count -->
    <div class="hud-meta">
      {jobs.length} job{jobs.length !== 1 ? 's' : ''} // {jobs.filter(j => j.enabled).length} enabled
      {#if cronStatus?.nextRunMs}
        // next tick {formatTime(Date.now() + cronStatus.nextRunMs)}
      {/if}
    </div>

    <!-- ═══ Editor Panel ═══════════════════════ -->
    {#if editorOpen}
      <div class="hud-panel hud-panel-editor">
        <!-- Editor header -->
        <div class="hud-panel-header">
          <span class="hud-panel-lbl">
            {editingJobId ? 'EDIT JOB' : 'CREATE JOB'}
          </span>
          <button onclick={closeEditor} class="hud-btn-close">X</button>
        </div>

        <div class="hud-panel-body">
          <!-- Name -->
          <div class="hud-field">
            <label class="hud-label">JOB NAME</label>
            <input
              type="text"
              bind:value={formName}
              placeholder="e.g. daily-digest, heartbeat-check"
              class="hud-input"
            />
          </div>

          <!-- Schedule section -->
          <div class="hud-field">
            <label class="hud-label">SCHEDULE TYPE</label>
            <div class="hud-tab-group">
              {#each [['at', 'ONE-SHOT'], ['every', 'RECURRING'], ['cron', 'CRON']] as [val, label]}
                <button
                  onclick={() => formScheduleKind = val as 'at' | 'every' | 'cron'}
                  class="hud-tab"
                  class:active={formScheduleKind === val}
                >
                  {label}
                </button>
              {/each}
            </div>

            <!-- At: datetime picker -->
            {#if formScheduleKind === 'at'}
              <div class="hud-field">
                <label class="hud-label">DATE & TIME</label>
                <input
                  type="datetime-local"
                  bind:value={formAtValue}
                  class="hud-input"
                />
              </div>
            {/if}

            <!-- Every: interval -->
            {#if formScheduleKind === 'every'}
              <div class="hud-field">
                <label class="hud-label">INTERVAL</label>
                <div class="hud-preset-group">
                  {#each intervalPresets as preset}
                    <button
                      onclick={() => formEveryMs = preset.ms}
                      class="hud-preset"
                      class:active={formEveryMs === preset.ms}
                    >
                      {preset.label}
                    </button>
                  {/each}
                </div>
                <div class="hud-inline-group">
                  <input
                    type="number"
                    bind:value={formEveryMs}
                    min="1000"
                    step="1000"
                    class="hud-input hud-input-narrow"
                  />
                  <span class="hud-hint">ms ({formatMs(formEveryMs)})</span>
                </div>
              </div>
            {/if}

            <!-- Cron: expression -->
            {#if formScheduleKind === 'cron'}
              <div class="hud-field">
                <label class="hud-label">CRON EXPRESSION</label>
                <input
                  type="text"
                  bind:value={formCronExpr}
                  placeholder="*/5 * * * *"
                  class="hud-input hud-input-mono"
                />
                {#if cronHumanReadable}
                  <p class="hud-cron-desc">// {cronHumanReadable}</p>
                {/if}
              </div>

              <!-- Cron presets -->
              <div class="hud-field">
                <label class="hud-label">PRESETS</label>
                <div class="hud-preset-group">
                  {#each cronPresets as preset}
                    <button
                      onclick={() => formCronExpr = preset.expr}
                      class="hud-preset"
                      class:active={formCronExpr === preset.expr}
                    >
                      {preset.label}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Timezone -->
              <div class="hud-field">
                <label class="hud-label">TIMEZONE</label>
                <select
                  bind:value={formCronTz}
                  class="hud-input hud-select"
                >
                  {#each timezones as tz}
                    <option value={tz}>{tz || '(default / UTC)'}</option>
                  {/each}
                </select>
              </div>
            {/if}
          </div>

          <!-- Session Target -->
          <div class="hud-field">
            <label class="hud-label">SESSION TARGET</label>
            <div class="hud-target-group">
              {#each [['main', 'MAIN SESSION', 'System event in main context'], ['isolated', 'ISOLATED', 'Separate agent turn with its own session']] as [val, label, desc]}
                <button
                  onclick={() => formSessionTarget = val as 'main' | 'isolated'}
                  class="hud-target-btn"
                  class:active={formSessionTarget === val}
                >
                  <div class="hud-target-label">{label}</div>
                  <div class="hud-target-desc">{desc}</div>
                </button>
              {/each}
            </div>
          </div>

          <!-- Payload -->
          <div class="hud-field">
            <label class="hud-label">
              PAYLOAD // <span class="hud-accent-cyan">{payloadKind}</span>
            </label>

            {#if payloadKind === 'systemEvent'}
              <textarea
                bind:value={formEventText}
                rows={3}
                placeholder="System event text to send to main session..."
                class="hud-input hud-textarea"
              ></textarea>
            {:else}
              <div class="hud-field-stack">
                <textarea
                  bind:value={formAgentMessage}
                  rows={3}
                  placeholder="Message for the agent turn..."
                  class="hud-input hud-textarea"
                ></textarea>

                <div class="hud-grid-3">
                  <div class="hud-field">
                    <label class="hud-label">MODEL <span class="hud-dim">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formAgentModel}
                      placeholder="e.g. claude-sonnet-4-20250514"
                      class="hud-input"
                    />
                  </div>
                  <div class="hud-field">
                    <label class="hud-label">THINKING</label>
                    <select
                      bind:value={formAgentThinking}
                      class="hud-input hud-select"
                    >
                      <option value="">Off</option>
                      <option value="on">On</option>
                      <option value="stream">Stream</option>
                    </select>
                  </div>
                  <div class="hud-field">
                    <label class="hud-label">TIMEOUT <span class="hud-dim">(seconds)</span></label>
                    <input
                      type="number"
                      bind:value={formAgentTimeout}
                      min="0"
                      placeholder="300"
                      class="hud-input"
                    />
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Delivery (isolated only) -->
          {#if formSessionTarget === 'isolated'}
            <div class="hud-field">
              <label class="hud-label">DELIVERY</label>
              <div class="hud-tab-group">
                {#each [['none', 'NONE'], ['announce', 'ANNOUNCE']] as [val, label]}
                  <button
                    onclick={() => formDeliveryMode = val as 'none' | 'announce'}
                    class="hud-tab"
                    class:active={formDeliveryMode === val}
                  >
                    {label}
                  </button>
                {/each}
              </div>
              {#if formDeliveryMode === 'announce'}
                <div class="hud-grid-2">
                  <div class="hud-field">
                    <label class="hud-label">CHANNEL <span class="hud-dim">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formDeliveryChannel}
                      placeholder="e.g. discord, telegram"
                      class="hud-input"
                    />
                  </div>
                  <div class="hud-field">
                    <label class="hud-label">TO <span class="hud-dim">(optional)</span></label>
                    <input
                      type="text"
                      bind:value={formDeliveryTo}
                      placeholder="Channel ID or user"
                      class="hud-input"
                    />
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Options -->
          <div class="hud-options-row">
            <label class="hud-checkbox-label">
              <input type="checkbox" bind:checked={formEnabled} class="hud-checkbox" />
              <span>ENABLED</span>
            </label>
            <label class="hud-checkbox-label">
              <input type="checkbox" bind:checked={formNotify} class="hud-checkbox" />
              <span>NOTIFY ON RUN</span>
            </label>
          </div>

          <!-- Submit row -->
          <div class="hud-submit-row">
            <button onclick={closeEditor} class="hud-btn">
              CANCEL
            </button>
            <button
              onclick={submitForm}
              disabled={!formValid || saving}
              class="hud-btn hud-btn-primary"
            >
              {#if saving}
                SAVING...
              {:else}
                {editingJobId ? 'UPDATE JOB' : 'CREATE JOB'}
              {/if}
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- ═══ Jobs List ═══════════════════════ -->
    {#if loading}
      <div class="hud-loading-list">
        {#each Array(3) as _}
          <div class="hud-panel hud-skeleton">
            <div class="hud-skeleton-bar wide"></div>
            <div class="hud-skeleton-bar narrow"></div>
          </div>
        {/each}
      </div>
    {:else if jobs.length === 0}
      <div class="hud-empty">
        <div class="hud-empty-icon">[ ]</div>
        <p class="hud-empty-title">NO CRON JOBS CONFIGURED</p>
        <p class="hud-empty-sub">Create your first scheduled job to get started.</p>
        <button
          onclick={openCreateEditor}
          class="hud-btn hud-btn-primary"
        >
          + CREATE JOB
        </button>
      </div>
    {:else}
      <div class="hud-job-list">
        {#each jobs as job (job.id)}
          <div class="hud-panel hud-job-card" class:disabled={!job.enabled} class:expanded={expandedJobId === job.id}>
            <!-- Job header -->
            <div class="hud-job-header">
              <!-- Enable/disable toggle -->
              <button
                onclick={() => toggleJob(job)}
                disabled={busy}
                class="hud-toggle"
                class:on={job.enabled}
                title="{job.enabled ? 'Disable' : 'Enable'} job"
              >
                <div class="hud-toggle-knob"></div>
              </button>

              <!-- Job info (click to expand) -->
              <button
                onclick={() => expandedJobId = expandedJobId === job.id ? null : job.id}
                class="hud-job-info"
              >
                <div class="hud-job-name-row">
                  <span class="hud-job-name">{job.name || job.id}</span>
                  <span class="hud-badge" class:badge-agent={job.payload.kind === 'agentTurn'} class:badge-event={job.payload.kind !== 'agentTurn'}>
                    {job.payload.kind === 'agentTurn' ? 'AGENT' : 'EVENT'}
                  </span>
                  <span class="hud-badge badge-target">
                    {job.sessionTarget}
                  </span>
                </div>
                <div class="hud-job-meta">
                  <span>{formatSchedule(job.schedule)}</span>
                  {#if job.nextRunAt}
                    <span class="hud-accent-cyan">Next: {formatTime(job.nextRunAt)}</span>
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
              <div class="hud-job-actions">
                <button
                  onclick={() => openEditEditor(job)}
                  disabled={busy}
                  class="hud-icon-btn"
                  title="Edit job"
                >
                  <svg class="hud-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onclick={() => runJob(job)}
                  disabled={busy}
                  class="hud-icon-btn hud-icon-btn-run"
                  title="Run now"
                >
                  <svg class="hud-icon" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                <button
                  onclick={() => loadRuns(job.id)}
                  disabled={busy}
                  class="hud-icon-btn hud-icon-btn-history"
                  title="View run history"
                >
                  <svg class="hud-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
                <button
                  onclick={() => removeJob(job)}
                  disabled={busy}
                  class="hud-icon-btn hud-icon-btn-delete"
                  title="Delete job"
                >
                  <svg class="hud-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Expanded detail -->
            {#if expandedJobId === job.id}
              <div class="hud-job-detail">
                {#if job.description}
                  <div class="hud-detail-field">
                    <span class="hud-label">DESCRIPTION</span>
                    <p>{job.description}</p>
                  </div>
                {/if}
                <div class="hud-detail-grid">
                  <div>
                    <span class="hud-label">SCHEDULE</span>
                    <span class="hud-detail-value mono">{formatSchedule(job.schedule)}</span>
                  </div>
                  <div>
                    <span class="hud-label">TARGET</span>
                    <span class="hud-detail-value">{job.sessionTarget}</span>
                  </div>
                  <div>
                    <span class="hud-label">NOTIFY</span>
                    <span class="hud-detail-value">{job.notify ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span class="hud-label">ID</span>
                    <span class="hud-detail-value mono break-all">{job.id}</span>
                  </div>
                </div>
                <div class="hud-detail-field">
                  <span class="hud-label">PAYLOAD</span>
                  <pre class="hud-pre">{JSON.stringify(job.payload, null, 2)}</pre>
                </div>
                {#if job.delivery}
                  <div class="hud-detail-field">
                    <span class="hud-label">DELIVERY</span>
                    <pre class="hud-pre">{JSON.stringify(job.delivery, null, 2)}</pre>
                  </div>
                {/if}
                {#if job.lastError}
                  <div class="hud-error-inline">
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
      <div class="hud-panel hud-panel-runs">
        <div class="hud-panel-header">
          <span class="hud-panel-lbl">
            RUN HISTORY // {selectedJob?.name ?? selectedJobId}
          </span>
          <div class="hud-panel-header-actions">
            <button
              onclick={() => loadRuns(selectedJobId!)}
              disabled={runsLoading}
              class="hud-btn hud-btn-sm"
            >
              REFRESH
            </button>
            <button
              onclick={() => { selectedJobId = null; runs = []; }}
              class="hud-btn hud-btn-sm"
            >
              CLOSE
            </button>
          </div>
        </div>

        {#if runsLoading}
          <div class="hud-runs-empty">Loading runs...</div>
        {:else if runs.length === 0}
          <div class="hud-runs-empty">No run history available.</div>
        {:else}
          <div class="hud-runs-list">
            {#each runs as run (run.id)}
              <div class="hud-run-row">
                <span class="hud-run-dot"
                  class:dot-ok={run.status === 'ok' || run.status === 'success'}
                  class:dot-err={run.status === 'error' || run.status === 'failed'}
                  class:dot-running={run.status === 'running'}
                ></span>
                <span class="hud-run-time">{formatTime(run.startedAt)}</span>
                <span class="hud-run-duration">{formatDuration(run.durationMs)}</span>
                <span class="hud-run-status">
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

<style>
  /* ─── Page Layout ─────────────────────── */
  .hud-page {
    position: relative;
    height: 100%;
    overflow-y: auto;
    background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(5,10,20,0.98) 100%);
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan, #00e5ff);
  }

  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--color-accent-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.03);
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(12px);
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: var(--color-accent-cyan, #00e5ff);
    text-decoration: none;
    letter-spacing: 0.1em;
    opacity: 0.7;
    transition: opacity 0.2s, text-shadow 0.2s;
  }
  .hud-back:hover {
    opacity: 1;
    text-shadow: 0 0 8px var(--color-accent-cyan, #00e5ff);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.1rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    color: var(--color-accent-cyan, #00e5ff);
    text-shadow: 0 0 20px rgba(0, 229, 255, 0.5);
  }

  .hud-content {
    max-width: 72rem;
    margin: 0 auto;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* ─── Header Row ──────────────────────── */
  .hud-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .hud-status-group { display: flex; align-items: center; gap: 0.75rem; }
  .hud-action-group { display: flex; align-items: center; gap: 0.75rem; }

  .hud-status-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
    border: 1px solid;
    letter-spacing: 0.1em;
  }
  .hud-status-badge.active {
    color: var(--color-accent-green, #00ff88);
    border-color: var(--color-accent-green, #00ff88);
    background: rgba(0, 255, 136, 0.08);
    text-shadow: 0 0 6px rgba(0, 255, 136, 0.4);
  }
  .hud-status-badge.inactive {
    color: #ff4444;
    border-color: #ff4444;
    background: rgba(255, 68, 68, 0.08);
  }

  .hud-meta {
    font-size: 0.75rem;
    color: rgba(0, 229, 255, 0.5);
    letter-spacing: 0.05em;
  }

  /* ─── Buttons ─────────────────────────── */
  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    padding: 0.5rem 1rem;
    border: 1px solid rgba(0, 229, 255, 0.3);
    background: rgba(0, 229, 255, 0.05);
    color: var(--color-accent-cyan, #00e5ff);
    cursor: pointer;
    letter-spacing: 0.1em;
    transition: all 0.2s;
  }
  .hud-btn:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.15);
    border-color: var(--color-accent-cyan, #00e5ff);
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.15);
  }
  .hud-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .hud-btn-primary {
    border-color: var(--color-accent-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.12);
    box-shadow: 0 0 8px rgba(0, 229, 255, 0.1);
  }
  .hud-btn-primary:hover:not(:disabled) {
    background: rgba(0, 229, 255, 0.25);
    box-shadow: 0 0 20px rgba(0, 229, 255, 0.3);
  }

  .hud-btn-sm {
    font-size: 0.7rem;
    padding: 0.25rem 0.5rem;
  }

  .hud-btn-close {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.9rem;
    color: rgba(0, 229, 255, 0.5);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s, text-shadow 0.2s;
  }
  .hud-btn-close:hover {
    color: var(--color-accent-cyan, #00e5ff);
    text-shadow: 0 0 8px rgba(0, 229, 255, 0.6);
  }

  /* ─── Panels ──────────────────────────── */
  .hud-panel {
    border: 1px solid rgba(0, 229, 255, 0.2);
    background: rgba(0, 10, 20, 0.7);
    backdrop-filter: blur(6px);
  }

  .hud-panel-lbl {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan, #00e5ff);
    text-shadow: 0 0 10px rgba(0, 229, 255, 0.3);
  }

  .hud-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid rgba(0, 229, 255, 0.15);
  }

  .hud-panel-header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hud-panel-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .hud-panel-editor {
    border-color: rgba(124, 77, 255, 0.4);
    box-shadow: 0 0 20px rgba(124, 77, 255, 0.1);
  }
  .hud-panel-editor .hud-panel-lbl {
    color: var(--color-accent-purple, #7c4dff);
    text-shadow: 0 0 10px rgba(124, 77, 255, 0.3);
  }
  .hud-panel-editor .hud-panel-header {
    border-bottom-color: rgba(124, 77, 255, 0.2);
  }

  .hud-panel-runs {
    border-color: rgba(0, 229, 255, 0.3);
    box-shadow: 0 0 12px rgba(0, 229, 255, 0.06);
  }

  /* ─── Form Elements ───────────────────── */
  .hud-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hud-field-stack {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .hud-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.5);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }

  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.85rem;
    padding: 0.5rem 0.75rem;
    background: rgba(0, 10, 20, 0.8);
    border: 1px solid rgba(0, 229, 255, 0.2);
    color: var(--color-accent-cyan, #00e5ff);
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .hud-input::placeholder {
    color: rgba(0, 229, 255, 0.2);
  }
  .hud-input:focus {
    border-color: var(--color-accent-purple, #7c4dff);
    box-shadow: 0 0 8px rgba(124, 77, 255, 0.2);
  }

  .hud-input-narrow { width: 10rem; }
  .hud-input-mono { font-family: 'Share Tech Mono', monospace; }

  .hud-textarea {
    resize: vertical;
    min-height: 3rem;
  }

  .hud-select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2300e5ff' d='M2 4l4 4 4-4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.75rem center;
    padding-right: 2rem;
  }

  .hud-hint {
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.4);
  }

  .hud-dim {
    opacity: 0.6;
  }

  .hud-accent-cyan {
    color: var(--color-accent-cyan, #00e5ff);
  }

  .hud-cron-desc {
    font-size: 0.75rem;
    color: var(--color-accent-cyan, #00e5ff);
    opacity: 0.8;
  }

  .hud-inline-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  /* ─── Tabs / Presets ──────────────────── */
  .hud-tab-group {
    display: flex;
    gap: 2px;
  }

  .hud-tab {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    padding: 0.4rem 0.75rem;
    background: rgba(0, 10, 20, 0.6);
    border: 1px solid rgba(0, 229, 255, 0.15);
    color: rgba(0, 229, 255, 0.4);
    cursor: pointer;
    letter-spacing: 0.1em;
    transition: all 0.2s;
  }
  .hud-tab:hover { color: var(--color-accent-cyan, #00e5ff); }
  .hud-tab.active {
    background: rgba(124, 77, 255, 0.15);
    border-color: var(--color-accent-purple, #7c4dff);
    color: var(--color-accent-purple, #7c4dff);
    text-shadow: 0 0 6px rgba(124, 77, 255, 0.4);
  }

  .hud-preset-group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .hud-preset {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid rgba(0, 229, 255, 0.15);
    background: transparent;
    color: rgba(0, 229, 255, 0.4);
    cursor: pointer;
    letter-spacing: 0.05em;
    transition: all 0.2s;
  }
  .hud-preset:hover {
    border-color: rgba(0, 229, 255, 0.4);
    color: var(--color-accent-cyan, #00e5ff);
  }
  .hud-preset.active {
    border-color: var(--color-accent-cyan, #00e5ff);
    background: rgba(0, 229, 255, 0.12);
    color: var(--color-accent-cyan, #00e5ff);
    text-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
  }

  /* ─── Target Buttons ──────────────────── */
  .hud-target-group {
    display: flex;
    gap: 0.75rem;
  }

  .hud-target-btn {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid rgba(0, 229, 255, 0.15);
    background: rgba(0, 10, 20, 0.5);
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-target-btn:hover {
    border-color: rgba(0, 229, 255, 0.3);
  }
  .hud-target-btn.active {
    border-color: var(--color-accent-purple, #7c4dff);
    background: rgba(124, 77, 255, 0.08);
  }

  .hud-target-label {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: rgba(0, 229, 255, 0.5);
    letter-spacing: 0.1em;
  }
  .hud-target-btn.active .hud-target-label {
    color: var(--color-accent-purple, #7c4dff);
    text-shadow: 0 0 6px rgba(124, 77, 255, 0.3);
  }

  .hud-target-desc {
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.3);
    margin-top: 0.25rem;
  }

  /* ─── Grids ───────────────────────────── */
  .hud-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .hud-grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.75rem;
  }

  @media (max-width: 768px) {
    .hud-grid-2, .hud-grid-3 {
      grid-template-columns: 1fr;
    }
  }

  /* ─── Checkboxes ──────────────────────── */
  .hud-options-row {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .hud-checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.8rem;
    color: rgba(0, 229, 255, 0.6);
    letter-spacing: 0.05em;
  }

  .hud-checkbox {
    appearance: none;
    width: 1rem;
    height: 1rem;
    border: 1px solid rgba(0, 229, 255, 0.3);
    background: rgba(0, 10, 20, 0.8);
    cursor: pointer;
  }
  .hud-checkbox:checked {
    background: rgba(0, 229, 255, 0.2);
    border-color: var(--color-accent-cyan, #00e5ff);
    box-shadow: 0 0 6px rgba(0, 229, 255, 0.3);
  }
  .hud-checkbox:checked::after {
    content: '';
    display: block;
    width: 0.5rem;
    height: 0.5rem;
    margin: 0.175rem auto;
    background: var(--color-accent-cyan, #00e5ff);
  }

  /* ─── Submit Row ──────────────────────── */
  .hud-submit-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 229, 255, 0.1);
  }

  /* ─── Error ───────────────────────────── */
  .hud-error {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 68, 68, 0.3);
    background: rgba(255, 68, 68, 0.06);
    color: #ff4444;
    font-size: 0.8rem;
  }

  .hud-error-inline {
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(255, 68, 68, 0.3);
    background: rgba(255, 68, 68, 0.06);
    color: #ff4444;
    font-size: 0.75rem;
  }

  /* ─── Loading / Empty ─────────────────── */
  .hud-loading-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .hud-skeleton {
    padding: 1rem;
  }

  .hud-skeleton-bar {
    height: 0.75rem;
    background: rgba(0, 229, 255, 0.06);
    animation: hud-pulse 1.5s ease-in-out infinite;
  }
  .hud-skeleton-bar.wide { width: 12rem; margin-bottom: 0.5rem; }
  .hud-skeleton-bar.narrow { width: 8rem; }

  @keyframes hud-pulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 0.7; }
  }

  .hud-empty {
    text-align: center;
    padding: 3rem 1rem;
    color: rgba(0, 229, 255, 0.4);
  }

  .hud-empty-icon {
    font-size: 2rem;
    margin-bottom: 0.75rem;
    opacity: 0.3;
  }

  .hud-empty-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1rem;
    letter-spacing: 0.15em;
    margin-bottom: 0.25rem;
  }

  .hud-empty-sub {
    font-size: 0.8rem;
    margin-bottom: 1.25rem;
    opacity: 0.6;
  }

  /* ─── Job Cards ───────────────────────── */
  .hud-job-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hud-job-card {
    transition: all 0.2s;
  }
  .hud-job-card:hover {
    border-color: rgba(0, 229, 255, 0.35);
  }
  .hud-job-card.disabled {
    opacity: 0.45;
    border-color: rgba(0, 229, 255, 0.08);
  }
  .hud-job-card.expanded {
    box-shadow: 0 0 15px rgba(0, 229, 255, 0.08);
    border-color: rgba(0, 229, 255, 0.35);
  }

  .hud-job-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
  }

  /* ─── Toggle ──────────────────────────── */
  .hud-toggle {
    width: 2.5rem;
    height: 1.4rem;
    border: 1px solid rgba(0, 229, 255, 0.2);
    background: rgba(0, 10, 20, 0.8);
    position: relative;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-toggle.on {
    border-color: var(--color-accent-green, #00ff88);
    background: rgba(0, 255, 136, 0.08);
  }

  .hud-toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 0.85rem;
    height: 0.85rem;
    background: rgba(0, 229, 255, 0.3);
    transition: all 0.2s;
  }
  .hud-toggle.on .hud-toggle-knob {
    left: calc(100% - 0.85rem - 2px);
    background: var(--color-accent-green, #00ff88);
    box-shadow: 0 0 6px rgba(0, 255, 136, 0.5);
  }

  /* ─── Job Info ────────────────────────── */
  .hud-job-info {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
    min-width: 0;
    padding: 0;
  }

  .hud-job-name-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .hud-job-name {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.9rem;
    color: var(--color-accent-cyan, #00e5ff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hud-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    padding: 0.15rem 0.4rem;
    letter-spacing: 0.1em;
    border: 1px solid;
  }
  .hud-badge.badge-agent {
    color: var(--color-accent-purple, #7c4dff);
    border-color: rgba(124, 77, 255, 0.3);
    background: rgba(124, 77, 255, 0.1);
  }
  .hud-badge.badge-event {
    color: var(--color-accent-cyan, #00e5ff);
    border-color: rgba(0, 229, 255, 0.3);
    background: rgba(0, 229, 255, 0.1);
  }
  .hud-badge.badge-target {
    color: rgba(0, 229, 255, 0.4);
    border-color: rgba(0, 229, 255, 0.15);
    background: rgba(0, 10, 20, 0.5);
  }

  .hud-job-meta {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    margin-top: 0.25rem;
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.35);
  }

  /* ─── Icon Buttons ────────────────────── */
  .hud-job-actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    flex-shrink: 0;
  }

  .hud-icon-btn {
    padding: 0.4rem;
    background: none;
    border: 1px solid transparent;
    color: rgba(0, 229, 255, 0.3);
    cursor: pointer;
    transition: all 0.2s;
  }
  .hud-icon-btn:hover:not(:disabled) {
    color: var(--color-accent-purple, #7c4dff);
    border-color: rgba(124, 77, 255, 0.2);
  }
  .hud-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .hud-icon-btn-run:hover:not(:disabled) {
    color: var(--color-accent-green, #00ff88);
    border-color: rgba(0, 255, 136, 0.2);
  }
  .hud-icon-btn-history:hover:not(:disabled) {
    color: var(--color-accent-cyan, #00e5ff);
    border-color: rgba(0, 229, 255, 0.2);
  }
  .hud-icon-btn-delete:hover:not(:disabled) {
    color: #ff4444;
    border-color: rgba(255, 68, 68, 0.2);
  }

  .hud-icon {
    width: 1rem;
    height: 1rem;
    display: block;
  }

  /* ─── Job Detail ──────────────────────── */
  .hud-job-detail {
    border-top: 1px solid rgba(0, 229, 255, 0.1);
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.8rem;
    color: rgba(0, 229, 255, 0.6);
  }

  .hud-detail-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .hud-detail-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  @media (max-width: 768px) {
    .hud-detail-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .hud-detail-value {
    font-size: 0.8rem;
    color: rgba(0, 229, 255, 0.7);
  }
  .hud-detail-value.mono {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
  }

  .break-all { word-break: break-all; }

  .hud-pre {
    padding: 0.5rem 0.75rem;
    background: rgba(0, 10, 20, 0.8);
    border: 1px solid rgba(0, 229, 255, 0.1);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: rgba(0, 229, 255, 0.6);
    overflow-x: auto;
    white-space: pre;
  }

  /* ─── Runs ────────────────────────────── */
  .hud-runs-empty {
    padding: 1.5rem;
    text-align: center;
    font-size: 0.8rem;
    color: rgba(0, 229, 255, 0.35);
  }

  .hud-runs-list {
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    max-height: 20rem;
    overflow-y: auto;
  }

  .hud-run-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.75rem;
    background: rgba(0, 10, 20, 0.5);
    border: 1px solid rgba(0, 229, 255, 0.05);
    font-size: 0.7rem;
  }

  .hud-run-dot {
    width: 0.4rem;
    height: 0.4rem;
    flex-shrink: 0;
    background: rgba(0, 229, 255, 0.3);
  }
  .hud-run-dot.dot-ok { background: var(--color-accent-green, #00ff88); box-shadow: 0 0 4px rgba(0, 255, 136, 0.5); }
  .hud-run-dot.dot-err { background: #ff4444; box-shadow: 0 0 4px rgba(255, 68, 68, 0.5); }
  .hud-run-dot.dot-running { background: var(--color-accent-cyan, #00e5ff); animation: hud-pulse 1s ease-in-out infinite; }

  .hud-run-time {
    color: rgba(0, 229, 255, 0.4);
    width: 7rem;
    flex-shrink: 0;
  }

  .hud-run-duration {
    color: rgba(0, 229, 255, 0.5);
    flex-shrink: 0;
    width: 4rem;
  }

  .hud-run-status {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Share Tech Mono', monospace;
    color: rgba(0, 229, 255, 0.6);
  }
</style>
