/**
 * Agent Routing — maps agents to their hosting node connections.
 *
 * When a Synapse desktop (sub-gateway) connects and announces agents via
 * agents.create, this module records which WebSocket connection hosts each agent.
 * When chat.send targets a non-default agent, the gateway can route the message
 * to the correct node for processing.
 */

import type { GatewayWsClient } from "./server/ws-types.js";

/** Tracks which node connection hosts which agent. */
const agentNodeMap = new Map<
  string,
  {
    client: GatewayWsClient;
    connId: string;
    registeredAt: number;
  }
>();

/**
 * Register that a node connection hosts a specific agent.
 * Called from agents.create when the caller is a node connection.
 */
export function registerAgentNode(agentId: string, client: GatewayWsClient): void {
  agentNodeMap.set(agentId, {
    client,
    connId: client.connId,
    registeredAt: Date.now(),
  });
}

/**
 * Unregister all agents hosted by a specific connection (e.g. on disconnect).
 */
export function unregisterNodeAgents(connId: string): string[] {
  const removed: string[] = [];
  for (const [agentId, entry] of agentNodeMap.entries()) {
    if (entry.connId === connId) {
      agentNodeMap.delete(agentId);
      removed.push(agentId);
    }
  }
  return removed;
}

/**
 * Look up the node connection hosting a specific agent.
 * Returns null if the agent is local (default) or not hosted by any node.
 */
export function getAgentNode(agentId: string): GatewayWsClient | null {
  const entry = agentNodeMap.get(agentId);
  if (!entry) {
    return null;
  }
  // Check if the WebSocket is still open
  if (entry.client.socket.readyState !== 1 /* OPEN */) {
    agentNodeMap.delete(agentId);
    return null;
  }
  return entry.client;
}

/**
 * Check if an agent is hosted on a remote node (vs local/default).
 */
export function isRemoteAgent(agentId: string): boolean {
  return getAgentNode(agentId) !== null;
}

/**
 * List all remotely-hosted agents and their node info.
 */
export function listRemoteAgents(): Array<{
  agentId: string;
  connId: string;
  hostname?: string;
  registeredAt: number;
}> {
  const result: Array<{
    agentId: string;
    connId: string;
    hostname?: string;
    registeredAt: number;
  }> = [];
  for (const [agentId, entry] of agentNodeMap.entries()) {
    if (entry.client.socket.readyState === 1) {
      result.push({
        agentId,
        connId: entry.connId,
        hostname: entry.client.connect?.client?.hostname,
        registeredAt: entry.registeredAt,
      });
    }
  }
  return result;
}

/**
 * Forward a chat message to a remote agent's node for processing.
 * The node should handle it via its embedded gateway and return the response.
 */
export function forwardToAgent(
  agentId: string,
  payload: {
    sessionKey: string;
    message: string;
    thinking?: string;
    runId: string;
  },
): boolean {
  const client = getAgentNode(agentId);
  if (!client) {
    return false;
  }

  try {
    client.socket.send(
      JSON.stringify({
        type: "event",
        event: "agent.chat.request",
        payload: {
          agentId,
          sessionKey: payload.sessionKey,
          message: payload.message,
          thinking: payload.thinking,
          runId: payload.runId,
          timestamp: Date.now(),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}
