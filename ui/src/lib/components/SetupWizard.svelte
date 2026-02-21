<script lang="ts">
  import { getConnection } from '$lib/stores/connection.svelte';
  import { loadConfig } from '$lib/config';
  import { getToasts } from '$lib/stores/toasts.svelte';

  const conn = getConnection();
  const toasts = getToasts();

  let step = $state(1);
  let gatewayUrl = $state('');
  let token = $state('');
  let showToken = $state(false);
  let isConnecting = $state(false);
  let error = $state('');
  let show = $state(false);
  let pairingWait = $state(false);
  let pairingRetryTimer: ReturnType<typeof setInterval> | null = null;

  // Show wizard if never connected before
  $effect(() => {
    const hasUrl = localStorage.getItem('cortex:gatewayUrl');
    const wasDismissed = localStorage.getItem('openclaw-setup-dismissed');
    if (!hasUrl && !wasDismissed && conn.state.status === 'disconnected') {
      show = true;
      // Pre-fill from config.json if available
      loadConfig().then(cfg => {
        if (cfg.gatewayUrl) {
          // Derive WS URL from HTTP URL
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
      const authToken = token.trim() || '__device_auth__';
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

      step = 3; // Success!
      toasts.success('Connected!', 'You\'re all set.');
      
      // Auto-dismiss after a moment
      setTimeout(() => { show = false; }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      
      // If pairing required, switch to waiting mode with auto-retry
      if (msg.toLowerCase().includes('pairing') || msg.toLowerCase().includes('pair')) {
        pairingWait = true;
        error = '';
        
        // Auto-retry every 5 seconds
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
              // Still waiting — keep retrying
            }
          });
        }, 5000);
        
        return; // Don't clear isConnecting
      }
      
      error = msg;
    } finally {
      if (!pairingWait) {
        isConnecting = false;
      }
    }
  }

  function normalizeUrl() {
    let url = gatewayUrl.trim();
    if (!url) return;
    
    // Add protocol if missing
    if (!url.match(/^(wss?|https?):\/\//)) {
      url = 'wss://' + url;
    }
    // Convert http(s) to ws(s)
    url = url.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    gatewayUrl = url;
  }
</script>

{#if show}
  <!-- Backdrop -->
  <div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
    <div class="glass border border-border-default rounded-2xl max-w-lg w-full mx-4 overflow-hidden shadow-2xl"
         style="box-shadow: 0 0 60px rgba(124, 77, 255, 0.15), 0 0 120px rgba(0, 229, 255, 0.05);">
      
      <!-- Header -->
      <div class="px-8 pt-8 pb-4 text-center">
        <div class="text-5xl mb-3">🧠</div>
        <h1 class="text-2xl font-bold text-text-primary">Welcome to Cortex</h1>
        <p class="text-text-secondary mt-1 text-sm">Let's connect to your OpenClaw gateway</p>
      </div>

      <!-- Progress dots -->
      <div class="flex justify-center gap-2 py-3">
        {#each [1, 2, 3] as s}
          <div class="w-2 h-2 rounded-full transition-all duration-300"
               class:bg-accent-cyan={step >= s}
               class:scale-125={step === s}
               class:bg-border-default={step < s}>
          </div>
        {/each}
      </div>

      <!-- Step Content -->
      <div class="px-8 pb-8">
        {#if step === 1}
          <!-- Step 1: Gateway URL -->
          <div class="space-y-4">
            <div>
              <label for="setup-url" class="block text-sm font-medium text-text-secondary mb-2">
                Gateway URL
              </label>
              <input
                id="setup-url"
                type="text"
                bind:value={gatewayUrl}
                onblur={normalizeUrl}
                placeholder="openclaw.example.com"
                class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary
                       text-text-primary placeholder-text-muted text-center text-lg
                       focus:outline-none focus:border-accent-cyan focus:glow-cyan
                       transition-all duration-200"
              />
              <p class="text-xs text-text-muted mt-2 text-center">
                The URL where your OpenClaw gateway is running
              </p>
            </div>

            <div class="flex gap-3">
              <button onclick={dismiss}
                class="flex-1 px-4 py-2.5 rounded-xl border border-border-default text-text-secondary
                       hover:bg-bg-hover transition-colors text-sm">
                Skip
              </button>
              <button onclick={() => { normalizeUrl(); step = 2; }}
                disabled={!gatewayUrl.trim()}
                class="flex-1 px-4 py-2.5 rounded-xl gradient-bg text-text-primary font-medium
                       hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-all text-sm">
                Next →
              </button>
            </div>
          </div>

        {:else if step === 2}
          <!-- Step 2: Auth -->
          <div class="space-y-4">
            {#if pairingWait}
              <!-- Waiting for approval -->
              <div class="p-5 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 text-center space-y-3">
                <div class="flex justify-center">
                  <svg class="w-8 h-8 animate-spin text-accent-cyan" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
                <p class="text-sm font-medium text-text-primary">Waiting for approval...</p>
                <p class="text-xs text-text-secondary">
                  A pairing request has been sent to the gateway. The gateway owner needs to approve
                  this device from their Cortex UI or CLI.
                </p>
                <p class="text-xs text-text-muted">Auto-retrying every 5 seconds</p>
              </div>

              <button onclick={() => { stopPairingRetry(); isConnecting = false; }}
                class="w-full px-4 py-2.5 rounded-xl border border-border-default text-text-secondary
                       hover:bg-bg-hover transition-colors text-sm">
                Cancel
              </button>
            {:else}
              <div class="p-4 rounded-xl border border-accent-cyan/20 bg-accent-cyan/5">
                <p class="text-sm text-text-secondary">
                  <strong class="text-text-primary">Two ways to connect:</strong>
                </p>
                <ul class="text-sm text-text-secondary mt-2 space-y-1">
                  <li>🔗 <strong>Device pairing</strong> — just click Connect, gateway owner approves</li>
                  <li>🔑 <strong>Token</strong> — paste your gateway token for instant access</li>
                </ul>
              </div>

              {#if showToken}
                <div>
                  <label for="setup-token" class="block text-sm font-medium text-text-secondary mb-2">
                    Access Token
                  </label>
                  <input
                    id="setup-token"
                    type="password"
                    bind:value={token}
                    placeholder="Paste gateway token"
                    class="w-full px-4 py-3 rounded-xl glass border border-border-default bg-bg-secondary
                           text-text-primary placeholder-text-muted
                           focus:outline-none focus:border-accent-cyan focus:glow-cyan
                           transition-all duration-200"
                  />
                </div>
              {:else}
                <button onclick={() => showToken = true}
                  class="text-xs text-text-muted hover:text-accent-cyan transition-colors flex items-center gap-1 mx-auto">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  I have an access token
                </button>
              {/if}

              {#if error}
                <div class="p-3 rounded-xl border border-accent-red/30 bg-accent-red/10">
                  <p class="text-sm text-accent-red">{error}</p>
                </div>
              {/if}

              <div class="flex gap-3">
                <button onclick={() => { step = 1; error = ''; }}
                  class="flex-1 px-4 py-2.5 rounded-xl border border-border-default text-text-secondary
                         hover:bg-bg-hover transition-colors text-sm"
                  disabled={isConnecting}>
                  ← Back
                </button>
                <button onclick={testConnection}
                  disabled={isConnecting}
                  class="flex-1 px-4 py-2.5 rounded-xl gradient-bg text-text-primary font-medium
                         hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-all text-sm">
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
          <!-- Step 3: Success -->
          <div class="text-center space-y-4 py-4">
            <div class="text-5xl animate-bounce">🎉</div>
            <h2 class="text-xl font-bold text-text-primary">Connected!</h2>
            <p class="text-text-secondary text-sm">
              You're all set. Your gateway is ready to go.
            </p>
            <div class="pt-2">
              <button onclick={() => show = false}
                class="px-6 py-2.5 rounded-xl gradient-bg text-text-primary font-medium
                       hover:brightness-110 transition-all text-sm">
                Let's go →
              </button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
