import { AuditLogger } from "../audit/audit-logger.js";
import { loadConfig } from "../config/config.js";
import { authorize, type CallerContext } from "../security/authorize.js";
import { isValidRole } from "../security/roles.js";
import { formatControlPlaneActor, resolveControlPlaneActor } from "./control-plane-audit.js";
import { consumeControlPlaneWriteBudget } from "./control-plane-rate-limit.js";
import {
  ADMIN_SCOPE,
  authorizeOperatorScopesForMethod,
  isNodeRoleMethod,
} from "./method-scopes.js";
import { ErrorCodes, errorShape } from "./protocol/index.js";
import { agentHandlers } from "./server-methods/agent.js";
import { agentsHandlers } from "./server-methods/agents.js";
import { auditHandlers } from "./server-methods/audit.js";
import { browserHandlers } from "./server-methods/browser.js";
import { channelsHandlers } from "./server-methods/channels.js";
import { chatHandlers } from "./server-methods/chat.js";
import { configHandlers } from "./server-methods/config.js";
import { connectHandlers } from "./server-methods/connect.js";
import { cronHandlers } from "./server-methods/cron.js";
import { deviceHandlers } from "./server-methods/devices.js";
import { execApprovalsHandlers } from "./server-methods/exec-approvals.js";
import { healthHandlers } from "./server-methods/health.js";
import { inviteHandlers } from "./server-methods/invites.js";
import { logsHandlers } from "./server-methods/logs.js";
import { modelsHandlers } from "./server-methods/models.js";
import { nodeHandlers } from "./server-methods/nodes.js";
import { pairingCodeHandlers } from "./server-methods/pairing-codes.js";
import { pushHandlers } from "./server-methods/push.js";
import { sendHandlers } from "./server-methods/send.js";
import { sessionsHandlers } from "./server-methods/sessions.js";
import { skillsHandlers } from "./server-methods/skills.js";
import { systemHandlers } from "./server-methods/system.js";
import { talkHandlers } from "./server-methods/talk.js";
import { tokenHandlers } from "./server-methods/tokens.js";
import { ttsHandlers } from "./server-methods/tts.js";
import type { GatewayRequestHandlers, GatewayRequestOptions } from "./server-methods/types.js";
import { updateHandlers } from "./server-methods/update.js";
import { usageHandlers } from "./server-methods/usage.js";
import { voicewakeHandlers } from "./server-methods/voicewake.js";
import { webHandlers } from "./server-methods/web.js";
import { wizardHandlers } from "./server-methods/wizard.js";

const CONTROL_PLANE_WRITE_METHODS = new Set(["config.apply", "config.patch", "update.run"]);

/** Methods that always get audit logged when audit is enabled. */
const AUDIT_SENSITIVE_METHODS = new Set([
  "config.set",
  "config.apply",
  "config.patch",
  "device.pair.approve",
  "device.pair.reject",
  "node.pair.approve",
  "node.pair.reject",
  "exec.approvals.set",
  "sessions.delete",
  "update.run",
]);

type AuditLevel = "sensitive" | "all" | "off";

function resolveAuditConfig(): { enabled: boolean; level: AuditLevel } {
  try {
    const cfg = loadConfig();
    const security = (cfg as Record<string, unknown>).security as
      | { audit?: { enabled?: boolean; level?: string } }
      | undefined;
    const enabled = security?.audit?.enabled !== false; // default true
    const level = (security?.audit?.level as AuditLevel) ?? "sensitive";
    return { enabled, level };
  } catch {
    return { enabled: true, level: "sensitive" };
  }
}

function shouldAuditMethod(method: string, level: AuditLevel): boolean {
  if (level === "off") {
    return false;
  }
  if (level === "all") {
    return true;
  }
  return AUDIT_SENSITIVE_METHODS.has(method);
}

function auditLogMethodCall(
  method: string,
  client: GatewayRequestOptions["client"],
  result: "success" | "failure" | "denied",
): void {
  try {
    const logger = AuditLogger.getInstance();
    const actorType = client?.connect?.role ?? "unknown";
    const actorId = client?.connect?.client?.id ?? client?.connect?.device?.id ?? undefined;
    const ip = client?.clientIp ?? undefined;
    logger.log({
      actor_type: actorType as "operator" | "node" | "device" | "system" | "webchat" | "unknown",
      actor_id: actorId,
      action: method,
      ip,
      result,
      details: result !== "success" ? `method ${method} ${result}` : undefined,
    });
  } catch {
    // Never crash from audit logging
  }
}
function authorizeGatewayMethod(method: string, client: GatewayRequestOptions["client"]) {
  if (!client?.connect) {
    return null;
  }
  if (method === "health" || method === "tick") {
    return null;
  }
  const role = client.connect.role ?? "operator";
  const scopes = client.connect.scopes ?? [];
  if (isNodeRoleMethod(method)) {
    if (role === "node") {
      return null;
    }
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role === "node") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (role !== "operator") {
    return errorShape(ErrorCodes.INVALID_REQUEST, `unauthorized role: ${role}`);
  }
  if (scopes.includes(ADMIN_SCOPE)) {
    return null;
  }
  const scopeAuth = authorizeOperatorScopesForMethod(method, scopes);
  if (!scopeAuth.allowed) {
    return errorShape(ErrorCodes.INVALID_REQUEST, `missing scope: ${scopeAuth.missingScope}`);
  }
  return null;
}

