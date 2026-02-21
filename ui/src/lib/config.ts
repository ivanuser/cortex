/**
 * Runtime Configuration Loader
 *
 * Fetches /__control__/bootstrap.json at startup to get gateway configuration.
 * This endpoint is provided by the OpenClaw gateway when serving the Control UI.
 *
 * Config is loaded once and cached. Falls back to defaults if missing.
 */

export interface CortexConfig {
  gateway: {
    /** Full URL for gateway (e.g., https://openclaw.example.com) */
    url: string;
    /** WebSocket URL (e.g., wss://openclaw.example.com). If empty, derived from gateway.url */
    ws: string;
  };
  branding: {
    /** App title shown in header and page titles */
    title: string;
    /** Subtitle shown in auth dialog */
    subtitle: string;
  };
}

const DEFAULT_CONFIG: CortexConfig = {
  gateway: {
    url: "",
    ws: "",
  },
  branding: {
    title: "Cortex",
    subtitle: "OpenClaw Command Center",
  },
};

let cachedConfig: CortexConfig | null = null;

/**
 * Derive WebSocket URL from an HTTP(S) URL.
 * https://example.com → wss://example.com
 * http://example.com → ws://example.com
 */
function _deriveWsUrl(httpUrl: string): string {
  try {
    const url = new URL(httpUrl);
    const wsProtocol = url.protocol === "https:" ? "wss:" : "ws:";
    return `${wsProtocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "";
  }
}

/**
 * Load runtime config from /__control__/bootstrap.json.
 * Called once at app startup. Cached after first load.
 */
export async function loadConfig(): Promise<CortexConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const resp = await fetch("/__openclaw/control-ui-config.json", { cache: "no-store" });
    if (!resp.ok) {
      console.warn(
        `[config] /__openclaw/control-ui-config.json returned ${resp.status}, using defaults`,
      );
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }

    const json = await resp.json();

    // Map bootstrap fields to Cortex config format
    // Gateway bootstrap provides: basePath, assistantName, assistantAvatar
    const gatewayUrl = json?.basePath || "";
    cachedConfig = {
      gateway: {
        url: gatewayUrl,
        ws: "", // Will be derived from window.location
      },
      branding: {
        title: json?.assistantName || DEFAULT_CONFIG.branding.title,
        subtitle: "OpenClaw Command Center", // Keep default subtitle
      },
    };

    // Since we're running same-origin with the gateway, derive WS from window.location
    if (typeof window !== "undefined" && !cachedConfig.gateway.ws) {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      cachedConfig.gateway.ws = `${wsProtocol}//${window.location.host}`;
    }

    return cachedConfig;
  } catch (err) {
    console.warn("[config] Failed to load /__control__/bootstrap.json:", err);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Get cached config synchronously. Returns null if not loaded yet.
 */
export function getConfig(): CortexConfig | null {
  return cachedConfig;
}

/**
 * Get the configured gateway WS URL, or empty string if not configured.
 */
export function getGatewayWsUrl(): string {
  return cachedConfig?.gateway?.ws || "";
}

/**
 * Check if a gateway URL is pre-configured via config.json.
 */
export function hasGatewayConfig(): boolean {
  return Boolean(cachedConfig?.gateway?.ws || cachedConfig?.gateway?.url);
}
