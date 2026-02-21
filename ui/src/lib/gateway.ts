/**
 * OpenClaw Gateway WebSocket Client
 * Handles connection, auth, RPC calls, and event streaming.
 */

// ═══ Protocol Types ═══════════════════════════════

export interface WsRequest {
  type: 'req';
  id: string;
  method: string;
  params?: unknown;
}

export interface WsResponse {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
}

export interface WsEvent {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
}

export type WsFrame = WsRequest | WsResponse | WsEvent;

// ═══ Chat Types ═══════════════════════════════════

export interface ChatEvent {
  runId: string;
  sessionKey: string;
  seq: number;
  state: 'delta' | 'final' | 'aborted' | 'error';
  message?: ChatMessage;
  errorMessage?: string;
  usage?: unknown;
  stopReason?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  name?: string;
  timestamp?: number;
  // transcript fields
  ts?: number;
  channel?: string;
  meta?: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name?: string;
  content?: string;
  isError?: boolean;
}

// ═══ Session Types ════════════════════════════════

export interface Session {
  key: string;
  agentId: string;
  label?: string;
  derivedTitle?: string;
  lastMessage?: string;
  lastActivity?: number;
  lastActivityAt?: string;
  spawnedBy?: string;
  spawnDepth?: number;
  channel?: string;
  status?: string;
  model?: string;
  provider?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  tokenCount?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  messageCount?: number;
  createdAt?: string | number;
}

export interface HelloOk {
  type: 'hello-ok';
  protocol: number;
  server: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  snapshot: {
    presence: unknown[];
    health: unknown;
    stateVersion: { presence: number; health: number };
    uptimeMs: number;
    sessionDefaults?: {
      defaultAgentId: string;
      mainKey: string;
      mainSessionKey: string;
    };
    authMode?: string;
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

// ═══ Connection State ═════════════════════════════

export type ConnectionStatus = 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  error?: string;
  serverVersion?: string;
  protocol?: number;
  connId?: string;
  mainSessionKey?: string;
}

// ═══ Event Emitter ════════════════════════════════

type EventHandler = (payload: unknown) => void;

// ═══ Gateway Client ═══════════════════════════════

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private tickIntervalMs = 30000;
  private intentionalDisconnect = false;
  private reqCounter = 0;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  // Public reactive state (consumed by stores)
  public connectionState: ConnectionState = {
    status: 'disconnected'
  };
  private stateChangeCallbacks: Set<(state: ConnectionState) => void> = new Set();

  // Reconnection config
  private readonly reconnectConfig = {
    initialMs: 1000,
    maxMs: 30000,
    factor: 2,
    jitter: 0.1,
    maxAttempts: 0 // 0 = infinite
  };

  constructor() {}

  // ─── Connection ─────────────────────────────

