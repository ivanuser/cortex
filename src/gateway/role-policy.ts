import { isNodeRoleMethod } from "./method-scopes.js";

export const GATEWAY_ROLES = ["operator", "node"] as const;

export type GatewayRole = (typeof GATEWAY_ROLES)[number];

export function parseGatewayRole(roleRaw: unknown): GatewayRole | null {
  if (roleRaw === "operator" || roleRaw === "node") {
    return roleRaw;
  }
  return null;
}

export function roleCanSkipDeviceIdentity(role: GatewayRole, sharedAuthOk: boolean): boolean {
  // Allow both operators and nodes to skip device identity when they have valid shared auth (token).
  // Upstream restricts to operators only, but our multi-agent network relies on nodes connecting
  // with token auth from Synapse desktop apps that don't implement Ed25519 device identity yet.
  return (role === "operator" || role === "node") && sharedAuthOk;
}

export function isRoleAuthorizedForMethod(role: GatewayRole, method: string): boolean {
  if (isNodeRoleMethod(method)) {
    return role === "node";
  }
  return role === "operator";
}
