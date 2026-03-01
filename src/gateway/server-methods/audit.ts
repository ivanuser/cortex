/**
 * Audit RPC method handlers (#6)
 * Registers audit.query and audit.stats as gateway RPC methods.
 */
import { AuditLogger } from "../../audit/audit-logger.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const auditHandlers: GatewayRequestHandlers = {
  "audit.query": ({ params, respond }) => {
    try {
      const logger = AuditLogger.getInstance();
      const filters: Record<string, unknown> = {};

      if (typeof params.action === "string") {
        filters.action = params.action;
      }
      if (typeof params.actor === "string") {
        filters.actor = params.actor;
      }
      if (typeof params.since === "number") {
        filters.since = params.since;
      }
      if (typeof params.until === "number") {
        filters.until = params.until;
      }
      if (typeof params.result === "string") {
        filters.result = params.result;
      }
      if (typeof params.limit === "number") {
        filters.limit = params.limit;
      }
      if (typeof params.offset === "number") {
        filters.offset = params.offset;
      }

      const entries = logger.query(filters);
      respond(true, { entries, count: entries.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `audit query failed: ${String(err)}`),
      );
    }
  },

  "audit.stats": ({ params, respond }) => {
    try {
      const logger = AuditLogger.getInstance();
      const filters: { since?: number } = {};
      if (typeof params.since === "number") {
        filters.since = params.since;
      }
      const stats = logger.stats(Object.keys(filters).length > 0 ? filters : undefined);
      respond(true, stats, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `audit stats failed: ${String(err)}`),
      );
    }
  },

  "audit.prune": ({ params, respond }) => {
    try {
      const logger = AuditLogger.getInstance();
      const olderThanDays = typeof params.olderThanDays === "number" ? params.olderThanDays : 90;
      if (olderThanDays < 1) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "olderThanDays must be >= 1"),
        );
        return;
      }
      const deleted = logger.prune(olderThanDays);
      respond(true, { deleted, olderThanDays }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `audit prune failed: ${String(err)}`),
      );
    }
  },
};
