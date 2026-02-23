import type { WebSocket } from "ws";
import type { ConnectParams } from "../protocol/index.js";

export type GatewayWsClient = {
  socket: WebSocket;
  connect: ConnectParams;
  connId: string;
  presenceKey?: string;
  clientIp?: string;
  canvasCapability?: string;
  canvasCapabilityExpiresAtMs?: number;
  /** Security role from device pairing or API token (admin/operator/viewer/chat-only). */
  securityRole?: string;
  /** How this client authenticated: "device" (keypair+pairing) or "token" (ctx_ API token). */
  authMode?: "device" | "token";
};
