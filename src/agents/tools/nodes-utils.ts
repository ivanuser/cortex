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

function pickDefaultNode(nodes: NodeListNode[], requiredCap?: string): NodeListNode | null {
  // Filter by required capability if specified
  const withCap = requiredCap
    ? nodes.filter((n) => (Array.isArray(n.caps) ? n.caps.includes(requiredCap) : true))
    : nodes;
  if (withCap.length === 0) {
    return null;
  }

  const connected = withCap.filter((n) => n.connected);
  const candidates = connected.length > 0 ? connected : withCap;
  if (candidates.length === 1) {
    return candidates[0];
  }

  const local = candidates.filter(
    (n) =>
      n.platform?.toLowerCase().startsWith("mac") &&
      typeof n.nodeId === "string" &&
      n.nodeId.startsWith("mac-"),
  );
  if (local.length === 1) {
    return local[0];
  }

  // If only one connected node, use it regardless of platform
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
): string {
  const q = String(query ?? "").trim();
  if (!q) {
    if (allowDefault) {
      const picked = pickDefaultNode(nodes, requiredCap);
      if (picked) {
        return picked.nodeId;
      }
    }
    const connected = nodes.filter((n) => n.connected);
    if (connected.length > 1) {
      const names = connected
        .map((n) => `  • ${n.displayName || n.nodeId} (${n.nodeId.slice(0, 8)}...)`)
        .join("\n");
      throw new Error(`Multiple nodes connected — specify which one:\n${names}`);
    }
    throw new Error("node required — no connected nodes found");
  }
  return resolveNodeIdFromCandidates(nodes, q);
}

export async function resolveNodeId(
  opts: GatewayCallOptions,
  query?: string,
  allowDefault = false,
  requiredCap?: string,
) {
  const nodes = await loadNodes(opts);
  return resolveNodeIdFromList(nodes, query, allowDefault, requiredCap);
}
