/**
 * Sentry integration for Cortex Gateway.
 *
 * Initializes error tracking + performance monitoring.
 * Gracefully no-ops if @sentry/node isn't available.
 */

import { version } from "../package.json" with { type: "json" };

let sentryModule: typeof import("@sentry/node") | null = null;
let initialized = false;

const SENTRY_DSN = "https://af877b470afb42d20e56491efa42b71a@sentry.honercloud.com/4";

export async function initSentry(): Promise<void> {
  if (initialized) {
    return;
  }

  // Allow disabling via env
  if (process.env.SENTRY_DISABLED === "1" || process.env.SENTRY_DISABLED === "true") {
    return;
  }

  // Allow DSN override via env
  const dsn = process.env.SENTRY_DSN || SENTRY_DSN;

  try {
    sentryModule = await import("@sentry/node");

    sentryModule.init({
      dsn,
      environment: process.env.NODE_ENV || "production",
      release: `cortex-gateway@${version}`,

      // Performance: sample 10% of transactions
      tracesSampleRate: 0.1,

      // Capture unhandled exceptions and rejections
      integrations: [sentryModule.onUnhandledRejectionIntegration({ mode: "warn" })],

      // Scrub sensitive data
      beforeSend(event) {
        // Remove token values from extras/breadcrumbs
        if (event.extra) {
          for (const key of Object.keys(event.extra)) {
            if (/token|password|secret|key|auth|dsn/i.test(key)) {
              event.extra[key] = "[REDACTED]";
            }
          }
        }

        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((bc) => {
            if (bc.message) {
              bc.message = bc.message.replace(/ctx_[a-f0-9]+/g, "ctx_[REDACTED]");
            }
            return bc;
          });
        }

        return event;
      },

      // Ignore noisy expected errors
      ignoreErrors: ["ECONNRESET", "EPIPE", "ENOTFOUND", "socket hang up", "write after end"],
    });

    initialized = true;
    console.log(`[sentry] initialized for cortex-gateway@${version}`);
  } catch (err) {
    // @sentry/node not installed or init failed — silent no-op
    if ((err as NodeJS.ErrnoException)?.code !== "MODULE_NOT_FOUND") {
      console.warn("[sentry] failed to initialize:", err);
    }
  }
}

export function captureException(err: Error, context?: Record<string, unknown>): void {
  if (!sentryModule || !initialized) {
    return;
  }
  sentryModule.captureException(err, { extra: context });
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info"): void {
  if (!sentryModule || !initialized) {
    return;
  }
  sentryModule.captureMessage(msg, level);
}

export function setTag(key: string, value: string): void {
  if (!sentryModule || !initialized) {
    return;
  }
  sentryModule.setTag(key, value);
}

export function addBreadcrumb(
  category: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!sentryModule || !initialized) {
    return;
  }
  sentryModule.addBreadcrumb({ category, message, level });
}
