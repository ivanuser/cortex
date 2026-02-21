import { l as head, b as attr, a as attr_class, s as stringify, c as escape_html, j as derived } from "../../../chunks/index.js";
import { g as getConnection, a as gateway } from "../../../chunks/connection.svelte.js";
import { g as getSessions } from "../../../chunks/sessions.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    const sessions = getSessions();
    let helloData = null;
    let presenceCount = 0;
    let modelsCount = 0;
    gateway.on("hello", (payload) => {
      helloData = payload;
      presenceCount = Array.isArray(helloData?.snapshot?.presence) ? helloData.snapshot.presence.length : 0;
    });
    function formatUptime(ms) {
      if (!ms) return "n/a";
      const seconds = Math.floor(ms / 1e3);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ${minutes % 60}m`;
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    let uptimeMs = derived(() => helloData?.snapshot?.uptimeMs);
    let tickMs = derived(() => helloData?.policy?.tickIntervalMs);
    let serverVersion = derived(() => helloData?.server?.version ?? conn.state.serverVersion);
    let protocol = derived(() => helloData?.protocol ?? conn.state.protocol);
    let authMode = derived(() => helloData?.snapshot?.authMode ?? "unknown");
    let connId = derived(() => helloData?.server?.connId ?? conn.state.connId);
    head("14qseeg", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Overview — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary">Overview</h1> <p class="text-sm text-text-muted mt-1">Gateway status, entry points, and a fast health read.</p></div> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh</button></div> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div${attr_class(`rounded-xl border border-border-default bg-bg-secondary/50 p-4 ${stringify(conn.state.status === "connected" ? "glow-green" : "")}`)}><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Status</div> <div${attr_class(`text-2xl font-bold ${stringify(conn.state.status === "connected" ? "text-accent-green" : "text-red-400")}`)}>${escape_html(conn.state.status === "connected" ? "Connected" : "Disconnected")}</div> `);
      if (serverVersion()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="text-xs text-text-muted mt-1">v${escape_html(serverVersion())} · protocol ${escape_html(protocol() ?? "?")}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Uptime</div> <div class="text-2xl font-bold text-accent-cyan">${escape_html(formatUptime(uptimeMs()))}</div> <div class="text-xs text-text-muted mt-1">Tick: ${escape_html(tickMs() ? `${tickMs()}ms` : "n/a")}</div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Sessions</div> <div class="text-2xl font-bold text-accent-purple">${escape_html(sessions.list.length)}</div> <div class="text-xs text-text-muted mt-1">`);
      if (sessions.mainKey) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`Main: ${escape_html(sessions.mainKey.split(":").pop())}`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`No main session`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Models</div> <div class="text-2xl font-bold text-accent-amber">${escape_html(modelsCount)}</div> <div class="text-xs text-text-muted mt-1">Available providers</div></div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="flex items-center justify-between mb-3"><div class="text-xs font-medium text-text-muted uppercase tracking-wider">Instances</div> <span class="text-lg font-bold text-accent-cyan">${escape_html(presenceCount)}</span></div> <p class="text-xs text-text-muted">Presence beacons from connected clients and nodes.</p> <a href="/instances" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">View all →</a></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="flex items-center justify-between mb-3"><div class="text-xs font-medium text-text-muted uppercase tracking-wider">Cron</div> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<span class="text-xs text-text-muted">n/a</span>`);
      }
      $$renderer2.push(`<!--]--></div> <p class="text-xs text-text-muted">Next run: ${escape_html("n/a")}</p> <a href="/cron" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">Manage jobs →</a></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="flex items-center justify-between mb-3"><div class="text-xs font-medium text-text-muted uppercase tracking-wider">Auth</div> <span class="px-2 py-0.5 rounded text-xs font-medium bg-accent-purple/20 text-accent-purple">${escape_html(authMode())}</span></div> `);
      if (connId()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="text-xs text-text-muted font-mono">ID: ${escape_html(connId().substring(0, 16))}…</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <a href="/settings" class="inline-block mt-2 text-xs text-accent-cyan hover:underline">Configure →</a></div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><h2 class="text-sm font-semibold text-text-primary mb-3">Quick Actions</h2> <div class="grid grid-cols-2 md:grid-cols-4 gap-3"><a href="/" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all text-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path></svg> Open Chat</a> <a href="/nodes" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all text-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> Node Fleet</a> <a href="/debug" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all text-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> Debug</a> <a href="/logs" class="flex items-center gap-2 p-3 rounded-lg border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all text-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg> View Logs</a></div></div></div></div>`);
  });
}
export {
  _page as default
};
