import { a as gateway } from "./connection.svelte.js";
import { g as getToasts } from "./toasts.svelte.js";
const toasts = getToasts();
const STORAGE_KEY_SESSION = "cortex:activeSession";
let sessions = [];
let activeSessionKey = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_SESSION) || "" : "";
let loading = false;
let mainSessionKey = "";
let filters = {
  activeMinutes: 0,
  limit: 100,
  includeGlobal: false,
  includeUnknown: false
};
gateway.on("hello", (payload) => {
  const hello = payload;
  if (hello.snapshot?.sessionDefaults?.mainSessionKey) {
    mainSessionKey = hello.snapshot.sessionDefaults.mainSessionKey;
    if (!activeSessionKey) {
      activeSessionKey = mainSessionKey;
      persistSession(mainSessionKey);
    }
  }
});
function persistSession(key) {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_SESSION, key);
  }
}
async function fetchSessions(opts) {
  if (!gateway.connected) return;
  loading = true;
  const f = { ...filters, ...opts };
  try {
    const params = {
      limit: f.limit,
      includeDerivedTitles: true,
      includeLastMessage: true
    };
    if (f.activeMinutes > 0) params.activeMinutes = f.activeMinutes;
    if (f.includeGlobal) params.includeGlobal = true;
    if (f.includeUnknown) params.includeUnknown = true;
    const result = await gateway.call("sessions.list", params);
    sessions = result.sessions ?? result.list ?? [];
  } catch (e) {
    console.error("Failed to fetch sessions:", e);
    toasts.error("Sessions Load Failed", e instanceof Error ? e.message : "Could not fetch sessions");
  } finally {
    loading = false;
  }
}
function setActiveSession(key) {
  activeSessionKey = key;
  persistSession(key);
}
function setFilters(f) {
  filters = { ...filters, ...f };
}
const CHANNEL_DISPLAY = {
  discord: { icon: "💬", name: "Discord" },
  telegram: { icon: "✈️", name: "Telegram" },
  signal: { icon: "🔒", name: "Signal" },
  whatsapp: { icon: "📱", name: "WhatsApp" },
  slack: { icon: "💼", name: "Slack" },
  "nextcloud-talk": { icon: "☁️", name: "Nextcloud Talk" },
  webchat: { icon: "🌐", name: "Web Chat" },
  imessage: { icon: "🍎", name: "iMessage" },
  googlechat: { icon: "📧", name: "Google Chat" },
  irc: { icon: "📟", name: "IRC" }
};
function smartParse(text, channel) {
  const parts = text.split(":");
  const rest = parts.length >= 3 && parts[0] === "agent" ? parts.slice(2).join(":") : text;
  if (rest === "main") return "🏠 Main Session";
  if (rest.startsWith("cron:")) return "⏰ Cron Job";
  if (rest.startsWith("subagent:")) {
    const shortId = rest.split(":")[1]?.slice(0, 8) || "";
    return `🤖 Sub-agent ${shortId}`;
  }
  for (const [channelKey, display] of Object.entries(CHANNEL_DISPLAY)) {
    if (rest.startsWith(channelKey + ":") || rest.startsWith(channelKey + ".")) {
      const channelRest = rest.slice(channelKey.length + 1);
      if (channelRest.startsWith("channel:")) return `${display.icon} ${display.name} Channel`;
      if (channelRest.startsWith("group:")) return `${display.icon} ${display.name} Group`;
      if (channelRest.startsWith("g-")) {
        const groupId = channelRest.slice(2);
        if (/^\d{10,}$/.test(groupId)) return `${display.icon} ${display.name} Group`;
        return `${display.icon} ${display.name}: ${groupId}`;
      }
      if (channelRest.startsWith("dm:") || channelRest.startsWith("dm-")) return `${display.icon} ${display.name} DM`;
      if (/^\d{10,}$/.test(channelRest)) return `${display.icon} ${display.name} Chat`;
      const label = channelRest.length > 20 ? channelRest.slice(0, 20) + "…" : channelRest;
      return `${display.icon} ${display.name}: ${label}`;
    }
  }
  if (channel) {
    const ch = CHANNEL_DISPLAY[channel];
    if (ch) return `${ch.icon} ${ch.name} Chat`;
  }
  return null;
}
function getSessionTitle(session) {
  if (session.label) return session.label;
  const smart = smartParse(session.key, session.channel);
  if (smart) return smart;
  if (session.derivedTitle) {
    const derivedSmart = smartParse(session.derivedTitle, session.channel);
    if (derivedSmart) return derivedSmart;
    return session.derivedTitle;
  }
  const parts = session.key.split(":");
  const rest = parts.length >= 3 ? parts.slice(2).join(":") : session.key;
  return rest.length > 40 ? rest.slice(0, 40) + "…" : rest || session.key;
}
function getSessions() {
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
    getSessionTitle
  };
}
export {
  getSessions as g
};
