import type { IncomingMessage } from "node:http";
import os from "node:os";
import type { WebSocket } from "ws";
import { AuditLogger } from "../../../audit/audit-logger.js";
import { loadConfig } from "../../../config/config.js";
import {
  deriveDeviceIdFromPublicKey,
  normalizeDevicePublicKeyBase64Url,
  verifyDeviceSignature,
} from "../../../infra/device-identity.js";
import {
  approveDevicePairing,
  ensureDeviceToken,
  getPairedDevice,
  requestDevicePairing,
  updatePairedDeviceMetadata,
  verifyDeviceToken,
} from "../../../infra/device-pairing.js";
import { updatePairedNodeMetadata } from "../../../infra/node-pairing.js";
import { recordRemoteNodeInfo, refreshRemoteNodeBins } from "../../../infra/skills-remote.js";
import { upsertPresence } from "../../../infra/system-presence.js";
import { loadVoiceWakeConfig } from "../../../infra/voicewake.js";
import { rawDataToString } from "../../../infra/ws.js";
import type { createSubsystemLogger } from "../../../logging/subsystem.js";
import { resolveCallerRole } from "../../../security/authorize.js";
import { InviteStore } from "../../../security/invites.js";
import { consumePairingCode } from "../../../security/pairing-codes.js";
import { TokenStore } from "../../../security/tokens.js";
import { roleScopesAllow } from "../../../shared/operator-scope-compat.js";
import { isGatewayCliClient, isWebchatClient } from "../../../utils/message-channel.js";
import { resolveRuntimeServiceVersion, VERSION } from "../../../version.js";
import { resolveAssistantIdentity } from "../../assistant-identity.js";
import {
  AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN,
  AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
  type AuthRateLimiter,
} from "../../auth-rate-limit.js";
import type { GatewayAuthResult, ResolvedGatewayAuth } from "../../auth.js";
import { authorizeGatewayConnect, isLocalDirectRequest } from "../../auth.js";
import {
  buildCanvasScopedHostUrl,
  CANVAS_CAPABILITY_TTL_MS,
  mintCanvasCapabilityToken,
} from "../../canvas-capability.js";
import { buildDeviceAuthPayload } from "../../device-auth.js";
import {
  isLoopbackAddress,
  isPrivateOrLoopbackAddress,
  isTrustedProxyAddress,
  resolveGatewayClientIp,
  resolveHostName,
} from "../../net.js";
import { resolveNodeCommandAllowlist } from "../../node-command-policy.js";
import { checkBrowserOrigin } from "../../origin-check.js";
import { GATEWAY_CLIENT_IDS } from "../../protocol/client-info.js";
import {
  type ConnectParams,
  ErrorCodes,
  type ErrorShape,
  errorShape,
  formatValidationErrors,
  PROTOCOL_VERSION,
  validateConnectParams,
  validateRequestFrame,
} from "../../protocol/index.js";
import { MAX_BUFFERED_BYTES, MAX_PAYLOAD_BYTES, TICK_INTERVAL_MS } from "../../server-constants.js";
import { handleGatewayRequest } from "../../server-methods.js";
import type { GatewayRequestContext, GatewayRequestHandlers } from "../../server-methods/types.js";
import { formatError } from "../../server-utils.js";
import { formatForLog, logWs } from "../../ws-log.js";
import { truncateCloseReason } from "../close-reason.js";
import {
  buildGatewaySnapshot,
  getHealthCache,
  getHealthVersion,
  incrementPresenceVersion,
  refreshGatewayHealthSnapshot,
} from "../health-state.js";
import type { GatewayWsClient } from "../ws-types.js";
import { formatGatewayAuthFailureMessage, type AuthProvidedKind } from "./auth-messages.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

const DEVICE_SIGNATURE_SKEW_MS = 10 * 60 * 1000;

