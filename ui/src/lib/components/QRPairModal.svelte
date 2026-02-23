<script lang="ts">
  import { untrack } from 'svelte';
  import QRCode from 'qrcode';
  import { gateway } from '$lib/gateway';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const toasts = getToasts();

  // ─── Props ──────────────────────────────────
  let {
    show = $bindable(false),
    gatewayWsUrl = '',
  }: {
    show: boolean;
    gatewayWsUrl: string;
  } = $props();

  // ─── State ──────────────────────────────────
  const ROLES = ['admin', 'operator', 'viewer', 'chat-only'] as const;
  let selectedRole = $state<string>('operator');
  let qrDataUrl = $state<string>('');
  let inviteCode = $state<string>('');
  let generating = $state(false);
  let error = $state<string>('');
  let expiresAt = $state<number>(0);
  let expired = $state(false);
  let expiryTimer: ReturnType<typeof setInterval> | null = null;

  const QR_EXPIRE_MS = 5 * 60 * 1000; // 5 minutes

  // ─── Role badge colors ──────────────────────
  const roleBadgeColors: Record<string, string> = {
    admin: 'bg-accent-pink/20 text-accent-pink border-accent-pink/30',
    operator: 'bg-accent-purple/20 text-accent-purple border-accent-purple/30',
    viewer: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30',
    'chat-only': 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  };

  // ─── Generate QR code ───────────────────────
  async function generateQR() {
    generating = true;
    error = '';
    expired = false;
    qrDataUrl = '';
    inviteCode = '';

    try {
      // Try to create an invite via the gateway RPC
      let code = '';
      try {
        const res = await gateway.call<{ code?: string; role?: string }>('invite.create', {
          role: selectedRole,
          expiresIn: '5m',
          maxUses: 1,
        });
        code = res.code ?? '';
      } catch (err) {
        // Invite system not available — generate a fallback local code
        console.warn('[QRPair] invite.create not available, using fallback:', err);
        code = '';
      }

      inviteCode = code;

      // Build the gateway URL for QR
      const baseUrl = deriveHttpUrl(gatewayWsUrl);
      const qrPayload = {
        url: gatewayWsUrl,
        ...(code ? { invite: code } : {}),
        role: selectedRole,
      };
      const encoded = btoa(JSON.stringify(qrPayload));
      const qrUrl = `${baseUrl}/?qr=${encoded}`;

      // Generate QR code as data URL
      qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#e0e0ff',
          light: '#0a0a1a',
        },
        errorCorrectionLevel: 'M',
      });

      // Set expiry timer
      expiresAt = Date.now() + QR_EXPIRE_MS;
      startExpiryTimer();
    } catch (err) {
      error = String(err);
      toasts.error('QR Generation Failed', String(err));
    } finally {
      generating = false;
    }
  }

  function deriveHttpUrl(wsUrl: string): string {
    if (!wsUrl) {
      // Derive from current window location
      if (typeof window !== 'undefined') {
        return `${window.location.protocol}//${window.location.host}`;
      }
      return '';
    }
    try {
      return wsUrl
        .replace(/^wss:\/\//, 'https://')
        .replace(/^ws:\/\//, 'http://');
    } catch {
      return '';
    }
  }

  function startExpiryTimer() {
    stopExpiryTimer();
    expiryTimer = setInterval(() => {
      if (Date.now() >= expiresAt) {
        expired = true;
        stopExpiryTimer();
      }
    }, 1000);
  }

  function stopExpiryTimer() {
    if (expiryTimer) {
      clearInterval(expiryTimer);
      expiryTimer = null;
    }
  }

  function close() {
    show = false;
    stopExpiryTimer();
    qrDataUrl = '';
    inviteCode = '';
    expired = false;
    error = '';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  // ─── Effects ────────────────────────────────
  // Generate QR when modal opens or role changes
  $effect(() => {
    const isShown = show;
    const role = selectedRole;
    if (isShown) {
      untrack(() => generateQR());
    } else {
      untrack(() => {
        stopExpiryTimer();
        qrDataUrl = '';
        inviteCode = '';
        expired = false;
        error = '';
      });
    }
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) close(); }}
  >
    <div class="glass border border-border-default rounded-2xl max-w-md w-full mx-4 overflow-hidden shadow-2xl"
         style="box-shadow: 0 0 60px rgba(124, 77, 255, 0.15), 0 0 120px rgba(0, 229, 255, 0.05);">

      <!-- Header -->
      <div class="px-6 pt-6 pb-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center">
            <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <div>
            <h2 class="text-lg font-bold text-text-primary glow-text-cyan">QR Pair</h2>
            <p class="text-xs text-text-muted">Scan to pair a new device</p>
          </div>
        </div>
        <button onclick={close} class="text-text-muted hover:text-text-primary transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Role selector -->
      <div class="px-6 pb-4">
        <label class="text-xs font-medium text-text-muted block mb-2">Security Role</label>
        <div class="flex flex-wrap gap-2">
          {#each ROLES as role}
            {@const isSelected = selectedRole === role}
            {@const badgeClass = roleBadgeColors[role] ?? ''}
            <button
              onclick={() => selectedRole = role}
              class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-lg border transition-all
                {isSelected
                  ? badgeClass + ' ring-1 ring-white/20'
                  : 'bg-bg-tertiary border-border-default text-text-muted hover:text-text-primary hover:border-border-hover'}"
            >
              {role}
            </button>
          {/each}
        </div>
      </div>

      <!-- QR Code display -->
      <div class="px-6 pb-6">
        {#if generating}
          <div class="flex flex-col items-center justify-center py-12">
            <svg class="w-8 h-8 animate-spin text-accent-cyan mb-3" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p class="text-sm text-text-muted">Generating QR code…</p>
          </div>
        {:else if error}
          <div class="p-4 rounded-xl border border-accent-pink/30 bg-accent-pink/5 text-center">
            <p class="text-sm text-accent-pink mb-3">{error}</p>
            <button
              onclick={generateQR}
              class="px-4 py-2 text-xs font-medium rounded-lg bg-accent-pink/20 text-accent-pink border border-accent-pink/30 hover:bg-accent-pink/30 transition-colors"
            >
              Retry
            </button>
          </div>
        {:else if expired}
          <div class="flex flex-col items-center justify-center py-8">
            <div class="w-12 h-12 rounded-xl bg-accent-amber/20 flex items-center justify-center mb-3">
              <svg class="w-6 h-6 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-sm font-medium text-text-primary mb-1">QR Code Expired</p>
            <p class="text-xs text-text-muted mb-4">This code has expired for security.</p>
            <button
              onclick={generateQR}
              class="px-4 py-2 text-sm font-medium rounded-lg gradient-bg border border-border-glow text-text-primary hover:brightness-110 transition-all"
            >
              Generate New Code
            </button>
          </div>
        {:else if qrDataUrl}
          <div class="flex flex-col items-center">
            <!-- QR code image -->
            <div class="p-3 rounded-xl border border-border-default bg-bg-primary/80 mb-3">
              <img src={qrDataUrl} alt="QR Code for device pairing" class="w-[280px] h-[280px]" />
            </div>

            <!-- Info -->
            <div class="text-center space-y-1.5">
              <p class="text-xs text-text-muted">
                Scan with the Cortex app or open the URL on the device.
              </p>
              {#if inviteCode}
                <div class="flex items-center justify-center gap-2">
                  <span class="text-[10px] uppercase tracking-wider text-text-muted">Invite:</span>
                  <code class="text-xs font-mono text-accent-cyan bg-bg-tertiary px-2 py-0.5 rounded">
                    {inviteCode.slice(0, 12)}…
                  </code>
                </div>
              {/if}
              <p class="text-[10px] text-text-muted">
                Expires in {Math.max(0, Math.ceil((expiresAt - Date.now()) / 60000))} min
              </p>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
