import { g as getConnection } from "../../chunks/connection.svelte.js";
import "../../chunks/sessions.svelte.js";
import "../../chunks/messages.svelte.js";
import { g as getTheme } from "../../chunks/theme.svelte.js";
import { e as ensure_array_like, a as attr_class, s as stringify, b as attr, c as escape_html, d as bind_props, g as getContext, f as store_get, h as unsubscribe_stores } from "../../chunks/index.js";
import { g as getToasts } from "../../chunks/toasts.svelte.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
function ToastContainer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const toasts = getToasts();
    const typeConfig = {
      success: {
        color: "bg-accent-green border-accent-green",
        glow: "glow-green",
        icon: "M5 13l4 4L19 7"
      },
      error: {
        color: "bg-accent-red border-accent-red",
        glow: "glow-red",
        icon: "M6 18L18 6M6 6l12 12"
      },
      warning: {
        color: "bg-accent-amber border-accent-amber",
        glow: "glow-amber",
        icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
      },
      info: {
        color: "bg-accent-cyan border-accent-cyan",
        glow: "glow-cyan",
        icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      }
    };
    $$renderer2.push(`<div class="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm" aria-live="polite" aria-relevant="additions removals"><!--[-->`);
    const each_array = ensure_array_like(toasts.list);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let toast = each_array[$$index];
      const config = typeConfig[toast.type];
      $$renderer2.push(`<div${attr_class(`gradient-border glass p-4 rounded-lg shadow-lg ${stringify(config.color)} ${stringify(config.glow)} animate-in slide-in-from-right-full duration-300`, "svelte-cqwvc2")} role="alert"><div class="flex items-start gap-3"><div class="flex-shrink-0 w-5 h-5 mt-0.5"><svg class="w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"${attr("d", config.icon)}></path></svg></div> <div class="flex-1 min-w-0"><p class="text-sm font-medium text-text-primary">${escape_html(toast.title)}</p> `);
      if (toast.message) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="text-xs text-text-secondary mt-1">${escape_html(toast.message)}</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> <button class="flex-shrink-0 ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" aria-label="Close notification"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
