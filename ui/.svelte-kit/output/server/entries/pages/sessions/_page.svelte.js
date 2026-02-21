import { l as head, a as attr_class, b as attr, c as escape_html, e as ensure_array_like, k as attr_style, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection, a as gateway } from "../../../chunks/connection.svelte.js";
import { g as getSessions } from "../../../chunks/sessions.svelte.js";
import { g as getToasts } from "../../../chunks/toasts.svelte.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils2.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    const sessions = getSessions();
    const toasts = getToasts();
    let loading = false;
    let searchQuery = "";
    let debouncedSearch = "";
    let sortBy = "activity";
    let showDeleteConfirm = null;
    let deleteTranscript = false;
    let renamingKey = null;
    let renameValue = "";
    let patchingKey = null;
    let expandedSubagents = /* @__PURE__ */ new Set();
    let availableModels = [];
    let filterActiveMinutes = sessions.filters.activeMinutes;
    let filterLimit = sessions.filters.limit;
    let filterIncludeGlobal = sessions.filters.includeGlobal;
    let filterIncludeUnknown = sessions.filters.includeUnknown;
    async function refresh() {
      loading = true;
      await sessions.fetchSessions({
        activeMinutes: filterActiveMinutes,
        limit: filterLimit,
        includeGlobal: filterIncludeGlobal,
        includeUnknown: filterIncludeUnknown
      });
      loading = false;
    }
    async function changeModel(session, model) {
      await patchSession(session.key, { model });
    }
    async function patchSession(key, patch) {
      patchingKey = key;
      try {
        await gateway.call("sessions.patch", { key, ...patch });
        toasts.success("Updated", "Session settings saved");
        await refresh();
      } catch (e) {
        toasts.error("Failed", String(e));
      } finally {
        patchingKey = null;
      }
    }
    function getSessionType(session) {
      if (session.key.includes(":main")) return "main";
      if (session.key.includes(":subagent:")) return "subagent";
      return "isolated";
    }
    function isSubagent(session) {
      return session.key.includes(":subagent:");
    }
    function getParentKey(session) {
      if (!isSubagent(session)) return null;
      const idx = session.key.indexOf(":subagent:");
      if (idx === -1) return null;
      return session.key.substring(0, idx) + ":main";
    }
    function getSubagentId(session) {
      const idx = session.key.lastIndexOf(":subagent:");
      if (idx === -1) return session.key;
      return session.key.substring(idx + ":subagent:".length);
    }
    function getSubagentStatus(session) {
      if (session.status === "error") return "error";
      if (session.status === "done" || session.status === "completed") return "done";
      const lastAct = session.lastActivityAt ? new Date(session.lastActivityAt).getTime() : session.lastActivity ? session.lastActivity : 0;
      if (lastAct && Date.now() - lastAct > 5 * 60 * 1e3) return "done";
      if (lastAct) return "active";
      return "unknown";
    }
    function formatTime(ts) {
      if (!ts) return "n/a";
      const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
      const diff = Date.now() - d.getTime();
      if (diff < 6e4) return "just now";
      if (diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
      if (diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    function formatTokens(n) {
      if (!n && n !== 0) return "—";
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return String(n);
    }
    let parentSessions = derived(() => {
      return sessions.list.filter((s) => !isSubagent(s));
    });
    let subagentMap = derived(() => {
      const map = /* @__PURE__ */ new Map();
      for (const s of sessions.list) {
        if (isSubagent(s)) {
          const parent = getParentKey(s);
          if (parent) {
            if (!map.has(parent)) map.set(parent, []);
            map.get(parent).push(s);
          }
        }
      }
      return map;
    });
    let filtered = derived(() => {
      let list = parentSessions();
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        list = list.filter((s) => sessions.getSessionTitle(s).toLowerCase().includes(q) || s.key.toLowerCase().includes(q) || (s.channel?.toLowerCase().includes(q) ?? false) || (s.model?.toLowerCase().includes(q) ?? false) || (s.agentId?.toLowerCase().includes(q) ?? false) || (s.provider?.toLowerCase().includes(q) ?? false));
      }
      list = [...list];
      {
        list.sort((a, b) => {
          const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : a.lastActivity ?? 0;
          const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : b.lastActivity ?? 0;
          return bTime - aTime;
        });
      }
      return list;
    });
    function getTokenCount(s) {
      return s.totalTokens ?? s.tokenCount ?? 0;
    }
    let stats = derived(() => {
      const all = sessions.list;
      const totalTokens = all.reduce((sum, s) => sum + getTokenCount(s), 0);
      return {
        total: all.length,
        main: all.filter((s) => s.key.includes(":main") && !s.key.includes(":subagent:")).length,
        isolated: all.filter((s) => !s.key.includes(":main") && !s.key.includes(":subagent:")).length,
        subagent: all.filter((s) => s.key.includes(":subagent:")).length,
        totalTokens
      };
    });
    head("98wg7q", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Sessions — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default"><div class="flex items-start justify-between gap-4 flex-wrap"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg></div> <div><h1 class="text-xl font-bold text-text-primary glow-text-cyan">Sessions</h1> <p class="text-sm text-text-muted">Inspect, control, and manage active sessions</p></div></div> <div class="flex items-center gap-2"><button${attr_class(`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-all ${stringify("border-border-default text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 bg-bg-tertiary")}`)}><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg> Filters</button> <button${attr("disabled", loading || conn.state.status !== "connected", true)} class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"><svg${attr_class(`w-4 h-4 ${stringify(loading ? "animate-spin" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${escape_html(loading ? "Loading…" : "Refresh")}</button></div></div> <div class="grid grid-cols-3 md:grid-cols-5 gap-3 mt-4"><div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-text-primary font-mono">${escape_html(stats().total)}</div> <div class="text-xs text-text-muted">Total</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-purple font-mono">${escape_html(stats().main)}</div> <div class="text-xs text-text-muted">Main</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-cyan font-mono">${escape_html(stats().isolated)}</div> <div class="text-xs text-text-muted">Isolated</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-amber font-mono">${escape_html(stats().subagent)}</div> <div class="text-xs text-text-muted">Sub-agents</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-green font-mono">${escape_html(formatTokens(stats().totalTokens))}</div> <div class="text-xs text-text-muted">Tokens</div></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="flex-shrink-0 px-4 md:px-6 py-3 border-b border-border-default/50"><div class="flex gap-3 items-center flex-wrap"><div class="relative flex-1"><input type="text"${attr("value", searchQuery)} placeholder="Search sessions by name, key, channel, model, agent..." class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan transition-all"/> <svg class="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div> `);
    $$renderer2.select(
      {
        value: sortBy,
        class: "px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-secondary"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "activity" }, ($$renderer4) => {
          $$renderer4.push(`Sort: Activity`);
        });
        $$renderer3.option({ value: "name" }, ($$renderer4) => {
          $$renderer4.push(`Sort: Name`);
        });
        $$renderer3.option({ value: "channel" }, ($$renderer4) => {
          $$renderer4.push(`Sort: Channel`);
        });
        $$renderer3.option({ value: "tokens" }, ($$renderer4) => {
          $$renderer4.push(`Sort: Tokens`);
        });
      }
    );
    $$renderer2.push(` <div class="flex rounded-lg border border-border-default overflow-hidden"><button${attr_class(`px-3 py-2 text-xs transition-all flex items-center gap-1.5 ${stringify(
      "bg-accent-cyan/10 text-accent-cyan"
    )}`)}><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg> List</button> <button${attr_class(`px-3 py-2 text-xs transition-all flex items-center gap-1.5 ${stringify("bg-bg-tertiary text-text-muted hover:text-text-secondary")}`)}><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h2v16H3zM9 4h2v8H9zM15 8h2v12h-2zM21 4h2v6h-2z"></path></svg> Tree</button></div> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex rounded-lg border border-border-default overflow-hidden"><button${attr_class(`px-3 py-2 text-xs transition-all ${stringify(
        "bg-accent-cyan/10 text-accent-cyan"
      )}`)}>Grouped</button> <button${attr_class(`px-3 py-2 text-xs transition-all ${stringify("bg-bg-tertiary text-text-muted hover:text-text-secondary")}`)}>All</button></div>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="flex-1 overflow-y-auto p-4 md:p-6">`);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-full text-center"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to view sessions.</p></div>`);
    } else if (loading && sessions.list.length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="flex flex-col gap-3"><!--[-->`);
      const each_array = ensure_array_like(Array(4));
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        each_array[$$index];
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5 animate-pulse"><div class="h-4 w-48 bg-bg-tertiary rounded mb-3"></div> <div class="h-3 w-96 bg-bg-tertiary rounded mb-2"></div> <div class="flex gap-2"><div class="h-5 w-16 bg-bg-tertiary rounded-full"></div> <div class="h-5 w-20 bg-bg-tertiary rounded-full"></div> <div class="h-5 w-14 bg-bg-tertiary rounded-full"></div></div></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else if (filtered().length === 0) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-center"><p class="text-text-muted text-sm">${escape_html("No sessions found.")}</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      if (filtered().length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-center"><p class="text-text-muted text-sm">${escape_html("No sessions found.")}</p></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="flex flex-col gap-3"><!--[-->`);
        const each_array_4 = ensure_array_like(filtered());
        for (let i = 0, $$length = each_array_4.length; i < $$length; i++) {
          let session = each_array_4[i];
          const type = getSessionType(session);
          const subs = subagentMap().get(session.key) ?? [];
          const tokens = getTokenCount(session);
          const isPatching = patchingKey === session.key;
          $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 hover:border-accent-cyan/20 transition-all animate-fade-in"${attr_style(`animation-delay: ${stringify(i * 30)}ms`)}><div class="p-4"><div class="flex items-start gap-4"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1.5 flex-wrap">`);
          if (renamingKey === session.key) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<form class="flex items-center gap-2"><input type="text"${attr("value", renameValue)} autofocus="" class="px-2 py-1 text-sm rounded border border-accent-cyan/50 bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan w-48"/> <button type="submit" class="text-accent-cyan text-xs hover:underline">Save</button> <button type="button" class="text-text-muted text-xs hover:text-text-secondary">Cancel</button></form>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<span class="font-medium text-text-primary truncate max-w-[300px]">${escape_html(sessions.getSessionTitle(session))}</span> <button class="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors" title="Rename"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>`);
          }
          $$renderer2.push(`<!--]--> <span${attr_class(`px-2 py-0.5 rounded text-[10px] font-medium ${stringify(type === "main" ? "bg-accent-purple/20 text-accent-purple border border-accent-purple/20" : type === "subagent" ? "bg-accent-amber/20 text-accent-amber border border-accent-amber/20" : "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/20")}`)}>${escape_html(type)}</span> `);
          if (session.channel) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-bg-tertiary text-text-muted border border-border-default">${escape_html(session.channel)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (session.agentId) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] font-medium bg-accent-purple/10 text-purple-300 border border-accent-purple/10">${escape_html(session.agentId)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (subs.length > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<button class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent-amber/10 text-accent-amber border border-accent-amber/20 hover:bg-accent-amber/20 transition-colors"><svg${attr_class(`w-3 h-3 transition-transform ${stringify(expandedSubagents.has(session.key) ? "rotate-90" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg> ${escape_html(subs.length)} sub-agent${escape_html(subs.length !== 1 ? "s" : "")}</button>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-2 mb-1.5 flex-wrap">`);
          if (session.model) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-purple/10 text-purple-300 border border-accent-purple/10"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg> ${escape_html(session.model)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (session.provider) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted border border-border-default">${escape_html(session.provider)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (tokens > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green border border-accent-green/10"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"></path></svg> ${escape_html(formatTokens(tokens))} tokens</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> `);
          if (session.lastMessage) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<p class="text-xs text-text-muted truncate mb-1.5 max-w-[500px]">${escape_html(session.lastMessage)}</p>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <div class="flex items-center gap-3 text-xs text-text-muted"><span class="flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ${escape_html(formatTime(session.lastActivityAt ?? session.lastActivity))}</span> <span class="font-mono text-text-muted/40 text-[10px] truncate max-w-[250px]"${attr("title", session.key)}>${escape_html(session.key)}</span></div></div> <div class="flex flex-col items-end gap-2 flex-shrink-0"><div class="flex items-center gap-1"><button${attr("disabled", isPatching, true)}${attr_class(`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50 ${stringify(session.thinkingLevel === "stream" ? "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30 glow-cyan" : session.thinkingLevel === "on" ? "bg-accent-purple/15 text-accent-purple border-accent-purple/30" : "bg-bg-tertiary text-text-muted border-border-default hover:border-accent-cyan/30 hover:text-text-secondary")}`)}${attr("title", `Thinking: ${stringify(session.thinkingLevel ?? "off")} (click to cycle)`)}><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg> T:${escape_html(session.thinkingLevel ?? "off")}</button> <button${attr("disabled", isPatching, true)}${attr_class(`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all disabled:opacity-50 ${stringify(session.verboseLevel === "on" ? "bg-accent-green/15 text-accent-green border-accent-green/30" : "bg-bg-tertiary text-text-muted border-border-default hover:border-accent-green/30 hover:text-text-secondary")}`)}${attr("title", `Verbose: ${stringify(session.verboseLevel ?? "off")} (click to toggle)`)}><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> V:${escape_html(session.verboseLevel ?? "off")}</button> `);
          if (session.reasoningLevel && session.reasoningLevel !== "off") {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-accent-amber/15 text-accent-amber border border-accent-amber/30">R:${escape_html(session.reasoningLevel)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> `);
          if (availableModels.length > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.select(
              {
                value: session.model || "default",
                onchange: (e) => changeModel(session, e.currentTarget.value),
                disabled: isPatching,
                class: "px-2 py-1 rounded-lg text-[11px] border border-border-default bg-bg-tertiary text-text-secondary hover:border-accent-purple/40 focus:outline-none focus:border-accent-purple transition-all disabled:opacity-50 max-w-[200px] cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2388929e%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_6px_center] bg-no-repeat pr-6",
                title: "Override model for this session"
              },
              ($$renderer3) => {
                $$renderer3.option({ value: "default" }, ($$renderer4) => {
                  $$renderer4.push(`🤖 Model: default`);
                });
                $$renderer3.push(`<!--[-->`);
                const each_array_5 = ensure_array_like(availableModels);
                for (let $$index_4 = 0, $$length2 = each_array_5.length; $$index_4 < $$length2; $$index_4++) {
                  let model = each_array_5[$$index_4];
                  $$renderer3.option({ value: model.id }, ($$renderer4) => {
                    $$renderer4.push(`${escape_html(model.name || model.id)}`);
                  });
                }
                $$renderer3.push(`<!--]-->`);
              }
            );
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <div class="flex items-center gap-1"><button class="px-3 py-1.5 rounded-lg text-xs border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 transition-colors" title="Open in chat">Chat</button> <button class="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors" title="Delete session"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div></div></div></div> `);
          if (showDeleteConfirm === session.key) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="px-4 pb-4"><div class="pt-3 border-t border-border-default flex items-center gap-3 flex-wrap"><span class="text-xs text-red-400">Delete this session permanently?</span> <label class="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer"><input type="checkbox"${attr("checked", deleteTranscript, true)} class="rounded border-border-default bg-bg-tertiary text-red-400"/> Also delete transcript</label> <button class="px-3 py-1 rounded text-xs bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Confirm Delete</button> <button class="px-3 py-1 rounded text-xs bg-bg-tertiary text-text-muted border border-border-default hover:text-text-secondary transition-colors">Cancel</button></div></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (expandedSubagents.has(session.key) && subs.length > 0) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="border-t border-border-default bg-bg-primary/30"><div class="px-4 py-2"><div class="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2 flex items-center gap-2"><svg class="w-3.5 h-3.5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Sub-Agents (${escape_html(subs.length)})</div> <div class="space-y-2"><!--[-->`);
            const each_array_6 = ensure_array_like(subs);
            for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
              let sub = each_array_6[$$index_5];
              const subStatus = getSubagentStatus(sub);
              const subTokens = getTokenCount(sub);
              $$renderer2.push(`<div class="rounded-lg border border-border-default/50 bg-bg-secondary/30 p-3 ml-4 relative before:absolute before:left-[-12px] before:top-1/2 before:w-3 before:h-px before:bg-accent-amber/30"><div class="flex items-start justify-between gap-3"><div class="min-w-0 flex-1"><div class="flex items-center gap-2 mb-1"><span${attr_class(`w-2 h-2 rounded-full flex-shrink-0 ${stringify(subStatus === "active" ? "bg-accent-green glow-pulse" : subStatus === "done" ? "bg-accent-cyan" : subStatus === "error" ? "bg-accent-pink" : "bg-text-muted")}`)}></span> <span class="text-sm font-medium text-text-primary truncate">${escape_html(sub.label || getSubagentId(sub))}</span> <span${attr_class(`px-1.5 py-0.5 rounded text-[9px] font-medium ${stringify(subStatus === "active" ? "bg-accent-green/15 text-accent-green" : subStatus === "done" ? "bg-accent-cyan/15 text-accent-cyan" : subStatus === "error" ? "bg-accent-pink/15 text-accent-pink" : "bg-bg-tertiary text-text-muted")}`)}>${escape_html(subStatus)}</span></div> `);
              if (sub.lastMessage) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<p class="text-xs text-text-muted truncate mb-1 max-w-[400px]">${escape_html(sub.lastMessage)}</p>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> <div class="flex items-center gap-3 text-[10px] text-text-muted">`);
              if (sub.model) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span>${escape_html(sub.model)}</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (subTokens > 0) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span>${escape_html(formatTokens(subTokens))} tokens</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> <span>${escape_html(formatTime(sub.lastActivityAt ?? sub.lastActivity))}</span></div></div> <div class="flex items-center gap-1 flex-shrink-0"><button class="px-2 py-1 rounded text-[10px] border border-accent-cyan/20 text-accent-cyan hover:bg-accent-cyan/10 transition-colors">Chat</button> <button class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div></div> `);
              if (showDeleteConfirm === sub.key) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="mt-2 pt-2 border-t border-border-default/50 flex items-center gap-2"><span class="text-[10px] text-red-400">Delete?</span> <label class="flex items-center gap-1 text-[10px] text-text-muted cursor-pointer"><input type="checkbox"${attr("checked", deleteTranscript, true)} class="rounded border-border-default bg-bg-tertiary text-red-400 w-3 h-3"/> + transcript</label> <button class="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">Confirm</button> <button class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted hover:text-text-secondary transition-colors">Cancel</button></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--></div>`);
            }
            $$renderer2.push(`<!--]--></div></div></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]-->`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
