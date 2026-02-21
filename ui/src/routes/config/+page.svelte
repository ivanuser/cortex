<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ──────────────────────────────────
  interface JsonSchema {
    type?: string | string[];
    title?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema | JsonSchema[];
    additionalProperties?: JsonSchema | boolean;
    enum?: unknown[];
    const?: unknown;
    default?: unknown;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    allOf?: JsonSchema[];
    nullable?: boolean;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    format?: string;
    required?: string[];
  }

  interface ConfigSnapshot {
    config: Record<string, unknown>;
    raw?: string;
    hash?: string;
    valid?: boolean;
    issues?: Array<{ path?: string; message?: string }>;
    version?: string;
  }

  interface ConfigSchemaResponse {
    schema?: JsonSchema;
    uiHints?: Record<string, { label?: string; description?: string; secret?: boolean; multiline?: boolean; advanced?: boolean }>;
    version?: string;
  }

  // ─── State ──────────────────────────────────
  let loading = $state(false);
  let saving = $state(false);
  let applying = $state(false);
  let error = $state<string | null>(null);

  // Config data
  let config = $state<Record<string, unknown> | null>(null);
  let configHash = $state<string | null>(null);
  let configValid = $state<boolean | null>(null);
  let configIssues = $state<Array<{ path?: string; message?: string }>>([]);
  let schema = $state<JsonSchema | null>(null);
  let uiHints = $state<Record<string, Record<string, unknown>>>({});
  let schemaVersion = $state<string | null>(null);

  // Editor state
  let mode = $state<'form' | 'raw'>('form');
  let rawText = $state('');
  let rawDirty = $state(false);
  let formDirty = $state(false);
  let searchQuery = $state('');
  let activeSection = $state<string | null>(null);
  let expandedPaths = $state<Set<string>>(new Set());
  let editingValues = $state<Record<string, string>>({});

  // ─── Validation ─────────────────────────────
  let validationErrors = $state<Record<string, string>>({});
  let debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  function validateField(path: string[], value: unknown, fieldSchema: JsonSchema, required: boolean): string | null {
    const type = schemaType(fieldSchema);
    const strVal = value !== undefined && value !== null ? String(value) : '';

    // Required check
    if (required && (value === undefined || value === null || strVal.trim() === '')) {
      return 'This field is required';
    }

    // Skip further validation if empty and not required
    if (value === undefined || value === null || strVal === '') return null;

    switch (type) {
      case 'string': {
        const trimmed = strVal.trim();
        if (fieldSchema.minLength !== undefined && trimmed.length < fieldSchema.minLength) {
          return `Minimum length is ${fieldSchema.minLength} characters`;
        }
        if (fieldSchema.maxLength !== undefined && trimmed.length > fieldSchema.maxLength) {
          return `Maximum length is ${fieldSchema.maxLength} characters`;
        }
        break;
      }
      case 'number':
      case 'integer': {
        const num = Number(value);
        if (isNaN(num)) return 'Must be a valid number';
        if (type === 'integer' && !Number.isInteger(num)) return 'Must be a whole number';
        if (fieldSchema.minimum !== undefined && num < fieldSchema.minimum) {
          return `Minimum value is ${fieldSchema.minimum}`;
        }
        if (fieldSchema.maximum !== undefined && num > fieldSchema.maximum) {
          return `Maximum value is ${fieldSchema.maximum}`;
        }
        break;
      }
      case 'array': {
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) return 'Must be a valid JSON array';
          } catch { return 'Invalid JSON — must be a valid array'; }
        } else if (!Array.isArray(value)) {
          return 'Must be an array';
        }
        break;
      }
      case 'object': {
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
              return 'Must be a valid JSON object';
            }
          } catch { return 'Invalid JSON — must be a valid object'; }
        } else if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return 'Must be an object';
        }
        break;
      }
    }

    return null;
  }

  function runFieldValidation(path: string[], value: unknown, fieldSchema: JsonSchema, required: boolean) {
    const pathStr = path.join('.');
    const err = validateField(path, value, fieldSchema, required);
    if (err) {
      validationErrors = { ...validationErrors, [pathStr]: err };
    } else {
      const next = { ...validationErrors };
      delete next[pathStr];
      validationErrors = next;
    }
  }

  function debouncedValidateField(path: string[], value: unknown, fieldSchema: JsonSchema, required: boolean) {
    const pathStr = path.join('.');
    if (debounceTimers[pathStr]) clearTimeout(debounceTimers[pathStr]);
    debounceTimers[pathStr] = setTimeout(() => {
      runFieldValidation(path, value, fieldSchema, required);
    }, 300);
  }

  function validateAll(): boolean {
    if (!config || !schema?.properties) return true;
    const errors: Record<string, string> = {};

    for (const [sectionKey, sectionSchema] of Object.entries(schema.properties)) {
      const ss = sectionSchema as JsonSchema;
      const sectionValue = config[sectionKey] as Record<string, unknown> | undefined;
      const requiredFields = ss.required ?? [];

      if (ss.properties) {
        for (const [propKey, propSchema] of Object.entries(ss.properties)) {
          const fieldPath = [sectionKey, propKey];
          const fieldValue = sectionValue ? sectionValue[propKey] : undefined;
          const isReq = requiredFields.includes(propKey);
          const err = validateField(fieldPath, fieldValue, propSchema as JsonSchema, isReq);
          if (err) errors[fieldPath.join('.')] = err;
        }
      }
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  let validationErrorCount = $derived(Object.keys(validationErrors).length);
  let hasValidationErrors = $derived(validationErrorCount > 0);

  // Update/restart
  let updateRunning = $state(false);

  // ─── Helpers ────────────────────────────────
  function schemaType(s: JsonSchema | undefined): string | undefined {
    if (!s) return undefined;
    if (Array.isArray(s.type)) {
      const filtered = s.type.filter(t => t !== 'null');
      return filtered[0] ?? s.type[0];
    }
    return s.type;
  }

  function humanize(raw: string): string {
    return raw
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .replace(/^./, m => m.toUpperCase());
  }

  function getNestedValue(obj: Record<string, unknown>, path: string[]): unknown {
    let current: unknown = obj;
    for (const key of path) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  function setNestedValue(obj: Record<string, unknown>, path: string[], value: unknown): Record<string, unknown> {
    const result = structuredClone(obj);
    let current: Record<string, unknown> = result;
    for (let i = 0; i < path.length - 1; i++) {
      if (!(path[i] in current) || typeof current[path[i]] !== 'object' || current[path[i]] === null) {
        current[path[i]] = {};
      }
      current = current[path[i]] as Record<string, unknown>;
    }
    current[path[path.length - 1]] = value;
    return result;
  }

  function isSecret(path: string[]): boolean {
    const key = path.join('.');
    const hint = uiHints[key] as Record<string, unknown> | undefined;
    if (hint?.secret) return true;
    const last = path[path.length - 1]?.toLowerCase() ?? '';
    return ['token', 'secret', 'password', 'apikey', 'api_key', 'apiToken'].some(s => last.includes(s.toLowerCase()));
  }

  function isMultiline(path: string[]): boolean {
    const key = path.join('.');
    const hint = uiHints[key] as Record<string, unknown> | undefined;
    return !!hint?.multiline;
  }

  function getHint(path: string[]): { label?: string; description?: string } | undefined {
    const key = path.join('.');
    return uiHints[key] as { label?: string; description?: string } | undefined;
  }

  // ─── Sections from schema ───────────────────
  let sections = $derived.by(() => {
    if (!schema?.properties) return [];
    return Object.entries(schema.properties).map(([key, subSchema]) => ({
      key,
      label: (subSchema as JsonSchema).title || humanize(key),
      description: (subSchema as JsonSchema).description,
      schema: subSchema as JsonSchema,
      hasValue: config ? key in config : false,
    })).filter(s => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return s.key.toLowerCase().includes(q) ||
             s.label.toLowerCase().includes(q) ||
             (s.description?.toLowerCase().includes(q) ?? false);
    });
  });

  let filteredSections = $derived(
    activeSection ? sections.filter(s => s.key === activeSection) : sections
  );

  // ─── Data Loading ───────────────────────────
  async function loadConfig() {
    if (!gateway.connected || loading) return;
    loading = true;
    error = null;
    try {
      const [configRes, schemaRes] = await Promise.all([
        gateway.call<ConfigSnapshot>('config.get', {}),
        gateway.call<ConfigSchemaResponse>('config.schema', {}),
      ]);

      if (configRes) {
        config = configRes.config ?? {};
        configHash = configRes.hash ?? null;
        configValid = configRes.valid ?? null;
        configIssues = Array.isArray(configRes.issues) ? configRes.issues : [];
        rawText = configRes.raw ?? JSON.stringify(configRes.config, null, 2);
        rawDirty = false;
        formDirty = false;
      }

      if (schemaRes) {
        schema = schemaRes.schema ?? null;
        uiHints = schemaRes.uiHints ?? {};
        schemaVersion = schemaRes.version ?? null;
      }
    } catch (e) {
      error = String(e);
      toasts.error('Config Load Failed', String(e));
    } finally {
      loading = false;
    }
  }

  async function saveConfig() {
    if (!gateway.connected || saving || !configHash) return;
    if (mode === 'form') {
      const valid = validateAll();
      if (!valid) {
        const count = Object.keys(validationErrors).length;
        toasts.error('Validation Failed', `${count} validation error${count !== 1 ? 's' : ''} — fix them before saving`);
        return;
      }
    }
    saving = true;
    error = null;
    try {
      const raw = mode === 'raw' ? rawText : JSON.stringify(config, null, 2);
      await gateway.call('config.set', { raw, baseHash: configHash });
      toasts.success('Config Saved', 'Configuration saved successfully');
      formDirty = false;
      rawDirty = false;
      await loadConfig();
    } catch (e) {
      error = String(e);
      toasts.error('Save Failed', String(e));
    } finally {
      saving = false;
    }
  }

  async function applyConfig() {
    if (!gateway.connected || applying || !configHash) return;
    applying = true;
    error = null;
    try {
      const raw = mode === 'raw' ? rawText : JSON.stringify(config, null, 2);
      await gateway.call('config.apply', { raw, baseHash: configHash });
      toasts.success('Config Applied', 'Configuration applied — gateway will restart');
      formDirty = false;
      rawDirty = false;
    } catch (e) {
      error = String(e);
      toasts.error('Apply Failed', String(e));
    } finally {
      applying = false;
    }
  }

  async function runUpdate() {
    if (!gateway.connected || updateRunning) return;
    updateRunning = true;
    error = null;
    try {
      await gateway.call('update.run', {});
      toasts.success('Update Started', 'Gateway update initiated — may restart');
    } catch (e) {
      error = String(e);
      toasts.error('Update Failed', String(e));
    } finally {
      updateRunning = false;
    }
  }

  // ─── Form value changes ─────────────────────
  function updateValue(path: string[], value: unknown) {
    if (!config) return;
    config = setNestedValue(config, path, value);
    formDirty = true;
  }

  function coerceAndUpdate(path: string[], rawValue: string, fieldSchema: JsonSchema) {
    const type = schemaType(fieldSchema);
    let value: unknown = rawValue;
    if (type === 'number' || type === 'integer') {
      const num = Number(rawValue);
      if (!isNaN(num)) value = num;
    } else if (type === 'boolean') {
      value = rawValue === 'true';
    }
    updateValue(path, value);
  }

  function toggleExpand(key: string) {
    const next = new Set(expandedPaths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expandedPaths = next;
  }

  // ─── Auto-load ──────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => loadConfig());
    }
  });

  // Dirty tracking
  let isDirty = $derived(mode === 'raw' ? rawDirty : formDirty);
