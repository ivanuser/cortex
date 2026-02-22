<script lang="ts">
  import { untrack } from 'svelte';
  import { gateway } from '$lib/gateway';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';

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

  const roleBadgeColors: Record<string, string> = {
    admin: 'bg-accent-pink/20 text-accent-pink border-accent-pink/30',
    operator: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
    viewer: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
    'chat-only': 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  };

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

<div class="h-full flex flex-col bg-bg-primary">
  <!-- Header -->
  <div class="flex-shrink-0 border-b border-border-default bg-bg-secondary/50">
    <div class="px-4 md:px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
            <svg class="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div>
            <h1 class="text-lg font-bold text-text-primary tracking-tight">API Tokens</h1>
            <p class="text-xs text-text-muted">Create and manage scoped API access tokens</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <!-- Stats badges -->
          <div class="flex items-center gap-2 text-xs">
            <span class="px-2 py-1 rounded-lg bg-accent-green/10 text-accent-green border border-accent-green/20">
              {activeCount} active
            </span>
            {#if revokedCount > 0}
              <span class="px-2 py-1 rounded-lg bg-bg-tertiary text-text-muted border border-border-default">
                {revokedCount} revoked
              </span>
            {/if}
          </div>
          <button
            onclick={() => { showCreate = !showCreate; createdToken = null; }}
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all
              {showCreate
                ? 'bg-accent-purple text-white shadow-lg shadow-accent-purple/25'
                : 'bg-accent-purple/20 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/30'}"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="{showCreate ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'}" />
            </svg>
            {showCreate ? 'Cancel' : 'Create Token'}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Create Token Form -->
  {#if showCreate}
    <div class="flex-shrink-0 mx-4 md:mx-6 mt-4">
      <div class="p-5 rounded-xl border border-accent-purple/30 bg-accent-purple/5">
        <h3 class="text-sm font-semibold text-accent-purple mb-4">Create New API Token</h3>

        {#if createdToken}
          <!-- Token created — show it -->
          <div class="space-y-4">
            <div class="p-4 rounded-lg border border-accent-green/30 bg-accent-green/5">
              <div class="flex items-center gap-2 mb-2">
                <svg class="w-4 h-4 text-accent-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="text-sm font-semibold text-accent-green">Token Created Successfully</span>
              </div>
              <p class="text-xs text-text-muted mb-3">Copy this token now — it won't be shown again.</p>
              <div class="flex items-center gap-2">
                <code class="flex-1 px-3 py-2 text-xs font-mono bg-bg-primary rounded-lg border border-border-default text-text-primary break-all select-all">
                  {createdToken}
                </code>
                <button
                  onclick={() => copyToClipboard(createdToken!)}
                  class="flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-all
                    {copiedToken
                      ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                      : 'bg-bg-tertiary text-text-secondary border border-border-default hover:text-accent-purple hover:border-accent-purple/30'}"
                >
                  {copiedToken ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <button
              onclick={() => { createdToken = null; }}
              class="text-xs text-accent-purple hover:text-accent-purple/80"
            >
              Create another token →
            </button>
          </div>
        {:else}
          <!-- Create form -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="md:col-span-1">
              <label class="text-xs text-text-muted block mb-1.5">Token Name</label>
              <input
                type="text"
                bind:value={createName}
                placeholder="e.g. monitoring-bot"
                class="w-full px-3 py-2 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
              />
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1.5">Role</label>
              <select
                bind:value={createRole}
                class="w-full px-3 py-2 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary focus:outline-none focus:border-accent-purple/50"
              >
                {#each ROLES as r}
                  <option value={r}>{r}</option>
                {/each}
              </select>
              <p class="text-[10px] text-text-muted mt-1">{roleDescriptions[createRole] ?? ''}</p>
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1.5">Expires (optional)</label>
              <input
                type="text"
                bind:value={createExpires}
                placeholder="e.g. 30d, 24h, never"
                class="w-full px-3 py-2 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/20 transition-all"
              />
            </div>
            <div class="flex items-end">
              <button
                onclick={createToken}
                disabled={creating || !createName.trim()}
                class="w-full px-4 py-2 text-sm font-medium rounded-lg transition-all
                  bg-accent-purple/20 text-accent-purple border border-accent-purple/30
                  hover:bg-accent-purple/30 hover:border-accent-purple/50
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating…' : 'Create Token'}
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Content area -->
  <div class="flex-1 overflow-y-auto p-4 md:p-6">
    {#if conn.state.status !== 'connected'}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm">Connect to the gateway to manage API tokens.</p>
      </div>

    {:else if loading && tokens.length === 0}
      <div class="space-y-3">
        {#each Array(3) as _}
          <div class="glass rounded-xl p-4 border border-border-default animate-pulse">
            <div class="flex items-center gap-3">
              <div class="w-3 h-3 rounded-full bg-bg-tertiary"></div>
              <div class="h-4 w-40 bg-bg-tertiary rounded"></div>
              <div class="h-5 w-16 bg-bg-tertiary rounded-full ml-auto"></div>
            </div>
          </div>
        {/each}
      </div>

    {:else if tokens.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-center">
        <div class="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4">
          <svg class="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <p class="text-text-muted text-sm mb-4">No API tokens yet.</p>
        <button
          onclick={() => { showCreate = true; }}
          class="px-4 py-2 text-sm font-medium rounded-xl bg-accent-purple/20 text-accent-purple border border-accent-purple/30 hover:bg-accent-purple/30 transition-all"
        >
          Create Your First Token
        </button>
      </div>

    {:else}
      <!-- Token list -->
      <div class="space-y-3">
        {#each tokens as token (token.id)}
          {@const expired = isExpired(token.expires_at)}
          {@const badgeClass = token.revoked
            ? 'bg-red-500/20 text-red-400 border-red-500/30'
            : expired
              ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/30'
              : roleBadgeColors[token.role] ?? roleBadgeColors['operator']}
          {@const statusText = token.revoked ? 'revoked' : expired ? 'expired' : 'active'}
          {@const statusColor = token.revoked ? 'bg-red-500' : expired ? 'bg-accent-amber' : 'bg-accent-green'}
          <div class="glass rounded-xl p-4 border border-border-default hover:border-accent-purple/20 transition-all
            {token.revoked ? 'opacity-60' : ''}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-2.5 h-2.5 rounded-full {statusColor} flex-shrink-0"></div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-text-primary">{token.name}</span>
                    <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border {badgeClass}">
                      {token.role}
                    </span>
                    {#if token.revoked}
                      <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                        revoked
                      </span>
                    {:else if expired}
                      <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-accent-amber/20 text-accent-amber border border-accent-amber/30">
                        expired
                      </span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-xs text-text-muted">
                    <span>Created {formatDate(token.created_at)}</span>
                    {#if token.expires_at}
                      <span>· Expires {formatDate(token.expires_at)}</span>
                    {/if}
                    {#if token.last_used_at}
                      <span>· Last used {formatDate(token.last_used_at)}</span>
                    {/if}
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0 ml-4">
                {#if !token.revoked}
                  <button
                    onclick={() => revokeToken(token.id, token.name)}
                    disabled={revokingId === token.id}
                    class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all
                      bg-red-500/10 text-red-400 border border-red-500/20
                      hover:bg-red-500/20 hover:border-red-500/30
                      disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {revokingId === token.id ? 'Revoking…' : 'Revoke'}
                  </button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    {#if lastError}
      <div class="glass rounded-xl p-4 border border-accent-pink/30 mt-4">
        <div class="flex items-center gap-2 text-accent-pink text-sm">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>{lastError}</span>
        </div>
      </div>
    {/if}
  </div>
</div>
