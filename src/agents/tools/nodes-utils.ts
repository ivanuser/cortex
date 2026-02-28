import { parseNodeList, parsePairingList } from "../../shared/node-list-parse.js";
import type { NodeListNode } from "../../shared/node-list-types.js";
import { resolveNodeIdFromCandidates } from "../../shared/node-match.js";
import { callGatewayTool, type GatewayCallOptions } from "./gateway.js";

export type { NodeListNode };

async function loadNodes(opts: GatewayCallOptions): Promise<NodeListNode[]> {
  try {
    const res = await callGatewayTool("node.list", opts, {});
    return parseNodeList(res);
  } catch {
    const res = await callGatewayTool("node.pair.list", opts, {});
    const { paired } = parsePairingList(res);
    return paired.map((n) => ({
      nodeId: n.nodeId,
      displayName: n.displayName,
      platform: n.platform,
      remoteIp: n.remoteIp,
    }));
  }
}

/** Normalize platform strings for matching. Supports common aliases. */
function normalizePlatform(platform?: string): string {
  const p = (platform ?? "").trim().toLowerCase();
  if (p === "win" || p === "win32" || p === "win64") {
    return "windows";
  }
  if (p === "mac" || p === "macos" || p === "osx" || p === "darwin") {
    return "macos";
  }
  if (p === "lin") {
    return "linux";
  }
  return p;
}

function pickDefaultNode(
  nodes: NodeListNode[],
  requiredCap?: string,
  platform?: string,
): NodeListNode | null {
  // Filter by required capability if specified
  const withCap = requiredCap
    ? nodes.filter((n) => (Array.isArray(n.caps) ? n.caps.includes(requiredCap) : true))
    : nodes;
  if (withCap.length === 0) {
    return null;
  }

  // Filter by platform if specified
  const normalizedPlatform = platform ? normalizePlatform(platform) : undefined;
  const withPlatform = normalizedPlatform
    ? withCap.filter((n) => normalizePlatform(n.platform) === normalizedPlatform)
    : withCap;
  if (withPlatform.length === 0) {
    return null;
  }

  const connected = withPlatform.filter((n) => n.connected);
  const candidates = connected.length > 0 ? connected : withPlatform;
  if (candidates.length === 1) {
    return candidates[0];
  }

  // If only one connected node, use it regardless of other factors
  if (connected.length === 1) {
    return connected[0];
  }

  return null;
}

export async function listNodes(opts: GatewayCallOptions): Promise<NodeListNode[]> {
  return loadNodes(opts);
}

export function resolveNodeIdFromList(
  nodes: NodeListNode[],
  query?: string,
  allowDefault = false,
  requiredCap?: string,
  platform?: string,
): string {
  const q = String(query ?? "").trim();
  if (!q) {
    if (allowDefault) {
      const picked = pickDefaultNode(nodes, requiredCap, platform);
      if (picked) {
        return picked.nodeId;
      }
    }
    // Filter by platform if specified to give better error messages
    const normalizedPlatform = platform ? normalizePlatform(platform) : undefined;
    const connected = nodes.filter((n) => n.connected);
    const filtered = normalizedPlatform
      ? connected.filter((n) => normalizePlatform(n.platform) === normalizedPlatform)
      : connected;
    if (filtered.length === 0 && normalizedPlatform) {
      const available = connected
        .map((n) => `  • ${n.displayName || n.nodeId} (${n.platform || "unknown"})`)
        .join("\n");
      throw new Error(
        `No ${platform} node connected.${available ? ` Available nodes:\n${available}` : ""}`,
      );
    }
    if (filtered.length > 1) {
      const names = filtered
        .map((n) => `  • ${n.displayName || n.nodeId} (${n.nodeId.slice(0, 8)}...)`)
        .join("\n");
      throw new Error(`Multiple nodes connected — specify which one:\n${names}`);
    }
    throw new Error("node required — no connected nodes found");
  }
  return resolveNodeIdFromCandidates(nodes, q);
}

export { normalizePlatform };

export async function resolveNodeId(
  opts: GatewayCallOptions,
  query?: string,
  allowDefault = false,
  requiredCap?: string,
  platform?: string,
) {
  const nodes = await loadNodes(opts);
  return resolveNodeIdFromList(nodes, query, allowDefault, requiredCap, platform);
}
