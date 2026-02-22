/**
 * Client-side Permission Definitions — Phase 3 UI Authorization
 *
 * Mirrors the gateway's roles.ts for permission-aware rendering.
 * This is a plain .ts file (no Svelte runes).
 */

// ─── Role Definitions ────────────────────────────

export const ROLES = ["admin", "operator", "viewer", "chat-only"] as const;
export type Role = (typeof ROLES)[number];

export function isValidRole(value: string): value is Role {
  return ROLES.includes(value as Role);
}

// ─── Permission Definitions ──────────────────────

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

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
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

// ─── Permission Check Helpers ────────────────────

export function hasPermission(role: Role, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) {return false;}
  return perms.has(permission);
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) {return [];}
  return [...perms];
}

// ─── Page Access Definitions ─────────────────────
// Maps page paths to the permission(s) required to access them.

export interface PageAccess {
  /** The permission required. If undefined, the page is always visible. */
  permission?: Permission;
  /** Minimum role required (alternative to permission check). */
  minRoles?: Role[];
  /** Label for access-denied messages. */
  label: string;
}

/**
 * Page access rules for Cortex UI routes.
 * Pages not listed here are accessible to all roles.
 */
export const PAGE_ACCESS: Record<string, PageAccess> = {
  "/": { label: "Chat", minRoles: ["admin", "operator", "chat-only"] },
  "/config": { permission: "config.manage", label: "Gateway Config" },
  "/tokens": { permission: "config.manage", label: "API Tokens" },
  "/audit": { permission: "audit.read", label: "Audit Log" },
  "/approvals": { permission: "exec.approvals.manage", label: "Approvals" },
  "/sessions": { permission: "sessions.list", label: "Sessions" },
  "/cron": { permission: "cron.manage", label: "Cron Jobs" },
  "/overview": { permission: "status.read", label: "Overview" },
  "/usage": { permission: "status.read", label: "Usage" },
  "/logs": { permission: "logs.tail", label: "Logs" },
  "/nodes": { permission: "status.read", label: "Nodes" },
  "/instances": { permission: "status.read", label: "Instances" },
  "/channels": { permission: "status.read", label: "Channels" },
  "/agents": { permission: "status.read", label: "Agents" },
  "/skills": { permission: "status.read", label: "Skills" },
  "/memory": { permission: "status.read", label: "Memory" },
};

/**
 * Check if a role can access a given page path.
 */
export function canAccessPage(role: Role, path: string): boolean {
  const access = PAGE_ACCESS[path];
  if (!access) {return true;} // Unlisted pages are open

  // Check minRoles first (for pages like Chat that need special role list)
  if (access.minRoles) {
    return access.minRoles.includes(role);
  }

  // Check permission
  if (access.permission) {
    return hasPermission(role, access.permission);
  }

  return true;
}

/**
 * Get the access denied label for a page, or null if accessible.
 */
export function getPageAccessDeniedLabel(role: Role, path: string): string | null {
  if (canAccessPage(role, path)) {return null;}
  const access = PAGE_ACCESS[path];
  return access?.label ?? "This page";
}
