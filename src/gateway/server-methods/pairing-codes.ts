/**
 * Gateway RPC handlers for 6-digit pairing codes.
 */
import { generatePairingCode, validatePairingCode } from "../../security/pairing-codes.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const pairingCodeHandlers: GatewayRequestHandlers = {
  "pair.code.generate": async ({ params, respond, context }) => {
    const { role } = params as { role?: string };
    try {
      const result = generatePairingCode(role?.trim());
      context.logGateway.info(`pairing code generated: role=${result.role}`);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "pair.code.validate": async ({ params, respond }) => {
    const { code } = params as { code?: string };
    const trimmed = String(code ?? "").trim();
    if (!trimmed) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "code is required"));
      return;
    }
    try {
      const result = validatePairingCode(trimmed);
      if (result.valid) {
        respond(true, { valid: true, role: result.role }, undefined);
      } else {
        respond(true, { valid: false }, undefined);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