function AuthDialog($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    getConnection();
    let { show = false } = $$props;
    let gatewayUrl = "";
    let isConnecting = false;
    if (show) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title"><div class="w-full max-w-md gradient-border glass p-6 rounded-lg glow-cyan animate-in zoom-in-95 duration-300 svelte-htsx5a"><div class="flex items-center gap-3 mb-6"><div class="w-12 h-12 rounded-lg gradient-bg flex items-center justify-center glow-purple"><svg class="w-6 h-6 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg></div> <div><h2 id="auth-dialog-title" class="text-lg font-semibold gradient-text">Connect to OpenClaw</h2> <p class="text-sm text-text-muted">Enter your gateway credentials to get started</p></div></div> <form class="space-y-4"><div><label for="gateway-url" class="block text-sm font-medium text-text-secondary mb-2">Gateway URL</label> <input id="gateway-url" type="url"${attr("value", gatewayUrl)} placeholder="wss://your-openclaw-gateway.com" class="w-full px-3 py-2 rounded-lg glass border border-border-default bg-bg-secondary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan focus:glow-cyan transition-all duration-200"${attr("disabled", isConnecting, true)} required=""/></div> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<button type="button" class="text-xs text-text-muted hover:text-accent-cyan transition-colors flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> I have an access token</button>`);
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="flex gap-3 pt-2"><button type="button" class="flex-1 px-4 py-2 rounded-lg border border-border-default text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"${attr("disabled", isConnecting, true)}>Cancel</button> <button type="submit" class="flex-1 px-4 py-2 rounded-lg gradient-bg gradient-border glow-cyan text-text-primary font-medium hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"${attr("disabled", !gatewayUrl.trim(), true)}>`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Connect`);
      }
      $$renderer2.push(`<!--]--></button></div></form> <div class="mt-4 pt-4 border-t border-border-default"><p class="text-xs text-text-muted text-center">`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Your device will be paired with the gateway. The gateway owner will approve your access.`);
      }
      $$renderer2.push(`<!--]--> <br/> Need help? Check the <a href="https://docs.openclaw.ai" target="_blank" class="text-accent-cyan hover:underline">OpenClaw documentation</a>.</p></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { show });
  });
}
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function AppNav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    const conn = getConnection();
    const navGroups = [
      {
        label: "Chat",
        items: [
          {
            label: "Chat",
            href: "/",
            icon: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
          }
        ]
      },
      {
        label: "Control",
        items: [
          {
            label: "Overview",
            href: "/overview",
            icon: "M4 6h16M4 10h16M4 14h16M4 18h16"
          },
          {
            label: "Channels",
            href: "/channels",
            icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
          },
          {
            label: "Instances",
            href: "/instances",
            icon: "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12h.01"
          },
          {
            label: "Sessions",
            href: "/sessions",
            icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          },
          {
            label: "Usage",
            href: "/usage",
            icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          },
          {
            label: "Cron Jobs",
            href: "/cron",
            icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          },
          {
            label: "Approvals",
            href: "/approvals",
            icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
          }
        ]
      },
      {
        label: "Agent",
        items: [
          {
            label: "Agents",
            href: "/agents",
            icon: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          },
          {
            label: "Skills",
            href: "/skills",
            icon: "M13 10V3L4 14h7v7l9-11h-7z"
          },
          {
            label: "Nodes",
            href: "/nodes",
            icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          },
          {
            label: "Memory",
            href: "/memory",
            icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          }
        ]
      },
      {
        label: "Settings",
        items: [
          {
            label: "Connection",
            href: "/settings",
            icon: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
          },
          {
            label: "Gateway Config",
            href: "/config",
            icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          },
          {
            label: "Debug",
            href: "/debug",
            icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          },
          { label: "Logs", href: "/logs", icon: "M4 6h16M4 12h16m-7 6h7" }
        ]
      }
    ];
    let {
      collapsed = false,
      mobileOpen = false,
      onshortcuthelp,
      onnavigate
    } = $$props;
    function isActive(href, currentPath) {
      if (href === "/") return currentPath === "/";
      return currentPath.startsWith(href);
    }
    $$renderer2.push(`<nav aria-label="Main navigation"${attr_class("h-full flex flex-col border-r border-border-default bg-bg-secondary/80 transition-all duration-300 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-64 max-md:shadow-2xl max-md:transition-transform max-md:duration-300 max-md:ease-in-out", void 0, {
      "w-56": !collapsed,
      "w-14": collapsed,
      "max-md:translate-x-0": mobileOpen,
      "max-md:-translate-x-full": !mobileOpen
    })}><div class="flex items-center gap-2 p-3 border-b border-border-default"><div class="hidden max-md:flex items-center gap-2 w-full"><img src="/logo.png" alt="Cortex" class="w-8 h-8 rounded-lg"/> <span class="text-base font-bold gradient-text tracking-wider">CORTEX</span> <button class="ml-auto p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" aria-label="Close navigation"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div> <div class="max-md:hidden flex items-center gap-2 w-full">`);
    if (!collapsed) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<img src="/logo.png" alt="Cortex" class="w-8 h-8 rounded-lg"/> <span class="text-base font-bold gradient-text tracking-wider">CORTEX</span> <button class="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" aria-label="Collapse navigation"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg></button>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<button class="mx-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" aria-label="Expand navigation"><img src="/logo.png" alt="Cortex" class="w-7 h-7 rounded-lg"/></button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="flex-1 overflow-y-auto py-2"><!--[-->`);
    const each_array = ensure_array_like(navGroups);
    for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
      let group = each_array[$$index_1];
      if (!collapsed) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="px-3 pt-3 pb-1"><span class="text-[10px] font-semibold uppercase tracking-widest text-text-muted/60">${escape_html(group.label)}</span></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="max-md:hidden pt-2 pb-1"><div class="mx-auto w-6 h-px bg-border-default"></div></div> <div class="hidden max-md:block px-3 pt-3 pb-1"><span class="text-[10px] font-semibold uppercase tracking-widest text-text-muted/60">${escape_html(group.label)}</span></div>`);
      }
      $$renderer2.push(`<!--]--> <!--[-->`);
      const each_array_1 = ensure_array_like(group.items);
      for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
        let item = each_array_1[$$index];
        const active = isActive(item.href, store_get($$store_subs ??= {}, "$page", page).url.pathname);
        $$renderer2.push(`<a${attr("href", item.href)}${attr("aria-current", active ? "page" : void 0)}${attr_class(
          `flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200 max-md:py-2.5 max-md:text-base ${stringify(active ? "gradient-bg glow-cyan text-accent-cyan font-medium" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover")}`,
          void 0,
          { "md:justify-center": collapsed }
        )}${attr("title", collapsed ? item.label : void 0)}><svg${attr_class(`w-4 h-4 max-md:w-5 max-md:h-5 flex-shrink-0 ${stringify(active ? "text-accent-cyan" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"${attr("d", item.icon)}></path></svg> `);
        if (!collapsed) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span>${escape_html(item.label)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<span class="hidden max-md:inline">${escape_html(item.label)}</span>`);
        }
        $$renderer2.push(`<!--]--></a>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div> <div class="p-2 border-t border-border-default"><div class="flex justify-center mb-1"><button class="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-mono font-semibold text-text-muted hover:text-accent-cyan hover:bg-bg-hover transition-colors" title="Keyboard shortcuts (Ctrl+/)" aria-label="Show keyboard shortcuts">?</button></div></div> <div class="p-2 border-t border-border-default" aria-live="polite" role="status">`);
    if (!collapsed) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-2 px-2 py-1.5 text-xs"><span${attr_class(`w-2 h-2 rounded-full flex-shrink-0 ${stringify(conn.state.status === "connected" ? "bg-accent-green glow-green" : conn.state.status === "connecting" || conn.state.status === "authenticating" ? "bg-amber-500 animate-pulse" : "bg-red-500")}`)} aria-hidden="true"></span> <span class="text-text-muted truncate">${escape_html(conn.state.status === "connected" ? `v${conn.state.serverVersion ?? "?"}` : conn.state.status)}</span></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="max-md:hidden flex justify-center py-1"><span${attr_class(`w-2.5 h-2.5 rounded-full ${stringify(conn.state.status === "connected" ? "bg-accent-green glow-green" : conn.state.status === "connecting" || conn.state.status === "authenticating" ? "bg-amber-500 animate-pulse" : "bg-red-500")}`)} aria-hidden="true"></span> <span class="sr-only">${escape_html(conn.state.status)}</span></div> <div class="hidden max-md:flex items-center gap-2 px-2 py-1.5 text-xs"><span${attr_class(`w-2 h-2 rounded-full flex-shrink-0 ${stringify(conn.state.status === "connected" ? "bg-accent-green glow-green" : conn.state.status === "connecting" || conn.state.status === "authenticating" ? "bg-amber-500 animate-pulse" : "bg-red-500")}`)} aria-hidden="true"></span> <span class="text-text-muted truncate">${escape_html(conn.state.status === "connected" ? `v${conn.state.serverVersion ?? "?"}` : conn.state.status)}</span></div>`);
    }
    $$renderer2.push(`<!--]--></div></nav>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
    bind_props($$props, { collapsed, mobileOpen });
  });
}
function KeyboardShortcuts($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { showHelp = false } = $$props;
    bind_props($$props, { showHelp });
  });
}
function ShortcutHelp($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { show = false } = $$props;
    const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? "⌘" : "Ctrl";
    const shortcuts = [
      { keys: [mod, "K"], desc: "Focus chat input" },
      { keys: [mod, "/"], desc: "Toggle this help" },
      { keys: [mod, ","], desc: "Open Settings" },
      { keys: [mod, "1–9"], desc: "Navigate to page by order" },
      { keys: ["Esc"], desc: "Close modal / deselect" }
    ];
    const pageMap = [
      "Chat",
      "Overview",
      "Channels",
      "Instances",
      "Sessions",
      "Usage",
      "Cron Jobs",
      "Approvals",
      "Agents"
    ];
    if (show) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm"><div class="relative w-full max-w-md mx-4 rounded-xl border border-accent-cyan/30 bg-bg-surface/95 backdrop-blur-md shadow-[0_0_30px_rgba(124,77,255,0.15)] overflow-hidden"><div class="flex items-center justify-between px-5 py-4 border-b border-border-default"><h2 class="text-base font-semibold text-text-primary tracking-wide flex items-center gap-2"><svg class="w-4 h-4 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Keyboard Shortcuts</h2> <button class="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors" aria-label="Close"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button></div> <div class="px-5 py-4 space-y-2.5"><!--[-->`);
      const each_array = ensure_array_like(shortcuts);
      for (let $$index_1 = 0, $$length = each_array.length; $$index_1 < $$length; $$index_1++) {
        let s = each_array[$$index_1];
        $$renderer2.push(`<div class="flex items-center justify-between py-1"><span class="text-sm text-text-secondary">${escape_html(s.desc)}</span> <div class="flex items-center gap-1"><!--[-->`);
        const each_array_1 = ensure_array_like(s.keys);
        for (let $$index = 0, $$length2 = each_array_1.length; $$index < $$length2; $$index++) {
          let key = each_array_1[$$index];
          $$renderer2.push(`<kbd class="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-border-default bg-bg-primary/80 text-[11px] font-mono font-medium text-accent-cyan shadow-[0_1px_0_1px_rgba(30,41,59,0.5)]">${escape_html(key)}</kbd>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="px-5 pb-4"><div class="rounded-lg border border-border-default/50 bg-bg-primary/40 p-3"><div class="text-[10px] uppercase tracking-widest text-text-muted/60 mb-2 font-semibold">Page Numbers</div> <div class="grid grid-cols-3 gap-x-3 gap-y-1"><!--[-->`);
      const each_array_2 = ensure_array_like(pageMap);
      for (let i = 0, $$length = each_array_2.length; i < $$length; i++) {
        let name = each_array_2[i];
        $$renderer2.push(`<div class="flex items-center gap-1.5 text-xs"><kbd class="inline-flex items-center justify-center w-5 h-5 rounded border border-border-default bg-bg-primary/80 text-[10px] font-mono text-accent-cyan">${escape_html(i + 1)}</kbd> <span class="text-text-muted truncate">${escape_html(name)}</span></div>`);
      }
      $$renderer2.push(`<!--]--></div></div></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
    bind_props($$props, { show });
  });
}
function SetupWizard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    getConnection();
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    getConnection();
    getTheme();
    let { children } = $$props;
    let showAuthDialog = false;
    let navCollapsed = false;
    let mobileNavOpen = false;
    let showShortcutHelp = false;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<div class="h-screen w-screen overflow-hidden bg-bg-primary flex"><a href="#main-content" class="skip-to-content">Skip to content</a> `);
      if (mobileNavOpen) {
        $$renderer3.push("<!--[-->");
        $$renderer3.push(`<div class="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" role="button" tabindex="0" aria-label="Close navigation"></div>`);
      } else {
        $$renderer3.push("<!--[!-->");
      }
      $$renderer3.push(`<!--]--> `);
      AppNav($$renderer3, {
        onshortcuthelp: () => showShortcutHelp = true,
        onnavigate: () => mobileNavOpen = false,
        get collapsed() {
          return navCollapsed;
        },
        set collapsed($$value) {
          navCollapsed = $$value;
          $$settled = false;
        },
        get mobileOpen() {
          return mobileNavOpen;
        },
        set mobileOpen($$value) {
          mobileNavOpen = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> <div id="main-content" class="flex-1 flex flex-col min-w-0 overflow-hidden" role="main"><header class="flex items-center gap-3 px-3 py-2 border-b border-border-default bg-bg-secondary/50 md:hidden flex-shrink-0"><button class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" aria-label="Open navigation menu"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg></button> <img src="/logo.png" alt="Cortex" class="w-6 h-6 rounded-lg"/> <span class="text-sm font-bold gradient-text tracking-wider">CORTEX</span></header> `);
      children($$renderer3);
      $$renderer3.push(`<!----></div> `);
      ToastContainer($$renderer3);
      $$renderer3.push(`<!----> `);
      AuthDialog($$renderer3, {
        get show() {
          return showAuthDialog;
        },
        set show($$value) {
          showAuthDialog = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      KeyboardShortcuts($$renderer3, {
        get showHelp() {
          return showShortcutHelp;
        },
        set showHelp($$value) {
          showShortcutHelp = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      ShortcutHelp($$renderer3, {
        get show() {
          return showShortcutHelp;
        },
        set show($$value) {
          showShortcutHelp = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> `);
      SetupWizard($$renderer3);
      $$renderer3.push(`<!----></div>`);
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
  _layout as default
};
