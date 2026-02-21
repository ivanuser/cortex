class GatewayClient {
  ws = null;
  url = "";
  token = "";
  pendingRequests = /* @__PURE__ */ new Map();
  eventHandlers = /* @__PURE__ */ new Map();
  reconnectTimer = null;
  reconnectAttempt = 0;
  tickTimer = null;
  tickIntervalMs = 3e4;
  intentionalDisconnect = false;
  reqCounter = 0;
  connectNonce = null;
  connectSent = false;
  connectFallbackTimer = null;
  // Public reactive state (consumed by stores)
  connectionState = {
    status: "disconnected"
  };
  stateChangeCallbacks = /* @__PURE__ */ new Set();
  // Reconnection config
  reconnectConfig = {
    initialMs: 1e3,
    maxMs: 3e4,
    factor: 2,
    jitter: 0.1,
    maxAttempts: 0
    // 0 = infinite
  };
  constructor() {
  }
  // ─── Connection ─────────────────────────────
  connect(url, token) {
    this.url = url;
    this.token = token;
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }
  disconnect() {
    this.intentionalDisconnect = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1e3, "client disconnect");
      this.ws = null;
    }
    this.updateState({ status: "disconnected" });
  }
  get connected() {
    return this.connectionState.status === "connected";
  }
  // ─── RPC ────────────────────────────────────
  async call(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }
    const id = `req-${++this.reqCounter}-${Date.now()}`;
    const frame = { type: "req", id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 3e4);
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout
      });
      this.ws.send(JSON.stringify(frame));
    });
  }
  // ─── Events ─────────────────────────────────
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, /* @__PURE__ */ new Set());
    }
    this.eventHandlers.get(event).add(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    this.eventHandlers.get(event)?.delete(handler);
  }
  onStateChange(cb) {
    this.stateChangeCallbacks.add(cb);
    return () => this.stateChangeCallbacks.delete(cb);
  }
  // ─── Convenience Methods ────────────────────
  async chatSend(sessionKey, message, options) {
    const key = options?.idempotencyKey ?? crypto.randomUUID();
    const params = { sessionKey, message, idempotencyKey: key, deliver: false };
    if (options?.attachments?.length) {
      params.attachments = options.attachments;
    }
    return this.call("chat.send", params);
  }
  async chatHistory(sessionKey, limit) {
    const result = await this.call("chat.history", { sessionKey, limit: limit ?? 500 });
    return result.messages ?? result.transcript ?? [];
  }
  async chatAbort(sessionKey, runId) {
    await this.call("chat.abort", { sessionKey, runId });
  }
  async sessionsList(opts) {
    const result = await this.call("sessions.list", {
      limit: opts?.limit ?? 50,
      includeDerivedTitles: opts?.includeDerivedTitles ?? true,
      includeLastMessage: opts?.includeLastMessage ?? true,
      activeMinutes: opts?.activeMinutes
    });
    return result.sessions ?? result.list ?? [];
  }
  // ─── Internal ───────────────────────────────
  doConnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState({ status: "connecting" });
    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.updateState({ status: "error", error: `Failed to create WebSocket: ${e}` });
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.connectNonce = null;
      this.connectSent = false;
      this.updateState({ status: "authenticating" });
      if (this.connectFallbackTimer) clearTimeout(this.connectFallbackTimer);
      this.connectFallbackTimer = setTimeout(() => {
        this.connectFallbackTimer = null;
        this.sendConnect();
      }, 750);
    };
    this.ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data);
        this.handleFrame(frame);
      } catch {
      }
    };
    this.ws.onerror = () => {
    };
    this.ws.onclose = (ev) => {
      this.clearTimers();
      const wasPairing = ev.code === 1008 && ev.reason?.includes("pairing");
      if (wasPairing) {
        this.updateState({
          status: "error",
          error: "Device pairing required. Run: openclaw devices approve <requestId>"
        });
        return;
      }
      if (!this.intentionalDisconnect) {
        this.updateState({ status: "disconnected", error: ev.reason || void 0 });
        this.scheduleReconnect();
      }
    };
  }
  handleFrame(frame) {
    if (frame.type === "res") {
      this.handleResponse(frame);
    } else if (frame.type === "event") {
      this.handleEvent(frame);
    }
  }
  handleResponse(frame) {
    const pending = this.pendingRequests.get(frame.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload ?? {});
      } else {
        pending.reject(new Error(frame.error?.message ?? "Unknown error"));
      }
      return;
    }
    if (frame.id === "connect") {
      if (frame.ok && frame.payload && typeof frame.payload === "object" && "type" in frame.payload) {
        const hello = frame.payload;
        if (hello.type === "hello-ok") {
          this.handleHelloOk(hello);
        }
      } else if (!frame.ok) {
        const errorMsg = frame.error?.message || "Connection rejected";
        const isPairing = errorMsg.toLowerCase().includes("pair") || frame.error?.code === "PAIRING_REQUIRED" || frame.error?.code === "AUTH_REQUIRED";
        this.updateState({
          status: "error",
          error: isPairing ? "Device pairing required — waiting for gateway owner to approve this device" : errorMsg
        });
        if (isPairing) {
          this.reconnectAttempt = 5;
        }
      }
      return;
    }
    if (frame.ok && frame.payload && typeof frame.payload === "object" && "type" in frame.payload) {
      const hello = frame.payload;
      if (hello.type === "hello-ok") {
        this.handleHelloOk(hello);
      }
    }
  }
  handleEvent(frame) {
    if (frame.event === "connect.challenge") {
      const payload = frame.payload;
      this.connectNonce = payload?.nonce ?? null;
      this.connectSent = false;
      if (this.connectFallbackTimer) {
        clearTimeout(this.connectFallbackTimer);
        this.connectFallbackTimer = null;
      }
      this.sendConnect();
      return;
    } else if (frame.event === "tick") {
      this.sendTick();
    } else {
      const handlers = this.eventHandlers.get(frame.event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(frame.payload);
          } catch {
          }
        }
      }
    }
  }
  async sendConnect() {
    if (this.connectSent) return;
    this.connectSent = true;
    const role = "operator";
    const scopes = ["operator.admin", "operator.approvals", "operator.pairing"];
    let authToken = this.token === "__device_auth__" ? "" : this.token;
    let device;
    const hasSubtle = typeof crypto !== "undefined" && !!crypto.subtle;
    if (hasSubtle) {
      try {
        const {
          loadOrCreateDeviceIdentity,
          signDevicePayload,
          buildDeviceAuthPayload,
          loadDeviceAuthToken
        } = await import("./device-identity.js");
        const identity = await loadOrCreateDeviceIdentity();
        const storedToken = loadDeviceAuthToken(identity.deviceId, role);
        if (storedToken) {
          authToken = storedToken;
        }
        const signedAtMs = Date.now();
        const nonce = this.connectNonce ?? void 0;
        const payload = buildDeviceAuthPayload({
          deviceId: identity.deviceId,
          clientId: "openclaw-control-ui",
          clientMode: "webchat",
          role,
          scopes,
          signedAtMs,
          token: authToken || null,
          nonce
        });
        const signature = await signDevicePayload(identity.privateKey, payload);
        device = {
          id: identity.deviceId,
          publicKey: identity.publicKey,
          signature,
          signedAt: signedAtMs,
          nonce
        };
      } catch {
      }
    }
    const frame = {
      type: "req",
      id: "connect",
      method: "connect",
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: "openclaw-control-ui",
          displayName: "Cortex",
          version: "1.1.0",
          platform: navigator.platform || "web",
          mode: "webchat"
        },
        role,
        scopes,
        device,
        auth: authToken || void 0 ? { token: authToken } : void 0,
        userAgent: navigator.userAgent,
        locale: navigator.language
      }
    };
    this.ws?.send(JSON.stringify(frame));
  }
  handleHelloOk(hello) {
    this.reconnectAttempt = 0;
    this.tickIntervalMs = hello.policy.tickIntervalMs;
    const authPayload = hello;
    if (authPayload.auth?.deviceToken && typeof crypto !== "undefined" && !!crypto.subtle) {
      import("./device-identity.js").then(({ loadOrCreateDeviceIdentity, storeDeviceAuthToken }) => {
        loadOrCreateDeviceIdentity().then((identity) => {
          storeDeviceAuthToken({
            deviceId: identity.deviceId,
            role: authPayload.auth.role ?? "operator",
            token: authPayload.auth.deviceToken,
            scopes: authPayload.auth.scopes ?? []
          });
        });
      }).catch(() => {
      });
    }
    this.updateState({
      status: "connected",
      serverVersion: hello.server.version,
      protocol: hello.protocol,
      connId: hello.server.connId,
      mainSessionKey: hello.snapshot.sessionDefaults?.mainSessionKey,
      error: void 0
    });
    this.startTickTimer();
    const handlers = this.eventHandlers.get("hello");
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(hello);
        } catch {
        }
      }
    }
  }
  sendTick() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "req", id: `tick-${Date.now()}`, method: "tick" }));
    }
  }
  startTickTimer() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.sendTick(), this.tickIntervalMs);
  }
  scheduleReconnect() {
    if (this.intentionalDisconnect) return;
    if (this.reconnectConfig.maxAttempts > 0 && this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      this.updateState({ status: "error", error: "Max reconnection attempts reached" });
      return;
    }
    const baseDelay = Math.min(
      this.reconnectConfig.initialMs * Math.pow(this.reconnectConfig.factor, this.reconnectAttempt),
      this.reconnectConfig.maxMs
    );
    const jitter = baseDelay * this.reconnectConfig.jitter * (Math.random() * 2 - 1);
    const delay = Math.max(0, baseDelay + jitter);
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }
  clearTimers() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.connectFallbackTimer) {
      clearTimeout(this.connectFallbackTimer);
      this.connectFallbackTimer = null;
    }
  }
  updateState(update) {
    this.connectionState = { ...this.connectionState, ...update };
    for (const cb of this.stateChangeCallbacks) {
      try {
        cb(this.connectionState);
      } catch {
      }
    }
  }
}
const gateway = new GatewayClient();
function getGatewayWsUrl() {
  return "";
}
const STORAGE_KEY_URL = "cortex:gatewayUrl";
const STORAGE_KEY_TOKEN = "cortex:gatewayToken";
let connectionState = { status: "disconnected" };
let gatewayUrl = "";
let gatewayToken = "";
let initialized = false;
gateway.onStateChange((state) => {
  connectionState = state;
});
function loadSettings() {
  if (typeof window === "undefined") return { url: "", token: "" };
  const url = localStorage.getItem(STORAGE_KEY_URL) || "";
  const token = localStorage.getItem(STORAGE_KEY_TOKEN) || "";
  return { url, token };
}
function getConfiguredWsUrl() {
  return getGatewayWsUrl();
}
function saveSettings(url, token) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_TOKEN, token);
}
function validateUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}
function validateToken(token) {
  if (token.trim() === "__device_auth__") return true;
  return /^[a-f0-9]{32,128}$/i.test(token.trim());
}
function connect(url, token) {
  const u = (url ?? gatewayUrl).trim();
  const t = (token ?? gatewayToken).trim();
  if (!u || !t) return;
  if (!validateUrl(u)) {
    connectionState = {
      status: "error",
      error: "Invalid gateway URL. Must start with ws:// or wss://"
    };
    return;
  }
  if (!validateToken(t)) {
    connectionState = {
      status: "error",
      error: "Invalid token format. Expected hex string."
    };
    return;
  }
  gatewayUrl = u;
  gatewayToken = t;
  saveSettings(u, t);
  gateway.connect(u, t);
}
function clearCredentials() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  gatewayUrl = "";
  gatewayToken = "";
}
function disconnect() {
  gateway.disconnect();
}
function init() {
  if (initialized) return;
  initialized = true;
  const { url, token } = loadSettings();
  gatewayUrl = url;
  gatewayToken = token;
  if (url && token) {
    connect(url, token);
  }
}
function getConnection() {
  return {
    get state() {
      return connectionState;
    },
    get url() {
      return gatewayUrl;
    },
    set url(v) {
      gatewayUrl = v;
    },
    get token() {
      return gatewayToken;
    },
    set token(v) {
      gatewayToken = v;
    },
    get initialized() {
      return initialized;
    },
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
export {
  gateway as a,
  getConnection as g
};
