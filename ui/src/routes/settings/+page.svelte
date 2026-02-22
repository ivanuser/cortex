<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getTheme, ACCENT_COLORS } from '$lib/stores/theme.svelte';
  import { getNotifications } from '$lib/notifications.svelte';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';

  const conn = getConnection();
  const theme = getTheme();
  const notif = getNotifications();

  let url = $state(conn.url || '');
  let token = $state(conn.token || '');
  let showToken = $state(false);
  let saved = $state(false);

  // User avatar
  let userAvatar = $state<string | null>(null);
  let userName = $state('');
  let avatarFileInput: HTMLInputElement | undefined = $state();

  // Load avatar from localStorage on mount
  $effect(() => {
    untrack(() => {
      if (typeof window !== 'undefined') {
        userAvatar = localStorage.getItem('cortex-user-avatar');
        userName = localStorage.getItem('cortex-user-name') || '';
      }
    });
  });

  function handleAvatarUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image too large — max 2MB');
      return;
    }
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const dataUrl = reader.result as string;
      userAvatar = dataUrl;
      localStorage.setItem('cortex-user-avatar', dataUrl);
    });
    reader.readAsDataURL(file);
    input.value = '';
  }

  function removeAvatar() {
    userAvatar = null;
    localStorage.removeItem('cortex-user-avatar');
  }

  function saveUserName() {
    localStorage.setItem('cortex-user-name', userName);
  }

  // Init notifications (reads permission + localStorage)
  $effect(() => {
    untrack(() => notif.init());
  });

  // Sync from store on mount
  $effect(() => {
    const storeUrl = conn.url;
    const storeToken = conn.token;
    untrack(() => {
      if (storeUrl && !url) url = storeUrl;
      if (storeToken && !token) token = storeToken;
    });
  });

  function handleSave() {
    conn.saveSettings(url, token);
    conn.url = url;
    conn.token = token;
    saved = true;
    setTimeout(() => saved = false, 2000);
  }

  function handleConnect() {
    conn.connect(url, token);
  }

  function handleDisconnect() {
    conn.disconnect();
  }
</script>

<svelte:head>
  <title>Settings — Cortex</title>
</svelte:head>

