import { l as head, b as attr, a as attr_class, c as escape_html, e as ensure_array_like, k as attr_style, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let entries = [];
    let expandedIdx = null;
    let patchingIdx = null;
    function formatUptime(ms) {
      if (typeof ms !== "number" || ms <= 0) return "—";
      const seconds = Math.floor(ms / 1e3);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m`;
      return `${seconds}s`;
    }
    function formatInputAge(seconds) {
      if (seconds == null) return "—";
      if (seconds < 60) return `${seconds}s ago`;
      if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
      if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
      return `${Math.floor(seconds / 86400)}d ago`;
    }
    function getInstanceStatus(entry) {
      if (entry.lastInputSeconds != null) {
        if (entry.lastInputSeconds < 300) return "online";
        if (entry.lastInputSeconds < 3600) return "idle";
        return "stale";
      }
      return "online";
    }
    let sortedEntries = derived(() => {
      return [...entries].sort((a, b) => {
        const aScore = a.mode === "gateway" ? 0 : 1;
        const bScore = b.mode === "gateway" ? 0 : 1;
        if (aScore !== bScore) return aScore - bScore;
        return (b.uptimeMs ?? 0) - (a.uptimeMs ?? 0);
      });
    });
    head("aye7dn", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Instances — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default"><div class="flex items-start justify-between gap-4 flex-wrap"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12h.01"></path></svg></div> <div><h1 class="text-xl font-bold text-text-primary glow-text-cyan">Connected Instances</h1> <p class="text-sm text-text-muted">Presence beacons from the gateway and clients</p></div></div> <button${attr("disabled", conn.state.status !== "connected", true)} class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"><svg${attr_class(`w-4 h-4 ${stringify("")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${escape_html("Refresh")}</button></div> `);
    if (entries.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-1.5 mt-3 text-xs"><span class="w-2 h-2 rounded-full bg-accent-green glow-pulse"></span> <span class="text-text-muted">Active instances:</span> <span class="text-accent-green font-mono font-semibold">${escape_html(entries.length)}</span></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-1 overflow-y-auto p-4 md:p-6">`);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-full text-center"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to view instances.</p></div>`);
    } else if (entries.length === 0) {
      $$renderer2.push("<!--[3-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-center"><p class="text-text-muted text-sm">No instances reported yet.</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex flex-col gap-3"><!--[-->`);
      const each_array_1 = ensure_array_like(sortedEntries());
      for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
        let entry = each_array_1[i];
        const status = getInstanceStatus(entry);
        const isExpanded = expandedIdx === i;
        const isPatching = patchingIdx === i;
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 hover:border-accent-cyan/20 transition-all animate-fade-in"${attr_style(`animation-delay: ${stringify(i * 50)}ms`)}><div class="p-4"><div class="flex items-start justify-between gap-4"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1.5"><span${attr_class(`w-2 h-2 rounded-full flex-shrink-0 ${stringify(status === "online" ? "bg-accent-green glow-pulse" : status === "idle" ? "bg-accent-amber" : "bg-text-muted")}`)}></span> <h3 class="text-sm font-semibold text-text-primary truncate">${escape_html(entry.displayName ?? entry.host ?? "unknown host")}</h3> `);
        if (entry.displayName && entry.host && entry.displayName !== entry.host) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-xs text-text-muted">(${escape_html(entry.host)})</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <p class="text-xs text-text-muted mb-2">`);
        if (entry.platform) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`${escape_html(entry.platform)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.deviceFamily) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`· ${escape_html(entry.deviceFamily)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.modelIdentifier) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`· ${escape_html(entry.modelIdentifier)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.clientId && entry.clientId !== entry.host) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-text-muted/50">· ${escape_html(entry.clientId)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></p> <div class="flex flex-wrap gap-1.5">`);
        if (entry.mode) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20">${escape_html(entry.mode)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <!--[-->`);
        const each_array_2 = ensure_array_like(entry.roles ?? []);
        for (let $$index_1 = 0, $$length2 = each_array_2.length; $$index_1 < $$length2; $$index_1++) {
          let role = each_array_2[$$index_1];
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-purple/10 text-accent-purple border border-accent-purple/20">${escape_html(role)}</span>`);
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.version || entry.clientVersion) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">v${escape_html(entry.clientVersion ?? entry.version)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if ((entry.capabilities ?? []).length > 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<!--[-->`);
          const each_array_3 = ensure_array_like(entry.capabilities ?? []);
          for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
            let cap = each_array_3[$$index_2];
            $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-green/10 text-accent-green border border-accent-green/10">${escape_html(cap)}</span>`);
          }
          $$renderer2.push(`<!--]-->`);
        } else if ((entry.scopes ?? []).length > 0) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">${escape_html((entry.scopes ?? []).length)} scopes</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.model) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-purple/10 text-purple-300 border border-accent-purple/10">${escape_html(entry.model)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.agentId) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/10">${escape_html(entry.agentId)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div> <div class="flex flex-col items-end gap-2 flex-shrink-0"><div class="text-right text-xs text-text-muted space-y-0.5">`);
        if (entry.uptimeMs) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex items-center gap-1 justify-end"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Up ${escape_html(formatUptime(entry.uptimeMs))}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.lastInputSeconds != null) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div>Input ${escape_html(formatInputAge(entry.lastInputSeconds))}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.reason) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="text-text-muted/60">${escape_html(entry.reason)}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> `);
        if (entry.sessionKey) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex items-center gap-1"><button${attr("disabled", isPatching, true)}${attr_class(`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50 ${stringify(entry.thinkingLevel === "stream" ? "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30" : entry.thinkingLevel === "on" ? "bg-accent-purple/15 text-accent-purple border-accent-purple/30" : "bg-bg-tertiary text-text-muted border-border-default hover:border-accent-cyan/30")}`)}${attr("title", `Thinking: ${stringify(entry.thinkingLevel ?? "off")}`)}><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg> T:${escape_html(entry.thinkingLevel ?? "off")}</button> <button${attr("disabled", isPatching, true)}${attr_class(`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50 ${stringify(entry.verboseLevel === "on" ? "bg-accent-green/15 text-accent-green border-accent-green/30" : "bg-bg-tertiary text-text-muted border-border-default hover:border-accent-green/30")}`)}${attr("title", `Verbose: ${stringify(entry.verboseLevel ?? "off")}`)}><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> V:${escape_html(entry.verboseLevel ?? "off")}</button></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <button class="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-cyan transition-colors"><svg${attr_class(`w-3.5 h-3.5 transition-transform ${stringify(isExpanded ? "rotate-180" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg> ${escape_html(isExpanded ? "Less" : "Details")}</button></div></div></div> `);
        if (isExpanded) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="px-4 pb-4 border-t border-border-default/50 pt-3 animate-fade-in"><div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs"><div><span class="text-text-muted block mb-0.5">Mode</span> <span class="text-text-primary font-mono">${escape_html(entry.mode ?? "—")}</span></div> <div><span class="text-text-muted block mb-0.5">Platform</span> <span class="text-text-primary font-mono">${escape_html(entry.platform ?? "—")}</span></div> <div><span class="text-text-muted block mb-0.5">Device</span> <span class="text-text-primary font-mono">${escape_html(entry.deviceFamily ?? "—")}</span></div> <div><span class="text-text-muted block mb-0.5">Model ID</span> <span class="text-text-primary font-mono">${escape_html(entry.modelIdentifier ?? "—")}</span></div> <div><span class="text-text-muted block mb-0.5">Client Version</span> <span class="text-text-primary font-mono">${escape_html(entry.clientVersion ?? entry.version ?? "—")}</span></div> <div><span class="text-text-muted block mb-0.5">Client ID</span> <span class="text-text-primary font-mono">${escape_html(entry.clientId ?? "—")}</span></div> `);
          if (entry.sessionKey) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="col-span-2 md:col-span-3"><span class="text-text-muted block mb-0.5">Session Key</span> <span class="text-text-primary font-mono text-[10px] break-all">${escape_html(entry.sessionKey)}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (entry.model) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted block mb-0.5">Model</span> <span class="text-accent-purple font-mono">${escape_html(entry.model)}</span></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if ((entry.scopes ?? []).length > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="col-span-2 md:col-span-3"><span class="text-text-muted block mb-0.5">Scopes</span> <div class="flex flex-wrap gap-1 mt-1"><!--[-->`);
            const each_array_4 = ensure_array_like(entry.scopes ?? []);
            for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
              let scope = each_array_4[$$index_3];
              $$renderer2.push(`<span class="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted border border-border-default font-mono">${escape_html(scope)}</span>`);
            }
            $$renderer2.push(`<!--]--></div></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if ((entry.capabilities ?? []).length > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="col-span-2 md:col-span-3"><span class="text-text-muted block mb-0.5">Capabilities</span> <div class="flex flex-wrap gap-1 mt-1"><!--[-->`);
            const each_array_5 = ensure_array_like(entry.capabilities ?? []);
            for (let $$index_4 = 0, $$length2 = each_array_5.length; $$index_4 < $$length2; $$index_4++) {
              let cap = each_array_5[$$index_4];
              $$renderer2.push(`<span class="px-1.5 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/10 font-mono">${escape_html(cap)}</span>`);
            }
            $$renderer2.push(`<!--]--></div></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
