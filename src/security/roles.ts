/**
 * Role-Based Access Control — Phase 2 Security Foundation
 *
 * Defines the role hierarchy, permission matrix, and helper functions
 * for the Cortex fork's scoped-role security model.
 */

// ─── Role Enum ───────────────────────────────────

export const ROLES = ["admin", "operator", "viewer", "chat-only"] as const;
export type Role = (typeof ROLES)[number];

export function isValidRole(value: string): value is Role {
  return ROLES.includes(value as Role);
}

// ─── Permission Enum ─────────────────────────────

export const PERMISSIONS = [
  "config.manage",
  "device.pair.manage",
  "node.pair.manage",
  "exec.approvals.manage",
  "chat.send",
  "chat.history",
  "chat.history.own",
  "sessions.list",
  "sessions.delete",
  "status.read",
  "audit.read",
  "models.list",
  "update.run",
  "cron.manage",
  "logs.tail",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ─── Permission Matrix ──────────────────────────

export type RolePermissions = Record<Role, ReadonlySet<Permission>>;

const ROLE_PERMISSIONS: RolePermissions = {
  admin: new Set<Permission>([
    "config.manage",
    "device.pair.manage",
    "node.pair.manage",
    "exec.approvals.manage",
    "chat.send",
    "chat.history",
    "chat.history.own",
    "sessions.list",
    "sessions.delete",
    "status.read",
    "audit.read",
    "models.list",
    "update.run",
    "cron.manage",
    "logs.tail",
  ]),
  operator: new Set<Permission>([
    "exec.approvals.manage",
    "chat.send",
    "chat.history",
    "chat.history.own",
    "sessions.list",
    "sessions.delete",
    "status.read",
    "models.list",
    "cron.manage",
    "logs.tail",
  ]),
  viewer: new Set<Permission>([
    "chat.history",
    "chat.history.own",
    "sessions.list",
    "status.read",
    "models.list",
    "logs.tail",
  ]),
  "chat-only": new Set<Permission>(["chat.send", "chat.history.own"]),
};

// ─── Role Hierarchy (admin > operator > viewer > chat-only) ──

const ROLE_RANK: Record<Role, number> = {
  admin: 100,
  operator: 50,
  viewer: 20,
  "chat-only": 10,
};

export function getRoleRank(role: Role): number {
  return ROLE_RANK[role] ?? 0;
}

export function isRoleAtLeast(role: Role, minimum: Role): boolean {
  return getRoleRank(role) >= getRoleRank(minimum);
}

// ─── Permission Check ───────────────────────────

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) {
    return false;
  }
  return perms.has(permission);
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) {
    return [];
  }
  return [...perms];
}

// ─── RPC Method → Permission Mapping ────────────

const METHOD_PERMISSION_MAP: Record<string, Permission> = {
  // Config
  "config.set": "config.manage",
  "config.apply": "config.manage",
  "config.patch": "config.manage",

  // Device pairing
  "device.pair.approve": "device.pair.manage",
  "device.pair.reject": "device.pair.manage",
  "device.pair.remove": "device.pair.manage",
  "device.pair.list": "device.pair.manage",
  "device.token.rotate": "device.pair.manage",
  "device.token.revoke": "device.pair.manage",
  "device.role.set": "device.pair.manage",

  // Node pairing
  "node.pair.approve": "node.pair.manage",
  "node.pair.reject": "node.pair.manage",

  // Exec approvals
  "exec.approvals.set": "exec.approvals.manage",
  "exec.approvals.node.set": "exec.approvals.manage",

  // Chat
  "chat.send": "chat.send",
  "chat.history": "chat.history",

  // Sessions
  "sessions.list": "sessions.list",
  "sessions.preview": "sessions.list",
  "sessions.delete": "sessions.delete",
  "sessions.reset": "sessions.delete",
  "sessions.compact": "sessions.delete",
  "sessions.patch": "sessions.delete",

  // Status
  health: "status.read",
  status: "status.read",
  "usage.status": "status.read",
  "usage.cost": "status.read",

  // Audit
  "audit.query": "audit.read",
  "audit.stats": "audit.read",
  "audit.prune": "audit.read",

  // Models
  "models.list": "models.list",

  // Update
  "update.run": "update.run",

  // Cron
  "cron.list": "cron.manage",
  "cron.status": "cron.manage",
  "cron.add": "cron.manage",
  "cron.update": "cron.manage",
  "cron.remove": "cron.manage",
  "cron.run": "cron.manage",
  "cron.runs": "cron.manage",

  // Logs
  "logs.tail": "logs.tail",

  // Token management (admin only — maps to config.manage)
  "tokens.create": "config.manage",
  "tokens.list": "config.manage",
  "tokens.revoke": "config.manage",

  // Invite management (admin only — maps to device.pair.manage)
  "invite.create": "device.pair.manage",
  "invite.list": "device.pair.manage",
  "invite.revoke": "device.pair.manage",

  // Pairing codes (admin only — maps to device.pair.manage)
  "pair.code.generate": "device.pair.manage",
  "pair.code.validate": "device.pair.manage",
};

/**
 * Get the permission required for a given RPC method.
 * Returns null for methods that are unclassified (default-allow or handled elsewhere).
 */
export function getMethodPermission(methodName: string): Permission | null {
  return METHOD_PERMISSION_MAP[methodName] ?? null;
}

/**
 * Check if a role is allowed to call a given RPC method.
 * Methods without a mapped permission are allowed by default
 * (they fall through to the existing scope-based auth).
 */
export function isMethodAllowedForRole(role: Role, methodName: string): boolean {
  const permission = getMethodPermission(methodName);
  if (!permission) {
    // Unclassified methods — fall through to existing auth
    return true;
  }
  return hasPermission(role, permission);
}
