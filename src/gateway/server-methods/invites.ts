/**
 * Gateway RPC handlers for invite link management.
 */
import { InviteStore } from "../../security/invites.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const inviteHandlers: GatewayRequestHandlers = {
  "invite.create": async ({ params, respond, context }) => {
    const { role, expiresIn, maxUses } = params as {
      role?: string;
      expiresIn?: string;
      maxUses?: number;
    };
    const trimmedRole = String(role ?? "").trim();
    if (!trimmedRole) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "role is required"));
      return;
    }
    try {
      const store = InviteStore.init();
      const result = store.createInvite({
        role: trimmedRole,
        expiresIn: expiresIn?.trim(),
        maxUses: typeof maxUses === "number" ? maxUses : undefined,
      });
      context.logGateway.info(
        `invite created: role=${result.role} code=${result.code.slice(0, 8)}…`,
      );
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "invite.list": async ({ respond }) => {
    try {
      const store = InviteStore.init();
      const list = store.listInvites();
      respond(true, list, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "invite.revoke": async ({ params, respond, context }) => {
    const { code } = params as { code?: string };
    const trimmed = String(code ?? "").trim();
    if (!trimmed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "code is required"));
      return;
    }
    try {
      const store = InviteStore.init();
      const result = store.revokeInvite(trimmed);
      if (result.revoked) {
        context.logGateway.info(`invite revoked: code=${trimmed.slice(0, 8)}…`);
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
