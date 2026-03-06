<script lang="ts">
  import { untrack } from 'svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getTheme, ACCENT_COLORS } from '$lib/stores/theme.svelte';
  import { getNotifications } from '$lib/notifications.svelte';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';
  import MatrixRain from '$lib/components/MatrixRain.svelte';
  import CRTOverlay from '$lib/components/CRTOverlay.svelte';

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
  <title>Settings -- Cortex</title>
</svelte:head>

<MatrixRain />
<CRTOverlay />

<div class="hud-page">
  <!-- TOP BAR -->
  <div class="hud-page-topbar">
    <div class="flex items-center gap-4">
      <a href="/overview" class="hud-back">&larr; BACK</a>
      <div class="hud-page-title">SETTINGS</div>
    </div>
  </div>

  <div class="hud-scroll">
    <!-- ═══ Appearance ═══ -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">APPEARANCE</div>

      <div class="hud-section">
        <div class="hud-field-lbl">ACCENT COLOR</div>
        <div class="hud-color-grid">
          {#each ACCENT_COLORS as color}
            <button
              onclick={() => theme.setAccent(color.value)}
              class="hud-color-swatch"
              class:active={theme.accentColor === color.value}
              style="background-color: {color.value}; {theme.accentColor === color.value ? `box-shadow: 0 0 14px ${color.value}88, inset 0 0 8px rgba(255,255,255,0.2);` : ''}"
              title={color.name}
              aria-label="Set accent color to {color.name}"
              aria-pressed={theme.accentColor === color.value}
            >
              {#if theme.accentColor === color.value}
                <svg class="w-4 h-4 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>

        <!-- Custom color input -->
        <div class="hud-custom-color">
          <span class="hud-field-lbl" style="margin-bottom:0">CUSTOM:</span>
          <input
            id="custom-accent-color"
            type="color"
            value={theme.accentColor}
            oninput={(e) => theme.setAccent((e.target as HTMLInputElement).value)}
            class="hud-color-input"
          />
          <span class="hud-mono-val">{theme.accentColor}</span>
        </div>
      </div>

      <!-- Background animation toggle -->
      <div class="hud-divider"></div>
      <div class="hud-toggle-row">
        <div>
          <div class="hud-toggle-label">BACKGROUND ANIMATION</div>
          <div class="hud-hint" style="margin-top:2px">Matrix rain effect behind all pages</div>
        </div>
        <button
          role="switch"
          aria-checked={theme.bgAnimation}
          onclick={() => theme.setBgAnimation(!theme.bgAnimation)}
          class="hud-switch"
          class:on={theme.bgAnimation}
        >
          <span class="hud-switch-thumb" class:on={theme.bgAnimation}></span>
        </button>
      </div>

      <!-- Brightness slider -->
      <div class="hud-divider"></div>
      <div class="hud-section">
        <div class="hud-field-lbl">BRIGHTNESS</div>
        <div class="hud-brightness-row">
          <span class="hud-brightness-icon">🌑</span>
          <input
            type="range"
            min="0"
            max="100"
            value={theme.brightness}
            oninput={(e) => theme.setBrightness(parseInt((e.target as HTMLInputElement).value))}
            class="hud-brightness-slider"
            aria-label="Adjust brightness"
          />
          <span class="hud-brightness-icon">☀️</span>
          <span class="hud-mono-val" style="min-width:3ch; text-align:right">{theme.brightness}</span>
        </div>
        <span class="hud-hint">Adjusts panel backgrounds, scanlines, and vignette intensity</span>
      </div>

      <!-- Preview -->
      <div class="hud-divider"></div>
      <div class="hud-section">
        <div class="hud-field-lbl">PREVIEW</div>
        <div class="hud-preview-row">
          <span style="color: var(--color-accent-cyan)">Accent text</span>
          <button class="hud-btn">BUTTON</button>
          <span class="hud-dot-preview"></span>
          <span class="hud-mono-val">
            Link: <a href="#preview" style="color: var(--color-accent-cyan)">example</a>
          </span>
          <code class="hud-code-preview" style="background: color-mix(in srgb, {theme.accentColor} 8%, transparent); border-color: color-mix(in srgb, {theme.accentColor} 15%, transparent); color: {theme.accentColor};">
            code
          </code>
        </div>
      </div>
    </div>

    <!-- ═══ Profile ═══ -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">PROFILE</div>

      <div class="hud-profile-row">
        <!-- Avatar preview & upload -->
        <div class="hud-avatar-col">
          <div class="hud-avatar-wrap">
            {#if userAvatar}
              <img
                src={userAvatar}
                alt="Your avatar"
                class="hud-avatar-img"
              />
              <button
                onclick={removeAvatar}
                class="hud-avatar-remove"
                aria-label="Remove avatar"
              >x</button>
            {:else}
              <div class="hud-avatar-placeholder">
                <svg class="w-10 h-10" style="color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent)" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
            {/if}
          </div>
          <button
            onclick={() => avatarFileInput?.click()}
            class="hud-btn"
          >
            {userAvatar ? 'CHANGE PHOTO' : 'UPLOAD PHOTO'}
          </button>
          <input
            bind:this={avatarFileInput}
            type="file"
            accept="image/*"
            class="hidden"
            onchange={handleAvatarUpload}
          />
          <span class="hud-hint">Max 2MB // Stored in browser</span>
        </div>

        <!-- Display name -->
        <div class="hud-name-col">
          <div class="hud-field-lbl">DISPLAY NAME</div>
          <div class="hud-input-row">
            <input
              id="user-name"
              type="text"
              bind:value={userName}
              placeholder="Your name"
              class="hud-input"
            />
            <button
              onclick={saveUserName}
              class="hud-btn"
            >SAVE</button>
          </div>
          <span class="hud-hint">Shown next to your messages in chat</span>
        </div>
      </div>
    </div>

    <!-- ═══ Notifications ═══ -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">NOTIFICATIONS</div>

      {#if !notif.supported}
        <div class="hud-hint">Your browser does not support notifications.</div>
      {:else}
        <!-- Permission status -->
        <div class="hud-srow">
          <span class="hud-sk">PERMISSION</span>
          {#if notif.permission === 'granted'}
            <span class="hud-sv" style="color:var(--color-accent-green)">GRANTED</span>
          {:else if notif.permission === 'denied'}
            <span class="hud-sv" style="color:#ff3864">DENIED</span>
          {:else}
            <span class="hud-sv" style="color:var(--color-accent-amber)">NOT REQUESTED</span>
          {/if}
        </div>

        {#if notif.permission === 'default'}
          <div style="margin-top:12px">
            <button
              onclick={() => notif.requestPermission()}
              class="hud-btn"
            >
              ENABLE NOTIFICATIONS
            </button>
          </div>
        {/if}

        {#if notif.permission === 'denied'}
          <div class="hud-warning">
            Notifications are blocked. To enable them, open your browser's site settings and allow notifications for this site.
          </div>
        {/if}

        {#if notif.permission === 'granted'}
          <!-- Toggle: Notify on new messages -->
          <div class="hud-toggle-row">
            <div>
              <div class="hud-toggle-label">NOTIFY ON NEW MESSAGES</div>
              <div class="hud-hint">Show a notification when a message arrives while the tab is in the background</div>
            </div>
            <button
              role="switch"
              aria-checked={notif.notifyOnMessages}
              onclick={() => notif.setNotifyOnMessages(!notif.notifyOnMessages)}
              class="hud-switch"
              class:on={notif.notifyOnMessages}
            >
              <span class="hud-switch-thumb" class:on={notif.notifyOnMessages}></span>
            </button>
          </div>

          <!-- Toggle: Notify on connection lost -->
          <div class="hud-toggle-row">
            <div>
              <div class="hud-toggle-label">NOTIFY ON CONNECTION LOST</div>
              <div class="hud-hint">Show a notification if the gateway connection drops</div>
            </div>
            <button
              role="switch"
              aria-checked={notif.notifyOnDisconnect}
              onclick={() => notif.setNotifyOnDisconnect(!notif.notifyOnDisconnect)}
              class="hud-switch"
              class:on={notif.notifyOnDisconnect}
            >
              <span class="hud-switch-thumb" class:on={notif.notifyOnDisconnect}></span>
            </button>
          </div>
        {/if}
      {/if}
    </div>

    <!-- ═══ Connection Status ═══ -->
    <div style="margin-bottom:0">
      <ConnectionStatus />
    </div>

    <!-- ═══ Gateway Connection ═══ -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">GATEWAY CONNECTION</div>

      <!-- URL -->
      <div class="hud-section">
        <div class="hud-field-lbl">GATEWAY WEBSOCKET URL</div>
        <input
          id="gateway-url"
          type="text"
          bind:value={url}
          placeholder="ws://192.168.1.242:18789 or wss://openclaw.honercloud.com"
          class="hud-input"
        />
        <span class="hud-hint">
          Use <code style="color:var(--color-accent-cyan)">ws://</code> for local,
          <code style="color:var(--color-accent-cyan)">wss://</code> for TLS
        </span>
      </div>

      <!-- Token -->
      <div class="hud-section">
        <div class="hud-field-lbl">AUTH TOKEN</div>
        <div class="hud-input-row">
          <input
            id="gateway-token"
            type={showToken ? 'text' : 'password'}
            bind:value={token}
            placeholder="Gateway authentication token"
            class="hud-input"
            style="flex:1"
          />
          <button
            onclick={() => showToken = !showToken}
            class="hud-btn"
            type="button"
            aria-label={showToken ? 'Hide token' : 'Show token'}
          >
            {showToken ? 'HIDE' : 'SHOW'}
          </button>
        </div>
        <span class="hud-hint">
          Find this in <code style="color:var(--color-accent-cyan)">~/.openclaw/openclaw.json</code> &rarr;
          <code style="color:var(--color-accent-cyan)">gateway.auth.token</code>
        </span>
      </div>

      <!-- Action buttons -->
      <div class="hud-actions">
        <button
          onclick={handleSave}
          class="hud-btn"
        >
          {saved ? '// SAVED' : 'SAVE SETTINGS'}
        </button>

        {#if conn.state.status === 'connected'}
          <button
            onclick={handleDisconnect}
            class="hud-btn hud-btn-danger"
          >
            DISCONNECT
          </button>
        {:else}
          <button
            onclick={handleConnect}
            disabled={!url || !token}
            class="hud-btn hud-btn-purple"
          >
            CONNECT
          </button>
        {/if}
      </div>
    </div>

    <!-- ═══ About ═══ -->
    <div class="hud-panel">
      <div class="hud-panel-lbl">ABOUT CORTEX</div>
      <div class="hud-srow"><span class="hud-sk">VERSION</span><span class="hud-sv">{conn.state.serverVersion || 'connecting...'}</span></div>
      <div class="hud-srow"><span class="hud-sk">PROTOCOL</span><span class="hud-sv">OpenClaw Gateway WS v3</span></div>
      <div class="hud-srow">
        <span class="hud-sk">SOURCE</span>
        <a href="https://github.com/ivanuser/cortex" target="_blank" rel="noopener" class="hud-sv" style="color:var(--color-accent-cyan);text-decoration:none">
          github.com/ivanuser/cortex
        </a>
      </div>
      <div class="hud-hint" style="margin-top:12px">
        Cortex is a cyberpunk command center for OpenClaw -- connecting directly to the Gateway WebSocket
        for real-time chat, session management, and system control.
      </div>
    </div>
  </div>
</div>

<style>
  /* ═══ PAGE LAYOUT ═══ */
  .hud-page {
    position: relative;
    z-index: 10;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 18px 22px;
    gap: 14px;
    overflow: hidden;
    font-family: 'Share Tech Mono', monospace;
    color: var(--color-accent-cyan);
  }

  .hud-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 720px;
    width: 100%;
    margin: 0 auto;
    padding-bottom: 60px;
  }

  /* ═══ TOP BAR ═══ */
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
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    text-decoration: none;
    transition: color 0.2s;
  }

  .hud-back:hover {
    color: var(--color-accent-cyan);
  }

  .hud-page-title {
    font-family: 'Orbitron', sans-serif;
    font-size: 1.4rem;
    font-weight: 900;
    letter-spacing: 0.25em;
    color: var(--color-accent-cyan);
    text-shadow: 0 0 20px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent),
                 0 0 60px color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
  }

  /* ═══ PANEL ═══ */
  .hud-panel {
    background: color-mix(in srgb, var(--color-accent-cyan) var(--hud-panel-mix, 10%), var(--color-bg-secondary, #151d30));
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 22%, transparent);
    border-radius: 4px;
    padding: 20px 20px 24px 20px;
    position: relative;
    overflow: visible;
  }

  .hud-panel::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--color-accent-cyan), transparent);
    opacity: 0.5;
    pointer-events: none;
  }

  .hud-panel-lbl {
    font-family: 'Orbitron', sans-serif;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: color-mix(in srgb, var(--color-accent-cyan) 70%, transparent);
    text-transform: uppercase;
    margin-bottom: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  /* ═══ ROWS ═══ */
  .hud-srow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
    font-size: 0.8rem;
  }

  .hud-srow:last-child { border-bottom: none; }

  .hud-sk {
    color: color-mix(in srgb, var(--color-accent-cyan) 58%, transparent);
    letter-spacing: 0.08em;
  }

  .hud-sv {
    color: var(--color-accent-cyan);
  }

  /* ═══ BUTTONS ═══ */
  .hud-btn {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.78rem;
    letter-spacing: 0.15em;
    color: var(--color-accent-cyan);
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 40%, transparent);
    padding: 10px 22px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--color-accent-cyan) 8%, transparent);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
    text-transform: uppercase;
  }

  .hud-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
  }

  .hud-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .hud-btn-danger {
    color: #ff3864;
    border-color: color-mix(in srgb, #ff3864 40%, transparent);
    background: color-mix(in srgb, #ff3864 8%, transparent);
  }

  .hud-btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, #ff3864 15%, transparent);
    border-color: #ff3864;
    box-shadow: 0 0 12px color-mix(in srgb, #ff3864 30%, transparent);
  }

  .hud-btn-purple {
    color: var(--color-accent-purple);
    border-color: color-mix(in srgb, var(--color-accent-purple) 40%, transparent);
    background: color-mix(in srgb, var(--color-accent-purple) 8%, transparent);
  }

  .hud-btn-purple:hover:not(:disabled) {
    background: color-mix(in srgb, var(--color-accent-purple) 15%, transparent);
    border-color: var(--color-accent-purple);
    box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent-purple) 30%, transparent);
  }

  /* ═══ INPUTS ═══ */
  .hud-input {
    width: 100%;
    padding: 10px 14px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 30%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 4%, var(--color-bg-primary, #0d1220));
    color: var(--color-accent-cyan);
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.82rem;
    letter-spacing: 0.04em;
    outline: none;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .hud-input::placeholder {
    color: color-mix(in srgb, var(--color-accent-cyan) 35%, transparent);
  }

  .hud-input:focus {
    border-color: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-input-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  /* ═══ SECTIONS & HELPERS ═══ */
  .hud-section {
    margin-bottom: 14px;
  }

  .hud-section:last-child {
    margin-bottom: 0;
  }

  .hud-field-lbl {
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    color: color-mix(in srgb, var(--color-accent-cyan) 65%, transparent);
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .hud-hint {
    font-size: 0.72rem;
    letter-spacing: 0.06em;
    color: color-mix(in srgb, var(--color-accent-cyan) 55%, transparent);
    margin-top: 8px;
    margin-bottom: 4px;
    display: block;
  }

  .hud-mono-val {
    font-size: 0.78rem;
    color: color-mix(in srgb, var(--color-accent-cyan) 65%, transparent);
  }

  .hud-divider {
    border-top: 1px solid color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
    margin: 14px 0;
  }

  .hud-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  .hud-warning {
    font-size: 0.72rem;
    color: #ff3864;
    border: 1px solid color-mix(in srgb, #ff3864 25%, transparent);
    background: color-mix(in srgb, #ff3864 6%, transparent);
    padding: 10px 14px;
    border-radius: 2px;
    margin-top: 10px;
    letter-spacing: 0.04em;
  }

  /* ═══ COLOR PICKER ═══ */
  .hud-color-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .hud-color-swatch {
    width: 36px;
    height: 36px;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.1);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hud-color-swatch:hover {
    transform: scale(1.12);
  }

  .hud-color-swatch.active {
    border-color: rgba(255,255,255,0.4);
  }

  .hud-custom-color {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }

  .hud-color-input {
    width: 36px;
    height: 36px;
    border-radius: 3px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: rgba(0,0,0,0.3);
    cursor: pointer;
    padding: 2px;
  }

  .hud-color-input::-webkit-color-swatch-wrapper { padding: 2px; }
  .hud-color-input::-webkit-color-swatch { border-radius: 2px; border: none; }
  .hud-color-input::-moz-color-swatch { border-radius: 2px; border: none; }

  /* ═══ PREVIEW ═══ */
  .hud-preview-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 0.78rem;
  }

  .hud-dot-preview {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-accent-cyan);
    box-shadow: 0 0 8px var(--color-accent-cyan);
  }

  .hud-code-preview {
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 2px;
    border: 1px solid;
  }

  /* ═══ PROFILE ═══ */
  .hud-profile-row {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }

  @media (max-width: 560px) {
    .hud-profile-row {
      flex-direction: column;
    }
  }

  .hud-avatar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
    padding-bottom: 8px;
  }

  .hud-avatar-wrap {
    position: relative;
    width: 88px;
    height: 88px;
  }

  .hud-avatar-img {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 15px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-avatar-placeholder {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    border: 2px dashed color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    background: color-mix(in srgb, var(--color-accent-cyan) 10%, #0a0e1a);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hud-avatar-remove {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #ff3864;
    color: white;
    font-size: 0.65rem;
    font-weight: bold;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }

  .hud-avatar-wrap:hover .hud-avatar-remove {
    opacity: 1;
  }

  .hud-name-col {
    flex: 1;
    min-width: 0;
  }

  /* ═══ TOGGLE SWITCH ═══ */
  .hud-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--color-accent-cyan) 15%, transparent);
  }

  .hud-toggle-row:last-child {
    border-bottom: none;
  }

  .hud-toggle-label {
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    color: var(--color-accent-cyan);
  }

  .hud-switch {
    position: relative;
    width: 40px;
    height: 22px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    background: rgba(0,0,0,0.3);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.2s;
    padding: 0;
  }

  .hud-switch.on {
    background: color-mix(in srgb, var(--color-accent-cyan) 25%, transparent);
    border-color: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--color-accent-cyan) 20%, transparent);
  }

  .hud-switch-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    transition: all 0.2s;
  }

  .hud-switch-thumb.on {
    left: 20px;
    background: var(--color-accent-cyan);
    box-shadow: 0 0 6px var(--color-accent-cyan);
  }

  /* ═══ BRIGHTNESS SLIDER ═══ */
  .hud-brightness-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .hud-brightness-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .hud-brightness-slider {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: linear-gradient(90deg,
      color-mix(in srgb, var(--color-accent-cyan) 10%, #000),
      color-mix(in srgb, var(--color-accent-cyan) 60%, #fff)
    );
    outline: none;
    cursor: pointer;
  }

  .hud-brightness-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    cursor: pointer;
    border: 2px solid rgba(255,255,255,0.2);
  }

  .hud-brightness-slider::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-accent-cyan);
    box-shadow: 0 0 10px color-mix(in srgb, var(--color-accent-cyan) 50%, transparent);
    cursor: pointer;
    border: 2px solid rgba(255,255,255,0.2);
  }
</style>
