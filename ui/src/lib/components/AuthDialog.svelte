<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { getConfig } from '$lib/config';

  const conn = getConnection();
  const toasts = getToasts();

  let { 
    show = $bindable(false)
  } = $props<{
    show?: boolean;
  }>();

  // Default URL: saved settings → config.json → empty
  const configuredWs = conn.getConfiguredWsUrl();
  let gatewayUrl = $state(configuredWs || '');
  // Pre-fill token from localStorage if stored (ctx_ token)
  const storedCtxToken = typeof window !== 'undefined' ? localStorage.getItem('cortex:authToken') ?? '' : '';
  let token = $state(storedCtxToken);
  let isConnecting = $state(false);
  let error = $state('');
  let showAdvanced = $state(Boolean(storedCtxToken));
  let pairingPending = $state(false);

  // Show dialog automatically if no saved credentials
  $effect(() => {
    const isInitialized = conn.initialized;
    untrack(() => {
      if (typeof window !== 'undefined' && isInitialized) {
        const { url, token: savedToken } = conn.loadSettings();
        if (!url || !savedToken) {
          if (!gatewayUrl && configuredWs) {
            gatewayUrl = configuredWs;
          }
          show = true;
        }
      }
    });
  });

  async function handleConnect() {
    if (!gatewayUrl.trim()) {
      error = 'Gateway URL is required';
      return;
    }

    // Token is optional — device identity can handle auth
    if (!token.trim() && showAdvanced) {
      // If they opened advanced but left token empty, that's fine
    }

    error = '';
    isConnecting = true;
    pairingPending = false;

    try {
      // Use a placeholder token if none provided — device identity will handle auth
      const rawToken = token.trim();
      const authToken = rawToken || '__device_auth__';
      
      // Store ctx_ token in localStorage for gateway.ts to pick up
      if (rawToken.startsWith('ctx_')) {
        localStorage.setItem('cortex:authToken', rawToken);
      }
      
      conn.connect(gatewayUrl.trim(), authToken);
      
      // Wait for connection result
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout — check your gateway URL'));
        }, 15000);

        const unsubscribe = conn.onStateChange((state: any) => {
          if (state.status === 'connected') {
            clearTimeout(timeout);
            unsubscribe();
            resolve();
          } else if (state.status === 'error') {
            clearTimeout(timeout);
            unsubscribe();
            // Check if it's a pairing request
            if (state.error?.includes('pairing')) {
              pairingPending = true;
              reject(new Error('Device pairing required — approve this device on your gateway'));
            } else {
              reject(new Error(state.error || 'Connection failed'));
            }
          }
        });
      });

      // Connection successful
      show = false;
      pairingPending = false;
      toasts.success('Connected', 'Successfully connected to OpenClaw Gateway');
      
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection failed';
      if (!pairingPending) {
        toasts.error('Connection Failed', error);
      }
    } finally {
      isConnecting = false;
    }
  }

  function handleCancel() {
    show = false;
    error = '';
  }

  let dialogRef: HTMLDivElement | undefined = $state(undefined);

  // Focus trap: keep focus inside dialog when open
  $effect(() => {
    if (show && dialogRef) {
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length) focusable[0].focus();
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      handleConnect();
    } else if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Tab' && dialogRef) {
      // Trap focus within dialog
      const focusable = dialogRef.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
</script>

<!-- Modal overlay -->
{#if show}
  <div 
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={handleCancel}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-dialog-title"
  >
    <!-- Modal content -->
    <div 
      bind:this={dialogRef}
      class="w-full max-w-md gradient-border glass p-6 rounded-lg glow-cyan animate-in zoom-in-95 duration-300"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-lg gradient-bg flex items-center justify-center glow-purple">
          <svg class="w-6 h-6 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h2 id="auth-dialog-title" class="text-lg font-semibold gradient-text">Connect to Gateway</h2>
          <p class="text-sm text-text-muted">Enter your gateway credentials to get started</p>
        </div>
      </div>

      <!-- Form -->
      <form onsubmit={(e) => { e.preventDefault(); handleConnect(); }} class="space-y-4">
        <!-- Gateway URL -->
        <div>
          <label for="gateway-url" class="block text-sm font-medium text-text-secondary mb-2">
            Gateway URL
          </label>
          <input
            id="gateway-url"
            type="url"
            bind:value={gatewayUrl}
            placeholder="wss://your-openclaw-gateway.com"
            class="w-full px-3 py-2 rounded-lg glass border border-border-default bg-bg-secondary
                   text-text-primary placeholder-text-muted
                   focus:outline-none focus:border-accent-cyan focus:glow-cyan
                   transition-all duration-200"
            disabled={isConnecting}
            required
          />
        </div>

        <!-- Token (optional / advanced) -->
        {#if showAdvanced}
          <div>
            <label for="gateway-token" class="block text-sm font-medium text-text-secondary mb-2">
              Access Token <span class="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              id="gateway-token"
              type="password"
              bind:value={token}
              placeholder="Leave empty to use device pairing"
              class="w-full px-3 py-2 rounded-lg glass border border-border-default bg-bg-secondary
                     text-text-primary placeholder-text-muted
                     focus:outline-none focus:border-accent-cyan focus:glow-cyan
                     transition-all duration-200"
              disabled={isConnecting}
            />
            <p class="text-xs text-text-muted mt-1">
              If provided, connects immediately. If empty, your gateway owner will need to approve this device.
            </p>
          </div>
        {:else}
          <button
            type="button"
            onclick={() => showAdvanced = true}
            class="text-xs text-text-muted hover:text-accent-cyan transition-colors flex items-center gap-1"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
            I have an access token
          </button>
        {/if}

        <!-- Pairing pending state -->
        {#if pairingPending}
          <div class="p-3 rounded-lg border border-accent-amber/30 bg-accent-amber/10" role="status">
            <div class="flex items-start gap-2">
              <svg class="w-5 h-5 text-accent-amber flex-shrink-0 animate-pulse mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p class="text-sm font-medium text-accent-amber">Device Pairing Required</p>
                <p class="text-xs text-text-muted mt-1">
                  Your gateway owner needs to approve this device. Ask them to run:
                </p>
                <code class="block text-xs font-mono text-accent-cyan bg-bg-primary/50 px-2 py-1 rounded mt-1">
                  openclaw devices approve
                </code>
              </div>
            </div>
          </div>
        {/if}

        <!-- Error display -->
        {#if error && !pairingPending}
          <div class="p-3 rounded-lg border border-accent-red/30 bg-accent-red/10 glow-red" role="alert" aria-live="assertive">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-accent-red flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p class="text-sm text-accent-red">{error}</p>
            </div>
          </div>
        {/if}

        <!-- Buttons -->
        <div class="flex gap-3 pt-2">
          <button
            type="button"
            onclick={handleCancel}
            class="flex-1 px-4 py-2 rounded-lg border border-border-default text-text-secondary
                   hover:bg-bg-hover hover:text-text-primary transition-colors"
            disabled={isConnecting}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 px-4 py-2 rounded-lg gradient-bg gradient-border glow-cyan
                   text-text-primary font-medium hover:brightness-110 
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all duration-200"
            disabled={isConnecting || !gatewayUrl.trim()}
          >
            {#if isConnecting}
              <div class="flex items-center justify-center gap-2">
                <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Connecting...
              </div>
            {:else}
              Connect
            {/if}
          </button>
        </div>
      </form>

      <!-- Help text -->
      <div class="mt-4 pt-4 border-t border-border-default">
        <p class="text-xs text-text-muted text-center">
          {#if showAdvanced}
            Credentials are saved locally and remembered for future sessions.
          {:else}
            Your device will be paired with the gateway. The gateway owner will approve your access.
          {/if}
          <br />
          Need help? Check the <a href="https://docs.openclaw.ai" target="_blank" class="text-accent-cyan hover:underline">OpenClaw documentation</a>.
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes zoom-in-95 {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  
  .animate-in {
    animation-fill-mode: both;
  }
  
  .zoom-in-95 {
    animation-name: zoom-in-95;
  }
  
  .duration-300 {
    animation-duration: 300ms;
  }
</style>