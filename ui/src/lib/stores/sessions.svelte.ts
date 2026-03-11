/**
 * Sessions store — manages session list and active session
 */
import { gateway, type Session, type HelloOk } from "$lib/gateway";
import { getToasts } from "./toasts.svelte";

const toasts = getToasts();
const STORAGE_KEY_SESSION = "cortex:activeSession";

// ─── Filter params type ────────────────────────

export interface SessionFilters {
  activeMinutes: number; // 0 = all
  limit: number;
  includeGlobal: boolean;
  includeUnknown: boolean;
}

// ─── Reactive state ────────────────────────────

let sessions = $state<Session[]>([]);
let activeSessionKey = $state<string>(
  typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_SESSION) || "" : "",
);
let loading = $state(false);
let mainSessionKey = $state<string>("");
let filters = $state<SessionFilters>({
  activeMinutes: 0,
  limit: 100,
  includeGlobal: false,
  includeUnknown: false,
});

// ─── Listen for hello to get main session key ──

gateway.on("hello", (payload) => {
  const hello = payload as HelloOk;
  if (hello.snapshot?.sessionDefaults?.mainSessionKey) {
    mainSessionKey = hello.snapshot.sessionDefaults.mainSessionKey;
    if (!activeSessionKey) {
      activeSessionKey = mainSessionKey;
      persistSession(mainSessionKey);
    }
  }
});

// ─── Functions ─────────────────────────────────

function persistSession(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_SESSION, key);
  }
}

async function fetchSessions(opts?: Partial<SessionFilters>): Promise<void> {
  if (!gateway.connected) {
    return;
  }
  loading = true;
  const f = { ...filters, ...opts };
  try {
    const params: Record<string, unknown> = {
      limit: f.limit,
      includeDerivedTitles: true,
      includeLastMessage: true,
    };
    if (f.activeMinutes > 0) {
      params.activeMinutes = f.activeMinutes;
    }
    if (f.includeGlobal) {
      params.includeGlobal = true;
    }
    if (f.includeUnknown) {
      params.includeUnknown = true;
    }

    const result = await gateway.call<{ sessions?: Session[]; list?: Session[] }>(
      "sessions.list",
      params,
    );
    sessions = result.sessions ?? result.list ?? [];
  } catch (e) {
    console.error("Failed to fetch sessions:", e);
    toasts.error(
      "Sessions Load Failed",
      e instanceof Error ? e.message : "Could not fetch sessions",
    );
  } finally {
    loading = false;
  }
}

function setActiveSession(key: string): void {
  activeSessionKey = key;
  persistSession(key);
}

function setFilters(f: Partial<SessionFilters>): void {
  filters = { ...filters, ...f };
}

// Channel display config
const CHANNEL_DISPLAY: Record<string, { icon: string; name: string }> = {
  discord: { icon: "💬", name: "Discord" },
  telegram: { icon: "✈️", name: "Telegram" },
  signal: { icon: "🔒", name: "Signal" },
  whatsapp: { icon: "📱", name: "WhatsApp" },
  slack: { icon: "💼", name: "Slack" },
  "nextcloud-talk": { icon: "☁️", name: "Nextcloud Talk" },
  webchat: { icon: "🌐", name: "Web Chat" },
  imessage: { icon: "🍎", name: "iMessage" },
  googlechat: { icon: "📧", name: "Google Chat" },
  irc: { icon: "📟", name: "IRC" },
};

