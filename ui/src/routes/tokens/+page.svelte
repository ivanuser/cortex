<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  // ─── Types ─────────────────────────────────────
  type TokenEntry = {
    id: number;
    name: string;
    prefix: string;
    role: string;
    scopes: string[];
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
    revoked: boolean;
    revoked_at: string | null;
  };

  // ─── State ─────────────────────────────────────
  let tokens = $state<TokenEntry[]>([]);
  let loading = $state(false);
  let lastError = $state<string | null>(null);

  // Create form
  let showCreate = $state(false);
  let createName = $state('');
  let createRole = $state('operator');
  let createExpires = $state('');
  let creating = $state(false);
  let createdToken = $state<string | null>(null);
  let copiedToken = $state(false);

  // Revoke
  let revokingId = $state<number | null>(null);

  const ROLES = ['admin', 'operator', 'viewer', 'chat-only'] as const;

  const roleDescriptions: Record<string, string> = {
    admin: 'Full access — config, pairing, audit, updates',
    operator: 'Operations — chat, sessions, cron, logs',
    viewer: 'Read-only — chat history, session list, status',
    'chat-only': 'Chat access only — send and view own history',
  };

  // ─── Actions ───────────────────────────────────
  async function loadTokens() {
    if (!gateway.connected || loading) return;
    loading = true;
    lastError = null;
    try {
      const res = await gateway.call<TokenEntry[]>('tokens.list', {});
      untrack(() => { tokens = Array.isArray(res) ? res : []; });
    } catch (err) {
      lastError = String(err);
    } finally {
      loading = false;
    }
  }

  async function createToken() {
    if (creating || !createName.trim()) return;
    creating = true;
    createdToken = null;
    try {
      const res = await gateway.call<{ token: string }>('tokens.create', {
        name: createName.trim(),
        role: createRole,
        expires: createExpires.trim() || undefined,
      });
      untrack(() => {
        createdToken = res.token;
        createName = '';
        createExpires = '';
      });
      toasts.success('Token Created', `API token "${createName.trim() || 'new'}" created`);
      loadTokens();
    } catch (err) {
      toasts.error('Token Creation Failed', String(err));
    } finally {
      creating = false;
    }
  }

  async function revokeToken(id: number, name: string) {
    revokingId = id;
    try {
      await gateway.call('tokens.revoke', { identifier: name });
      toasts.success('Token Revoked', `Token "${name}" has been revoked`);
      loadTokens();
    } catch (err) {
      toasts.error('Revoke Failed', String(err));
    } finally {
      revokingId = null;
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedToken = true;
      setTimeout(() => { copiedToken = false; }, 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      copiedToken = true;
      setTimeout(() => { copiedToken = false; }, 2000);
    }
  }

  function formatDate(iso: string | null): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return Date.now() > Date.parse(expiresAt);
  }

  // ─── Lifecycle ─────────────────────────────────
  $effect(() => {
    if (conn.state.status === 'connected') {
      untrack(() => { loadTokens(); });
    }
  });

  let activeCount = $derived(tokens.filter(t => !t.revoked && !isExpired(t.expires_at)).length);
  let revokedCount = $derived(tokens.filter(t => t.revoked).length);
</script>

<svelte:head>
  <title>API Tokens — Cortex</title>
</svelte:head>