export const coreGatewayHandlers: GatewayRequestHandlers = {
  ...connectHandlers,
  ...logsHandlers,
  ...voicewakeHandlers,
  ...healthHandlers,
  ...channelsHandlers,
  ...chatHandlers,
  ...cronHandlers,
  ...deviceHandlers,
  ...execApprovalsHandlers,
  ...webHandlers,
  ...modelsHandlers,
  ...configHandlers,
  ...wizardHandlers,
  ...talkHandlers,
  ...ttsHandlers,
  ...skillsHandlers,
  ...sessionsHandlers,
  ...systemHandlers,
  ...updateHandlers,
  ...nodeHandlers,
  ...pushHandlers,
  ...sendHandlers,
  ...usageHandlers,
  ...agentHandlers,
  ...agentsHandlers,
  ...browserHandlers,
  ...auditHandlers,
  ...tokenHandlers,
  ...inviteHandlers,
  ...pairingCodeHandlers,
};

export async function handleGatewayRequest(
  opts: GatewayRequestOptions & { extraHandlers?: GatewayRequestHandlers },
): Promise<void> {
  const { req, respond, client, isWebchatConnect, context } = opts;
  const authError = authorizeGatewayMethod(req.method, client);
  if (authError) {
    // Audit log auth failures
    const auditCfg = resolveAuditConfig();
    if (auditCfg.enabled) {
      auditLogMethodCall(req.method, client, "denied");
    }
    respond(false, undefined, authError);
    return;
  }

  // Phase 3: Role-based authorization (admin/operator/viewer/chat-only)
  // Only applies to operator connections that have a securityRole set.
  if (client?.securityRole && isValidRole(client.securityRole)) {
    const callerCtx: CallerContext = {
      role: client.securityRole,
      deviceId: client.connect?.device?.id,
      clientIp: client.clientIp,
      clientId: client.connect?.client?.id,
    };
    const authzResult = authorize(req.method, callerCtx);
    if (!authzResult.allowed) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, authzResult.reason ?? "forbidden", {
          details: { code: "FORBIDDEN", securityRole: client.securityRole },
        }),
      );
      return;
    }
  }
  if (CONTROL_PLANE_WRITE_METHODS.has(req.method)) {
    const budget = consumeControlPlaneWriteBudget({ client });
    if (!budget.allowed) {
      const actor = resolveControlPlaneActor(client);
      context.logGateway.warn(
        `control-plane write rate-limited method=${req.method} ${formatControlPlaneActor(actor)} retryAfterMs=${budget.retryAfterMs} key=${budget.key}`,
      );
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `rate limit exceeded for ${req.method}; retry after ${Math.ceil(budget.retryAfterMs / 1000)}s`,
          {
            retryable: true,
            retryAfterMs: budget.retryAfterMs,
            details: {
              method: req.method,
              limit: "3 per 60s",
            },
          },
        ),
      );
      return;
    }
  }
  const handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];
  if (!handler) {
    respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`),
    );
    return;
  }

  // Audit logging for sensitive (or all) methods
  const auditCfg = resolveAuditConfig();
  const shouldAudit = auditCfg.enabled && shouldAuditMethod(req.method, auditCfg.level);

  if (shouldAudit) {
    // Wrap respond to capture success/failure for audit
    const originalRespond = respond;
    const auditedRespond: typeof respond = (ok, payload, error, meta) => {
      auditLogMethodCall(req.method, client, ok ? "success" : "failure");
      originalRespond(ok, payload, error, meta);
    };
    await handler({
      req,
      params: (req.params ?? {}) as Record<string, unknown>,
      client,
      isWebchatConnect,
      respond: auditedRespond,
      context,
    });
  } else {
    await handler({
      req,
      params: (req.params ?? {}) as Record<string, unknown>,
      client,
      isWebchatConnect,
      respond,
      context,
    });
  }
}
