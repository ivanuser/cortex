import { l as head, b as attr, a as attr_class, c as escape_html, e as ensure_array_like, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
import { f as formatRelativeTime } from "../../../chunks/time.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    const channelThemes = {
      discord: {
        color: "text-[#7289da]",
        bg: "bg-[#7289da]/10",
        border: "border-[#7289da]/25",
        glow: "shadow-[0_0_12px_rgba(114,137,218,0.2)]",
        icon: "M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"
      },
      telegram: {
        color: "text-[#0088cc]",
        bg: "bg-[#0088cc]/10",
        border: "border-[#0088cc]/25",
        glow: "shadow-[0_0_12px_rgba(0,136,204,0.2)]",
        icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"
      },
      whatsapp: {
        color: "text-[#25d366]",
        bg: "bg-[#25d366]/10",
        border: "border-[#25d366]/25",
        glow: "shadow-[0_0_12px_rgba(37,211,102,0.2)]",
        icon: "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"
      },
      signal: {
        color: "text-[#3a76f0]",
        bg: "bg-[#3a76f0]/10",
        border: "border-[#3a76f0]/25",
        glow: "shadow-[0_0_12px_rgba(58,118,240,0.2)]",
        icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"
      },
      slack: {
        color: "text-[#e01e5a]",
        bg: "bg-[#e01e5a]/10",
        border: "border-[#e01e5a]/25",
        glow: "shadow-[0_0_12px_rgba(224,30,90,0.2)]",
        icon: "M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.164 0a2.528 2.528 0 012.521 2.522v6.312zM15.164 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.164 24a2.528 2.528 0 01-2.521-2.522v-2.522h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.314A2.528 2.528 0 0124 15.164a2.528 2.528 0 01-2.522 2.521h-6.314z"
      },
      imessage: {
        color: "text-[#34c759]",
        bg: "bg-[#34c759]/10",
        border: "border-[#34c759]/25",
        glow: "shadow-[0_0_12px_rgba(52,199,89,0.2)]",
        icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      },
      nostr: {
        color: "text-accent-purple",
        bg: "bg-accent-purple/10",
        border: "border-accent-purple/25",
        glow: "shadow-[0_0_12px_rgba(124,77,255,0.2)]",
        icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
      },
      googlechat: {
        color: "text-[#00ac47]",
        bg: "bg-[#00ac47]/10",
        border: "border-[#00ac47]/25",
        glow: "shadow-[0_0_12px_rgba(0,172,71,0.2)]",
        icon: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
      },
      "nextcloud-talk": {
        color: "text-[#0082c9]",
        bg: "bg-[#0082c9]/10",
        border: "border-[#0082c9]/25",
        glow: "shadow-[0_0_12px_rgba(0,130,201,0.2)]",
        icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 16.09V20H8.54v-1.91c-1.75-.32-3.29-1.46-3.4-3.33h1.82c.13 1.05.97 1.72 2.59 1.72 1.72 0 2.1-.81 2.1-1.32 0-.69-.42-1.33-2.17-1.79C7.76 12.91 6 12.15 6 10.24c0-1.57 1.27-2.66 2.54-2.98V5.35h2.05v1.93c1.61.42 2.57 1.66 2.62 3.03h-1.82c-.05-.96-.73-1.72-2.12-1.72-1.32 0-2.21.59-2.21 1.48 0 .93.65 1.28 2.42 1.76 1.96.53 3.83 1.14 3.83 3.41 0 1.78-1.36 2.76-2.72 3.15V18.09z"
      }
    };
    const defaultTheme = {
      color: "text-accent-cyan",
      bg: "bg-accent-cyan/10",
      border: "border-accent-cyan/25",
      glow: "shadow-[0_0_12px_rgba(0,229,255,0.2)]",
      icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    };
    const channelDescriptions = {
      discord: "Bot status and server configuration",
      telegram: "Bot status and message polling",
      whatsapp: "WhatsApp Web link and connection health",
      signal: "signal-cli daemon status",
      slack: "Slack app and workspace connection",
      imessage: "iMessage bridge status",
      nostr: "Nostr relay and profile management",
      googlechat: "Google Chat app status",
      "nextcloud-talk": "Nextcloud Talk webhook bot"
    };
    let waLoginBusy = false;
    let logoutBusy = {};
    let expandedChannel = null;
    let channelOrder = derived(() => {
      return [
        "whatsapp",
        "telegram",
        "discord",
        "googlechat",
        "slack",
        "signal",
        "imessage",
        "nostr"
      ];
    });
    let sortedChannels = derived(() => {
      const channels = {};
      const accounts = {};
      return channelOrder().map((key, idx) => {
        const status = channels[key];
        const accts = accounts[key] ?? [];
        const enabled = !!(status?.configured || status?.running || status?.connected || accts.some((a) => a.configured || a.running || a.connected));
        return { key, status, accounts: accts, enabled, order: idx };
      }).toSorted((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.order - b.order;
      });
    });
    function resolveLabel(key) {
      return key.charAt(0).toUpperCase() + key.slice(1);
    }
    function getTheme(key) {
      return channelThemes[key] ?? defaultTheme;
    }
    function getConnectionStatus(status, accounts) {
      if (status?.connected) return "connected";
      if (accounts?.some((a) => a.connected)) return "connected";
      if (status?.running && status?.configured) return "connected";
      if (status?.configured && !status?.lastError) return "connected";
      if (status?.running) return "connecting";
      if (status?.configured && status?.lastError) return "disconnected";
      return "disconnected";
    }
    function getStatusDotColor(connStatus) {
      switch (connStatus) {
        case "connected":
          return "bg-accent-green";
        case "connecting":
          return "bg-accent-amber";
        default:
          return "bg-red-500";
      }
    }
    function getStatusBadgeClasses(connStatus) {
      switch (connStatus) {
        case "connected":
          return "bg-accent-green/15 text-accent-green border border-accent-green/20";
        case "connecting":
          return "bg-accent-amber/15 text-accent-amber border border-accent-amber/20";
        default:
          return "bg-red-500/10 text-red-400 border border-red-500/20";
      }
    }
    function formatDuration(ms) {
      const seconds = Math.floor(ms / 1e3);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ${minutes % 60}m`;
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    head("1psf3x9", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Channels — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default"><div class="flex items-start justify-between gap-4 flex-wrap"><div><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg></div> <div><h1 class="text-xl font-bold text-text-primary glow-text-cyan">Channels</h1> <p class="text-sm text-text-muted">Messaging platform connections and health</p></div></div></div> <div class="flex items-center gap-2">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button${attr("disabled", conn.state.status !== "connected", true)} class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"><svg${attr_class(`w-4 h-4 ${stringify("")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${escape_html("Refresh")}</button> <button${attr("disabled", conn.state.status !== "connected", true)} class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent-cyan/10 border border-accent-cyan/25 rounded-lg text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan/40 transition-all disabled:opacity-40 disabled:cursor-not-allowed"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg> Probe All</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-1 overflow-y-auto p-4 md:p-6">`);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-full text-center"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to view channel status.</p></div>`);
    } else if (sortedChannels().length === 0) {
      $$renderer2.push("<!--[3-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-center"><div class="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg></div> <p class="text-text-muted text-sm">No channels configured. Add channels in your gateway config.</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"><!--[-->`);
      const each_array_1 = ensure_array_like(sortedChannels());
      for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
        let channel = each_array_1[$$index_2];
        const theme = getTheme(channel.key);
        const connStatus = getConnectionStatus(channel.status, channel.accounts);
        const isExpanded = expandedChannel === channel.key;
        const isWhatsApp = channel.key === "whatsapp";
        const label = resolveLabel(channel.key);
        const description = channelDescriptions[channel.key] ?? "Channel status and configuration";
        $$renderer2.push(`<div${attr_class(`glass rounded-xl border transition-all duration-300 animate-fade-in ${stringify(channel.enabled ? theme.border + " " + theme.glow : "border-border-default opacity-60")} ${stringify(isExpanded ? "md:col-span-2 xl:col-span-2" : "")} hover:border-opacity-50`)}><div class="p-4 pb-3"><div class="flex items-start justify-between gap-3"><div class="flex items-center gap-3 min-w-0"><div${attr_class(`w-10 h-10 rounded-xl ${stringify(theme.bg)} ${stringify(theme.border)} border flex items-center justify-center flex-shrink-0`)}><svg${attr_class(`w-5 h-5 ${stringify(theme.color)}`)} viewBox="0 0 24 24" fill="currentColor"><path${attr("d", theme.icon)}></path></svg></div> <div class="min-w-0"><h3 class="text-sm font-semibold text-text-primary truncate">${escape_html(label)}</h3> <p class="text-xs text-text-muted truncate">${escape_html(description)}</p></div></div> <span${attr_class(`flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${stringify(getStatusBadgeClasses(connStatus))}`)}><span class="inline-flex items-center gap-1"><span${attr_class(`w-1.5 h-1.5 rounded-full ${stringify(getStatusDotColor(connStatus))} ${stringify(connStatus === "connected" ? "glow-pulse" : "")}`)}></span> ${escape_html(connStatus)}</span></span></div> `);
        if (channel.accounts.length > 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div${attr_class(`mt-2 text-[10px] font-medium uppercase tracking-wider text-text-muted ${stringify(theme.color)}`)}>${escape_html(channel.accounts.length)} accounts</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="px-4 pb-3"><div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs"><div class="flex justify-between"><span class="text-text-muted">Configured</span> <span${attr_class(channel.status?.configured ? "text-accent-green" : "text-text-secondary")}>${escape_html(channel.status?.configured ? "Yes" : "No")}</span></div> <div class="flex justify-between"><span class="text-text-muted">Running</span> <span${attr_class(channel.status?.running ? "text-accent-green" : "text-text-secondary")}>${escape_html(channel.status?.running ? "Yes" : "No")}</span></div> <div class="flex justify-between"><span class="text-text-muted">Connected</span> <span${attr_class(channel.status?.connected ? "text-accent-green" : "text-text-secondary")}>${escape_html(channel.status?.connected ? "Yes" : "No")}</span></div> `);
        if (isWhatsApp && channel.status?.linked !== void 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex justify-between"><span class="text-text-muted">Linked</span> <span${attr_class(channel.status?.linked ? "text-accent-green" : "text-text-secondary")}>${escape_html(channel.status?.linked ? "Yes" : "No")}</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (channel.status?.mode) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex justify-between"><span class="text-text-muted">Mode</span> <span class="text-text-primary font-mono">${escape_html(channel.status.mode)}</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div> `);
        if (channel.status?.lastError) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="mx-4 mb-3 p-2.5 rounded-lg bg-red-500/8 border border-red-500/20"><p class="text-xs text-red-400 leading-relaxed break-words">${escape_html(channel.status.lastError)}</p></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (channel.status?.probe) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div${attr_class(`mx-4 mb-3 p-2.5 rounded-lg ${stringify(channel.status.probe.ok ? "bg-accent-green/8 border border-accent-green/20" : "bg-accent-amber/8 border border-accent-amber/20")}`)}><p${attr_class(`text-xs ${stringify(channel.status.probe.ok ? "text-accent-green" : "text-accent-amber")}`)}>Probe ${escape_html(channel.status.probe.ok ? "ok" : "failed")} `);
          if (channel.status.probe.status) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`· ${escape_html(channel.status.probe.status)}`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status.probe.error) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`· ${escape_html(channel.status.probe.error)}`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status.probe.bot?.username) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`· @${escape_html(channel.status.probe.bot.username)}`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></p></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (isWhatsApp) {
          $$renderer2.push("<!--[-->");
          {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <div class="px-4 pb-3 flex flex-wrap gap-2"><button${attr("disabled", waLoginBusy, true)} class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-[#25d366]/15 text-[#25d366] border border-[#25d366]/25 hover:bg-[#25d366]/25 hover:border-[#25d366]/40 disabled:opacity-40 disabled:cursor-not-allowed">`);
          {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg> Show QR`);
          }
          $$renderer2.push(`<!--]--></button> <button${attr("disabled", waLoginBusy, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-bg-tertiary text-text-secondary border border-border-default hover:text-accent-cyan hover:border-accent-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">Relink</button> `);
          {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<button${attr("disabled", waLoginBusy, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg transition-all bg-bg-tertiary text-text-secondary border border-border-default hover:text-accent-cyan hover:border-accent-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">Wait for scan</button>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (channel.accounts.length > 1) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="px-4 pb-3 space-y-2"><!--[-->`);
          const each_array_2 = ensure_array_like(channel.accounts);
          for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
            let account = each_array_2[$$index_1];
            const botUsername = account.probe?.bot?.username;
            $$renderer2.push(`<div class="p-2.5 rounded-lg bg-bg-tertiary/50 border border-border-default"><div class="flex items-center justify-between mb-1.5"><span class="text-xs font-medium text-text-primary">${escape_html(botUsername ? `@${botUsername}` : account.name || account.accountId)}</span> <span class="text-[10px] font-mono text-text-muted">${escape_html(account.accountId)}</span></div> <div class="grid grid-cols-3 gap-2 text-[11px]"><div><span class="text-text-muted">Running</span> <span${attr_class(`ml-1 ${stringify(account.running ? "text-accent-green" : "text-text-secondary")}`)}>${escape_html(account.running ? "Yes" : "No")}</span></div> <div><span class="text-text-muted">Config</span> <span${attr_class(`ml-1 ${stringify(account.configured ? "text-accent-green" : "text-text-secondary")}`)}>${escape_html(account.configured ? "Yes" : "No")}</span></div> <div><span class="text-text-muted">Inbound</span> <span class="ml-1 text-text-primary">${escape_html(account.lastInboundAt ? formatRelativeTime(account.lastInboundAt) : "n/a")}</span></div></div> `);
            if (account.lastError) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<p class="mt-1.5 text-[11px] text-red-400 break-words">${escape_html(account.lastError)}</p>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <div class="px-4 pb-4 pt-1 flex items-center gap-2 border-t border-border-default mt-1"><button class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all text-text-muted hover:text-text-primary hover:bg-bg-hover"><svg${attr_class(`w-3.5 h-3.5 transition-transform duration-200 ${stringify(isExpanded ? "rotate-180" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> Details</button> <div class="flex-1"></div> `);
        if (channel.status?.connected || channel.status?.running) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<button${attr("disabled", logoutBusy[channel.key], true)} class="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all text-red-400/80 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg> ${escape_html(logoutBusy[channel.key] ? "Logging out…" : "Logout")}</button>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> `);
        if (isExpanded) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="border-t border-border-default p-4 animate-slide-in-up"><div class="grid grid-cols-2 lg:grid-cols-3 gap-4 text-xs">`);
          if (channel.status?.lastConnectedAt) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Last connected</span> <span class="text-text-primary">${escape_html(formatRelativeTime(channel.status.lastConnectedAt))}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.lastMessageAt) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Last message</span> <span class="text-text-primary">${escape_html(formatRelativeTime(channel.status.lastMessageAt))}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.lastStartAt) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Last start</span> <span class="text-text-primary">${escape_html(formatRelativeTime(channel.status.lastStartAt))}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.lastProbeAt) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Last probe</span> <span class="text-text-primary">${escape_html(formatRelativeTime(channel.status.lastProbeAt))}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.authAgeMs != null) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Auth age</span> <span class="text-text-primary font-mono">${escape_html(formatDuration(channel.status.authAgeMs))}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.baseUrl) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Base URL</span> <span class="text-text-primary font-mono text-[11px] break-all">${escape_html(channel.status.baseUrl)}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (channel.status?.mode) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Mode</span> <span class="text-text-primary font-mono">${escape_html(channel.status.mode)}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <details class="mt-4"><summary class="text-[11px] text-text-muted cursor-pointer hover:text-text-secondary transition-colors">Raw status JSON</summary> <pre class="mt-2 p-3 rounded-lg bg-bg-tertiary/60 border border-border-default text-[11px] text-text-secondary font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">${escape_html(JSON.stringify(channel.status, null, 2))}</pre></details></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
