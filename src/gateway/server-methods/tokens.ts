/**
 * Gateway RPC handlers for token management.
 */
import { TokenStore } from "../../security/tokens.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const tokenHandlers: GatewayRequestHandlers = {
  "tokens.create": async ({ params, respond, context }) => {
    const { name, role, expires, scopes } = params as {
      name?: string;
      role?: string;
      expires?: string;
      scopes?: string[];
    };
    const trimmedName = String(name ?? "").trim();
    const trimmedRole = String(role ?? "").trim();
    if (!trimmedName || !trimmedRole) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name and role are required"),
      );
      return;
    }
    try {
      const store = TokenStore.init();
      const result = store.create({
        name: trimmedName,
        role: trimmedRole,
        scopes: Array.isArray(scopes) ? scopes : undefined,
        expires: expires?.trim(),
      });
      context.logGateway.info(`API token created: name=${result.name} role=${result.role}`);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
    }
  },

  "tokens.list": async ({ respond }) => {
    try {
      const store = TokenStore.init();
      const list = store.list();
      respond(true, list, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "tokens.revoke": async ({ params, respond, context }) => {
    const { identifier } = params as { identifier?: string };
    const trimmed = String(identifier ?? "").trim();
    if (!trimmed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "identifier is required"));
      return;
    }
    try {
      const store = TokenStore.init();
      const result = store.revoke(trimmed);
      if (result.revoked) {
        context.logGateway.info(`API token revoked: name=${result.name ?? trimmed}`);
      }
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
