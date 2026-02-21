/**
 * Device Identity — Ed25519 keypair for gateway device authentication.
 *
 * Each browser instance gets a unique device identity stored in localStorage.
 * The gateway uses this to:
 * 1. Identify returning devices (no re-pairing needed)
 * 2. Issue per-device auth tokens (more secure than shared tokens)
 * 3. Support device pairing/approval flow for new installations
 */
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';

const IDENTITY_STORAGE_KEY = 'openclaw-device-identity-v1';
const AUTH_STORAGE_KEY = 'openclaw.device.auth.v1';

// ─── Types ─────────────────────────────────────

interface StoredIdentity {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
}

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;   // base64url
  privateKey: string;  // base64url
}

interface DeviceAuthEntry {
  token: string;
  role: string;
  scopes: string[];
  updatedAtMs: number;
}

interface DeviceAuthStore {
  version: 1;
  deviceId: string;
  tokens: Record<string, DeviceAuthEntry>;
}

// ─── Base64url Utilities ───────────────────────

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.buffer);
  return bytesToHex(new Uint8Array(hash));
}

// ─── Device Identity ───────────────────────────

async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey)
  };
}

/**
 * Load existing device identity or create a new one.
 * Stored in localStorage. Persists across sessions.
 */
export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKey === 'string' &&
        typeof parsed.privateKey === 'string'
      ) {
        // Re-derive device ID from public key to ensure consistency
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = { ...parsed, deviceId: derivedId };
          localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(updated));
          return { deviceId: derivedId, publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        }
        return { deviceId: parsed.deviceId, publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      }
    }
  } catch { /* fall through to regenerate */ }

  const identity = await generateIdentity();
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now()
  };
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

/**
 * Sign a payload string with the device's private key.
 * Returns base64url-encoded Ed25519 signature.
 */
export async function signDevicePayload(privateKeyBase64Url: string, payload: string): Promise<string> {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}

// ─── Device Auth Payload ───────────────────────

/**
 * Build the canonical payload string for device authentication.
 * Must match the gateway's buildDeviceAuthPayload exactly.
 */
export function buildDeviceAuthPayload(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce?: string | null;
}): string {
  const version = params.nonce ? 'v2' : 'v1';
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token
  ];
  if (version === 'v2') base.push(params.nonce ?? '');
  return base.join('|');
}

// ─── Device Auth Token Storage ─────────────────

function readAuthStore(): DeviceAuthStore | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceAuthStore;
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.deviceId || typeof parsed.deviceId !== 'string') return null;
    if (!parsed.tokens || typeof parsed.tokens !== 'object') return null;
    return parsed;
  } catch { return null; }
}

function writeAuthStore(store: DeviceAuthStore): void {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch { /* best-effort */ }
}

/**
 * Load a stored device auth token for the given device and role.
 */
export function loadDeviceAuthToken(deviceId: string, role: string): string | null {
  const store = readAuthStore();
  if (!store || store.deviceId !== deviceId) return null;
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== 'string') return null;
  return entry.token;
}

/**
 * Store a device auth token issued by the gateway.
 */
export function storeDeviceAuthToken(params: {
  deviceId: string;
  role: string;
  token: string;
  scopes?: string[];
}): void {
  const next: DeviceAuthStore = {
    version: 1,
    deviceId: params.deviceId,
    tokens: {}
  };
  const existing = readAuthStore();
  if (existing && existing.deviceId === params.deviceId) {
    next.tokens = { ...existing.tokens };
  }
  next.tokens[params.role] = {
    token: params.token,
    role: params.role,
    scopes: params.scopes ?? [],
    updatedAtMs: Date.now()
  };
  writeAuthStore(next);
}

/**
 * Clear a stored device auth token.
 */
export function clearDeviceAuthToken(deviceId: string, role: string): void {
  const store = readAuthStore();
  if (!store || store.deviceId !== deviceId) return;
  if (!store.tokens[role]) return;
  const next = { ...store, tokens: { ...store.tokens } };
  delete next.tokens[role];
  writeAuthStore(next);
}

/**
 * Check if crypto.subtle is available (HTTPS or localhost required).
 */
export function isSecureContext(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}