/** Try to parse a session key (or derivedTitle that looks like one) into a friendly name */
function smartParse(text: string, channel?: string): string | null {
  // Extract the "rest" after agent:<id>:
  const parts = text.split(":");
  const isAgentSession = parts.length >= 3 && parts[0] === "agent";
  const agentId = isAgentSession ? parts[1] : null;
  const rest = isAgentSession ? parts.slice(2).join(":") : text;

  // Agent chat sessions — show agent name prominently
  if (isAgentSession && agentId && (rest === "chat" || rest === "main")) {
    const name = agentId.charAt(0).toUpperCase() + agentId.slice(1);
    return `🤖 ${name}`;
  }

  // Main session
  if (rest === "main") {
    return "🏠 Main Session";
  }

  // Cron sessions — show the job name if available
  if (rest.startsWith("cron:")) {
    const cronName = rest.slice(5);
    if (cronName && cronName.length > 0 && cronName.length <= 30) {
      return `⏰ Cron: ${cronName}`;
    }
    return "⏰ Cron Job";
  }

  // Sub-agent sessions
  if (rest.startsWith("subagent:")) {
    const shortId = rest.split(":")[1]?.slice(0, 8) || "";
    return `🤖 Sub-agent ${shortId}`;
  }

  // Channel sessions — match against known channel prefixes
  for (const [channelKey, display] of Object.entries(CHANNEL_DISPLAY)) {
    if (rest.startsWith(channelKey + ":") || rest.startsWith(channelKey + ".")) {
      const channelRest = rest.slice(channelKey.length + 1);
      if (channelRest.startsWith("channel:")) {
        return `${display.icon} ${display.name} Channel`;
      }
      if (channelRest.startsWith("group:")) {
        return `${display.icon} ${display.name} Group`;
      }
      if (channelRest.startsWith("g-")) {
        const groupId = channelRest.slice(2);
        if (/^\d{10,}$/.test(groupId)) {
          return `${display.icon} ${display.name} Group`;
        }
        return `${display.icon} ${display.name}: ${groupId}`;
      }
      if (channelRest.startsWith("dm:") || channelRest.startsWith("dm-")) {
        return `${display.icon} ${display.name} DM`;
      }
      if (/^\d{10,}$/.test(channelRest)) {
        return `${display.icon} ${display.name} Chat`;
      }
      const label = channelRest.length > 20 ? channelRest.slice(0, 20) + "…" : channelRest;
      return `${display.icon} ${display.name}: ${label}`;
    }
  }

  // Webchat / Synapse sessions
  if (rest.startsWith("webchat:") || rest.startsWith("synapse:")) {
    const prefix = rest.startsWith("webchat:") ? "Web Chat" : "Synapse";
    const suffix = rest.split(":").slice(1).join(":");
    if (suffix.startsWith("task")) {
      return `🖥️ ${prefix} Task`;
    }
    if (/^[0-9a-f]{4,}/.test(suffix)) {
      return `🖥️ ${prefix} Session`;
    }
    return `🖥️ ${prefix}: ${suffix.length > 20 ? suffix.slice(0, 20) + "…" : suffix}`;
  }

  // Use session.channel field as fallback
  if (channel) {
    const ch = CHANNEL_DISPLAY[channel];
    if (ch) {
      return `${ch.icon} ${ch.name} Chat`;
    }
  }

  return null;
}

function getSessionTitle(session: Session): string {
  // User-set label always wins
  if (session.label) {
    return session.label;
  }

  // Smart-parse the session key — always more readable than raw IDs
  const smart = smartParse(session.key, session.channel);
  if (smart) {
    return smart;
  }

  // Fall back to derivedTitle, but also try smart-parsing it
  if (session.derivedTitle) {
    const derivedSmart = smartParse(session.derivedTitle, session.channel);
    if (derivedSmart) {
      return derivedSmart;
    }
    return session.derivedTitle;
  }

  // Last resort
  const parts = session.key.split(":");
  const rest = parts.length >= 3 ? parts.slice(2).join(":") : session.key;
  return rest.length > 40 ? rest.slice(0, 40) + "…" : rest || session.key;
}

// ─── Export ────────────────────────────────────

export function getSessions() {
  return {
    get list() {
      return sessions;
    },
    get activeKey() {
      return activeSessionKey;
    },
    get mainKey() {
      return mainSessionKey;
    },
    get loading() {
      return loading;
    },
    get filters() {
      return filters;
    },
    fetchSessions,
    setActiveSession,
    setFilters,
    getSessionTitle,
  };
}
