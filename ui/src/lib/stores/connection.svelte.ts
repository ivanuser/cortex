/**
 * Connection store — manages gateway URL, token, and connection status
 */
import { gateway, type ConnectionState } from '$lib/gateway';
import { getConfig, getGatewayWsUrl } from '$lib/config';

const STORAGE_KEY_URL = 'cortex:gatewayUrl';
const STORAGE_KEY_TOKEN = 'cortex:gatewayToken';

// ─── Reactive state ────────────────────────────

let connectionState = $state<ConnectionState>({ status: 'disconnected' });
let gatewayUrl = $state('');
let gatewayToken = $state('');
let initialized = $state(false);

// ─── Gateway state sync ────────────────────────

gateway.onStateChange((state) => {
  connectionState = state;
});

// ─── Functions ─────────────────────────────────

function loadSettings(): { url: string; token: string } {
  if (typeof window === 'undefined') return { url: '', token: '' };
  // Saved user settings take priority
  const url = localStorage.getItem(STORAGE_KEY_URL) || '';
  const token = localStorage.getItem(STORAGE_KEY_TOKEN) || '';
  return { url, token };
}

/** Get the pre-configured gateway WS URL from config.json (if any) */
function getConfiguredWsUrl(): string {
  return getGatewayWsUrl();
}

function saveSettings(url: string, token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

function validateToken(token: string): boolean {
  // Device auth placeholder is valid (no token needed for device pairing)
  if (token.trim() === '__device_auth__') return true;
  // Token should be a hex string, 32-64 chars
  return /^[a-f0-9]{32,128}$/i.test(token.trim());
}

function connect(url?: string, token?: string): void {
  const u = (url ?? gatewayUrl).trim();
  const t = (token ?? gatewayToken).trim();
  if (!u || !t) return;

  // Validate inputs before connecting
  if (!validateUrl(u)) {
    connectionState = { status: 'error', error: 'Invalid gateway URL. Must start with ws:// or wss://' };
    return;
  }
  if (!validateToken(t)) {
    connectionState = { status: 'error', error: 'Invalid token format. Expected hex string.' };
    return;
  }

  gatewayUrl = u;
  gatewayToken = t;
  saveSettings(u, t);
  gateway.connect(u, t);
}

function clearCredentials(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  gatewayUrl = '';
  gatewayToken = '';
}

function disconnect(): void {
  gateway.disconnect();
}

function init(): void {
  if (initialized) return;
  initialized = true;
  const { url, token } = loadSettings();
  gatewayUrl = url;
  gatewayToken = token;
  if (url && token) {
    connect(url, token);
  }
}

// ─── Export ────────────────────────────────────

export function getConnection() {
  return {
    get state() { return connectionState; },
    get url() { return gatewayUrl; },
    set url(v: string) { gatewayUrl = v; },
    get token() { return gatewayToken; },
    set token(v: string) { gatewayToken = v; },
    get initialized() { return initialized; },
    connect,
    disconnect,
    init,
    saveSettings,
    loadSettings,
    clearCredentials,
    validateUrl,
    validateToken,
    getConfiguredWsUrl,
    onStateChange: gateway.onStateChange.bind(gateway)
  };
}
