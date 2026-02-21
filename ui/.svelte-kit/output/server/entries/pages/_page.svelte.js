import { a as attr_class, b as attr, e as ensure_array_like, s as stringify, c as escape_html, d as bind_props, j as derived, k as attr_style, l as head } from "../../chunks/index.js";
import { g as getSessions } from "../../chunks/sessions.svelte.js";
import { g as getMessages } from "../../chunks/messages.svelte.js";
import { g as getConnection } from "../../chunks/connection.svelte.js";
import { C as ConnectionStatus } from "../../chunks/ConnectionStatus.js";
import { Renderer, Marked } from "marked";
import "dompurify";
import { f as formatRelativeTime, g as getDateGroup } from "../../chunks/time.js";
import { g as getToasts } from "../../chunks/toasts.svelte.js";
function html(value) {
  var html2 = String(value);
  var open = "<!---->";
  return open + html2 + "<!---->";
}
function SessionSidebar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sessions = getSessions();
    const conn = getConnection();
    let { collapsed = false, mobileOpen = false, onMobileSessionSelect } = $$props;
    let searchQuery = "";
    let activeFilter = "all";
    let isCreatingSession = false;
    let filteredSessions = derived(() => {
      let filtered = sessions.list;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter((session) => {
          const title = sessions.getSessionTitle(session).toLowerCase();
          const key = session.key.toLowerCase();
          const lastMessage = session.lastMessage?.toLowerCase() || "";
          return title.includes(query) || key.includes(query) || lastMessage.includes(query);
        });
      }
      return filtered;
    });
    function formatTime(ts) {
      if (!ts) return "";
      const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
      const now = /* @__PURE__ */ new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 6e4) return "now";
      if (diff < 36e5) return `${Math.floor(diff / 6e4)}m`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)}h`;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    function truncate(s, max) {
      if (s.length <= max) return s;
      return s.slice(0, max) + "…";
    }
    function getSessionType(session) {
      if (session.key === sessions.mainKey || session.key.includes(":main")) {
        return "main";
      } else if (session.key.includes(":subagent:")) {
        return "subagent";
      }
      return "isolated";
    }
    function getChannelBadgeColor(channel) {
      if (!channel) return "bg-bg-tertiary text-text-muted";
      switch (channel.toLowerCase()) {
        case "discord":
          return "bg-purple-500/20 text-purple-300";
        case "telegram":
          return "bg-blue-500/20 text-blue-300";
        case "whatsapp":
          return "bg-green-500/20 text-green-300";
        case "webchat":
          return "bg-cyan-500/20 text-cyan-300";
        default:
          return "bg-bg-tertiary text-text-muted";
      }
    }
    function getSessionTypeIcon(type) {
      switch (type) {
        case "main":
          return "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z";
        case // Star
        "isolated":
          return "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z";
        case // Circle
        "subagent":
          return "M12 2l2 7h7l-5.5 4L17 20l-5-3.5L7 20l1.5-7L3 9h7l2-7z";
      }
    }
    $$renderer2.push(`<aside${attr_class("h-full flex flex-col border-r border-border-default bg-bg-secondary transition-all duration-300 overflow-hidden md:relative md:translate-x-0 fixed left-0 top-0 z-50 w-72 md:z-auto", void 0, {
      "md:w-72": !collapsed,
      "md:w-0": collapsed,
      "-translate-x-full": !mobileOpen,
      "translate-x-0": mobileOpen
    })}>`);
    if (!collapsed) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-3 p-4 border-b border-border-default"><img src="/logo.png" alt="Cortex" class="w-10 h-10 rounded-lg"/> <div class="flex-1 min-w-0"><h1 class="text-lg font-semibold gradient-text tracking-wide">CORTEX</h1></div> <button class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors md:hidden min-h-11" aria-label="Close sidebar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button> <button class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors hidden md:block" aria-label="Collapse sidebar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg></button></div> <div class="px-3 py-2 border-b border-border-default">`);
      ConnectionStatus($$renderer2);
      $$renderer2.push(`<!----></div> <div class="p-3 space-y-2 border-b border-border-default"><div class="relative"><label for="session-search" class="sr-only">Search sessions</label> <input id="session-search" type="text"${attr("value", searchQuery)} placeholder="Search sessions..." class="w-full pl-8 pr-3 py-2 text-sm rounded-lg glass border border-border-default bg-bg-tertiary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan focus:glow-cyan transition-all duration-200"/> <svg class="absolute left-2.5 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div> <div class="flex gap-1"><!--[-->`);
      const each_array = ensure_array_like([
        { key: "all", label: "All" },
        { key: "main", label: "Main" },
        { key: "isolated", label: "Isolated" },
        { key: "subagent", label: "Sub" }
      ]);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let filter = each_array[$$index];
        $$renderer2.push(`<button${attr_class(`flex-1 px-2 py-1 text-xs rounded transition-all ${stringify(activeFilter === filter.key ? "gradient-bg gradient-border glow-cyan text-text-primary" : "border border-border-default hover:border-accent-cyan text-text-muted hover:text-text-secondary")}`)}>${escape_html(filter.label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="px-3 py-2 flex items-center justify-between"><span class="text-xs font-medium text-text-muted uppercase tracking-wider">Sessions (${escape_html(filteredSessions().length)})</span> <div class="flex gap-1"><button${attr("disabled", !conn.state.status || conn.state.status !== "connected" || isCreatingSession, true)} class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-green transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Create new session" aria-label="Create new session">`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>`);
      }
      $$renderer2.push(`<!--]--></button> <button class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" aria-label="Refresh sessions"${attr("disabled", sessions.loading, true)}><svg${attr_class("w-4 h-4", void 0, { "animate-spin": sessions.loading })} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg></button></div></div> <div class="flex-1 overflow-y-auto">`);
      if (sessions.loading) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="px-2 pb-2 space-y-1"><!--[-->`);
        const each_array_1 = ensure_array_like(Array(5));
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          each_array_1[$$index_1];
          $$renderer2.push(`<div class="px-3 py-2.5 rounded-lg border border-transparent"><div class="flex items-center justify-between mb-1.5"><div class="h-4 w-32 rounded bg-bg-tertiary skeleton-pulse"></div> <div class="h-3 w-8 rounded bg-bg-tertiary skeleton-pulse"></div></div> <div class="h-3 w-48 rounded bg-bg-tertiary skeleton-pulse" style="animation-delay: 0.1s"></div></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else if (filteredSessions().length === 0) {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<div class="px-4 py-8 text-center text-text-muted text-sm">`);
        if (searchQuery.trim()) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`No sessions match your search`);
        } else if (conn.state.status === "connected") {
          $$renderer2.push("<!--[2-->");
          $$renderer2.push(`No sessions found`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`Connect to see sessions`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="px-2 pb-2 space-y-1"><!--[-->`);
      const each_array_2 = ensure_array_like(filteredSessions());
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let session = each_array_2[$$index_2];
        const sessionType = getSessionType(session);
        $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 group ${stringify(session.key === sessions.activeKey ? "gradient-border gradient-bg glow-cyan" : "hover:bg-bg-hover border border-transparent")}`)}><div class="flex items-center justify-between mb-1"><div class="flex items-center gap-2 flex-1 min-w-0"><svg${attr_class(`w-3 h-3 flex-shrink-0 ${stringify(sessionType === "main" ? "text-accent-purple" : sessionType === "subagent" ? "text-accent-amber" : "text-accent-cyan")}`)} fill="currentColor" viewBox="0 0 24 24"><path${attr("d", getSessionTypeIcon(sessionType))}></path></svg> <span${attr_class(`text-sm font-medium truncate ${stringify(session.key === sessions.activeKey ? "text-accent-cyan" : "text-text-primary")}`)}>${escape_html(sessions.getSessionTitle(session))}</span></div> <span class="text-xs text-text-muted flex-shrink-0 ml-2">${escape_html(formatTime(session.lastActivityAt ?? session.lastActivity))}</span></div> `);
        if (session.lastMessage) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-xs text-text-muted truncate mb-1">${escape_html(truncate(session.lastMessage, 60))}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<p class="text-xs text-text-muted/50 truncate mb-1 italic">No messages yet</p>`);
        }
        $$renderer2.push(`<!--]--> <div class="flex items-center gap-1.5 flex-wrap">`);
        if (session.model) {
          $$renderer2.push("<!--[-->");
          const shortModel = session.model.replace(/^(anthropic|openai|google|meta)\//i, "").split("/").pop()?.slice(0, 20) ?? session.model;
          $$renderer2.push(`<span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/15 text-purple-300/80 leading-none">${escape_html(shortModel)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (session.channel) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span${attr_class(`inline-block text-[10px] px-1.5 py-0.5 rounded leading-none ${stringify(getChannelBadgeColor(session.channel))}`)}>${escape_html(session.channel)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (session.messageCount) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted leading-none">${escape_html(session.messageCount)} msgs</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></button>`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="p-3 border-t border-border-default"><a href="/settings" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-hover hover:text-accent-purple transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Settings</a></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></aside>`);
    bind_props($$props, { collapsed, mobileOpen });
  });
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
const mathExtension = {
  name: "math",
  level: "inline",
  start(src) {
    return src.indexOf("$");
  },
  tokenizer(src) {
    const blockMatch = src.match(/^\$\$([^$]+)\$\$/);
    if (blockMatch) {
      return {
        type: "math",
        raw: blockMatch[0],
        text: blockMatch[1].trim(),
        displayMode: true
      };
    }
    const inlineMatch = src.match(/^\$([^$\n]+)\$/);
    if (inlineMatch) {
      return {
        type: "math",
        raw: inlineMatch[0],
        text: inlineMatch[1].trim(),
        displayMode: false
      };
    }
  },
  renderer(token) {
    const encoded = encodeURIComponent(token.text);
    const displayAttr = token.displayMode ? "true" : "false";
    if (token.displayMode) {
      return `<div class="katex-placeholder" data-math="${encoded}" data-display="${displayAttr}"><span class="text-text-muted text-xs">Loading math…</span></div>`;
    }
    return `<span class="katex-placeholder" data-math="${encoded}" data-display="${displayAttr}">⋯</span>`;
  }
};
const renderer = new Renderer();
renderer.code = function({ text, lang }) {
  const language = lang || "";
  if (language === "mermaid") {
    const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
    return `<div class="mermaid-wrapper">
      <div class="mermaid" data-diagram="${escapeHtml(text)}" id="${id}">
        <!-- Mermaid will render here -->
      </div>
    </div>`;
  }
  const copyHandler = `navigator.clipboard.writeText(decodeURIComponent(this.dataset.code)).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})`;
  const header = language ? `<div class="code-block-header"><span>${escapeHtml(language)}</span><button class="copy-btn" onclick="${copyHandler}" data-code="${encodeURIComponent(text)}">Copy</button></div>` : "";
  return `<div class="code-wrapper">${header}<pre><code class="shiki-code" data-lang="${escapeHtml(language)}" data-code="${escapeHtml(text)}">${escapeHtml(text)}</code></pre></div>`;
};
renderer.link = function({ href, title, text }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};
renderer.table = function(token) {
  return `<div class="table-wrapper overflow-x-auto"><table>${token.header}${token.body}</table></div>`;
};
renderer.image = function({ href, title, text }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  const altAttr = text ? ` alt="${escapeHtml(text)}"` : "";
  return `<img src="${escapeHtml(href)}"${altAttr}${titleAttr} loading="lazy" decoding="async" />`;
};
new Marked({
  renderer,
  gfm: true,
  breaks: true,
  extensions: [mathExtension]
});
function ThinkingBlock($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { thinkingContent, isStreaming = false } = $$props;
    $$renderer2.push(`<div class="thinking-block my-2 svelte-1mu9o59"><button class="flex items-center gap-2 text-xs text-accent-purple hover:text-accent-purple/80 bg-accent-purple/5 hover:bg-accent-purple/10 border border-accent-purple/20 rounded-lg px-3 py-2 transition-all duration-200 w-full text-left svelte-1mu9o59" style="box-shadow: 0 0 8px rgba(124, 77, 255, 0.1)"><svg${attr_class(`w-3 h-3 transition-transform duration-200 ${stringify("")}`, "svelte-1mu9o59")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" class="svelte-1mu9o59"></path></svg> <span class="font-medium svelte-1mu9o59">`);
    if (isStreaming) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="thinking-dots svelte-1mu9o59">Thinking</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`Thinking`);
    }
    $$renderer2.push(`<!--]--></span> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-text-muted svelte-1mu9o59">(${escape_html(thinkingContent.length)} chars)</span>`);
    }
    $$renderer2.push(`<!--]--></button> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function ToolCallCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      toolCall,
      toolResult,
      isExecuting = false,
      isHistorical = false
    } = $$props;
    let status = derived(() => {
      if (isExecuting) return {
        text: "Running",
        cssColor: "var(--color-accent-cyan)",
        icon: "⚡",
        pulse: true
      };
      if (toolResult?.isError) return { text: "Error", cssColor: "#f87171", icon: "✕", pulse: false };
      if (toolResult) return {
        text: "Complete",
        cssColor: "var(--color-accent-green, #34d399)",
        icon: "✓",
        pulse: false
      };
      if (isHistorical) return {
        text: "Done",
        cssColor: "var(--color-accent-green, #34d399)",
        icon: "✓",
        pulse: false
      };
      return {
        text: "Pending",
        cssColor: "var(--color-text-muted, #888)",
        icon: "⏳",
        pulse: false
      };
    });
    let hasInput = derived(() => Boolean(toolCall.input || toolCall.arguments));
    let hasOutput = derived(() => Boolean(toolResult?.content));
    $$renderer2.push(`<div class="tool-call-card my-3 border border-border-default rounded-lg bg-bg-tertiary overflow-hidden"><div class="flex items-center justify-between p-3 bg-bg-surface/50"><div class="flex items-center gap-3"><div class="flex items-center gap-2"><span class="text-lg">${escape_html(status().icon)}</span> <span class="font-mono font-medium text-sm text-text-primary">${escape_html(toolCall.name)}</span></div> <div class="flex items-center gap-1"><div${attr_class(`w-2 h-2 rounded-full ${stringify(status().pulse ? "animate-pulse" : "")}`)}${attr_style(`background-color: ${stringify(status().cssColor)}`)}></div> <span class="text-xs font-medium"${attr_style(`color: ${stringify(status().cssColor)}`)}>${escape_html(status().text)}</span></div></div> <div class="flex items-center gap-2">`);
    if (hasInput()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="text-xs text-text-muted hover:text-accent-cyan px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors">Input ${escape_html("▶")}</button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (hasOutput()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="text-xs text-text-muted hover:text-accent-cyan px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-hover border border-border-default transition-colors">Output ${escape_html("▶")}</button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (isExecuting) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="border-t border-border-default bg-accent-cyan/5"><div class="p-3 flex items-center gap-3"><div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0s"></div> <div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0.2s"></div> <div class="w-2 h-2 rounded-full bg-accent-cyan animate-pulse" style="animation-delay: 0.4s"></div></div> <span class="text-xs text-accent-cyan font-medium">Executing...</span></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function ImageLightbox($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function MessageBubble($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let {
      message,
      streaming = false,
      streamingContent = "",
      streamingThinkingContent = "",
      streamingToolCalls = [],
      showChannel = false
    } = $$props;
    const channelConfig = {
      discord: {
        label: "Discord",
        color: "#5865F2",
        bg: "rgba(88,101,242,0.15)"
      },
      telegram: {
        label: "Telegram",
        color: "#0088cc",
        bg: "rgba(0,136,204,0.15)"
      },
      webchat: { label: "Web", color: "#00e5ff", bg: "rgba(0,229,255,0.12)" },
      signal: {
        label: "Signal",
        color: "#3A76F0",
        bg: "rgba(58,118,240,0.15)"
      },
      whatsapp: {
        label: "WhatsApp",
        color: "#25D366",
        bg: "rgba(37,211,102,0.15)"
      },
      slack: { label: "Slack", color: "#4A154B", bg: "rgba(74,21,75,0.25)" }
    };
    let channelBadge = derived(() => {
      if (!showChannel || !message?.channel) return null;
      const ch = message.channel.toLowerCase();
      return channelConfig[ch] ?? {
        label: message.channel,
        color: "#888",
        bg: "rgba(136,136,136,0.12)"
      };
    });
    let renderedHtml = "";
    let role = derived(() => message?.role ?? "assistant");
    let content = derived(() => streaming ? streamingContent : message?.content ?? "");
    let isUser = derived(() => role() === "user");
    let timestamp = derived(() => message?.timestamp ? new Date(message.timestamp) : null);
    let relativeTime = derived(() => timestamp() ? formatRelativeTime(timestamp().getTime()) : null);
    const imageUrlRegex = /(?:!\[([^\]]*)\]\((https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s)]*)?)\))|(?:^|\s)(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)(?:\s|$)/gi;
    let inlineImages = derived(() => {
      if (!content()) return [];
      const images = [];
      const seen = /* @__PURE__ */ new Set();
      let match;
      const regex = new RegExp(imageUrlRegex.source, imageUrlRegex.flags);
      while ((match = regex.exec(content())) !== null) {
        const url = match[2] || match[3];
        if (url && !seen.has(url)) {
          seen.add(url);
          images.push({ url, alt: match[1] || "Image" });
        }
      }
      return images;
    });
    let fullMessageText = derived(() => {
      let text = content();
      const thinking = streaming ? streamingThinkingContent : message?.thinkingContent;
      if (thinking) {
        text = `[Thinking]
${thinking}

${text}`;
      }
      return text;
    });
    let currentThinkingContent = derived(() => streaming ? streamingThinkingContent : message?.thinkingContent);
    let currentToolCalls = derived(() => streaming ? streamingToolCalls : message?.toolCalls);
    $$renderer2.push(`<div${attr_class(`flex ${stringify(isUser() ? "justify-end" : "justify-start")} animate-slide-in-up mb-3 md:mb-4 px-2 md:px-0`, "svelte-1e5n1dp")}>`);
    if (!isUser()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-shrink-0 mr-2.5 mt-5 hidden md:block svelte-1e5n1dp"><img src="/images/ranaye-avatar.png" alt="Ranaye" class="w-8 h-8 rounded-full object-cover border border-accent-purple/30 shadow-[0_0_8px_rgba(124,77,255,0.2)] svelte-1e5n1dp" onerror="this.__e=event"/></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div${attr_class(`max-w-[90%] md:max-w-[80%] ${stringify(isUser() ? "ml-8 md:ml-12" : "")} group`, "svelte-1e5n1dp")} role="article"><div${attr_class(`flex items-center gap-2 mb-1 ${stringify(isUser() ? "justify-end" : "")}`, "svelte-1e5n1dp")}>`);
    if (!isUser()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-xs font-medium text-accent-purple svelte-1e5n1dp">Ranaye</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<span class="text-xs font-medium text-accent-cyan svelte-1e5n1dp">${escape_html("You")}</span>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (channelBadge()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none svelte-1e5n1dp"${attr_style(`color: ${stringify(channelBadge().color)}; background: ${stringify(channelBadge().bg)}; border: 1px solid ${stringify(channelBadge().color)}33;`)}>${escape_html(channelBadge().label)}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (relativeTime()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none svelte-1e5n1dp"${attr("title", timestamp()?.toLocaleString())}>${escape_html(relativeTime())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (message?.isAborted) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-xs text-amber-400 font-medium svelte-1e5n1dp">⚡ Aborted</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (message?.isError) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-xs text-red-400 font-medium svelte-1e5n1dp">✕ Error</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button${attr_class(
      `text-xs p-1.5 md:p-1 rounded-md transition-all duration-200 min-h-6 min-w-6 flex items-center justify-center ${stringify("text-text-muted hover:text-accent-cyan opacity-0 group-hover:opacity-100")} ${stringify(!fullMessageText() ? "hidden" : "")}`,
      "svelte-1e5n1dp"
    )}${attr("aria-label", "Copy message")}${attr("title", "Copy message")}>`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<svg class="w-3 h-3 svelte-1e5n1dp" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" class="svelte-1e5n1dp"></path></svg>`);
    }
    $$renderer2.push(`<!--]--></button></div> `);
    if (!isUser() && currentThinkingContent()) {
      $$renderer2.push("<!--[-->");
      ThinkingBlock($$renderer2, {
        thinkingContent: currentThinkingContent(),
        isStreaming: streaming
      });
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (content() || message?.images?.length || inlineImages().length > 0 || streaming) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div${attr_class(
        `rounded-2xl px-2.5 py-2.5 md:px-4 md:py-3 ${stringify(isUser() ? "bg-accent-cyan/10 border border-accent-cyan/20" : "glass")} ${stringify(streaming ? "border-accent-purple/30" : "")}`,
        "svelte-1e5n1dp"
      )}>`);
      if (message?.images?.length) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div${attr_class(`flex flex-wrap gap-2 ${stringify(content() ? "mb-2" : "")}`, "svelte-1e5n1dp")}><!--[-->`);
        const each_array = ensure_array_like(message.images);
        for (let idx = 0, $$length = each_array.length; idx < $$length; idx++) {
          let img = each_array[idx];
          $$renderer2.push(`<button class="block cursor-pointer bg-transparent border-0 p-0 svelte-1e5n1dp"${attr("aria-label", `View attachment ${stringify(idx + 1)} fullscreen`)}><img${attr("src", img.dataUrl)}${attr("alt", `Attachment ${stringify(idx + 1)}`)} class="max-w-[200px] md:max-w-xs max-h-48 md:max-h-64 rounded-lg border border-border-default hover:border-accent-cyan/50 transition-colors cursor-pointer object-contain svelte-1e5n1dp" loading="lazy"/></button>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (content()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="markdown-content text-sm svelte-1e5n1dp">${html(renderedHtml)}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (inlineImages().length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="mt-2 flex flex-wrap gap-2 svelte-1e5n1dp"><!--[-->`);
        const each_array_1 = ensure_array_like(inlineImages());
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let img = each_array_1[$$index_1];
          $$renderer2.push(`<button class="block cursor-pointer bg-transparent border-0 p-0 svelte-1e5n1dp" aria-label="View image fullscreen"><img${attr("src", img.url)}${attr("alt", img.alt)} class="max-w-[200px] md:max-w-sm max-h-48 md:max-h-64 rounded-lg border border-border-default hover:border-accent-cyan/50 transition-colors cursor-pointer object-contain svelte-1e5n1dp" loading="lazy" onerror="this.__e=event"/></button>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (streaming && !content() && !currentThinkingContent() && !currentToolCalls()?.length) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center gap-2 py-1 svelte-1e5n1dp"><div class="flex items-center gap-1 svelte-1e5n1dp"><span class="typing-dot svelte-1e5n1dp"></span> <span class="typing-dot svelte-1e5n1dp" style="animation-delay: 0.15s"></span> <span class="typing-dot svelte-1e5n1dp" style="animation-delay: 0.3s"></span></div> <span class="text-xs text-text-muted svelte-1e5n1dp">Thinking...</span></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (streaming && content()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="inline-block w-0.5 h-4 bg-accent-cyan ml-0.5 animate-pulse align-middle svelte-1e5n1dp"></span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (currentToolCalls()?.length) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_2 = ensure_array_like(currentToolCalls());
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let toolCall = each_array_2[$$index_2];
        const toolResult = message?.toolResults?.find((r) => r.toolCallId === toolCall.id);
        ToolCallCard($$renderer2, {
          toolCall,
          toolResult,
          isExecuting: streaming && !toolResult,
          isHistorical: message?.isHistorical ?? false
        });
      }
      $$renderer2.push(`<!--]-->`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    if (isUser()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-shrink-0 ml-2.5 mt-5 hidden md:block svelte-1e5n1dp">`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="w-8 h-8 rounded-full bg-accent-cyan/20 border border-accent-cyan/30 flex items-center justify-center shadow-[0_0_8px_rgba(0,229,255,0.15)] svelte-1e5n1dp"><svg class="w-4 h-4 text-accent-cyan svelte-1e5n1dp" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" class="svelte-1e5n1dp"></path></svg></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    ImageLightbox($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
function MessageList($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const msgs = getMessages();
    const conn = getConnection();
    const sessions = getSessions();
    let hasMixedChannels = derived(() => {
      const channels = /* @__PURE__ */ new Set();
      for (const m of msgs.list) {
        if (m.channel) channels.add(m.channel);
      }
      return channels.size > 1;
    });
    let messagesWithDates = derived(() => {
      const result = [];
      let lastDateGroup = "";
      for (const message of msgs.list) {
        const dateGroup = getDateGroup(message.timestamp);
        if (dateGroup !== lastDateGroup) {
          result.push({ type: "separator", date: dateGroup });
          lastDateGroup = dateGroup;
        }
        result.push({ type: "message", message });
      }
      return result;
    });
    let activeSession = derived(() => sessions.list.find((s) => s.key === sessions.activeKey));
    let sessionTitle = derived(() => activeSession() ? sessions.getSessionTitle(activeSession()) : "");
    const quickActions = [
      {
        emoji: "💬",
        label: "Ask a question",
        text: "Help me understand..."
      },
      { emoji: "✍️", label: "Write something", text: "Write a..." },
      { emoji: "🔍", label: "Research a topic", text: "Research..." },
      {
        emoji: "💡",
        label: "Brainstorm ideas",
        text: "Brainstorm ideas for..."
      }
    ];
    $$renderer2.push(`<div class="flex-1 overflow-y-auto px-4 py-6"><div class="max-w-4xl mx-auto">`);
    if (msgs.loadingHistory) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center py-12"><div class="flex items-center gap-3 text-text-muted"><svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span class="text-sm">Loading history...</span></div></div>`);
    } else if (msgs.list.length === 0 && !msgs.streaming) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center py-16 md:py-24 text-center animate-fade-in"><div class="relative mb-8"><div class="absolute inset-0 w-32 h-32 md:w-40 md:h-40 rounded-full bg-accent-cyan/10 blur-2xl"></div> <img src="/logo.png" alt="Cortex" class="relative w-32 h-32 md:w-40 md:h-40 drop-shadow-lg"/></div> <h2 class="text-2xl md:text-3xl font-bold gradient-text mb-3">`);
      if (sessionTitle()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`${escape_html(sessionTitle())}`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Welcome to Cortex`);
      }
      $$renderer2.push(`<!--]--></h2> <p class="text-text-muted text-sm md:text-base max-w-md mb-8">`);
      if (conn.state.status === "connected") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`Start a conversation — ask anything, explore ideas, or get help with a task.`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Configure your gateway connection in <a href="/settings" class="text-accent-cyan hover:underline">Settings</a> to get started.`);
      }
      $$renderer2.push(`<!--]--></p> `);
      if (conn.state.status === "connected") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="grid grid-cols-2 gap-3 w-full max-w-lg"><!--[-->`);
        const each_array = ensure_array_like(quickActions);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let action = each_array[$$index];
          $$renderer2.push(`<button class="flex items-center gap-3 px-4 py-3 rounded-xl text-left glass hover:bg-bg-hover border border-border-default hover:border-accent-cyan/30 transition-all duration-200 group/action"><span class="text-xl">${escape_html(action.emoji)}</span> <span class="text-sm text-text-secondary group-hover/action:text-text-primary transition-colors">${escape_html(action.label)}</span></button>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<!--[-->`);
      const each_array_1 = ensure_array_like(messagesWithDates());
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let item = each_array_1[$$index_1];
        if (item.type === "separator") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex items-center justify-center my-6"><div class="flex-1 h-px bg-border-default"></div> <span class="px-4 text-xs text-text-muted font-medium bg-bg-primary">${escape_html(item.date)}</span> <div class="flex-1 h-px bg-border-default"></div></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="virtual-item">`);
          MessageBubble($$renderer2, { message: item.message, showChannel: hasMixedChannels() });
          $$renderer2.push(`<!----></div>`);
        }
        $$renderer2.push(`<!--]-->`);
      }
      $$renderer2.push(`<!--]--> `);
      if (msgs.streaming) {
        $$renderer2.push("<!--[-->");
        MessageBubble($$renderer2, {
          streaming: true,
          streamingContent: msgs.streamingContent,
          streamingThinkingContent: msgs.streamingThinkingContent,
          streamingToolCalls: msgs.streamingToolCalls,
          showChannel: false
        });
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function ChatInput($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const msgs = getMessages();
    const conn = getConnection();
    let inputText = "";
    let attachments = [];
    let canSend = derived(() => (inputText.trim().length > 0 || attachments.length > 0) && !msgs.streaming && conn.state.status === "connected");
    let charCount = derived(() => inputText.length);
    let showCharCount = derived(() => charCount() > 500);
    $$renderer2.push(`<div${attr_class(`p-3 md:p-4 border-t border-border-default bg-bg-secondary transition-colors duration-200 ${stringify("")}`, "svelte-5wsbgm")} role="region" aria-label="Chat input"><div class="flex flex-col gap-2 max-w-4xl mx-auto svelte-5wsbgm">`);
    if (msgs.streaming) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-2 px-1 svelte-5wsbgm"><div class="flex items-center gap-1 svelte-5wsbgm"><span class="streaming-dot svelte-5wsbgm"></span> <span class="streaming-dot svelte-5wsbgm" style="animation-delay: 0.15s"></span> <span class="streaming-dot svelte-5wsbgm" style="animation-delay: 0.3s"></span></div> <span class="text-xs text-accent-purple font-medium svelte-5wsbgm">Ranaye is responding...</span></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (attachments.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-wrap gap-2 px-1 svelte-5wsbgm"><!--[-->`);
      const each_array = ensure_array_like(attachments);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let att = each_array[i];
        $$renderer2.push(`<div class="relative group/att svelte-5wsbgm"><img${attr("src", att.dataUrl)}${attr("alt", `Attachment ${stringify(i + 1)}`)} class="h-16 w-16 md:h-20 md:w-20 object-cover rounded-lg border border-border-default svelte-5wsbgm"/> <button class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs font-bold opacity-0 group-hover/att:opacity-100 transition-opacity duration-150 hover:bg-red-400 svelte-5wsbgm" aria-label="Remove attachment">×</button></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (showCharCount()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex justify-end svelte-5wsbgm"><span class="text-xs text-text-muted font-mono svelte-5wsbgm">${escape_html(charCount().toLocaleString())} characters</span></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex items-end gap-2 md:gap-3 svelte-5wsbgm"><button${attr("disabled", conn.state.status !== "connected", true)}${attr_class(
      `flex-shrink-0 p-3 md:p-3 rounded-xl transition-all duration-200 min-h-11 min-w-11 md:min-h-auto md:min-w-auto flex items-center justify-center ${stringify(conn.state.status === "connected" ? "text-text-muted hover:text-accent-cyan hover:bg-bg-hover" : "text-text-muted opacity-30 cursor-not-allowed")}`,
      "svelte-5wsbgm"
    )} aria-label="Attach image" title="Attach image (or paste / drag-drop)"><svg class="w-5 h-5 svelte-5wsbgm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" class="svelte-5wsbgm"></path></svg></button> <input type="file" accept="image/*" multiple="" class="hidden svelte-5wsbgm"/> <div class="flex-1 relative svelte-5wsbgm"><textarea aria-label="Chat message"${attr("placeholder", conn.state.status === "connected" ? attachments.length > 0 ? "Add a message or paste more images..." : "Message (Shift+Enter for newline, paste images)" : "Connect to gateway first...")}${attr("disabled", conn.state.status !== "connected", true)} rows="1" class="w-full resize-none rounded-xl px-3 py-4 md:px-4 md:py-3 text-sm bg-bg-input border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-cyan/50 focus:ring-2 focus:ring-accent-cyan/20 glow-cyan disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 svelte-5wsbgm">`);
    const $$body = escape_html(inputText);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea></div> `);
    if (msgs.streaming) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="flex-shrink-0 p-3 md:p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all duration-200 min-h-11 min-w-11 md:min-h-auto md:min-w-auto glow-pink flex items-center justify-center svelte-5wsbgm" style="box-shadow: 0 0 15px rgba(244, 63, 158, 0.15)" aria-label="Stop response"><svg class="w-5 h-5 svelte-5wsbgm" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" class="svelte-5wsbgm"></rect></svg></button>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<button${attr("disabled", !canSend(), true)}${attr_class(
        `flex-shrink-0 p-3 md:p-3 rounded-xl transition-all duration-200 min-h-11 min-w-11 md:min-h-auto md:min-w-auto flex items-center justify-center ${stringify(canSend() ? "bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 hover:scale-105 glow-cyan glow-pulse" : "bg-bg-tertiary border border-border-default text-text-muted cursor-not-allowed opacity-50")}`,
        "svelte-5wsbgm"
      )} aria-label="Send message"><svg class="w-5 h-5 svelte-5wsbgm" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" class="svelte-5wsbgm"></path></svg></button>`);
    }
    $$renderer2.push(`<!--]--></div></div></div>`);
  });
}
function ErrorBoundary($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const toasts = getToasts();
    let { children, fallback } = $$props;
    let hasError = false;
    let errorMessage = "";
    function handleError(error) {
      hasError = true;
      errorMessage = error.message || "An unexpected error occurred";
      console.error("ErrorBoundary caught error:", error);
      toasts.error("Component Error", "A component encountered an error and has been disabled.", 8e3);
    }
    function retry() {
      hasError = false;
      errorMessage = "";
    }
    if (typeof window !== "undefined") {
      window.addEventListener("error", (event) => {
        handleError(new Error(event.message || "Runtime error"));
      });
      window.addEventListener("unhandledrejection", (event) => {
        handleError(new Error(event.reason?.message || "Unhandled promise rejection"));
      });
    }
    if (hasError) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center justify-center p-8">`);
      if (fallback) {
        $$renderer2.push("<!--[-->");
        fallback($$renderer2, { error: errorMessage, retry });
        $$renderer2.push(`<!---->`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="max-w-md mx-auto text-center"><div class="gradient-border glass p-6 rounded-lg glow-red"><div class="mx-auto w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-accent-red/20"><svg class="w-8 h-8 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg></div> <h2 class="text-lg font-semibold text-text-primary mb-2">Something went wrong</h2> <p class="text-sm text-text-secondary mb-4">A component encountered an error and cannot be displayed.</p> `);
        if (errorMessage) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<details class="mb-4 text-left"><summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary">Error details</summary> <div class="mt-2 p-3 rounded bg-bg-tertiary text-xs font-mono text-text-secondary">${escape_html(errorMessage)}</div></details>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <button class="px-4 py-2 rounded-lg gradient-bg gradient-border glow-cyan text-sm font-medium text-text-primary hover:brightness-110 transition-all">Try Again</button></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      children($$renderer2);
      $$renderer2.push(`<!---->`);
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const sessions = getSessions();
    const conn = getConnection();
    const msgs = getMessages();
    let sidebarCollapsed = false;
    let sidebarMobileOpen = false;
    let streamingHasCompaction = derived(() => msgs.streamingContent.toLowerCase().includes("compacting") || msgs.streamingContent.toLowerCase().includes("context compaction"));
    let showCompacting = derived(() => streamingHasCompaction());
    let activeSession = derived(() => sessions.list.find((s) => s.key === sessions.activeKey));
    let messageCount = derived(() => activeSession()?.messageCount ?? msgs.list.length);
    function handleMobileSessionSelect(key) {
      sessions.setActiveSession(key);
      sidebarMobileOpen = false;
    }
    function formatThinkingLevel(session) {
      const level = session?.thinkingLevel || session?.reasoningLevel;
      if (!level || level === "off" || level === "none") return null;
      return level;
    }
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      head("1uha8ag", $$renderer3, ($$renderer4) => {
        $$renderer4.title(($$renderer5) => {
          $$renderer5.push(`<title>Chat — Cortex</title>`);
        });
      });
      $$renderer3.push(`<div class="flex h-full relative">`);
      if (sidebarMobileOpen) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="fixed inset-0 bg-black/50 z-40 md:hidden" role="button" tabindex="0" aria-label="Close sidebar"></div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> `);
      SessionSidebar($$renderer3, {
        onMobileSessionSelect: handleMobileSessionSelect,
        get collapsed() {
          return sidebarCollapsed;
        },
        set collapsed($$value) {
          sidebarCollapsed = $$value;
          $$settled = false;
        },
        get mobileOpen() {
          return sidebarMobileOpen;
        },
        set mobileOpen($$value) {
          sidebarMobileOpen = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> <main class="flex-1 flex flex-col min-w-0"><header class="flex items-center gap-3 px-3 py-2.5 md:px-4 md:py-3 border-b border-border-default bg-bg-secondary/50"><button class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors md:hidden min-h-11" aria-label="Open sidebar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button> `);
      if (sidebarCollapsed) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<button class="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors hidden md:block" aria-label="Open sidebar"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> <div class="flex-1 min-w-0">`);
      if (sessions.activeKey) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<!--[-->`);
        const each_array = ensure_array_like(sessions.list.filter((s) => s.key === sessions.activeKey));
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let session = each_array[$$index];
          $$renderer3.push(`<div class="flex items-center gap-2 flex-wrap"><h2 class="text-sm font-medium text-text-primary truncate">${escape_html(sessions.getSessionTitle(session))}</h2> `);
          if (messageCount() > 0) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20 leading-none"><svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg> ${escape_html(messageCount())}</span>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]--></div> <div class="flex items-center gap-2 flex-wrap mt-0.5">`);
          if (session.model) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<span class="text-[11px] text-text-muted font-mono">${escape_html(session.model)}</span>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]--> `);
          if (formatThinkingLevel(session)) {
            $$renderer3.push("<!--[-->");
            $$renderer3.push(`<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-purple/10 text-accent-purple border border-accent-purple/20 leading-none font-medium">🧠 ${escape_html(formatThinkingLevel(session))}</span>`);
          } else {
            $$renderer3.push("<!--[!-->");
          }
          $$renderer3.push(`<!--]--></div>`);
        }
        $$renderer3.push(`<!--]--> `);
        if (!sessions.list.find((s) => s.key === sessions.activeKey)) {
          $$renderer3.push("<!--[-->");
          $$renderer3.push(`<h2 class="text-sm font-medium text-text-primary truncate">${escape_html(sessions.activeKey)}</h2>`);
        } else {
          $$renderer3.push("<!--[!-->");
        }
        $$renderer3.push(`<!--]-->`);
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push(`<h2 class="text-sm text-text-muted">No session selected</h2>`);
      }
      $$renderer3.push(`<!--]--></div> <div class="flex items-center gap-2" role="status" aria-live="polite">`);
      if (conn.state.status === "connected") {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<span class="w-2 h-2 rounded-full bg-accent-green" aria-hidden="true"></span> <span class="sr-only">Connected</span>`);
      } else if (conn.state.status === "connecting" || conn.state.status === "authenticating") {
        $$renderer3.push("<!--[1-->");
        $$renderer3.push(`<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true"></span> <span class="sr-only">${escape_html(conn.state.status)}</span>`);
      } else {
        $$renderer3.push("<!--[!-->");
        $$renderer3.push(`<span class="w-2 h-2 rounded-full bg-red-500" aria-hidden="true"></span> <span class="sr-only">Disconnected</span>`);
      }
      $$renderer3.push(`<!--]--></div></header> `);
      if (showCompacting()) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="flex items-center gap-2 px-4 py-1.5 bg-accent-purple/5 border-b border-accent-purple/15 animate-fade-in"><svg class="w-3.5 h-3.5 text-accent-purple animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span class="text-xs text-accent-purple font-medium">Context compacting…</span></div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> `);
      ErrorBoundary($$renderer3, {
        children: ($$renderer4) => {
          MessageList($$renderer4);
        }
      });
      $$renderer3.push(`<!----> `);
      ChatInput($$renderer3);
      $$renderer3.push(`<!----></main></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
  });
}
export {
  _page as default
};