<div class="hud-page">
  <MatrixRain />
  <CRTOverlay />

  <!-- Top bar -->
  <div class="hud-page-topbar">
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="/overview" class="hud-back">&#x25C0; BACK</a>
      <span class="hud-page-title">TOKEN MANAGEMENT</span>
    </div>
    <div style="display:flex;align-items:center;gap:10px;">
      <span class="hud-badge hud-badge-green">{activeCount} ACTIVE</span>
      {#if revokedCount > 0}
        <span class="hud-badge hud-badge-dim">{revokedCount} REVOKED</span>
      {/if}
      <button
        class="hud-btn"
        onclick={() => { showCreate = !showCreate; createdToken = null; }}
      >
        {showCreate ? '[ CANCEL ]' : '[ + CREATE TOKEN ]'}
      </button>
    </div>
  </div>

  <!-- Create Token Form -->
  {#if showCreate}
    <div class="hud-panel">
      <div class="hud-panel-lbl">CREATE NEW API TOKEN</div>

      {#if createdToken}
        <div class="hud-success-box">
          <div class="hud-success-title">TOKEN CREATED SUCCESSFULLY</div>
          <p class="hud-dim-text">Copy this token now — it will not be shown again.</p>
          <div class="hud-token-row">
            <code class="hud-token-code">{createdToken}</code>
            <button
              class="hud-btn {copiedToken ? 'hud-btn-green' : ''}"
              onclick={() => copyToClipboard(createdToken!)}
            >
              {copiedToken ? 'COPIED' : 'COPY'}
            </button>
          </div>
          <button class="hud-link" onclick={() => { createdToken = null; }}>
            CREATE ANOTHER TOKEN &rarr;
          </button>
        </div>
      {:else}
        <div class="hud-form-grid">
          <div class="hud-field">
            <label class="hud-field-lbl">TOKEN NAME</label>
            <input
              type="text"
              bind:value={createName}
              placeholder="e.g. monitoring-bot"
              class="hud-input"
            />
          </div>
          <div class="hud-field">
            <label class="hud-field-lbl">ROLE</label>
            <select bind:value={createRole} class="hud-input">
              {#each ROLES as r}
                <option value={r}>{r.toUpperCase()}</option>
              {/each}
            </select>
            <span class="hud-dim-text" style="margin-top:4px;display:block;font-size:0.6rem;">{roleDescriptions[createRole] ?? ''}</span>
          </div>
          <div class="hud-field">
            <label class="hud-field-lbl">EXPIRES (OPTIONAL)</label>
            <input
              type="text"
              bind:value={createExpires}
              placeholder="e.g. 30d, 24h, never"
              class="hud-input"
            />
          </div>
          <div class="hud-field" style="display:flex;align-items:flex-end;">
            <button
              class="hud-btn hud-btn-full"
              onclick={createToken}
              disabled={creating || !createName.trim()}
            >
              {creating ? 'CREATING...' : '[ CREATE TOKEN ]'}
            </button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Content area -->
  <div class="hud-content">
    {#if conn.state.status !== 'connected'}
      <div class="hud-empty">
        <div class="hud-empty-icon">
          <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p class="hud-dim-text">CONNECT TO GATEWAY TO MANAGE API TOKENS</p>
      </div>

    {:else if loading && tokens.length === 0}
      <div class="hud-panel" style="padding:20px;">
        <div class="hud-dim-text" style="text-align:center;letter-spacing:0.2em;">LOADING TOKENS...</div>
      </div>

    {:else if tokens.length === 0}
      <div class="hud-empty">
        <div class="hud-empty-icon">
          <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p class="hud-dim-text">NO API TOKENS YET</p>
        <button class="hud-btn" onclick={() => { showCreate = true; }}>
          [ CREATE YOUR FIRST TOKEN ]
        </button>
      </div>

    {:else}
      <!-- Token list -->
      <div class="hud-token-list">
        {#each tokens as token (token.id)}
          {@const expired = isExpired(token.expires_at)}
          {@const statusText = token.revoked ? 'REVOKED' : expired ? 'EXPIRED' : 'ACTIVE'}
          {@const statusClass = token.revoked ? 'hud-status-red' : expired ? 'hud-status-amber' : 'hud-status-green'}
          {@const roleClass = token.role === 'admin' ? 'hud-role-pink' : token.role === 'operator' ? 'hud-role-purple' : token.role === 'viewer' ? 'hud-role-cyan' : 'hud-role-amber'}
          <div class="hud-panel hud-token-card {token.revoked ? 'hud-revoked' : ''}">
            <div class="hud-token-header">
              <div class="hud-token-info">
                <div class="hud-status-dot {statusClass}"></div>
                <span class="hud-token-name">{token.name}</span>
                <span class="hud-role-badge {roleClass}">{token.role.toUpperCase()}</span>
                {#if token.revoked}
                  <span class="hud-status-badge hud-status-red-badge">REVOKED</span>
                {:else if expired}
                  <span class="hud-status-badge hud-status-amber-badge">EXPIRED</span>
                {/if}
              </div>
              <div class="hud-token-actions">
                {#if !token.revoked}
                  <button
                    class="hud-btn hud-btn-danger"
                    onclick={() => revokeToken(token.id, token.name)}
                    disabled={revokingId === token.id}
                  >
                    {revokingId === token.id ? 'REVOKING...' : '[ REVOKE ]'}
                  </button>
                {/if}
              </div>
            </div>
            <div class="hud-token-meta">
              <span>CREATED {formatDate(token.created_at)}</span>
              {#if token.expires_at}
                <span>EXPIRES {formatDate(token.expires_at)}</span>
              {/if}
              {#if token.last_used_at}
                <span>LAST USED {formatDate(token.last_used_at)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if lastError}
      <div class="hud-panel hud-error-panel">
        <div class="hud-error-row">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ═══════════════════════════════════════════════
     HUD PAGE LAYOUT
  ═══════════════════════════════════════════════ */
  .hud-page {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 22px;
    gap: 14px;
    overflow-y: auto;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
    background: #0a0e1a;
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
    position: relative;
    z-index: 10;
  }

  .hud-back {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.18em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .hud-back:hover {
    color: var(--color-accent-cyan);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: 0.25em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent),
                 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    animation: hud-glow 4s ease-in-out infinite;
  }

  /* ─── BADGES ─── */
  .hud-badge {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.62rem;
    letter-spacing: 0.22em;
    padding: 3px 9px;
    border-radius: 2px;
    text-transform: uppercase;
  }

  .hud-badge-green {
    color: var(--color-accent-green);
    border: 1px solid color-mix(in srgb, var(--color-accent-green) 28%, transparent);
  }

  .hud-badge-dim {
    color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
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
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hud-btn-full {
    width: 100%;
    padding: 8px 12px;
  }

  .hud-btn-green {
    color: var(--color-accent-green);
    border-color: color-mix(in srgb, var(--color-accent-green) 50%, transparent);
  }

  .hud-btn-danger {
    color: #ff3864;
    border-color: color-mix(in srgb, #ff3864 35%, transparent);
  }

  .hud-btn-danger:hover:not(:disabled) {
    border-color: #ff3864;
    box-shadow: 0 0 10px color-mix(in srgb, #ff3864 30%, transparent);
  }

  /* ─── PANELS ─── */
  .hud-panel {
    background: color-mix(in srgb, var(--color-accent-cyan) 8%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 3px;
    padding: 16px;
    position: relative;
    overflow: hidden;
    z-index: 10;
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
    margin-bottom: 12px;
  }

  /* ─── CONTENT ─── */
  .hud-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    z-index: 10;
    min-height: 0;
  }

  /* ─── FORM ─── */
  .hud-form-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
  }

  @media (max-width: 767px) {
    .hud-form-grid {
      grid-template-columns: 1fr;
    }
  }

  .hud-field {
    display: flex;
    flex-direction: column;
  }

  .hud-field-lbl {
    font-size: 0.75rem;
    letter-spacing: 0.28em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .hud-input {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-radius: 2px;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.2s;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-input:focus {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 60%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  /* ─── SUCCESS BOX ─── */
  .hud-success-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hud-success-title {
    font-size: 0.75rem;
    letter-spacing: 0.18em;
    color: var(--color-accent-green);
  }

  .hud-token-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .hud-token-code {
    flex: 1;
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    color: var(--color-accent-cyan);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    border-radius: 2px;
    padding: 8px 10px;
    word-break: break-all;
    user-select: all;
  }

  /* ─── LINK ─── */
  .hud-link {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.68rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: opacity 0.2s;
  }

  .hud-link:hover {
    opacity: 0.7;
  }

  /* ─── DIM TEXT ─── */
  .hud-dim-text {
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  /* ─── TOKEN LIST ─── */
  .hud-token-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hud-token-card {
    transition: border-color 0.2s;
  }

  .hud-token-card:hover {
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
  }

  .hud-revoked {
    opacity: 0.5;
  }

  .hud-token-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .hud-token-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .hud-token-name {
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--color-accent-cyan);
  }

  .hud-token-actions {
    flex-shrink: 0;
  }

  .hud-token-meta {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    font-size: 0.62rem;
    letter-spacing: 0.12em;
    color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    flex-wrap: wrap;
  }

  /* ─── STATUS DOT ─── */
  .hud-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .hud-status-green {
    background: var(--color-accent-green);
    box-shadow: 0 0 6px var(--color-accent-green);
    animation: hud-dp 1.6s ease-in-out infinite;
  }

  .hud-status-amber {
    background: var(--color-accent-amber);
    box-shadow: 0 0 6px var(--color-accent-amber);
  }

  .hud-status-red {
    background: #ff3864;
    box-shadow: 0 0 6px #ff3864;
  }

  /* ─── ROLE BADGES ─── */
  .hud-role-badge {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    padding: 2px 7px;
    border-radius: 2px;
    text-transform: uppercase;
  }

  .hud-role-pink {
    color: var(--color-accent-pink);
    border: 1px solid color-mix(in srgb, var(--color-accent-pink) 35%, transparent);
  }

  .hud-role-purple {
    color: var(--color-accent-purple);
    border: 1px solid color-mix(in srgb, var(--color-accent-purple) 35%, transparent);
  }

  .hud-role-cyan {
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  .hud-role-amber {
    color: var(--color-accent-amber);
    border: 1px solid color-mix(in srgb, var(--color-accent-amber) 35%, transparent);
  }

  /* ─── STATUS BADGES ─── */
  .hud-status-badge {
    font-size: 0.55rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    padding: 2px 7px;
    border-radius: 2px;
    text-transform: uppercase;
  }

  .hud-status-red-badge {
    color: #ff3864;
    border: 1px solid color-mix(in srgb, #ff3864 35%, transparent);
  }

  .hud-status-amber-badge {
    color: var(--color-accent-amber);
    border: 1px solid color-mix(in srgb, var(--color-accent-amber) 35%, transparent);
  }

  /* ─── EMPTY STATE ─── */
  .hud-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 20px;
    text-align: center;
  }

  .hud-empty-icon {
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
  }

  /* ─── ERROR PANEL ─── */
  .hud-error-panel {
    border-color: color-mix(in srgb, #ff3864 30%, transparent);
    margin-top: 8px;
  }

  .hud-error-panel::before {
    background: linear-gradient(90deg, transparent, #ff3864, transparent);
  }

  .hud-error-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: #ff3864;
  }

  /* ─── ANIMATIONS ─── */
  @keyframes hud-glow {
    0%, 100% { text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent), 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent); }
    50% { text-shadow: 0 0 40px color-mix(in srgb, var(--color-accent-cyan) 95%, transparent), 0 0 120px color-mix(in srgb, var(--color-accent-cyan) 55%, transparent); }
  }

  @keyframes hud-dp {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.25; }
  }
</style>