</script>

<svelte:head>
  <title>Config — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-5xl mx-auto p-4 md:p-6 space-y-6">

    <!-- ═══ Header ════════════════════════════════ -->
    <div class="flex items-center justify-between flex-wrap gap-4">
      <div>
        <h1 class="text-2xl font-bold text-text-primary">Gateway Configuration</h1>
        <p class="text-sm text-text-muted mt-1">
          Edit your OpenClaw gateway settings
          {#if schemaVersion}
            <span class="text-xs text-text-muted ml-2">· schema {schemaVersion}</span>
          {/if}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <!-- Mode toggle -->
        <div class="flex rounded-lg border border-border-default overflow-hidden">
          <button
            onclick={() => { mode = 'form'; if (config) rawText = JSON.stringify(config, null, 2); }}
            class="px-3 py-1.5 text-xs font-medium transition-all
                   {mode === 'form' ? 'bg-accent-cyan/20 text-accent-cyan' : 'text-text-muted hover:text-text-secondary'}">
            Form
          </button>
          <button
            onclick={() => { mode = 'raw'; if (config) rawText = JSON.stringify(config, null, 2); }}
            class="px-3 py-1.5 text-xs font-medium transition-all
                   {mode === 'raw' ? 'bg-accent-purple/20 text-accent-purple' : 'text-text-muted hover:text-text-secondary'}">
            Raw JSON
          </button>
        </div>
        <button onclick={() => loadConfig()} disabled={loading || conn.state.status !== 'connected'}
          class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan
                 text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">
          {#if loading}
            <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          Refresh
        </button>
      </div>
    </div>

    <!-- ═══ Validation Status ═════════════════════ -->
    {#if configValid === false || configIssues.length > 0}
      <div class="rounded-xl border border-status-error/30 bg-status-error/10 p-4">
        <p class="text-sm font-medium text-status-error mb-2">⚠️ Configuration Issues</p>
        {#each configIssues as issue}
          <p class="text-xs text-status-error/80 font-mono">
            {issue.path ? `[${issue.path}] ` : ''}{issue.message}
          </p>
        {/each}
      </div>
    {/if}

    {#if error}
      <div class="rounded-xl border border-status-error/30 bg-status-error/10 p-4">
        <p class="text-sm text-status-error">{error}</p>
      </div>
    {/if}

    <!-- ═══ Not Connected ═════════════════════════ -->
    {#if conn.state.status !== 'connected'}
      <div class="text-center py-16">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">Connect to the gateway to edit configuration.</p>
      </div>

    <!-- ═══ Loading ════════════════════════════ -->
    {:else if loading && !config}
      <div class="space-y-4">
        {#each Array(4) as _}
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 animate-pulse">
            <div class="h-4 w-32 bg-bg-tertiary rounded mb-3"></div>
            <div class="h-3 w-full bg-bg-tertiary rounded mb-2"></div>
            <div class="h-3 w-3/4 bg-bg-tertiary rounded"></div>
          </div>
        {/each}
      </div>

    <!-- ═══ Raw JSON Editor ═══════════════════════ -->
    {:else if mode === 'raw'}
      <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
        <div class="px-4 py-3 border-b border-border-default flex items-center justify-between">
          <span class="text-sm font-medium text-text-primary">Raw Configuration (JSON)</span>
          <span class="text-xs text-text-muted font-mono">
            {configHash ? `hash: ${configHash.slice(0, 12)}...` : ''}
          </span>
        </div>
        <textarea
          bind:value={rawText}
          oninput={() => rawDirty = true}
          class="w-full h-[600px] p-4 bg-bg-primary text-text-primary font-mono text-sm
                 resize-none focus:outline-none border-none"
          spellcheck="false"
        ></textarea>
      </div>

    <!-- ═══ Form Editor ═══════════════════════════ -->
    {:else if config && schema}

      <!-- Search + Section Nav -->
      <div class="flex items-center gap-3 flex-wrap">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search config keys..."
          class="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-border-default bg-bg-tertiary
                 text-sm text-text-primary placeholder:text-text-muted
                 focus:outline-none focus:border-accent-cyan transition-all"
        />
        <div class="flex items-center gap-1 flex-wrap">
          <button
            onclick={() => activeSection = null}
            class="px-2.5 py-1 rounded-md text-xs transition-all
                   {activeSection === null ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30' : 'text-text-muted hover:text-text-secondary border border-border-default'}">
            All
          </button>
          {#each sections as section}
            <button
              onclick={() => activeSection = activeSection === section.key ? null : section.key}
              class="px-2.5 py-1 rounded-md text-xs transition-all
                     {activeSection === section.key ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30' : 'text-text-muted hover:text-text-secondary border border-border-default'}">
              {section.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Config Sections -->
      <div class="space-y-4">
        {#each filteredSections as section}
          {@const sectionValue = config ? (config[section.key] as Record<string, unknown> | undefined) : undefined}
          {@const sectionSchema = section.schema}
          {@const props = sectionSchema.properties ?? {}}
          {@const requiredFields = (sectionSchema.required ?? []) as string[]}
          
          <div class="rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden">
            <!-- Section header -->
            <button
              onclick={() => toggleExpand(section.key)}
              class="w-full px-4 py-3 flex items-center justify-between hover:bg-bg-tertiary/50 transition-all"
            >
              <div class="flex items-center gap-3">
                <span class="text-sm font-mono text-accent-cyan">{section.key}</span>
                <span class="text-sm text-text-primary font-medium">{section.label}</span>
                {#if section.description}
                  <span class="text-xs text-text-muted hidden md:inline">{section.description}</span>
                {/if}
              </div>
              <div class="flex items-center gap-2">
                {#if sectionValue !== undefined}
                  <span class="text-xs text-accent-green">configured</span>
                {/if}
                <svg class="w-4 h-4 text-text-muted transition-transform {expandedPaths.has(section.key) ? 'rotate-180' : ''}"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            <!-- Section fields -->
            {#if expandedPaths.has(section.key)}
              <div class="border-t border-border-default px-4 py-3 space-y-4">
                {#if Object.keys(props).length > 0}
                  {#each Object.entries(props) as [propKey, propSchema]}
                    {@const fieldPath = [section.key, propKey]}
                    {@const fieldValue = sectionValue ? (sectionValue as Record<string, unknown>)[propKey] : undefined}
                    {@const fieldType = schemaType(propSchema as JsonSchema)}
                    {@const hint = getHint(fieldPath)}
                    {@const secret = isSecret(fieldPath)}
                    {@const multiline = isMultiline(fieldPath)}
                    {@const pSchema = propSchema as JsonSchema}
                    {@const pathStr = fieldPath.join('.')}
                    {@const isRequired = requiredFields.includes(propKey)}
                    {@const fieldError = validationErrors[pathStr]}

                    <div class="group">
                      <div class="flex items-start gap-3">
                        <div class="flex-1 min-w-0">
                          <label class="block text-sm font-medium text-text-secondary mb-1">
                            <span class="font-mono text-xs text-accent-purple mr-1">{propKey}</span>
                            {#if hint?.label}
                              <span class="text-text-primary">{hint.label}</span>
                            {:else}
                              <span class="text-text-primary">{humanize(propKey)}</span>
                            {/if}
                            {#if isRequired}
                              <span class="text-red-400 ml-0.5 text-xs">*</span>
                            {/if}
                          </label>
                          {#if pSchema.description || hint?.description}
                            <p class="text-xs text-text-muted mb-2">{hint?.description ?? pSchema.description}</p>
                          {/if}

                          <!-- Field input based on type -->
                          {#if fieldType === 'boolean'}
                            <label class="inline-flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={fieldValue === true}
                                onchange={(e) => updateValue(fieldPath, (e.target as HTMLInputElement).checked)}
                                class="w-4 h-4 rounded border-border-default bg-bg-tertiary accent-accent-cyan"
                              />
                              <span class="text-sm text-text-secondary">{fieldValue ? 'Enabled' : 'Disabled'}</span>
                            </label>

                          {:else if pSchema.enum}
                            <select
                              value={String(fieldValue ?? '')}
                              onchange={(e) => { coerceAndUpdate(fieldPath, (e.target as HTMLSelectElement).value, pSchema); runFieldValidation(fieldPath, (e.target as HTMLSelectElement).value, pSchema, isRequired); }}
                              class="px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-tertiary
                                     text-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-all"
                            >
                              <option value="">— not set —</option>
                              {#each pSchema.enum as opt}
                                <option value={String(opt)}>{String(opt)}</option>
                              {/each}
                            </select>

                          {:else if fieldType === 'number' || fieldType === 'integer'}
                            <input
                              type="number"
                              value={fieldValue !== undefined ? String(fieldValue) : ''}
                              oninput={(e) => { coerceAndUpdate(fieldPath, (e.target as HTMLInputElement).value, pSchema); debouncedValidateField(fieldPath, (e.target as HTMLInputElement).value, pSchema, isRequired); }}
                              min={pSchema.minimum}
                              max={pSchema.maximum}
                              class="w-48 px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-tertiary
                                     text-sm text-text-primary font-mono focus:outline-none focus:border-accent-cyan transition-all"
                            />

                          {:else if fieldType === 'object'}
                            <!-- Nested object: show as collapsible JSON -->
                            <div class="mt-1">
                              <button
                                onclick={() => toggleExpand(pathStr)}
                                class="text-xs text-accent-cyan hover:underline"
                              >
                                {expandedPaths.has(pathStr) ? '▼ Collapse' : '▶ Expand'} ({fieldValue ? Object.keys(fieldValue as Record<string, unknown>).length : 0} keys)
                              </button>
                              {#if expandedPaths.has(pathStr) && fieldValue && typeof fieldValue === 'object'}
                                <textarea
                                  value={JSON.stringify(fieldValue, null, 2)}
                                  oninput={(e) => {
                                    const raw = (e.target as HTMLTextAreaElement).value;
                                    try {
                                      const parsed = JSON.parse(raw);
                                      updateValue(fieldPath, parsed);
                                    } catch { /* ignore parse errors while typing */ }
                                    debouncedValidateField(fieldPath, raw, pSchema, isRequired);
                                  }}
                                  class="w-full mt-2 h-32 px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-primary
                                         text-xs text-text-primary font-mono resize-y focus:outline-none focus:border-accent-cyan"
                                  spellcheck="false"
                                ></textarea>
                              {/if}
                            </div>

                          {:else if fieldType === 'array'}
                            <!-- Array: show as JSON textarea -->
                            <textarea
                              value={fieldValue ? JSON.stringify(fieldValue, null, 2) : '[]'}
                              oninput={(e) => {
                                const raw = (e.target as HTMLTextAreaElement).value;
                                try {
                                  const parsed = JSON.parse(raw);
                                  updateValue(fieldPath, parsed);
                                } catch { /* ignore */ }
                                debouncedValidateField(fieldPath, raw, pSchema, isRequired);
                              }}
                              class="w-full h-24 px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-primary
                                     text-xs text-text-primary font-mono resize-y focus:outline-none focus:border-accent-cyan"
                              spellcheck="false"
                            ></textarea>

                          {:else if multiline}
                            <textarea
                              value={fieldValue !== undefined ? String(fieldValue) : ''}
                              oninput={(e) => { updateValue(fieldPath, (e.target as HTMLTextAreaElement).value); debouncedValidateField(fieldPath, (e.target as HTMLTextAreaElement).value, pSchema, isRequired); }}
                              class="w-full h-24 px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-tertiary
                                     text-sm text-text-primary font-mono resize-y focus:outline-none focus:border-accent-cyan"
                            ></textarea>

                          {:else}
                            <!-- String input (default) -->
                            <input
                              type={secret ? 'password' : 'text'}
                              value={fieldValue !== undefined ? String(fieldValue) : ''}
                              oninput={(e) => { updateValue(fieldPath, (e.target as HTMLInputElement).value); debouncedValidateField(fieldPath, (e.target as HTMLInputElement).value, pSchema, isRequired); }}
                              placeholder={pSchema.default !== undefined ? `default: ${pSchema.default}` : ''}
                              class="w-full px-3 py-2 rounded-lg border {fieldError ? 'border-red-500/50' : 'border-border-default'} bg-bg-tertiary
                                     text-sm text-text-primary {secret ? 'font-mono' : ''} focus:outline-none focus:border-accent-cyan transition-all"
                            />
                          {/if}

                          <!-- Validation error -->
                          {#if fieldError}
                            <p class="mt-1 text-xs text-red-400 bg-red-500/5 border border-red-500/30 rounded px-2 py-1">{fieldError}</p>
                          {/if}

                          <!-- Type hint -->
                          <div class="mt-1 flex items-center gap-2">
                            <span class="text-[10px] text-text-muted font-mono">{fieldType ?? 'any'}</span>
                            {#if pSchema.default !== undefined}
                              <span class="text-[10px] text-text-muted">default: {JSON.stringify(pSchema.default)}</span>
                            {/if}
                            {#if pSchema.nullable}
                              <span class="text-[10px] text-accent-amber">nullable</span>
                            {/if}
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                {:else}
                  <!-- No properties defined: show raw JSON editor -->
                  <textarea
                    value={sectionValue ? JSON.stringify(sectionValue, null, 2) : '{}'}
                    oninput={(e) => {
                      try {
                        const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
                        updateValue([section.key], parsed);
                      } catch { /* ignore */ }
                    }}
                    class="w-full h-32 px-3 py-2 rounded-lg border border-border-default bg-bg-primary
                           text-xs text-text-primary font-mono resize-y focus:outline-none focus:border-accent-cyan"
                    spellcheck="false"
                  ></textarea>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

    {:else if config}
      <!-- No schema: raw-only -->
      <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4">
        <p class="text-sm text-text-muted mb-3">Schema not available. Showing raw JSON editor.</p>
        <textarea
          bind:value={rawText}
          oninput={() => rawDirty = true}
          class="w-full h-[500px] p-4 bg-bg-primary text-text-primary font-mono text-sm
                 resize-none focus:outline-none rounded-lg border border-border-default"
          spellcheck="false"
        ></textarea>
      </div>
    {/if}

    <!-- ═══ Action Bar (sticky bottom) ════════════ -->
    {#if config && conn.state.status === 'connected'}
      <div class="sticky bottom-0 -mx-6 px-6 py-4 bg-bg-primary/90 backdrop-blur-sm border-t border-border-default">
        <div class="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          <div class="flex items-center gap-2">
            {#if isDirty}
              <span class="text-xs text-accent-amber">● Unsaved changes</span>
            {/if}
            {#if hasValidationErrors}
              <span class="text-xs text-red-400">⚠ {validationErrorCount} validation error{validationErrorCount !== 1 ? 's' : ''}</span>
            {/if}
            {#if configHash}
              <span class="text-xs text-text-muted font-mono">hash: {configHash.slice(0, 12)}</span>
            {/if}
          </div>
          <div class="flex items-center gap-2">
            <button
              onclick={saveConfig}
              disabled={saving || !isDirty || hasValidationErrors}
              class="px-4 py-2 rounded-lg text-sm font-medium border transition-all
                     {isDirty && !hasValidationErrors
                       ? 'bg-accent-cyan/20 border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 glow-cyan'
                       : 'bg-bg-tertiary border-border-default text-text-muted cursor-not-allowed opacity-50'}">
              {#if saving}
                <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              {/if}
              Save
            </button>
            <button
              onclick={applyConfig}
              disabled={applying}
              class="px-4 py-2 rounded-lg text-sm font-medium border transition-all
                     bg-accent-purple/20 border-accent-purple/30 text-accent-purple hover:bg-accent-purple/30 glow-purple
                     disabled:opacity-50">
              {#if applying}
                <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              {/if}
              Apply &amp; Restart
            </button>
            <button
              onclick={runUpdate}
              disabled={updateRunning}
              class="px-4 py-2 rounded-lg text-sm font-medium border transition-all
                     bg-accent-green/20 border-accent-green/30 text-accent-green hover:bg-accent-green/30
                     disabled:opacity-50">
              {#if updateRunning}
                <svg class="w-4 h-4 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
              {/if}
              Update Gateway
            </button>
          </div>
        </div>
      </div>
    {/if}

  </div>
</div>
