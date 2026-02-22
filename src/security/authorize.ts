/**
 * Authorization Middleware — Phase 3 Per-Method Authorization
 *
 * Checks whether a caller (identified by role, device ID, or token)
 * is authorized to invoke a given RPC method. Logs denied attempts
 * to the audit log.
 */
import { AuditLogger } from "../audit/audit-logger.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Role } from "./roles.js";
import { isMethodAllowedForRole, isValidRole } from "./roles.js";

const log = createSubsystemLogger("authorize");

// ─── Types ───────────────────────────────────────

export interface CallerContext {
  /** The security role of the caller (admin, operator, viewer, chat-only). */
  role: Role;
  /** Device ID if the caller authenticated via device identity. */
  deviceId?: string;
  /** Token name/ID if the caller authenticated via API token. */
  tokenName?: string;
  /** Client IP for audit logging. */
  clientIp?: string;
  /** Client identifier (e.g. "openclaw-cli", "openclaw-control-ui"). */
  clientId?: string;
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
}

// ─── Always-Allowed Methods ──────────────────────
// These methods are essential for connection lifecycle and
// must be accessible regardless of role.

const ALWAYS_ALLOWED_METHODS = new Set([
  "connect",
  "hello",
  "tick",
  "health",
  "status",
]);

// ─── Authorization Check ─────────────────────────

/**
 * Check if a caller is authorized to invoke a given RPC method.
 *
 * @param methodName - The RPC method being invoked
 * @param caller - Context about who is making the call
 * @returns Authorization result with allow/deny and reason
 */
export function authorize(methodName: string, caller: CallerContext): AuthorizationResult {
  // Always-allowed methods bypass role checks
  if (ALWAYS_ALLOWED_METHODS.has(methodName)) {
    return { allowed: true };
  }

  // Validate the role
  if (!isValidRole(caller.role)) {
    const reason = `invalid role: ${String(caller.role)}`;
    const result: AuthorizationResult = {
      allowed: false,
      reason,
    };
    logDenied(methodName, caller, reason);
    return result;
  }

  // Check role-based permission
  if (!isMethodAllowedForRole(caller.role, methodName)) {
    const result: AuthorizationResult = {
      allowed: false,
      reason: `role "${caller.role}" is not authorized to call "${methodName}"`,
    };
    logDenied(methodName, caller, result.reason!);
    return result;
  }

  return { allowed: true };
}

// ─── Audit Logging for Denied Attempts ───────────

function logDenied(methodName: string, caller: CallerContext, reason: string): void {
  try {
    const actorId = caller.deviceId ?? caller.tokenName ?? caller.clientId ?? "unknown";
    log.warn(
      `authorization denied: method=${methodName} role=${caller.role} actor=${actorId} reason=${reason}`,
    );

    const logger = AuditLogger.getInstance();
    logger.log({
      actor_type: caller.deviceId ? "device" : caller.tokenName ? "system" : "unknown",
      actor_id: actorId,
      action: `authorize.denied:${methodName}`,
      resource: methodName,
      details: reason,
      ip: caller.clientIp,
      result: "denied",
    });
  } catch {
    // Never crash from logging
  }
}

// ─── Helper: Resolve caller role from connection ──

/**
 * Resolve the effective security role for a gateway client.
 * Priority: device role (from pairing) > token role > default "admin".
 *
 * Note: The gateway's existing role field (operator/node) is the connection role,
 * not the security role. The security role comes from device pairing metadata
 * or API token validation.
 */
export function resolveCallerRole(opts: {
  /** Security role from device pairing metadata */
  deviceSecurityRole?: string;
  /** Role from API token validation */
  tokenRole?: string;
  /** Fallback default */
  defaultRole?: Role;
}): Role {
  // Device security role takes priority
  if (opts.deviceSecurityRole && isValidRole(opts.deviceSecurityRole)) {
    return opts.deviceSecurityRole;
  }
  // Token role is next
  if (opts.tokenRole && isValidRole(opts.tokenRole)) {
    return opts.tokenRole;
  }
  // Default to admin (backward compat: existing connections without explicit role are admin)
  return opts.defaultRole ?? "admin";
}
