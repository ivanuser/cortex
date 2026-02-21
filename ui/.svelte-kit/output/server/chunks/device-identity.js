import { signAsync, utils, getPublicKeyAsync } from "@noble/ed25519";
const IDENTITY_STORAGE_KEY = "openclaw-device-identity-v1";
const AUTH_STORAGE_KEY = "openclaw.device.auth.v1";
function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function base64UrlDecode(input) {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function fingerprintPublicKey(publicKey) {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.buffer);
  return bytesToHex(new Uint8Array(hash));
}
async function generateIdentity() {
  const privateKey = utils.randomSecretKey();
  const publicKey = await getPublicKeyAsync(privateKey);
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey)
  };
}
async function loadOrCreateDeviceIdentity() {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && typeof parsed.deviceId === "string" && typeof parsed.publicKey === "string" && typeof parsed.privateKey === "string") {
        const derivedId = await fingerprintPublicKey(base64UrlDecode(parsed.publicKey));
        if (derivedId !== parsed.deviceId) {
          const updated = { ...parsed, deviceId: derivedId };
          localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(updated));
          return { deviceId: derivedId, publicKey: parsed.publicKey, privateKey: parsed.privateKey };
        }
        return { deviceId: parsed.deviceId, publicKey: parsed.publicKey, privateKey: parsed.privateKey };
      }
    }
  } catch {
  }
  const identity = await generateIdentity();
  const stored = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now()
  };
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(stored));
  return identity;
}
async function signDevicePayload(privateKeyBase64Url, payload) {
  const key = base64UrlDecode(privateKeyBase64Url);
  const data = new TextEncoder().encode(payload);
  const sig = await signAsync(data, key);
  return base64UrlEncode(sig);
}
function buildDeviceAuthPayload(params) {
  const version = params.nonce ? "v2" : "v1";
  const scopes = params.scopes.join(",");
  const token = params.token ?? "";
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
  if (version === "v2") base.push(params.nonce ?? "");
  return base.join("|");
}
function readAuthStore() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (!parsed.deviceId || typeof parsed.deviceId !== "string") return null;
    if (!parsed.tokens || typeof parsed.tokens !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeAuthStore(store) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(store));
  } catch {
  }
}
function loadDeviceAuthToken(deviceId, role) {
  const store = readAuthStore();
  if (!store || store.deviceId !== deviceId) return null;
  const entry = store.tokens[role];
  if (!entry || typeof entry.token !== "string") return null;
  return entry.token;
}
function storeDeviceAuthToken(params) {
  const next = {
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
function clearDeviceAuthToken(deviceId, role) {
  const store = readAuthStore();
  if (!store || store.deviceId !== deviceId) return;
  if (!store.tokens[role]) return;
  const next = { ...store, tokens: { ...store.tokens } };
  delete next.tokens[role];
  writeAuthStore(next);
}
function isSecureContext() {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}
export {
  buildDeviceAuthPayload,
  clearDeviceAuthToken,
  isSecureContext,
  loadDeviceAuthToken,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  storeDeviceAuthToken
};
