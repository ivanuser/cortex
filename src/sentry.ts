/**
 * Sentry integration for Cortex Gateway.
 *
 * Uses @sentry/core directly to avoid @sentry/node's eager OTel imports
 * (Fastify, Prisma, Express, etc.) which fail when those packages aren't installed.
 *
 * We only need: error capture, unhandled rejection/exception hooks, breadcrumbs.
 */

import { version } from "../package.json" with { type: "json" };

const SENTRY_DSN = "https://af877b470afb42d20e56491efa42b71a@sentry.honercloud.com/4";

interface SentryLike {
  init(opts: Record<string, unknown>): void;
  captureException(err: unknown, hint?: Record<string, unknown>): void;
  captureMessage(msg: string, level?: string): void;
  setTag(key: string, value: string): void;
  addBreadcrumb(bc: Record<string, unknown>): void;
}

let sentry: SentryLike | null = null;
let initialized = false;

export async function initSentry(): Promise<void> {
  if (initialized) {
    return;
  }
  if (process.env.SENTRY_DISABLED === "1" || process.env.SENTRY_DISABLED === "true") {
    return;
  }

  const dsn = process.env.SENTRY_DSN || SENTRY_DSN;

  try {
    // Use @sentry/node-core (not @sentry/node) to avoid heavy OTel auto-instrumentation imports
    const core = await import("@sentry/node-core");

    core.init({
      dsn,
      environment: process.env.NODE_ENV || "production",
      release: `cortex-gateway@${version}`,
      tracesSampleRate: 0.1,
      defaultIntegrations: false,
      integrations: [core.inboundFiltersIntegration(), core.linkedErrorsIntegration()],
      beforeSend(event: Record<string, unknown>) {
        // Scrub tokens from extras
        const extra = event.extra as Record<string, unknown> | undefined;
        if (extra) {
          for (const key of Object.keys(extra)) {
            if (/token|password|secret|key|auth|dsn/i.test(key)) {
              extra[key] = "[REDACTED]";
            }
          }
        }
        // Scrub ctx_ tokens from breadcrumb messages
        const breadcrumbs = event.breadcrumbs as Array<{ message?: string }> | undefined;
        if (breadcrumbs) {
          for (const bc of breadcrumbs) {
            if (bc.message) {
              bc.message = bc.message.replace(/ctx_[a-f0-9]+/g, "ctx_[REDACTED]");
            }
          }
        }
        return event;
      },
      ignoreErrors: ["ECONNRESET", "EPIPE", "ENOTFOUND", "socket hang up", "write after end"],
    });

    sentry = core as unknown as SentryLike;
    initialized = true;

    // Set up global unhandled rejection/exception capture
    process.on("unhandledRejection", (reason) => {
      if (sentry && reason instanceof Error) {
        sentry.captureException(reason);
      }
    });
    process.on("uncaughtException", (err) => {
      if (sentry) {
        sentry.captureException(err);
      }
    });

    console.log(`[sentry] initialized for cortex-gateway@${version}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND") {
      console.warn("[sentry] failed to initialize:", err);
    }
  }
}

export function captureException(err: Error, context?: Record<string, unknown>): void {
  if (!sentry) {
    return;
  }
  sentry.captureException(err, { extra: context });
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info"): void {
  if (!sentry) {
    return;
  }
  sentry.captureMessage(msg, level);
}

export function setTag(key: string, value: string): void {
  if (!sentry) {
    return;
  }
  sentry.setTag(key, value);
}

export function addBreadcrumb(
  category: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!sentry) {
    return;
  }
  sentry.addBreadcrumb({ category, message, level });
}