export function attachGatewayWsMessageHandler(params: {
  socket: WebSocket;
  upgradeReq: IncomingMessage;
  connId: string;
  remoteAddr?: string;
  forwardedFor?: string;
  realIp?: string;
  requestHost?: string;
  requestOrigin?: string;
  requestUserAgent?: string;
  canvasHostUrl?: string;
  connectNonce: string;
  resolvedAuth: ResolvedGatewayAuth;
  /** Optional rate limiter for auth brute-force protection. */
  rateLimiter?: AuthRateLimiter;
  gatewayMethods: string[];
  events: string[];
  extraHandlers: GatewayRequestHandlers;
  buildRequestContext: () => GatewayRequestContext;
  send: (obj: unknown) => void;
  close: (code?: number, reason?: string) => void;
  isClosed: () => boolean;
  clearHandshakeTimer: () => void;
  getClient: () => GatewayWsClient | null;
  setClient: (next: GatewayWsClient) => void;
  setHandshakeState: (state: "pending" | "connected" | "failed") => void;
  setCloseCause: (cause: string, meta?: Record<string, unknown>) => void;
  setLastFrameMeta: (meta: { type?: string; method?: string; id?: string }) => void;
  logGateway: SubsystemLogger;
  logHealth: SubsystemLogger;
  logWsControl: SubsystemLogger;
}) {
  const {
    socket,
    upgradeReq,
    connId,
    remoteAddr,
    forwardedFor,
    realIp,
    requestHost,
    requestOrigin,
    requestUserAgent,
    canvasHostUrl,
    connectNonce,
    resolvedAuth,
    rateLimiter,
    gatewayMethods,
    events,
    extraHandlers,
    buildRequestContext,
    send,
    close,
    isClosed,
    clearHandshakeTimer,
    getClient,
    setClient,
    setHandshakeState,
    setCloseCause,
    setLastFrameMeta,
    logGateway,
    logHealth,
    logWsControl,
  } = params;

  const configSnapshot = loadConfig();
  const trustedProxies = configSnapshot.gateway?.trustedProxies ?? [];
  const clientIp = resolveGatewayClientIp({ remoteAddr, forwardedFor, realIp, trustedProxies });

  // If proxy headers are present but the remote address isn't trusted, don't treat
  // the connection as local. This prevents auth bypass when running behind a reverse
  // proxy without proper configuration - the proxy's loopback connection would otherwise
  // cause all external requests to be treated as trusted local clients.
  const hasProxyHeaders = Boolean(forwardedFor || realIp);
  const remoteIsTrustedProxy = isTrustedProxyAddress(remoteAddr, trustedProxies);
  const hasUntrustedProxyHeaders = hasProxyHeaders && !remoteIsTrustedProxy;
  const hostName = resolveHostName(requestHost);
  const hostIsLocal = hostName === "localhost" || hostName === "127.0.0.1" || hostName === "::1";
  const hostIsTailscaleServe = hostName.endsWith(".ts.net");
  const hostIsLocalish = hostIsLocal || hostIsTailscaleServe;
  const isLocalClient = isLocalDirectRequest(upgradeReq, trustedProxies);
  const reportedClientIp =
    isLocalClient || hasUntrustedProxyHeaders
      ? undefined
      : clientIp && !isLoopbackAddress(clientIp)
        ? clientIp
        : undefined;

  if (hasUntrustedProxyHeaders) {
    logWsControl.warn(
      "Proxy headers detected from untrusted address. " +
        "Connection will not be treated as local. " +
        "Configure gateway.trustedProxies to restore local client detection behind your proxy.",
    );
  }
  if (!hostIsLocalish && isLoopbackAddress(remoteAddr) && !hasProxyHeaders) {
    logWsControl.warn(
      "Loopback connection with non-local Host header. " +
        "Treating it as remote. If you're behind a reverse proxy, " +
        "set gateway.trustedProxies and forward X-Forwarded-For/X-Real-IP.",
    );
  }

  const isWebchatConnect = (p: ConnectParams | null | undefined) => isWebchatClient(p?.client);

  socket.on("message", async (data) => {
    if (isClosed()) {
      return;
    }
    const text = rawDataToString(data);
    try {
      const parsed = JSON.parse(text);
      const frameType =
        parsed && typeof parsed === "object" && "type" in parsed
          ? typeof (parsed as { type?: unknown }).type === "string"
            ? String((parsed as { type?: unknown }).type)
            : undefined
          : undefined;
      const frameMethod =
        parsed && typeof parsed === "object" && "method" in parsed
          ? typeof (parsed as { method?: unknown }).method === "string"
            ? String((parsed as { method?: unknown }).method)
            : undefined
          : undefined;
      const frameId =
        parsed && typeof parsed === "object" && "id" in parsed
          ? typeof (parsed as { id?: unknown }).id === "string"
            ? String((parsed as { id?: unknown }).id)
            : undefined
          : undefined;
      if (frameType || frameMethod || frameId) {
        setLastFrameMeta({ type: frameType, method: frameMethod, id: frameId });
      }

      const client = getClient();
      if (!client) {
        // Handshake must be a normal request:
        // { type:"req", method:"connect", params: ConnectParams }.
        const isRequestFrame = validateRequestFrame(parsed);
        if (
          !isRequestFrame ||
          parsed.method !== "connect" ||
          !validateConnectParams(parsed.params)
        ) {
          const handshakeError = isRequestFrame
            ? parsed.method === "connect"
              ? `invalid connect params: ${formatValidationErrors(validateConnectParams.errors)}`
              : "invalid handshake: first request must be connect"
            : "invalid request frame";
          setHandshakeState("failed");
          setCloseCause("invalid-handshake", {
            frameType,
            frameMethod,
            frameId,
            handshakeError,
          });
          if (isRequestFrame) {
            const req = parsed;
            send({
              type: "res",
              id: req.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, handshakeError),
            });
          } else {
            logWsControl.warn(
              `invalid handshake conn=${connId} remote=${remoteAddr ?? "?"} fwd=${forwardedFor ?? "n/a"} origin=${requestOrigin ?? "n/a"} host=${requestHost ?? "n/a"} ua=${requestUserAgent ?? "n/a"}`,
            );
          }
          const closeReason = truncateCloseReason(handshakeError || "invalid handshake");
          if (isRequestFrame) {
            queueMicrotask(() => close(1008, closeReason));
          } else {
            close(1008, closeReason);
          }
          return;
        }

        const frame = parsed;
        const connectParams = frame.params as ConnectParams;
        const clientLabel = connectParams.client.displayName ?? connectParams.client.id;
        const clientMeta = {
          client: connectParams.client.id,
          clientDisplayName: connectParams.client.displayName,
          mode: connectParams.client.mode,
          version: connectParams.client.version,
        };
        const markHandshakeFailure = (cause: string, meta?: Record<string, unknown>) => {
          setHandshakeState("failed");
          setCloseCause(cause, { ...meta, ...clientMeta });
        };
        const sendHandshakeErrorResponse = (
          code: Parameters<typeof errorShape>[0],
          message: string,
          options?: Parameters<typeof errorShape>[2],
        ) => {
          send({
            type: "res",
            id: frame.id,
            ok: false,
            error: errorShape(code, message, options),
          });
        };

        // protocol negotiation
        const { minProtocol, maxProtocol } = connectParams;
        if (maxProtocol < PROTOCOL_VERSION || minProtocol > PROTOCOL_VERSION) {
          markHandshakeFailure("protocol-mismatch", {
            minProtocol,
            maxProtocol,
            expectedProtocol: PROTOCOL_VERSION,
          });
          logWsControl.warn(
            `protocol mismatch conn=${connId} remote=${remoteAddr ?? "?"} client=${clientLabel} ${connectParams.client.mode} v${connectParams.client.version}`,
          );
          sendHandshakeErrorResponse(ErrorCodes.INVALID_REQUEST, "protocol mismatch", {
            details: { expectedProtocol: PROTOCOL_VERSION },
          });
          close(1002, "protocol mismatch");
          return;
        }

        const roleRaw = connectParams.role ?? "operator";
        const role = roleRaw === "operator" || roleRaw === "node" ? roleRaw : null;
        if (!role) {
          markHandshakeFailure("invalid-role", {
            role: roleRaw,
          });
          sendHandshakeErrorResponse(ErrorCodes.INVALID_REQUEST, "invalid role");
          close(1008, "invalid role");
          return;
        }
        // Default-deny: scopes must be explicit. Empty/missing scopes means no permissions.
        // Note: If the client does not present a device identity, we can't bind scopes to a paired
        // device/token, so we will clear scopes after auth to avoid self-declared permissions.
        let scopes = Array.isArray(connectParams.scopes) ? connectParams.scopes : [];
        connectParams.role = role;
        connectParams.scopes = scopes;

        const isControlUi = connectParams.client.id === GATEWAY_CLIENT_IDS.CONTROL_UI;
        const isWebchat = isWebchatConnect(connectParams);
        if (isControlUi || isWebchat) {
          const originCheck = checkBrowserOrigin({
            requestHost,
            origin: requestOrigin,
            allowedOrigins: configSnapshot.gateway?.controlUi?.allowedOrigins,
          });
          if (!originCheck.ok) {
            const errorMessage =
              "origin not allowed (open the Control UI from the gateway host or allow it in gateway.controlUi.allowedOrigins)";
            markHandshakeFailure("origin-mismatch", {
              origin: requestOrigin ?? "n/a",
              host: requestHost ?? "n/a",
              reason: originCheck.reason,
            });
            sendHandshakeErrorResponse(ErrorCodes.INVALID_REQUEST, errorMessage);
            close(1008, truncateCloseReason(errorMessage));
            return;
          }
        }

        const deviceRaw = connectParams.device;
        let devicePublicKey: string | null = null;
        const hasTokenAuth = Boolean(connectParams.auth?.token);
        const hasPasswordAuth = Boolean(connectParams.auth?.password);
        const hasSharedAuth = hasTokenAuth || hasPasswordAuth;

        // ── ctx_ API token authentication (Issue #20) ──────────────────
        // If the client provides a ctx_ prefixed token (from the token store),
        // validate it directly and bypass device identity + pairing entirely.
        const ctxTokenRaw = connectParams.auth?.token;
        const isCtxToken = typeof ctxTokenRaw === "string" && ctxTokenRaw.startsWith("ctx_");
        let ctxTokenValidation: {
          role: string;
          scopes: string[];
          name: string;
          id: number;
        } | null = null;
        if (isCtxToken && ctxTokenRaw) {
          try {
            const tokenStore = TokenStore.init();
            ctxTokenValidation = tokenStore.validate(ctxTokenRaw);
            if (ctxTokenValidation) {
              logGateway.info(
                `ctx_ token auth succeeded conn=${connId} tokenName=${ctxTokenValidation.name} role=${ctxTokenValidation.role} client=${clientLabel}`,
              );
            } else {
              logGateway.warn(
                `ctx_ token auth failed (invalid/expired/revoked) conn=${connId} client=${clientLabel}`,
              );
            }
          } catch (err) {
            logGateway.warn(`ctx_ token validation error: ${String(err)}`);
          }
        }
        const allowInsecureControlUi =
          isControlUi && configSnapshot.gateway?.controlUi?.allowInsecureAuth === true;
        const disableControlUiDeviceAuth =
          isControlUi && configSnapshot.gateway?.controlUi?.dangerouslyDisableDeviceAuth === true;
        // `allowInsecureAuth` is retained for compatibility, but must not bypass
        // secure-context/device-auth requirements.
        const allowControlUiBypass = disableControlUiDeviceAuth;
        const device = disableControlUiDeviceAuth ? null : deviceRaw;

        const hasDeviceTokenCandidate = Boolean(connectParams.auth?.token && device);
        let authResult: GatewayAuthResult = await authorizeGatewayConnect({
          auth: resolvedAuth,
          connectAuth: connectParams.auth,
          req: upgradeReq,
          trustedProxies,
          rateLimiter: hasDeviceTokenCandidate ? undefined : rateLimiter,
          clientIp,
          rateLimitScope: AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
        });

        if (
          hasDeviceTokenCandidate &&
          authResult.ok &&
          rateLimiter &&
          (authResult.method === "token" || authResult.method === "password")
        ) {
          const sharedRateCheck = rateLimiter.check(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
          if (!sharedRateCheck.allowed) {
            authResult = {
              ok: false,
              reason: "rate_limited",
              rateLimited: true,
              retryAfterMs: sharedRateCheck.retryAfterMs,
            };
          } else {
            rateLimiter.reset(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
          }
        }

        let authOk = authResult.ok;
        let authMethod =
          authResult.method ?? (resolvedAuth.mode === "password" ? "password" : "token");
        const sharedAuthResult = hasSharedAuth
          ? await authorizeGatewayConnect({
              auth: { ...resolvedAuth, allowTailscale: false },
              connectAuth: connectParams.auth,
              req: upgradeReq,
              trustedProxies,
              // Shared-auth probe only; rate-limit side effects are handled in
              // the primary auth flow (or deferred for device-token candidates).
              rateLimitScope: AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET,
            })
          : null;
        const sharedAuthOk =
          sharedAuthResult?.ok === true &&
          (sharedAuthResult.method === "token" || sharedAuthResult.method === "password");
        const rejectUnauthorized = (failedAuth: GatewayAuthResult) => {
          markHandshakeFailure("unauthorized", {
            authMode: resolvedAuth.mode,
            authProvided: connectParams.auth?.token
              ? "token"
              : connectParams.auth?.password
                ? "password"
                : "none",
            authReason: failedAuth.reason,
            allowTailscale: resolvedAuth.allowTailscale,
          });
          logWsControl.warn(
            `unauthorized conn=${connId} remote=${remoteAddr ?? "?"} client=${clientLabel} ${connectParams.client.mode} v${connectParams.client.version} reason=${failedAuth.reason ?? "unknown"}`,
          );
          const authProvided: AuthProvidedKind = connectParams.auth?.token
            ? "token"
            : connectParams.auth?.password
              ? "password"
              : "none";
          const authMessage = formatGatewayAuthFailureMessage({
            authMode: resolvedAuth.mode,
            authProvided,
            reason: failedAuth.reason,
            client: connectParams.client,
          });
          sendHandshakeErrorResponse(ErrorCodes.INVALID_REQUEST, authMessage);
          close(1008, truncateCloseReason(authMessage));
        };
        if (!device) {
          // Desktop app schemes (tauri://, capacitor://) are secure contexts
          // with full WebCrypto — treat them like HTTPS/localhost.
          const isDesktopAppOrigin =
            typeof requestOrigin === "string" && /^(tauri|capacitor):\/\//i.test(requestOrigin);

          if (
            scopes.length > 0 &&
            !allowControlUiBypass &&
            !ctxTokenValidation &&
            !isDesktopAppOrigin
          ) {
            scopes = [];
            connectParams.scopes = scopes;
          }
          const canSkipDevice = sharedAuthOk || Boolean(ctxTokenValidation);

          if (isControlUi && !allowControlUiBypass && !ctxTokenValidation && !isDesktopAppOrigin) {
            const errorMessage = "control ui requires HTTPS or localhost (secure context)";
            markHandshakeFailure("control-ui-insecure-auth", {
              insecureAuthConfigured: allowInsecureControlUi,
            });
            sendHandshakeErrorResponse(ErrorCodes.INVALID_REQUEST, errorMessage);
            close(1008, errorMessage);
            return;
          }

          // Allow shared-secret or ctx_ token authenticated connections to skip device identity
          if (!canSkipDevice) {
            if (!authOk && hasSharedAuth) {
              rejectUnauthorized(authResult);
              return;
            }
            markHandshakeFailure("device-required");
            sendHandshakeErrorResponse(ErrorCodes.NOT_PAIRED, "device identity required");
            close(1008, "device identity required");
            return;
          }
        }
        if (device) {
          const derivedId = deriveDeviceIdFromPublicKey(device.publicKey);
          if (!derivedId || derivedId !== device.id) {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-id-mismatch",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device identity mismatch"),
            });
            close(1008, "device identity mismatch");
            return;
          }
          const signedAt = device.signedAt;
          if (
            typeof signedAt !== "number" ||
            Math.abs(Date.now() - signedAt) > DEVICE_SIGNATURE_SKEW_MS
          ) {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-signature-stale",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device signature expired"),
            });
            close(1008, "device signature expired");
            return;
          }
          const nonceRequired = !isLocalClient;
          const providedNonce = typeof device.nonce === "string" ? device.nonce.trim() : "";
          if (nonceRequired && !providedNonce) {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-nonce-missing",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device nonce required"),
            });
            close(1008, "device nonce required");
            return;
          }
          if (providedNonce && providedNonce !== connectNonce) {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-nonce-mismatch",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device nonce mismatch"),
            });
            close(1008, "device nonce mismatch");
            return;
          }
          const payload = buildDeviceAuthPayload({
            deviceId: device.id,
            clientId: connectParams.client.id,
            clientMode: connectParams.client.mode,
            role,
            scopes,
            signedAtMs: signedAt,
            token: connectParams.auth?.token ?? null,
            nonce: providedNonce || undefined,
            version: providedNonce ? "v2" : "v1",
          });
          const rejectDeviceSignatureInvalid = () => {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-signature",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device signature invalid"),
            });
            close(1008, "device signature invalid");
          };
          const signatureOk = verifyDeviceSignature(device.publicKey, payload, device.signature);
          const allowLegacy = !nonceRequired && !providedNonce;
          if (!signatureOk && allowLegacy) {
            const legacyPayload = buildDeviceAuthPayload({
              deviceId: device.id,
              clientId: connectParams.client.id,
              clientMode: connectParams.client.mode,
              role,
              scopes,
              signedAtMs: signedAt,
              token: connectParams.auth?.token ?? null,
              version: "v1",
            });
            if (verifyDeviceSignature(device.publicKey, legacyPayload, device.signature)) {
              // accepted legacy loopback signature
            } else {
              rejectDeviceSignatureInvalid();
              return;
            }
          } else if (!signatureOk) {
            rejectDeviceSignatureInvalid();
            return;
          }
          devicePublicKey = normalizeDevicePublicKeyBase64Url(device.publicKey);
          if (!devicePublicKey) {
            setHandshakeState("failed");
            setCloseCause("device-auth-invalid", {
              reason: "device-public-key",
              client: connectParams.client.id,
              deviceId: device.id,
            });
            send({
              type: "res",
              id: frame.id,
              ok: false,
              error: errorShape(ErrorCodes.INVALID_REQUEST, "device public key invalid"),
            });
            close(1008, "device public key invalid");
            return;
          }
        }

        // ctx_ API token auth — mark as authenticated if valid
        if (!authOk && ctxTokenValidation) {
          authOk = true;
          authMethod = "api-token";
          // The shared-secret auth check above recorded a rate-limit failure
          // (ctx_ token != gateway token → "token_mismatch") before we got here.
          // Reset that counter now that we know the ctx_ token is valid,
          // otherwise repeated reconnects poison the rate limiter and cause
          // intermittent lockouts (10 attempts → 5-min block).
          rateLimiter?.reset(clientIp, AUTH_RATE_LIMIT_SCOPE_SHARED_SECRET);
          // Populate connection scopes based on token role so that
          // authorizeGatewayMethod (which checks client.connect.scopes)
          // grants the correct access level for ctx_ API token connections.
          const tokenRole = ctxTokenValidation.role ?? "admin";
          if (tokenRole === "admin") {
            scopes = [
              "operator.admin",
              "operator.read",
              "operator.write",
              "operator.approvals",
              "operator.pairing",
            ];
          } else if (tokenRole === "operator") {
            scopes = ["operator.read", "operator.write", "operator.approvals", "operator.pairing"];
          } else if (tokenRole === "viewer") {
            scopes = ["operator.read"];
          }
          // chat-only role gets empty scopes — Phase 3 authorize() handles chat permissions
          connectParams.scopes = scopes;
        }

        if (!authOk && connectParams.auth?.token && device) {
          if (rateLimiter) {
            const deviceRateCheck = rateLimiter.check(clientIp, AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
            if (!deviceRateCheck.allowed) {
              authResult = {
                ok: false,
                reason: "rate_limited",
                rateLimited: true,
                retryAfterMs: deviceRateCheck.retryAfterMs,
              };
            }
          }
          if (!authResult.rateLimited) {
            const tokenCheck = await verifyDeviceToken({
              deviceId: device.id,
              token: connectParams.auth.token,
              role,
              scopes,
            });
            if (tokenCheck.ok) {
              authOk = true;
              authMethod = "device-token";
              rateLimiter?.reset(clientIp, AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
            } else {
              authResult = { ok: false, reason: "device_token_mismatch" };
              rateLimiter?.recordFailure(clientIp, AUTH_RATE_LIMIT_SCOPE_DEVICE_TOKEN);
            }
          }
        }
        if (!authOk) {
          rejectUnauthorized(authResult);
          return;
        }

        // ─── Populate scopes for desktop app origins with shared auth ─────
        // Desktop apps (tauri://, capacitor://) authenticated via gateway
        // shared token should get operator scopes, same as ctx_ admin tokens.
        // Without this, scopes stay empty because they're only populated for
        // ctx_ tokens (above) or device-token auth.
        const isDesktopAppOriginForScopes =
          typeof requestOrigin === "string" && /^(tauri|capacitor):\/\//i.test(requestOrigin);
        if (
          isDesktopAppOriginForScopes &&
          sharedAuthOk &&
          !ctxTokenValidation &&
          connectParams.scopes.length === 0
        ) {
          connectParams.scopes = [
            "operator.admin",
            "operator.read",
            "operator.write",
            "operator.approvals",
            "operator.pairing",
          ];
          scopes = connectParams.scopes;
        }

        // ─── Invite code / pairing code auto-approval ────────
        let inviteOrCodeRole: string | null = null;

        if (connectParams.auth?.invite && device && devicePublicKey) {
          const inviteCode = String(connectParams.auth.invite).trim();
          if (inviteCode) {
            try {
              const inviteStore = InviteStore.init();
              const validation = inviteStore.validateInvite(inviteCode);
              if (validation.valid) {
                inviteOrCodeRole = validation.role;
                inviteStore.useInvite(inviteCode);
                logGateway.info(
                  `invite code accepted: device=${device.id} role=${validation.role}`,
                );
                const pairing = await requestDevicePairing({
                  deviceId: device.id,
                  publicKey: devicePublicKey,
                  displayName: connectParams.client.displayName,
                  platform: connectParams.client.platform,
                  clientId: connectParams.client.id,
                  clientMode: connectParams.client.mode,
                  role,
                  scopes,
                  remoteIp: reportedClientIp,
                  silent: true,
                });
                const approved = await approveDevicePairing(pairing.request.requestId);
                if (approved) {
                  await updatePairedDeviceMetadata(device.id, {
                    displayName: connectParams.client.displayName,
                    platform: connectParams.client.platform,
                    clientId: connectParams.client.id,
                    clientMode: connectParams.client.mode,
                    role,
                    scopes,
                    remoteIp: reportedClientIp,
                    securityRole: validation.role,
                  });
                  const ctx = buildRequestContext();
                  ctx.broadcast(
                    "device.pair.resolved",
                    {
                      requestId: pairing.request.requestId,
                      deviceId: approved.device.deviceId,
                      decision: "approved",
                      ts: Date.now(),
                    },
                    { dropIfSlow: true },
                  );
                }
              }
            } catch (err) {
              logGateway.warn(`invite validation error: ${String(err)}`);
            }
          }
        }

        if (!inviteOrCodeRole && connectParams.auth?.pairingCode && device && devicePublicKey) {
          const pCode = String(connectParams.auth.pairingCode).trim();
          if (pCode) {
            const codeResult = consumePairingCode(pCode);
            if (codeResult.valid) {
              inviteOrCodeRole = codeResult.role;
              logGateway.info(`pairing code accepted: device=${device.id} role=${codeResult.role}`);
              const pairing = await requestDevicePairing({
                deviceId: device.id,
                publicKey: devicePublicKey,
                displayName: connectParams.client.displayName,
                platform: connectParams.client.platform,
                clientId: connectParams.client.id,
                clientMode: connectParams.client.mode,
                role,
                scopes,
                remoteIp: reportedClientIp,
                silent: true,
              });
              const approved = await approveDevicePairing(pairing.request.requestId);
              if (approved) {
                await updatePairedDeviceMetadata(device.id, {
                  displayName: connectParams.client.displayName,
                  platform: connectParams.client.platform,
                  clientId: connectParams.client.id,
                  clientMode: connectParams.client.mode,
                  role,
                  scopes,
                  remoteIp: reportedClientIp,
                  securityRole: codeResult.role,
                });
                const ctx = buildRequestContext();
                ctx.broadcast(
                  "device.pair.resolved",
                  {
                    requestId: pairing.request.requestId,
                    deviceId: approved.device.deviceId,
                    decision: "approved",
                    ts: Date.now(),
                  },
                  { dropIfSlow: true },
                );
              }
            }
          }
        }

        const skipPairing =
          (allowControlUiBypass && sharedAuthOk) ||
          Boolean(ctxTokenValidation) ||
          Boolean(inviteOrCodeRole);
        if (device && devicePublicKey && !skipPairing) {
          const formatAuditList = (items: string[] | undefined): string => {
            if (!items || items.length === 0) {
              return "<none>";
            }
            const out = new Set<string>();
            for (const item of items) {
              const trimmed = item.trim();
              if (trimmed) {
                out.add(trimmed);
              }
            }
            if (out.size === 0) {
              return "<none>";
            }
            return [...out].toSorted().join(",");
          };
          const logUpgradeAudit = (
            reason: "role-upgrade" | "scope-upgrade",
            currentRoles: string[] | undefined,
            currentScopes: string[] | undefined,
          ) => {
            logGateway.warn(
              `security audit: device access upgrade requested reason=${reason} device=${device.id} ip=${reportedClientIp ?? "unknown-ip"} auth=${authMethod} roleFrom=${formatAuditList(currentRoles)} roleTo=${role} scopesFrom=${formatAuditList(currentScopes)} scopesTo=${formatAuditList(scopes)} client=${connectParams.client.id} conn=${connId}`,
            );
          };
          const requirePairing = async (
            reason: "not-paired" | "role-upgrade" | "scope-upgrade",
          ) => {
            // Issue #23: Check LAN auto-approve config
            const securityConfig = configSnapshot.gateway?.security;
            const lanAutoApproveEnabled = securityConfig?.lanAutoApprove === true;
            const isLanAutoApprove =
              lanAutoApproveEnabled &&
              reason === "not-paired" &&
              isPrivateOrLoopbackAddress(reportedClientIp ?? clientIp);

            const pairing = await requestDevicePairing({
              deviceId: device.id,
              publicKey: devicePublicKey,
              displayName: connectParams.client.displayName,
              platform: connectParams.client.platform,
              clientId: connectParams.client.id,
              clientMode: connectParams.client.mode,
              role,
              scopes,
              remoteIp: reportedClientIp,
              silent: (isLocalClient && reason === "not-paired") || isLanAutoApprove,
            });
            const context = buildRequestContext();
            if (pairing.request.silent === true) {
              const approved = await approveDevicePairing(pairing.request.requestId);
              if (approved) {
                // Issue #23: LAN auto-approve — set role from config and audit log
                if (isLanAutoApprove) {
                  const lanRole = securityConfig?.lanAutoApproveRole || "operator";
                  logGateway.info(
                    `device pairing lan-auto-approved device=${approved.device.deviceId} role=${lanRole} ip=${reportedClientIp ?? "unknown"}`,
                  );
                  try {
                    await updatePairedDeviceMetadata(approved.device.deviceId, {
                      securityRole: lanRole,
                      approveReason: "lan-auto-approve",
                    });
                  } catch {
                    // Best effort — device is already approved
                  }
                  try {
                    AuditLogger.getInstance().log({
                      actor_type: "device",
                      actor_id: approved.device.deviceId,
                      action: "device.pair.lan-auto-approve",
                      resource: approved.device.deviceId,
                      ip: reportedClientIp,
                      result: "success",
                      details: JSON.stringify({
                        reason: "lan-auto-approve",
                        role: lanRole,
                        clientId: connectParams.client.id,
                        displayName: connectParams.client.displayName,
                      }),
                    });
                  } catch {
                    // Never crash from audit logging
                  }
                  context.broadcast(
                    "device.pair.resolved",
                    {
                      requestId: pairing.request.requestId,
                      deviceId: approved.device.deviceId,
                      decision: "approved",
                      reason: "lan-auto-approve",
                      ts: Date.now(),
                    },
                    { dropIfSlow: true },
                  );
                  // Issue #19: First device gets admin securityRole automatically
                } else if (pairing.firstDevice) {
                  logGateway.info(
                    `first device auto-approved as admin device=${approved.device.deviceId} client=${clientLabel}`,
                  );
                  await updatePairedDeviceMetadata(approved.device.deviceId, {
                    securityRole: "admin",
                  });
                  try {
                    AuditLogger.getInstance().log({
                      actor_type: "device",
                      actor_id: approved.device.deviceId,
                      action: "device.first-device-auto-approved",
                      resource: approved.device.deviceId,
                      details: `First device auto-approved as admin. client=${connectParams.client.id} ip=${reportedClientIp ?? "unknown"}`,
                      ip: reportedClientIp,
                      result: "success",
                    });
                  } catch {
                    // Never crash from audit logging
                  }
                  context.broadcast(
                    "device.pair.resolved",
                    {
                      requestId: pairing.request.requestId,
                      deviceId: approved.device.deviceId,
                      decision: "approved",
                      ts: Date.now(),
                    },
                    { dropIfSlow: true },
                  );
                } else {
                  // Local auto-approve: default to admin securityRole
                  logGateway.info(
                    `device pairing auto-approved device=${approved.device.deviceId} securityRole=admin`,
                  );
                  try {
                    await updatePairedDeviceMetadata(approved.device.deviceId, {
                      securityRole: "admin",
                    });
                  } catch {
                    // Best effort
                  }
                  context.broadcast(
                    "device.pair.resolved",
                    {
                      requestId: pairing.request.requestId,
                      deviceId: approved.device.deviceId,
                      decision: "approved",
                      ts: Date.now(),
                    },
                    { dropIfSlow: true },
                  );
                }
              }
            } else if (pairing.created) {
              context.broadcast("device.pair.requested", pairing.request, { dropIfSlow: true });
            }
            if (pairing.request.silent !== true) {
              setHandshakeState("failed");
              setCloseCause("pairing-required", {
                deviceId: device.id,
                requestId: pairing.request.requestId,
                reason,
              });
              send({
                type: "res",
                id: frame.id,
                ok: false,
                error: errorShape(ErrorCodes.NOT_PAIRED, "pairing required", {
                  details: { requestId: pairing.request.requestId },
                }),
              });
              close(1008, "pairing required");
              return false;
            }
            return true;
          };

          const paired = await getPairedDevice(device.id);
          const isPaired = paired?.publicKey === devicePublicKey;
          if (!isPaired) {
            const ok = await requirePairing("not-paired");
            if (!ok) {
              return;
            }
          } else {
            const hasLegacyPairedMetadata =
              paired.roles === undefined && paired.scopes === undefined;
            const pairedRoles = Array.isArray(paired.roles)
              ? paired.roles
              : paired.role
                ? [paired.role]
                : [];
            if (!hasLegacyPairedMetadata) {
              const allowedRoles = new Set(pairedRoles);
              if (allowedRoles.size === 0) {
                logUpgradeAudit("role-upgrade", pairedRoles, paired.scopes);
                const ok = await requirePairing("role-upgrade");
                if (!ok) {
                  return;
                }
              } else if (!allowedRoles.has(role)) {
                logUpgradeAudit("role-upgrade", pairedRoles, paired.scopes);
                const ok = await requirePairing("role-upgrade");
                if (!ok) {
                  return;
                }
              }

              const pairedScopes = Array.isArray(paired.scopes) ? paired.scopes : [];
              if (scopes.length > 0) {
                if (pairedScopes.length === 0) {
                  logUpgradeAudit("scope-upgrade", pairedRoles, pairedScopes);
                  const ok = await requirePairing("scope-upgrade");
                  if (!ok) {
                    return;
                  }
                } else {
                  const scopesAllowed = roleScopesAllow({
                    role,
                    requestedScopes: scopes,
                    allowedScopes: pairedScopes,
                  });
                  if (!scopesAllowed) {
                    logUpgradeAudit("scope-upgrade", pairedRoles, pairedScopes);
                    const ok = await requirePairing("scope-upgrade");
                    if (!ok) {
                      return;
                    }
                  }
                }
              }
            }

            await updatePairedDeviceMetadata(device.id, {
              displayName: connectParams.client.displayName,
              platform: connectParams.client.platform,
              clientId: connectParams.client.id,
              clientMode: connectParams.client.mode,
              role,
              scopes,
              remoteIp: reportedClientIp,
            });
          }
        }

        const deviceToken = device
          ? await ensureDeviceToken({ deviceId: device.id, role, scopes })
          : null;

        // Resolve the security role for authorization (Phase 3)
        // This is the fine-grained role (admin/operator/viewer/chat-only) from device pairing,
        // NOT the connection role (operator/node).
        let resolvedSecurityRole: string | undefined;
        if (ctxTokenValidation) {
          // ctx_ API token — role comes directly from the token
          resolvedSecurityRole = resolveCallerRole({
            tokenRole: ctxTokenValidation.role,
            defaultRole: "admin",
          });
        } else if (device) {
          try {
            const pairedForRole = await getPairedDevice(device.id);
            // Use securityRole field (Phase 2+), NOT role (which is the connection role "operator"/"node")
            const deviceSecRole = (pairedForRole as Record<string, unknown>)?.securityRole as
              | string
              | undefined;
            resolvedSecurityRole = resolveCallerRole({
              deviceSecurityRole: deviceSecRole,
              // NOTE: deviceToken?.role is the connection-level role ("operator"/"node"),
              // NOT the security role. Only securityRole from paired device metadata
              // or ctx_ API tokens should determine authorization level.
              defaultRole: "admin",
            });
          } catch {
            // Fall through to default
          }
        }
        if (!resolvedSecurityRole) {
          resolvedSecurityRole = resolveCallerRole({
            // Only ctx_ tokens carry meaningful security roles; device tokens don't
            defaultRole: "admin",
          });
        }

        // Invite code or pairing code role takes priority
        if (inviteOrCodeRole) {
          resolvedSecurityRole = inviteOrCodeRole;
        }

        if (role === "node") {
          const cfg = loadConfig();
          const allowlist = resolveNodeCommandAllowlist(cfg, {
            platform: connectParams.client.platform,
            deviceFamily: connectParams.client.deviceFamily,
          });
          const declared = Array.isArray(connectParams.commands) ? connectParams.commands : [];
          const filtered = declared
            .map((cmd) => cmd.trim())
            .filter((cmd) => cmd.length > 0 && allowlist.has(cmd));
          connectParams.commands = filtered;
        }

        const shouldTrackPresence = !isGatewayCliClient(connectParams.client);
        const clientId = connectParams.client.id;
        const instanceId = connectParams.client.instanceId;
        const presenceKey = shouldTrackPresence ? (device?.id ?? instanceId ?? connId) : undefined;

        logWs("in", "connect", {
          connId,
          client: connectParams.client.id,
          clientDisplayName: connectParams.client.displayName,
          version: connectParams.client.version,
          mode: connectParams.client.mode,
          clientId,
          platform: connectParams.client.platform,
          auth: authMethod,
        });

        if (isWebchatConnect(connectParams)) {
          logWsControl.info(
            `webchat connected conn=${connId} remote=${remoteAddr ?? "?"} client=${clientLabel} ${connectParams.client.mode} v${connectParams.client.version}`,
          );
        }

        if (presenceKey) {
          upsertPresence(presenceKey, {
            host: connectParams.client.displayName ?? connectParams.client.id ?? os.hostname(),
            ip: isLocalClient ? undefined : reportedClientIp,
            version: connectParams.client.version,
            platform: connectParams.client.platform,
            deviceFamily: connectParams.client.deviceFamily,
            modelIdentifier: connectParams.client.modelIdentifier,
            mode: connectParams.client.mode,
            deviceId: device?.id,
            roles: [role],
            scopes,
            instanceId: device?.id ?? instanceId,
            reason: "connect",
          });
          incrementPresenceVersion();
        }

        const snapshot = buildGatewaySnapshot();
        const cachedHealth = getHealthCache();
        if (cachedHealth) {
          snapshot.health = cachedHealth;
          snapshot.stateVersion.health = getHealthVersion();
        }
        const canvasCapability =
          role === "node" && canvasHostUrl ? mintCanvasCapabilityToken() : undefined;
        const canvasCapabilityExpiresAtMs = canvasCapability
          ? Date.now() + CANVAS_CAPABILITY_TTL_MS
          : undefined;
        const scopedCanvasHostUrl =
          canvasHostUrl && canvasCapability
            ? (buildCanvasScopedHostUrl(canvasHostUrl, canvasCapability) ?? canvasHostUrl)
            : canvasHostUrl;
        const resolvedAuthMode = ctxTokenValidation ? ("token" as const) : ("device" as const);
        // Resolve assistant identity for branding
        const assistantIdentity = resolveAssistantIdentity({
          cfg: configSnapshot,
          agentId: connectParams.agentId,
        });

        const helloOk = {
          type: "hello-ok",
          protocol: PROTOCOL_VERSION,
          server: {
            version: VERSION || resolveRuntimeServiceVersion(process.env),
            commit: process.env.GIT_COMMIT,
            host: os.hostname(),
            connId,
          },
          branding: {
            assistantName: assistantIdentity.name,
            assistantAvatar: assistantIdentity.avatar,
            assistantEmoji: assistantIdentity.emoji,
          },
          features: { methods: gatewayMethods, events },
          snapshot,
          canvasHostUrl: scopedCanvasHostUrl,
          auth: deviceToken
            ? {
                deviceToken: deviceToken.token,
                role: deviceToken.role,
                securityRole: resolvedSecurityRole,
                scopes: deviceToken.scopes,
                issuedAtMs: deviceToken.rotatedAtMs ?? deviceToken.createdAtMs,
                authMode: resolvedAuthMode,
              }
            : resolvedSecurityRole
              ? { securityRole: resolvedSecurityRole, authMode: resolvedAuthMode }
              : { authMode: resolvedAuthMode },
          policy: {
            maxPayload: MAX_PAYLOAD_BYTES,
            maxBufferedBytes: MAX_BUFFERED_BYTES,
            tickIntervalMs: TICK_INTERVAL_MS,
          },
        };

        clearHandshakeTimer();
        const nextClient: GatewayWsClient = {
          socket,
          connect: connectParams,
          connId,
          presenceKey,
          clientIp: reportedClientIp,
          canvasCapability,
          canvasCapabilityExpiresAtMs,
          securityRole: resolvedSecurityRole,
          authMode: resolvedAuthMode,
        };
        setClient(nextClient);
        setHandshakeState("connected");
        if (role === "node") {
          const context = buildRequestContext();
          const nodeSession = context.nodeRegistry.register(nextClient, {
            remoteIp: reportedClientIp,
          });
          logWsControl.info(
            `node registered nodeId=${nodeSession.nodeId} conn=${connId} caps=${(nodeSession.caps ?? []).join(",")} commands=${(nodeSession.commands ?? []).length} client=${clientLabel}`,
          );
          const instanceIdRaw = connectParams.client.instanceId;
          const instanceId = typeof instanceIdRaw === "string" ? instanceIdRaw.trim() : "";
          const nodeIdsForPairing = new Set<string>([nodeSession.nodeId]);
          if (instanceId) {
            nodeIdsForPairing.add(instanceId);
          }
          for (const nodeId of nodeIdsForPairing) {
            void updatePairedNodeMetadata(nodeId, {
              lastConnectedAtMs: nodeSession.connectedAtMs,
              version: nodeSession.version,
              coreVersion: nodeSession.coreVersion,
              displayName: nodeSession.displayName,
              platform: nodeSession.platform,
              caps: nodeSession.caps,
              commands: nodeSession.commands,
            }).catch((err) =>
              logGateway.warn(`failed to record last connect for ${nodeId}: ${formatForLog(err)}`),
            );
          }
          recordRemoteNodeInfo({
            nodeId: nodeSession.nodeId,
            displayName: nodeSession.displayName,
            platform: nodeSession.platform,
            deviceFamily: nodeSession.deviceFamily,
            commands: nodeSession.commands,
            remoteIp: nodeSession.remoteIp,
          });
          void refreshRemoteNodeBins({
            nodeId: nodeSession.nodeId,
            platform: nodeSession.platform,
            deviceFamily: nodeSession.deviceFamily,
            commands: nodeSession.commands,
            cfg: loadConfig(),
          }).catch((err) =>
            logGateway.warn(
              `remote bin probe failed for ${nodeSession.nodeId}: ${formatForLog(err)}`,
            ),
          );
          void loadVoiceWakeConfig()
            .then((cfg) => {
              context.nodeRegistry.sendEvent(nodeSession.nodeId, "voicewake.changed", {
                triggers: cfg.triggers,
              });
            })
            .catch((err) =>
              logGateway.warn(
                `voicewake snapshot failed for ${nodeSession.nodeId}: ${formatForLog(err)}`,
              ),
            );
        }

        logWs("out", "hello-ok", {
          connId,
          methods: gatewayMethods.length,
          events: events.length,
          presence: snapshot.presence.length,
          stateVersion: snapshot.stateVersion.presence,
        });

        send({ type: "res", id: frame.id, ok: true, payload: helloOk });
        void refreshGatewayHealthSnapshot({ probe: true }).catch((err) =>
          logHealth.error(`post-connect health refresh failed: ${formatError(err)}`),
        );
        return;
      }

      // After handshake, accept only req frames
      if (!validateRequestFrame(parsed)) {
        send({
          type: "res",
          id: (parsed as { id?: unknown })?.id ?? "invalid",
          ok: false,
          error: errorShape(
            ErrorCodes.INVALID_REQUEST,
            `invalid request frame: ${formatValidationErrors(validateRequestFrame.errors)}`,
          ),
        });
        return;
      }
      const req = parsed;
      logWs("in", "req", { connId, id: req.id, method: req.method });
      const respond = (
        ok: boolean,
        payload?: unknown,
        error?: ErrorShape,
        meta?: Record<string, unknown>,
      ) => {
        send({ type: "res", id: req.id, ok, payload, error });
        logWs("out", "res", {
          connId,
          id: req.id,
          ok,
          method: req.method,
          errorCode: error?.code,
          errorMessage: error?.message,
          ...meta,
        });
      };

      void (async () => {
        await handleGatewayRequest({
          req,
          respond,
          client,
          isWebchatConnect,
          extraHandlers,
          context: buildRequestContext(),
        });
      })().catch((err) => {
        logGateway.error(`request handler failed: ${formatForLog(err)}`);
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, formatForLog(err)));
      });
    } catch (err) {
      logGateway.error(`parse/handle error: ${String(err)}`);
      logWs("out", "parse-error", { connId, error: formatForLog(err) });
      if (!getClient()) {
        close();
      }
    }
  });
}