<div class="h-full overflow-y-auto">
  <div class="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8">
    <!-- Back link -->
    <a
      href="/"
      class="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent-cyan transition-colors mb-8"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Chat
    </a>

    <!-- Header -->
    <div class="flex items-center gap-4 mb-8">
      <img src="/logo.png" alt="Cortex" class="w-16 h-16 rounded-xl" />
      <div>
        <h1 class="text-2xl font-bold text-accent-cyan glow-text-cyan">Settings</h1>
        <p class="text-sm text-text-muted">Customize your Cortex experience</p>
      </div>
    </div>

    <!-- ═══ Appearance ═══ -->
    <div class="glass rounded-2xl p-6 space-y-6 mb-6">
      <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
        Appearance
      </h2>

      <div>
        <label class="block text-sm font-medium text-text-secondary mb-3">Accent Color</label>
        <div class="flex flex-wrap gap-3">
          {#each ACCENT_COLORS as color}
            <button
              onclick={() => theme.setAccent(color.value)}
              class="group relative w-12 h-12 rounded-xl transition-all duration-200 hover:scale-110"
              class:ring-2={theme.accentColor === color.value}
              class:ring-offset-2={theme.accentColor === color.value}
              class:ring-offset-bg-primary={theme.accentColor === color.value}
              style="background-color: {color.value}; {theme.accentColor === color.value ? `ring-color: ${color.value}; box-shadow: 0 0 20px ${color.value}44, 0 0 40px ${color.value}22;` : ''}"
              title={color.name}
              aria-label="Set accent color to {color.name}"
              aria-pressed={theme.accentColor === color.value}
            >
              {#if theme.accentColor === color.value}
                <svg class="w-5 h-5 absolute inset-0 m-auto text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              {/if}
              <!-- Tooltip -->
              <span class="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-text-muted
                opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                {color.name}
              </span>
            </button>
          {/each}
        </div>

        <!-- Custom color input -->
        <div class="mt-4 flex items-center gap-3">
          <label for="custom-accent-color" class="text-sm text-text-muted">Custom:</label>
          <input
            id="custom-accent-color"
            type="color"
            value={theme.accentColor}
            oninput={(e) => theme.setAccent((e.target as HTMLInputElement).value)}
            class="w-10 h-10 rounded-lg border border-border-default bg-bg-input cursor-pointer
              [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none
              [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-none"
          />
          <span class="text-sm font-mono text-text-muted">{theme.accentColor}</span>
        </div>
      </div>

      <!-- Preview -->
      <div class="border-t border-border-default pt-4">
        <p class="text-sm text-text-muted mb-3">Preview</p>
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-accent-cyan font-medium">Accent text</span>
          <button class="px-3 py-1.5 rounded-lg text-sm bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan glow-cyan">
            Button
          </button>
          <span class="inline-block w-3 h-3 rounded-full bg-accent-cyan glow-cyan"></span>
          <span class="text-sm text-text-secondary">
            Link: <a href="#preview" class="text-accent-cyan hover:underline">example</a>
          </span>
          <code class="text-sm font-mono px-2 py-0.5 rounded" style="background: color-mix(in srgb, {theme.accentColor} 8%, transparent); border: 1px solid color-mix(in srgb, {theme.accentColor} 15%, transparent); color: {theme.accentColor};">
            code
          </code>
        </div>
      </div>
    </div>

    <!-- ═══ Profile ═══ -->
    <div class="glass rounded-2xl p-6 space-y-6 mb-6">
      <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        Profile
      </h2>

      <div class="flex flex-col sm:flex-row items-start gap-6">
        <!-- Avatar preview & upload -->
        <div class="flex flex-col items-center gap-3">
          <div class="relative group">
            {#if userAvatar}
              <img
                src={userAvatar}
                alt="Your avatar"
                class="w-24 h-24 rounded-full object-cover border-2 border-accent-cyan/30 shadow-[0_0_15px_rgba(0,229,255,0.15)]"
              />
              <button
                onclick={removeAvatar}
                class="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold
                       flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Remove avatar"
              >×</button>
            {:else}
              <div class="w-24 h-24 rounded-full bg-accent-cyan/10 border-2 border-dashed border-accent-cyan/30
                          flex items-center justify-center">
                <svg class="w-10 h-10 text-accent-cyan/40" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            {/if}
          </div>
          <button
            onclick={() => avatarFileInput?.click()}
            class="px-3 py-1.5 rounded-lg text-xs font-medium border border-accent-cyan/30 text-accent-cyan
                   hover:bg-accent-cyan/10 transition-all"
          >
            {userAvatar ? 'Change Photo' : 'Upload Photo'}
          </button>
          <input
            bind:this={avatarFileInput}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={handleAvatarUpload}
          />
          <p class="text-[10px] text-text-muted">Max 2MB · Stored in browser</p>
        </div>

        <!-- Display name -->
        <div class="flex-1 w-full">
          <label for="user-name" class="block text-sm font-medium text-text-secondary mb-2">Display Name</label>
          <div class="flex gap-2">
            <input
              id="user-name"
              type="text"
              bind:value={userName}
              placeholder="Your name"
              class="flex-1 px-3 py-2 rounded-lg border border-border-default bg-bg-input text-sm text-text-primary
                     placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/50"
            />
            <button
              onclick={saveUserName}
              class="px-3 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 border border-accent-cyan/30
                     text-accent-cyan hover:bg-accent-cyan/30 transition-all"
            >Save</button>
          </div>
          <p class="text-xs text-text-muted mt-1.5">Shown next to your messages in chat</p>
        </div>
      </div>
    </div>

    <!-- ═══ Notifications ═══ -->
    <div class="glass rounded-2xl p-6 space-y-6 mb-6">
      <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        Notifications
      </h2>

      {#if !notif.supported}
        <p class="text-sm text-text-muted">
          Your browser does not support notifications.
        </p>
      {:else}
        <!-- Permission status -->
        <div class="flex items-center gap-3">
          <span class="text-sm text-text-secondary">Permission:</span>
          {#if notif.permission === 'granted'}
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-green-400">
              <span class="w-2 h-2 rounded-full bg-green-400"></span>
              Granted
            </span>
          {:else if notif.permission === 'denied'}
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-red-400">
              <span class="w-2 h-2 rounded-full bg-red-400"></span>
              Denied
            </span>
          {:else}
            <span class="inline-flex items-center gap-1.5 text-sm font-medium text-yellow-400">
              <span class="w-2 h-2 rounded-full bg-yellow-400"></span>
              Not requested
            </span>
          {/if}
        </div>

        {#if notif.permission === 'default'}
          <button
            onclick={() => notif.requestPermission()}
            class="px-5 py-2.5 rounded-xl text-sm font-medium
              bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan
              hover:bg-accent-cyan/30 transition-all glow-cyan"
          >
            Enable Notifications
          </button>
        {/if}

        {#if notif.permission === 'denied'}
          <p class="text-sm text-red-400/80 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            Notifications are blocked. To enable them, open your browser's site settings and allow notifications for this site.
          </p>
        {/if}

        {#if notif.permission === 'granted'}
          <!-- Toggle: Notify on new messages -->
          <label class="flex items-center justify-between cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-text-primary">Notify on new messages</p>
              <p class="text-xs text-text-muted">Show a notification when a message arrives while the tab is in the background</p>
            </div>
            <button
              role="switch"
              aria-checked={notif.notifyOnMessages}
              onclick={() => notif.setNotifyOnMessages(!notif.notifyOnMessages)}
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200
                {notif.notifyOnMessages ? 'bg-accent-cyan' : 'bg-bg-tertiary'}"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200
                  {notif.notifyOnMessages ? 'translate-x-5' : 'translate-x-0'}"
              ></span>
            </button>
          </label>

          <!-- Toggle: Notify on connection lost -->
          <label class="flex items-center justify-between cursor-pointer group">
            <div>
              <p class="text-sm font-medium text-text-primary">Notify on connection lost</p>
              <p class="text-xs text-text-muted">Show a notification if the gateway connection drops</p>
            </div>
            <button
              role="switch"
              aria-checked={notif.notifyOnDisconnect}
              onclick={() => notif.setNotifyOnDisconnect(!notif.notifyOnDisconnect)}
              class="relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200
                {notif.notifyOnDisconnect ? 'bg-accent-cyan' : 'bg-bg-tertiary'}"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform duration-200
                  {notif.notifyOnDisconnect ? 'translate-x-5' : 'translate-x-0'}"
              ></span>
            </button>
          </label>
        {/if}
      {/if}
    </div>

    <!-- ═══ Connection ═══ -->
    <div class="mb-6">
      <ConnectionStatus />
    </div>

    <div class="glass rounded-2xl p-6 space-y-6 mb-6">
      <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
        <svg class="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
        </svg>
        Gateway Connection
      </h2>

      <!-- URL -->
      <div>
        <label for="gateway-url" class="block text-sm font-medium text-text-secondary mb-2">
          Gateway WebSocket URL
        </label>
        <input
          id="gateway-url"
          type="text"
          bind:value={url}
          placeholder="ws://192.168.1.242:18789 or wss://openclaw.honercloud.com"
          class="w-full px-4 py-3 rounded-xl bg-bg-input border border-border-default
            text-text-primary placeholder:text-text-muted text-sm font-mono
            focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20
            transition-all"
        />
        <p class="text-xs text-text-muted mt-1.5">
          Use <code class="text-accent-cyan">ws://</code> for local, <code class="text-accent-cyan">wss://</code> for TLS
        </p>
      </div>

      <!-- Token -->
      <div>
        <label for="gateway-token" class="block text-sm font-medium text-text-secondary mb-2">
          Auth Token
        </label>
        <div class="relative">
          <input
            id="gateway-token"
            type={showToken ? 'text' : 'password'}
            bind:value={token}
            placeholder="Gateway authentication token"
            class="w-full px-4 py-3 pr-12 rounded-xl bg-bg-input border border-border-default
              text-text-primary placeholder:text-text-muted text-sm font-mono
              focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20
              transition-all"
          />
          <button
            onclick={() => showToken = !showToken}
            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
            type="button"
            aria-label={showToken ? 'Hide token' : 'Show token'}
          >
            {#if showToken}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            {:else}
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            {/if}
          </button>
        </div>
        <p class="text-xs text-text-muted mt-1.5">
          Find this in <code class="text-accent-cyan">~/.openclaw/openclaw.json</code> → <code class="text-accent-cyan">gateway.auth.token</code>
        </p>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-3 pt-2">
        <button
          onclick={handleSave}
          class="px-5 py-2.5 rounded-xl text-sm font-medium
            bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan
            hover:bg-accent-cyan/30 transition-all glow-cyan"
        >
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>

        {#if conn.state.status === 'connected'}
          <button
            onclick={handleDisconnect}
            class="px-5 py-2.5 rounded-xl text-sm font-medium
              bg-red-500/20 border border-red-500/30 text-red-400
              hover:bg-red-500/30 transition-all"
          >
            Disconnect
          </button>
        {:else}
          <button
            onclick={handleConnect}
            disabled={!url || !token}
            class="px-5 py-2.5 rounded-xl text-sm font-medium
              {url && token
                ? 'bg-accent-purple/20 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/30 glow-purple'
                : 'bg-bg-tertiary border border-border-default text-text-muted cursor-not-allowed opacity-50'
              } transition-all"
          >
            Connect
          </button>
        {/if}
      </div>
    </div>

    <!-- ═══ About ═══ -->
    <div class="glass rounded-2xl p-6">
      <h2 class="text-lg font-semibold text-text-primary mb-4">About Cortex</h2>
      <div class="space-y-3 text-sm text-text-secondary">
        <p><strong class="text-text-primary">Version:</strong> {conn.state.serverVersion || 'connecting...'}</p>
        <p><strong class="text-text-primary">Protocol:</strong> OpenClaw Gateway WS v3</p>
        <p><strong class="text-text-primary">Source:</strong>
          <a href="https://github.com/ivanuser/cortex" target="_blank" rel="noopener" class="text-accent-cyan hover:underline">
            github.com/ivanuser/cortex
          </a>
        </p>
        <p class="text-text-muted text-xs mt-4">
          Cortex is a cyberpunk command center for OpenClaw — connecting directly to the Gateway WebSocket
          for real-time chat, session management, and system control.
        </p>
      </div>
    </div>
  </div>
</div>