  connect(url: string, token: string): void {
    this.url = url;
    this.token = token;
    this.intentionalDisconnect = false;
    this.reconnectAttempt = 0;
    this.doConnect();
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'client disconnect');
      this.ws = null;
    }
    this.updateState({ status: 'disconnected' });
  }

  get connected(): boolean {
    return this.connectionState.status === 'connected';
  }

  // ─── RPC ────────────────────────────────────

  async call<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }

    const id = `req-${++this.reqCounter}-${Date.now()}`;
    const frame: WsRequest = { type: 'req', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  // ─── Events ─────────────────────────────────

  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  onStateChange(cb: (state: ConnectionState) => void): () => void {
    this.stateChangeCallbacks.add(cb);
    return () => this.stateChangeCallbacks.delete(cb);
  }

  // ─── Convenience Methods ────────────────────

  async chatSend(
    sessionKey: string,
    message: string,
    options?: { idempotencyKey?: string; attachments?: Array<{ type: string; mimeType: string; content: string }> }
  ): Promise<{ runId: string; status: string }> {
    const key = options?.idempotencyKey ?? crypto.randomUUID();
    const params: Record<string, unknown> = { sessionKey, message, idempotencyKey: key, deliver: false };
    if (options?.attachments?.length) {
      params.attachments = options.attachments;
    }
    return this.call('chat.send', params);
  }

  async chatHistory(sessionKey: string, limit?: number): Promise<ChatMessage[]> {
    const result = await this.call<{ messages?: ChatMessage[]; transcript?: ChatMessage[] }>('chat.history', { sessionKey, limit: limit ?? 500 });
    return result.messages ?? result.transcript ?? [];
  }

  async chatAbort(sessionKey: string, runId?: string): Promise<void> {
    await this.call('chat.abort', { sessionKey, runId });
  }

  async sessionsList(opts?: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
    activeMinutes?: number;
  }): Promise<Session[]> {
    const result = await this.call<{ sessions?: Session[]; list?: Session[] }>('sessions.list', {
      limit: opts?.limit ?? 50,
      includeDerivedTitles: opts?.includeDerivedTitles ?? true,
      includeLastMessage: opts?.includeLastMessage ?? true,
      activeMinutes: opts?.activeMinutes,
    });
    return result.sessions ?? result.list ?? [];
  }

  // ─── Internal ───────────────────────────────

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateState({ status: 'connecting' });

    try {
      this.ws = new WebSocket(this.url);
    } catch (e) {
      this.updateState({ status: 'error', error: `Failed to create WebSocket: ${e}` });
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connectNonce = null;
      this.connectSent = false;
      this.updateState({ status: 'authenticating' });
      // Fallback: if no challenge event arrives within 750ms, send connect anyway
      if (this.connectFallbackTimer) clearTimeout(this.connectFallbackTimer);
      this.connectFallbackTimer = setTimeout(() => {
        this.connectFallbackTimer = null;
        this.sendConnect();
      }, 750);
    };

    this.ws.onmessage = (ev) => {
      try {
        const frame: WsFrame = JSON.parse(ev.data);
        this.handleFrame(frame);
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onerror = () => {
      // onerror is always followed by onclose
    };

    this.ws.onclose = (ev) => {
      this.clearTimers();
      const wasPairing = ev.code === 1008 && ev.reason?.includes('pairing');
      if (wasPairing) {
        this.updateState({
          status: 'error',
          error: 'Device pairing required. Run: openclaw devices approve <requestId>'
        });
        // Don't auto-reconnect for pairing — user needs to approve
        return;
      }
      if (!this.intentionalDisconnect) {
        this.updateState({ status: 'disconnected', error: ev.reason || undefined });
        this.scheduleReconnect();
      }
    };
  }

  private handleFrame(frame: WsFrame): void {
    if (frame.type === 'res') {
      this.handleResponse(frame);
    } else if (frame.type === 'event') {
      this.handleEvent(frame);
    }
  }

  private handleResponse(frame: WsResponse): void {
    const pending = this.pendingRequests.get(frame.id);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(frame.id);
      if (frame.ok) {
        pending.resolve(frame.payload ?? {});
      } else {
        pending.reject(new Error(frame.error?.message ?? 'Unknown error'));
      }
      return;
    }

    // Handle connect response (sent raw, not through call())
    if (frame.id === 'connect') {
      if (frame.ok && frame.payload && typeof frame.payload === 'object' && 'type' in frame.payload) {
        const hello = frame.payload as HelloOk;
        if (hello.type === 'hello-ok') {
          this.handleHelloOk(hello);
        }
      } else if (!frame.ok) {
        // Connect rejected — likely pairing required
        const errorMsg = frame.error?.message || 'Connection rejected';
        const isPairing = errorMsg.toLowerCase().includes('pair') || 
                          frame.error?.code === 'PAIRING_REQUIRED' ||
                          frame.error?.code === 'AUTH_REQUIRED';
        this.updateState({ 
          status: 'error', 
          error: isPairing 
            ? 'Device pairing required — waiting for gateway owner to approve this device'
            : errorMsg 
        });
        // For pairing, don't auto-reconnect aggressively — poll slowly
        if (isPairing) {
          this.reconnectAttempt = 5; // Start with longer backoff
        }
      }
      return;
    }

    // Fallback: check for hello-ok on any ok response
    if (frame.ok && frame.payload && typeof frame.payload === 'object' && 'type' in frame.payload) {
      const hello = frame.payload as HelloOk;
      if (hello.type === 'hello-ok') {
        this.handleHelloOk(hello);
      }
    }
  }

  private handleEvent(frame: WsEvent): void {
    if (frame.event === 'connect.challenge') {
      // Extract nonce from challenge for device auth signing
      const payload = frame.payload as { nonce?: string } | undefined;
      this.connectNonce = payload?.nonce ?? null;
      this.connectSent = false;
      // Cancel fallback timer — we got the challenge
      if (this.connectFallbackTimer) {
        clearTimeout(this.connectFallbackTimer);
        this.connectFallbackTimer = null;
      }
      this.sendConnect();
      return;
    } else if (frame.event === 'tick') {
      // Server tick — send pong
      this.sendTick();
    } else {
      // Dispatch to event listeners
      const handlers = this.eventHandlers.get(frame.event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(frame.payload);
          } catch {
            // ignore handler errors
          }
        }
      }
    }
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent) return;
    this.connectSent = true;

    const role = 'operator';
    const scopes = ['operator.admin', 'operator.approvals', 'operator.pairing'];
    // '__device_auth__' is a placeholder meaning "use device identity only, no shared token"
    let authToken = this.token === '__device_auth__' ? '' : this.token;
    let device: {
      id: string;
      publicKey: string;
      signature: string;
      signedAt: number;
      nonce: string | undefined;
    } | undefined;

    // Use device identity for proper auth when crypto.subtle is available (HTTPS)
    const hasSubtle = typeof crypto !== 'undefined' && !!crypto.subtle;
    if (hasSubtle) {
      try {
        const {
          loadOrCreateDeviceIdentity,
          signDevicePayload,
          buildDeviceAuthPayload,
          loadDeviceAuthToken
        } = await import('./device-identity');

        const identity = await loadOrCreateDeviceIdentity();

        // Use stored device token if available
        const storedToken = loadDeviceAuthToken(identity.deviceId, role);
        if (storedToken) {
          authToken = storedToken;
        }

        // Sign the connect payload
        const signedAtMs = Date.now();
        const nonce = this.connectNonce ?? undefined;
        const payload = buildDeviceAuthPayload({
          deviceId: identity.deviceId,
          clientId: 'openclaw-control-ui',
          clientMode: 'webchat',
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
        // Fall back to token-only auth
      }
    }

    const frame: WsRequest = {
      type: 'req',
      id: 'connect',
      method: 'connect',
      params: {
        minProtocol: 3,
        maxProtocol: 3,
        client: {
          id: 'openclaw-control-ui',
          displayName: 'Cortex',
          version: '1.1.0',
          platform: navigator.platform || 'web',
          mode: 'webchat'
        },
        role,
        scopes,
        device,
        auth: (authToken || undefined) ? { token: authToken } : undefined,
        userAgent: navigator.userAgent,
        locale: navigator.language
      }
    };
    this.ws?.send(JSON.stringify(frame));
  }

  private handleHelloOk(hello: HelloOk): void {
    this.reconnectAttempt = 0;
    this.tickIntervalMs = hello.policy.tickIntervalMs;

    // Store device auth token if the gateway issued one
    const authPayload = hello as unknown as { auth?: { deviceToken?: string; role?: string; scopes?: string[] } };
    if (authPayload.auth?.deviceToken && typeof crypto !== 'undefined' && !!crypto.subtle) {
      import('./device-identity').then(({ loadOrCreateDeviceIdentity, storeDeviceAuthToken }) => {
        loadOrCreateDeviceIdentity().then((identity) => {
          storeDeviceAuthToken({
            deviceId: identity.deviceId,
            role: authPayload.auth!.role ?? 'operator',
            token: authPayload.auth!.deviceToken!,
            scopes: authPayload.auth!.scopes ?? []
          });
        });
      }).catch(() => { /* ignore */ });
    }

    this.updateState({
      status: 'connected',
      serverVersion: hello.server.version,
      protocol: hello.protocol,
      connId: hello.server.connId,
      mainSessionKey: hello.snapshot.sessionDefaults?.mainSessionKey,
      error: undefined
    });

    // Start tick heartbeat
    this.startTickTimer();

    // Emit hello event for stores
    const handlers = this.eventHandlers.get('hello');
    if (handlers) {
      for (const handler of handlers) {
        try { handler(hello); } catch { /* ignore */ }
      }
    }
  }

  private sendTick(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'req', id: `tick-${Date.now()}`, method: 'tick' }));
    }
  }

  private startTickTimer(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.sendTick(), this.tickIntervalMs);
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect) return;
    if (this.reconnectConfig.maxAttempts > 0 && this.reconnectAttempt >= this.reconnectConfig.maxAttempts) {
      this.updateState({ status: 'error', error: 'Max reconnection attempts reached' });
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

  private clearTimers(): void {
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

  private updateState(update: Partial<ConnectionState>): void {
    this.connectionState = { ...this.connectionState, ...update };
    for (const cb of this.stateChangeCallbacks) {
      try { cb(this.connectionState); } catch { /* ignore */ }
    }
  }
}

// ═══ Singleton ════════════════════════════════════

export const gateway = new GatewayClient();
