/**
 * Sentry integration for Cortex Gateway — zero dependencies.
 *
 * Uses the Sentry HTTP envelope API directly instead of @sentry/node,
 * which pulls in dozens of OTel instrumentations that the bundler either
 * inlines (causing missing transitive deps) or leaves as externals.
 *
 * This gives us: error capture, breadcrumbs, unhandled rejection hooks.
 */

import { version } from "../package.json" with { type: "json" };

// Use internal IP for self-hosted Sentry (CF tunnel blocks /api/envelope/)
const SENTRY_DSN = "http://af877b470afb42d20e56491efa42b71a@192.168.1.170:9000/4";

interface Breadcrumb {
  timestamp: number;
  category: string;
  message: string;
  level: string;
}

// Parsed from DSN
let sentryHost = "";
let sentryProjectId = "";
let sentryPublicKey = "";
let initialized = false;
const breadcrumbs: Breadcrumb[] = [];
const MAX_BREADCRUMBS = 50;

function parseDSN(dsn: string): boolean {
  try {
    const url = new URL(dsn);
    sentryPublicKey = url.username;
    sentryHost = `${url.protocol}//${url.host}`;
    sentryProjectId = url.pathname.replace(/\//g, "");
    return !!(sentryPublicKey && sentryHost && sentryProjectId);
  } catch {
    return false;
  }
}

async function sendEnvelope(event: Record<string, unknown>): Promise<void> {
  const envelope = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    sent_at: new Date().toISOString(),
    dsn: `${sentryHost}/${sentryProjectId}`,
  };

  const eventPayload = {
    ...event,
    event_id: envelope.event_id,
    timestamp: Date.now() / 1000,
    platform: "node",
    release: `cortex-gateway@${version}`,
    environment: process.env.NODE_ENV || "production",
    server_name: (await import("node:os")).hostname(),
    breadcrumbs: { values: [...breadcrumbs] },
    sdk: { name: "cortex-gateway-sentry", version: "1.0.0" },
  };

  const envelopeHeader = JSON.stringify({
    event_id: envelope.event_id,
    sent_at: envelope.sent_at,
    dsn: `https://${sentryPublicKey}@${new URL(sentryHost).host}/${sentryProjectId}`,
  });
  const itemHeader = JSON.stringify({ type: "event", length: JSON.stringify(eventPayload).length });
  const body = `${envelopeHeader}\n${itemHeader}\n${JSON.stringify(eventPayload)}`;

  const url = `${sentryHost}/api/${sentryProjectId}/envelope/`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=cortex-gateway/1.0, sentry_key=${sentryPublicKey}`,
      },
      body,
    });
  } catch {
    // Network failure — silently drop
  }
}

function serializeError(err: Error): Record<string, unknown> {
  const frames = (err.stack || "")
    .split("\n")
    .slice(1)
    .map((line) => {
      const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
      if (match) {
        return {
          function: match[1],
          filename: match[2],
          lineno: parseInt(match[3], 10),
          colno: parseInt(match[4], 10),
        };
      }
      const simpleMatch = line.match(/at\s+(.+?):(\d+):(\d+)/);
      if (simpleMatch) {
        return {
          filename: simpleMatch[1],
          lineno: parseInt(simpleMatch[2], 10),
          colno: parseInt(simpleMatch[3], 10),
        };
      }
      return { filename: line.trim() };
    });

  return {
    type: err.name || "Error",
    value: redactSensitive(err.message),
    stacktrace: { frames: frames.toReversed() },
  };
}

function redactSensitive(str: string): string {
  return str
    .replace(/ctx_[a-f0-9]+/g, "ctx_[REDACTED]")
    .replace(/(token|password|secret|key|auth)[:=]\s*\S+/gi, "$1=[REDACTED]");
}

export async function initSentry(): Promise<void> {
  if (initialized) {
    return;
  }
  if (process.env.SENTRY_DISABLED === "1" || process.env.SENTRY_DISABLED === "true") {
    return;
  }

  const dsn = process.env.SENTRY_DSN || SENTRY_DSN;
  if (!parseDSN(dsn)) {
    console.warn("[sentry] invalid DSN, disabled");
    return;
  }

  initialized = true;

  process.on("unhandledRejection", (reason) => {
    if (reason instanceof Error) {
      captureException(reason, { source: "unhandledRejection" });
    }
  });

  process.on("uncaughtException", (err) => {
    captureException(err, { source: "uncaughtException" });
  });

  console.log(`[sentry] initialized for cortex-gateway@${version} (HTTP transport)`);
}

export function captureException(err: Error, context?: Record<string, unknown>): void {
  if (!initialized) {
    return;
  }
  const event: Record<string, unknown> = {
    level: "error",
    exception: { values: [serializeError(err)] },
  };
  if (context) {
    event.extra = context;
  }
  void sendEnvelope(event);
}

export function captureMessage(msg: string, level: "info" | "warning" | "error" = "info"): void {
  if (!initialized) {
    return;
  }
  void sendEnvelope({ level, message: { formatted: redactSensitive(msg) } });
}

export function setTag(_key: string, _value: string): void {
  // Tags are included per-event in this lightweight impl
  // Could accumulate and attach to all events if needed
}

export function addBreadcrumb(
  category: string,
  message: string,
  level: "info" | "warning" | "error" = "info",
): void {
  if (!initialized) {
    return;
  }
  breadcrumbs.push({
    timestamp: Date.now() / 1000,
    category,
    message: redactSensitive(message),
    level,
  });
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}
