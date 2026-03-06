<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- TOP BAR -->
  <div class="hud-page-topbar">
    <div class="flex items-center gap-4">
      <a href="/overview" class="hud-back">&larr; BACK</a>
      <div class="hud-page-title">CONFIG EDITOR</div>
      {#if schemaVersion}
        <span class="hud-schema-ver">SCHEMA {schemaVersion}</span>
      {/if}
    </div>
    <div class="flex items-center gap-3">
      <!-- Mode toggle -->
      <div class="hud-mode-toggle">
        <button
          onclick={() => { mode = 'form'; if (config) rawText = JSON.stringify(config, null, 2); }}
          class="hud-mode-btn {mode === 'form' ? 'active' : ''}">
          FORM
        </button>
        <button
          onclick={() => { mode = 'raw'; if (config) rawText = JSON.stringify(config, null, 2); }}
          class="hud-mode-btn {mode === 'raw' ? 'active purple' : ''}">
          RAW JSON
        </button>
      </div>
      <button onclick={() => loadConfig()} disabled={loading || conn.state.status !== 'connected'} class="hud-btn">
        {#if loading}
          <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        {/if}
        REFRESH
      </button>
    </div>
  </div>

  <!-- Validation Status -->
  {#if configValid === false || configIssues.length > 0}
    <div class="hud-alert hud-alert-error">
      <div class="hud-alert-title">[WARNING] CONFIGURATION ISSUES</div>
      {#each configIssues as issue}
        <div class="hud-alert-line">
          {issue.path ? `[${issue.path}] ` : ''}{issue.message}
        </div>
      {/each}
    </div>
  {/if}

  {#if error}
    <div class="hud-alert hud-alert-error">
      <div class="hud-alert-line">{error}</div>
    </div>
  {/if}

  <!-- Not Connected -->
  {#if conn.state.status !== 'connected'}
    <div class="hud-panel" style="text-align:center;padding:48px 16px">
      <div class="hud-panel-lbl" style="justify-content:center;margin-bottom:16px">CONNECTION REQUIRED</div>
      <div style="font-size:0.78rem;color:color-mix(in srgb, var(--color-accent-cyan) 55%, transparent)">
        Connect to the gateway to edit configuration.
      </div>
    </div>

  <!-- Loading -->
  {:else if loading && !config}
    <div class="hud-loading-grid">
      {#each Array(4) as _}
        <div class="hud-panel hud-pulse" style="min-height:80px"></div>
      {/each}
    </div>

  <!-- Raw JSON Editor -->
  {:else if mode === 'raw'}
    <div class="hud-panel" style="padding:0;overflow:hidden">
      <div class="hud-raw-header">
        <span class="hud-panel-lbl" style="margin-bottom:0">RAW CONFIGURATION (JSON)</span>
        <span class="hud-hash">
          {configHash ? `HASH: ${configHash.slice(0, 12)}...` : ''}
        </span>
      </div>
      <textarea
        bind:value={rawText}
        oninput={() => rawDirty = true}
        class="hud-raw-editor"
        spellcheck="false"
      ></textarea>
    </div>

  <!-- Form Editor -->
  {:else if config && schema}

    <!-- Search + Section Nav -->
    <div class="hud-filter-bar">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="SEARCH CONFIG KEYS..."
        class="hud-search"
      />
      <div class="hud-section-nav">
        <button
          onclick={() => activeSection = null}
          class="hud-section-btn {activeSection === null ? 'active' : ''}">
          ALL
        </button>
        {#each sections as section}
          <button
            onclick={() => activeSection = activeSection === section.key ? null : section.key}
            class="hud-section-btn {activeSection === section.key ? 'active' : ''}">
            {section.label.toUpperCase()}
          </button>
        {/each}
      </div>
    </div>

    <!-- Config Sections -->
    <div class="hud-sections">
      {#each filteredSections as section}
        {@const sectionValue = config ? (config[section.key] as Record<string, unknown> | undefined) : undefined}
        {@const sectionSchema = section.schema}
        {@const props = sectionSchema.properties ?? {}}
        {@const requiredFields = (sectionSchema.required ?? []) as string[]}

        <div class="hud-panel">
          <!-- Section header -->
          <button
            onclick={() => toggleExpand(section.key)}
            class="hud-section-header"
          >
            <div class="flex items-center gap-3">
              <span class="hud-section-key">{section.key}</span>
              <span class="hud-section-label">{section.label}</span>
              {#if section.description}
                <span class="hud-section-desc hidden md:inline">{section.description}</span>
              {/if}
            </div>
            <div class="flex items-center gap-2">
              {#if sectionValue !== undefined}
                <span class="hud-configured-badge">CONFIGURED</span>
              {/if}
              <span class="hud-chevron {expandedPaths.has(section.key) ? 'open' : ''}">&#9660;</span>
            </div>
          </button>

          <!-- Section fields -->
          {#if expandedPaths.has(section.key)}
            <div class="hud-fields">
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

                  <div class="hud-field">
                    <label class="hud-field-label">
                      <span class="hud-field-key">{propKey}</span>
                      {#if hint?.label}
                        <span class="hud-field-name">{hint.label}</span>
                      {:else}
                        <span class="hud-field-name">{humanize(propKey)}</span>
                      {/if}
                      {#if isRequired}
                        <span class="hud-required">*</span>
                      {/if}
                    </label>
                    {#if pSchema.description || hint?.description}
                      <p class="hud-field-desc">{hint?.description ?? pSchema.description}</p>
                    {/if}

                    <!-- Field input based on type -->
                    {#if fieldType === 'boolean'}
                      <label class="hud-checkbox-wrap">
                        <input
                          type="checkbox"
                          checked={fieldValue === true}
                          onchange={(e) => updateValue(fieldPath, (e.target as HTMLInputElement).checked)}
                          class="hud-checkbox"
                        />
                        <span class="hud-checkbox-label">{fieldValue ? 'ENABLED' : 'DISABLED'}</span>
                      </label>

                    {:else if pSchema.enum}
                      <select
                        value={String(fieldValue ?? '')}
                        onchange={(e) => { coerceAndUpdate(fieldPath, (e.target as HTMLSelectElement).value, pSchema); runFieldValidation(fieldPath, (e.target as HTMLSelectElement).value, pSchema, isRequired); }}
                        class="hud-select {fieldError ? 'has-error' : ''}"
                      >
                        <option value="">-- NOT SET --</option>
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
                        class="hud-input hud-input-number {fieldError ? 'has-error' : ''}"
                      />

                    {:else if fieldType === 'object'}
                      <div class="mt-1">
                        <button
                          onclick={() => toggleExpand(pathStr)}
                          class="hud-expand-btn"
                        >
                          {expandedPaths.has(pathStr) ? '[-] COLLAPSE' : '[+] EXPAND'} ({fieldValue ? Object.keys(fieldValue as Record<string, unknown>).length : 0} keys)
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
                            class="hud-textarea {fieldError ? 'has-error' : ''}"
                            style="height:128px;margin-top:8px"
                            spellcheck="false"
                          ></textarea>
                        {/if}
                      </div>

                    {:else if fieldType === 'array'}
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
                        class="hud-textarea {fieldError ? 'has-error' : ''}"
                        style="height:96px"
                        spellcheck="false"
                      ></textarea>

                    {:else if multiline}
                      <textarea
                        value={fieldValue !== undefined ? String(fieldValue) : ''}
                        oninput={(e) => { updateValue(fieldPath, (e.target as HTMLTextAreaElement).value); debouncedValidateField(fieldPath, (e.target as HTMLTextAreaElement).value, pSchema, isRequired); }}
                        class="hud-textarea {fieldError ? 'has-error' : ''}"
                        style="height:96px"
                      ></textarea>

                    {:else}
                      <input
                        type={secret ? 'password' : 'text'}
                        value={fieldValue !== undefined ? String(fieldValue) : ''}
                        oninput={(e) => { updateValue(fieldPath, (e.target as HTMLInputElement).value); debouncedValidateField(fieldPath, (e.target as HTMLInputElement).value, pSchema, isRequired); }}
                        placeholder={pSchema.default !== undefined ? `default: ${pSchema.default}` : ''}
                        class="hud-input {fieldError ? 'has-error' : ''}"
                      />
                    {/if}

                    <!-- Validation error -->
                    {#if fieldError}
                      <div class="hud-field-error">{fieldError}</div>
                    {/if}

                    <!-- Type hint -->
                    <div class="hud-type-hints">
                      <span class="hud-type-tag">{fieldType ?? 'any'}</span>
                      {#if pSchema.default !== undefined}
                        <span class="hud-type-default">default: {JSON.stringify(pSchema.default)}</span>
                      {/if}
                      {#if pSchema.nullable}
                        <span class="hud-type-nullable">NULLABLE</span>
                      {/if}
                    </div>
                  </div>
                {/each}
              {:else}
                <textarea
                  value={sectionValue ? JSON.stringify(sectionValue, null, 2) : '{}'}
                  oninput={(e) => {
                    try {
                      const parsed = JSON.parse((e.target as HTMLTextAreaElement).value);
                      updateValue([section.key], parsed);
                    } catch { /* ignore */ }
                  }}
                  class="hud-textarea"
                  style="height:128px"
                  spellcheck="false"
                ></textarea>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

  {:else if config}
    <div class="hud-panel">
      <div class="hud-panel-lbl">SCHEMA UNAVAILABLE</div>
      <div style="font-size:0.72rem;color:color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);margin-bottom:12px">
        Schema not available. Showing raw JSON editor.
      </div>
      <textarea
        bind:value={rawText}
        oninput={() => rawDirty = true}
        class="hud-raw-editor"
        style="height:500px"
        spellcheck="false"
      ></textarea>
    </div>
  {/if}

  <!-- Action Bar (sticky bottom) -->
  {#if config && conn.state.status === 'connected'}
    <div class="hud-action-bar">
      <div class="flex items-center gap-3">
        {#if isDirty}
          <span class="hud-dirty-badge">UNSAVED CHANGES</span>
        {/if}
        {#if hasValidationErrors}
          <span class="hud-error-badge">[!] {validationErrorCount} VALIDATION ERROR{validationErrorCount !== 1 ? 'S' : ''}</span>
        {/if}
        {#if configHash}
          <span class="hud-hash">HASH: {configHash.slice(0, 12)}</span>
        {/if}
      </div>
      <div class="flex items-center gap-2">
        <button
          onclick={saveConfig}
          disabled={saving || !isDirty || hasValidationErrors}
          class="hud-btn hud-btn-cyan {isDirty && !hasValidationErrors ? '' : 'disabled'}">
          {#if saving}
            <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          SAVE
        </button>
        <button
          onclick={applyConfig}
          disabled={applying}
          class="hud-btn hud-btn-purple">
          {#if applying}
            <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          APPLY &amp; RESTART
        </button>
        <button
          onclick={runUpdate}
          disabled={updateRunning}
          class="hud-btn hud-btn-green">
          {#if updateRunning}
            <svg class="w-3 h-3 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {/if}
          UPDATE GATEWAY
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════
     HUD PAGE LAYOUT
  ═══════════════════════════════════════════════ */
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

  /* ─── TOP BAR ─── */
  .hud-page-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-bottom: 9px;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-cyan);
    text-decoration: none;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    padding: 4px 12px;
    border-radius: 2px;
    transition: all 0.2s;
  }

  .hud-back:hover {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: 0.2em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent),
                 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    animation: hud-glow 4s ease-in-out infinite;
  }

  .hud-schema-ver {
    font-size: 0.62rem;
    letter-spacing: 0.15em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
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

  .hud-btn-cyan {
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn-cyan:hover:not(:disabled) {
    box-shadow: 0 0 15px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-btn-cyan.disabled {
    opacity: 0.6;
  }

  .hud-btn-purple {
    color: var(--color-accent-purple);
    border-color: color-mix(in srgb, var(--color-accent-purple) 40%, transparent);
    background: color-mix(in srgb, var(--color-accent-purple) 10%, transparent);
  }

  .hud-btn-purple:hover:not(:disabled) {
    box-shadow: 0 0 15px color-mix(in srgb, var(--color-accent-purple) 40%, transparent);
  }

  .hud-btn-green {
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 40%, transparent);
    background: color-mix(in srgb, var(--color-accent-green) 10%, transparent);
  }

  .hud-btn-green:hover:not(:disabled) {
    box-shadow: 0 0 15px color-mix(in srgb, var(--color-accent-green) 40%, transparent);
  }

  /* ─── MODE TOGGLE ─── */
  .hud-mode-toggle {
    display: flex;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    overflow: hidden;
  }

  .hud-mode-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.15em;
    padding: 4px 12px;
    background: transparent;
    border: none;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-mode-btn.active {
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    color: var(--color-accent-cyan);
  }

  .hud-mode-btn.purple {
    background: color-mix(in srgb, var(--color-accent-purple) 15%, transparent);
    color: var(--color-accent-purple);
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

  /* ─── ALERTS ─── */
  .hud-alert {
    border-radius: 3px;
    padding: 12px 16px;
    position: relative;
    overflow: hidden;
  }

  .hud-alert::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, #ff3864, transparent);
    opacity: 0.6;
  }

  .hud-alert-error {
    background: color-mix(in srgb, #ff3864 8%, #0a0e1a);
    border: 1px solid color-mix(in srgb, #ff3864 30%, transparent);
  }

  .hud-alert-title {
    font-size: 0.72rem;
    letter-spacing: 0.15em;
    color: #ff3864;
    margin-bottom: 6px;
  }

  .hud-alert-line {
    font-size: 0.72rem;
    color: color-mix(in srgb, #ff3864 75%, transparent);
    line-height: 1.5;
  }

  /* ─── LOADING ─── */
  .hud-loading-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .hud-pulse {
    animation: hud-pulse-anim 1.5s ease-in-out infinite;
  }

  @keyframes hud-pulse-anim {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 0.3; }
  }

  /* ─── RAW EDITOR ─── */
  .hud-raw-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  .hud-raw-editor {
    width: 100%;
    height: 600px;
    padding: 16px;
    background: rgba(0, 0, 0, 0.3);
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    border: none;
    resize: none;
    outline: none;
    letter-spacing: 0.02em;
    line-height: 1.6;
  }

  .hud-hash {
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── FILTER BAR ─── */
  .hud-filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .hud-search {
    flex: 1;
    min-width: 200px;
    padding: 8px 14px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    outline: none;
    transition: border-color 0.2s;
  }

  .hud-search::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-search:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  .hud-section-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .hud-section-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    padding: 4px 10px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    background: transparent;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    cursor: pointer;
    transition: all 0.2s;
  }

  .hud-section-btn:hover {
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-section-btn.active {
    background: color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    color: var(--color-accent-cyan);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── SECTIONS ─── */
  .hud-sections {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .hud-section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0;
    background: transparent;
    border: none;
    cursor: pointer;
    color: inherit;
    font-family: inherit;
    transition: opacity 0.2s;
  }

  .hud-section-header:hover {
    opacity: 0.85;
  }

  .hud-section-key {
    font-size: 0.75rem;
    color: var(--color-accent-purple);
    letter-spacing: 0.05em;
  }

  .hud-section-label {
    font-size: 0.78rem;
    color: var(--color-accent-cyan);
    letter-spacing: 0.05em;
  }

  .hud-section-desc {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-configured-badge {
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: var(--color-accent-green);
  }

  .hud-chevron {
    font-size: 0.75rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    transition: transform 0.2s;
    display: inline-block;
  }

  .hud-chevron.open {
    transform: rotate(180deg);
  }

  /* ─── FIELDS ─── */
  .hud-fields {
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    padding-top: 14px;
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .hud-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .hud-field-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
  }

  .hud-field-key {
    color: var(--color-accent-purple);
    letter-spacing: 0.05em;
    font-size: 0.68rem;
  }

  .hud-field-name {
    color: var(--color-accent-cyan);
  }

  .hud-required {
    color: #ff3864;
    font-size: 0.68rem;
  }

  .hud-field-desc {
    font-size: 0.65rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    margin-bottom: 4px;
  }

  /* ─── INPUTS ─── */
  .hud-input {
    width: 100%;
    padding: 7px 12px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .hud-input:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-input-number {
    width: 200px;
  }

  .hud-input.has-error,
  .hud-textarea.has-error,
  .hud-select.has-error {
    border-color: color-mix(in srgb, #ff3864 50%, transparent);
  }

  .hud-textarea {
    width: 100%;
    padding: 7px 12px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    outline: none;
    resize: vertical;
    transition: border-color 0.2s;
    line-height: 1.5;
  }

  .hud-textarea:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-select {
    padding: 7px 12px;
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    border-radius: 2px;
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.75rem;
    outline: none;
    transition: border-color 0.2s;
  }

  .hud-select:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-select option {
    background: #0a0e1a;
    color: var(--color-accent-cyan);
  }

  .hud-checkbox-wrap {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .hud-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--color-accent-cyan);
  }

  .hud-checkbox-label {
    font-size: 0.72rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 65%, transparent);
    letter-spacing: 0.1em;
  }

  .hud-expand-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    color: var(--color-accent-cyan);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.2s;
  }

  .hud-expand-btn:hover {
    opacity: 0.7;
  }

  /* ─── FIELD ERROR ─── */
  .hud-field-error {
    font-size: 0.68rem;
    color: #ff3864;
    background: color-mix(in srgb, #ff3864 5%, transparent);
    border: 1px solid color-mix(in srgb, #ff3864 25%, transparent);
    border-radius: 2px;
    padding: 3px 8px;
    margin-top: 2px;
  }

  /* ─── TYPE HINTS ─── */
  .hud-type-hints {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }

  .hud-type-tag {
    font-size: 0.58rem;
    letter-spacing: 0.08em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  .hud-type-default {
    font-size: 0.58rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  .hud-type-nullable {
    font-size: 0.58rem;
    letter-spacing: 0.1em;
    color: color-mix(in srgb, var(--color-accent-amber) 65%, transparent);
  }

  /* ─── ACTION BAR ─── */
  .hud-action-bar {
    position: sticky;
    bottom: 0;
    margin: 0 -22px;
    padding: 12px 22px;
    background: color-mix(in srgb, #0a0e1a 92%, transparent);
    backdrop-filter: blur(8px);
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hud-dirty-badge {
    font-size: 0.65rem;
    letter-spacing: 0.12em;
    color: var(--color-accent-amber);
  }

  .hud-error-badge {
    font-size: 0.65rem;
    letter-spacing: 0.1em;
    color: #ff3864;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-glow {
    0%, 100% { text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent), 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent); }
    50% { text-shadow: 0 0 40px color-mix(in srgb, var(--color-accent-cyan) 95%, transparent), 0 0 120px color-mix(in srgb, var(--color-accent-cyan) 55%, transparent); }
  }
</style>
