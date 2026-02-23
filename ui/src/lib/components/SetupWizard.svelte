<script lang="ts">
  import { getConnection } from '$lib/stores/connection.svelte';
  import { loadConfig } from '$lib/config';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  let step = $state(1);
  let gatewayUrl = $state('');
  let token = $state('');
  let isConnecting = $state(false);
  let error = $state('');
  let show = $state(false);
  let pairingWait = $state(false);
  let pairingRetryTimer: ReturnType<typeof setInterval> | null = null;

  // Invite / pairing code state
  let authMode = $state<'device' | 'invite' | 'pairing-code' | 'token'>('device');
  let inviteCode = $state('');
  let pairingCode = $state('');

  // Show wizard if never connected before (or if invite URL param is present)
  $effect(() => {
    const hasUrl = localStorage.getItem('cortex:gatewayUrl');
    const wasDismissed = localStorage.getItem('openclaw-setup-dismissed');

    // Check for QR code data in URL (?qr=base64json) or invite code (?invite=...)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);

      // QR pair: decode base64 JSON payload
      const qrParam = urlParams.get('qr');
      if (qrParam) {
        try {
          const decoded = JSON.parse(atob(qrParam));
          if (decoded.url) {
            gatewayUrl = decoded.url;
          }
          if (decoded.invite) {
            inviteCode = decoded.invite;
            authMode = 'invite';
          }
          show = true;
          step = 2; // Go directly to auth step
          // Clean up the URL
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('qr');
          window.history.replaceState({}, '', cleanUrl.toString());
          return;
        } catch (err) {
          console.warn('[SetupWizard] Failed to decode QR param:', err);
        }
      }

      const inviteParam = urlParams.get('invite');
      if (inviteParam) {
        inviteCode = inviteParam;
        authMode = 'invite';
        show = true;
        loadConfig().then(cfg => {
          if (cfg.gatewayUrl) {
            const wsUrl = cfg.gatewayWs || cfg.gatewayUrl.replace(/^http/, 'ws');
            gatewayUrl = wsUrl;
            if (gatewayUrl) step = 2;
          }
        });
        return;
      }
    }

    if (!hasUrl && !wasDismissed && conn.state.status === 'disconnected') {
      show = true;
      loadConfig().then(cfg => {
        if (cfg.gatewayUrl) {
          const wsUrl = cfg.gatewayWs || cfg.gatewayUrl.replace(/^http/, 'ws');
          gatewayUrl = wsUrl;
        }
      });
    }
  });

  function dismiss() {
    show = false;
    localStorage.setItem('openclaw-setup-dismissed', 'true');
  }

  function stopPairingRetry() {
    if (pairingRetryTimer) {
      clearInterval(pairingRetryTimer);
      pairingRetryTimer = null;
    }
    pairingWait = false;
  }

  async function testConnection() {
    if (!gatewayUrl.trim()) {
      error = 'Please enter your gateway URL';
      return;
    }

    error = '';
    isConnecting = true;
    stopPairingRetry();

    try {
      let authToken = token.trim() || '__device_auth__';

      if (authMode === 'invite' && inviteCode.trim()) {
        localStorage.setItem('cortex:inviteCode', inviteCode.trim());
      } else {
        localStorage.removeItem('cortex:inviteCode');
      }

      if (authMode === 'pairing-code' && pairingCode.trim()) {
        localStorage.setItem('cortex:pairingCode', pairingCode.trim());
      } else {
        localStorage.removeItem('cortex:pairingCode');
      }

      if (authMode === 'token' && token.trim()) {
        authToken = token.trim();
      }

      conn.connect(gatewayUrl.trim(), authToken);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 15000);
        const unsubscribe = conn.onStateChange((state: any) => {
          if (state.status === 'connected') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          } else if (state.status === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            reject(new Error(state.error || 'Connection failed'));
          }
        });
      });

      localStorage.removeItem('cortex:inviteCode');
      localStorage.removeItem('cortex:pairingCode');
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('invite')) {
          url.searchParams.delete('invite');
          window.history.replaceState({}, '', url.toString());
        }
      }

      step = 3;
      toasts.success('Connected!', 'You\'re all set.');
      setTimeout(() => { show = false; }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';

      if (authMode === 'device' && (msg.toLowerCase().includes('pairing') || msg.toLowerCase().includes('pair'))) {
        pairingWait = true;
        error = '';

        const authToken = token.trim() || '__device_auth__';
        pairingRetryTimer = setInterval(() => {
          conn.connect(gatewayUrl.trim(), authToken);
          const unsubscribe = conn.onStateChange((state: any) => {
            if (state.status === 'connected') {
              unsubscribe();
              stopPairingRetry();
              isConnecting = false;
              step = 3;
              toasts.success('Device approved!', 'You\'re connected.');
              setTimeout(() => { show = false; }, 3000);
            } else if (state.status === 'error') {
              unsubscribe();
            }
          });
        }, 5000);

        return;
      }

      if (authMode === 'invite') {
        error = 'Invalid or expired invite code. Please check and try again.';
      } else if (authMode === 'pairing-code') {
        error = 'Invalid or expired pairing code. Please check and try again.';
      } else {
        error = msg;
      }
    } finally {
      if (!pairingWait) {
        isConnecting = false;
      }
    }
  }

  function normalizeUrl() {
    let url = gatewayUrl.trim();
    if (!url) return;
    if (!url.match(/^(wss?|https?):\/\//)) {
      url = 'wss://' + url;
    }
    url = url.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    gatewayUrl = url;
  }

  function selectAuthMode(mode: typeof authMode) {
    authMode = mode;
    error = '';
  }
</script>

{#if show}
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div class="glass border border-border-default rounded-2xl max-w-lg w-full mx-4 overflow-hidden shadow-2xl"
         style="box-shadow: 0 0 60px rgba(124, 77, 255, 0.15), 0 0 120px rgba(0, 229, 255, 0.05);">

      <div class="px-8 pt-8 pb-4 text-center">
        <div class="text-5xl mb-3">🧠</div>
        <h1 class="text-2xl font-bold text-text-primary">Welcome to Cortex</h1>
        <p class="text-text-secondary mt-1 text-sm">Let's connect to your OpenClaw gateway</p>
      </div>

      <div class="flex justify-center gap-2 py-3">
        {#each [1, 2, 3] as s}
          <div class="w-2 h-2 rounded-full transition-all duration-300"
               class:bg-accent-cyan={step >= s}
               class:scale-125={step === s}
               class:bg-border-default={step < s}>
          </div>
        {/each}
      </div>

      <div class="px-8 pb-8">
        {#if step === 1}
          <div class="space-y-4">
            <div>
              <label for="setup-url" class="block text-sm font-medium text-text-secondary mb-2">Gateway URL</label>
              <input id="setup-url" type="text" bind:value={gatewayUrl} onblur={normalizeUrl}
                placeholder="openclaw.example.com"
                class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary text-text-primary placeholder-text-muted text-center text-lg focus:outline-none focus:border-accent-cyan transition-all duration-200" />
              <p class="text-xs text-text-muted mt-2 text-center">The URL where your OpenClaw gateway is running</p>
            </div>
            <div class="flex gap-3">
              <button onclick={dismiss} class="flex-1 px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:bg-bg-hover transition-colors text-sm">Skip</button>
              <button onclick={() => { normalizeUrl(); step = 2; }} disabled={!gatewayUrl.trim()}
                class="flex-1 px-4 py-2.5 rounded-xl gradient-bg text-text-primary font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">Next →</button>
            </div>
          </div>

        {:else if step === 2}
          <div class="space-y-4">
            {#if pairingWait}
              <div class="p-5 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 text-center space-y-3">
                <div class="flex justify-center">
                  <svg class="w-8 h-8 animate-spin text-accent-cyan" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p class="text-sm font-medium text-text-primary">Waiting for approval...</p>
                <p class="text-xs text-text-secondary">A pairing request has been sent. The gateway owner needs to approve this device.</p>
                <p class="text-xs text-text-muted">Auto-retrying every 5 seconds</p>
              </div>
              <button onclick={() => { stopPairingRetry(); isConnecting = false; }}
                class="w-full px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:bg-bg-hover transition-colors text-sm">Cancel</button>
            {:else}
              <!-- Auth mode selector -->
              <div class="grid grid-cols-2 gap-2">
                <button onclick={() => selectAuthMode('device')}
                  class="p-3 rounded-xl border text-left transition-all text-sm {authMode === 'device' ? 'border-accent-cyan/50 bg-accent-cyan/10' : 'border-border-default hover:border-accent-cyan/20'}">
                  <div class="flex items-center gap-2 mb-1"><span class="text-base">🔗</span><span class="font-medium text-text-primary text-xs">Device Pairing</span></div>
                  <p class="text-[10px] text-text-muted">Gateway owner approves</p>
                </button>
                <button onclick={() => selectAuthMode('pairing-code')}
                  class="p-3 rounded-xl border text-left transition-all text-sm {authMode === 'pairing-code' ? 'border-accent-purple/50 bg-accent-purple/10' : 'border-border-default hover:border-accent-purple/20'}">
                  <div class="flex items-center gap-2 mb-1"><span class="text-base">🔢</span><span class="font-medium text-text-primary text-xs">Pairing Code</span></div>
                  <p class="text-[10px] text-text-muted">6-digit code from admin</p>
                </button>
                <button onclick={() => selectAuthMode('invite')}
                  class="p-3 rounded-xl border text-left transition-all text-sm {authMode === 'invite' ? 'border-accent-green/50 bg-accent-green/10' : 'border-border-default hover:border-accent-green/20'}">
                  <div class="flex items-center gap-2 mb-1"><span class="text-base">✉️</span><span class="font-medium text-text-primary text-xs">Invite Link</span></div>
                  <p class="text-[10px] text-text-muted">Paste invite code</p>
                </button>
                <button onclick={() => selectAuthMode('token')}
                  class="p-3 rounded-xl border text-left transition-all text-sm {authMode === 'token' ? 'border-accent-amber/50 bg-accent-amber/10' : 'border-border-default hover:border-accent-amber/20'}">
                  <div class="flex items-center gap-2 mb-1"><span class="text-base">🔑</span><span class="font-medium text-text-primary text-xs">Access Token</span></div>
                  <p class="text-[10px] text-text-muted">Direct token auth</p>
                </button>
              </div>

              {#if authMode === 'pairing-code'}
                <div>
                  <label for="setup-pairing-code" class="block text-sm font-medium text-text-secondary mb-2">6-Digit Pairing Code</label>
                  <input id="setup-pairing-code" type="text" bind:value={pairingCode} placeholder="000000" maxlength={6}
                    class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary text-text-primary placeholder-text-muted text-center text-2xl tracking-[0.5em] font-mono focus:outline-none focus:border-accent-purple transition-all duration-200"
                    oninput={(e) => { const input = e.target as HTMLInputElement; input.value = input.value.replace(/\D/g, '').slice(0, 6); pairingCode = input.value; }} />
                  <p class="text-xs text-text-muted mt-2 text-center">Ask your gateway admin to generate a code</p>
                </div>
              {:else if authMode === 'invite'}
                <div>
                  <label for="setup-invite" class="block text-sm font-medium text-text-secondary mb-2">Invite Code</label>
                  <input id="setup-invite" type="text" bind:value={inviteCode} placeholder="Paste your invite code"
                    class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary text-text-primary placeholder-text-muted text-center font-mono focus:outline-none focus:border-accent-green transition-all duration-200" />
                  <p class="text-xs text-text-muted mt-2 text-center">Paste the invite code you received</p>
                </div>
              {:else if authMode === 'token'}
                <div>
                  <label for="setup-token" class="block text-sm font-medium text-text-secondary mb-2">Access Token</label>
                  <input id="setup-token" type="password" bind:value={token} placeholder="Paste gateway token"
                    class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-amber transition-all duration-200" />
                </div>
              {:else}
                <div class="p-4 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5">
                  <p class="text-sm text-text-secondary">Click <strong class="text-text-primary">Connect</strong> below. The gateway owner will see a pairing request to approve.</p>
                </div>
              {/if}

              {#if error}
                <div class="p-3 rounded-xl border border-accent-red/30 bg-accent-red/10">
                  <p class="text-sm text-accent-red">{error}</p>
                </div>
              {/if}

              <div class="flex gap-3">
                <button onclick={() => { step = 1; error = ''; }} disabled={isConnecting}
                  class="flex-1 px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:bg-bg-hover transition-colors text-sm">← Back</button>
                <button onclick={testConnection}
                  disabled={isConnecting || (authMode === 'pairing-code' && pairingCode.length !== 6) || (authMode === 'invite' && !inviteCode.trim()) || (authMode === 'token' && !token.trim())}
                  class="flex-1 px-4 py-2.5 rounded-xl gradient-bg text-text-primary font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
                  {#if isConnecting}
                    <span class="flex items-center justify-center gap-2">
                      <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Connecting...
                    </span>
                  {:else}
                    Connect
                  {/if}
                </button>
              </div>
            {/if}
          </div>

        {:else if step === 3}
          <div class="text-center space-y-4 py-4">
            <div class="text-5xl animate-bounce">🎉</div>
            <h2 class="text-xl font-bold text-text-primary">Connected!</h2>
            <p class="text-text-secondary text-sm">You're all set. Your gateway is ready to go.</p>
            <div class="pt-2">
              <button onclick={() => show = false}
                class="px-6 py-2.5 rounded-xl gradient-bg text-text-primary font-medium hover:brightness-110 transition-all text-sm">Let's go →</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
