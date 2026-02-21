import { l as head, a as attr_class, b as attr, c as escape_html, s as stringify, k as attr_style, e as ensure_array_like, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let startDate = formatIsoDate(daysAgo(6));
    let endDate = formatIsoDate(/* @__PURE__ */ new Date());
    let selectedSessionKey = null;
    let sortBy = "tokens";
    function daysAgo(n) {
      const d = /* @__PURE__ */ new Date();
      d.setDate(d.getDate() - n);
      return d;
    }
    function formatIsoDate(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }
    function formatTokens(n) {
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return String(Math.round(n));
    }
    function formatCost(n, decimals = 2) {
      return `$${n.toFixed(decimals)}`;
    }
    function formatTime(ts) {
      if (!ts) return "n/a";
      const d = new Date(ts);
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
    function formatDuration(ms) {
      if (!ms || ms <= 0) return "—";
      const seconds = Math.floor(ms / 1e3);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    }
    function pct(part, total) {
      return total > 0 ? part / total * 100 : 0;
    }
    function sessionLabel(s) {
      const raw = s.label || s.key;
      if (raw.startsWith("agent:") && raw.includes("?token=")) {
        return raw.slice(0, raw.indexOf("?token="));
      }
      return raw.length > 60 ? raw.slice(0, 60) + "…" : raw;
    }
    let totals = derived(() => null);
    let sessions = derived(() => []);
    let aggregates = derived(() => null);
    let daily = derived(() => []);
    let sortedSessions = derived(() => {
      const list = [...sessions()];
      switch (sortBy) {
        case "cost":
          return list.sort((a, b) => (b.usage?.totalCost ?? 0) - (a.usage?.totalCost ?? 0));
        case "recent":
          return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        case "tokens":
        default:
          return list.sort((a, b) => (b.usage?.totalTokens ?? 0) - (a.usage?.totalTokens ?? 0));
      }
    });
    let topModels = derived(() => {
      return (aggregates()?.byModel ?? []).slice(0, 5).map((m) => ({
        name: m.model ?? "unknown",
        provider: m.provider ?? "",
        cost: m.totals.totalCost,
        tokens: m.totals.totalTokens,
        count: m.count
      }));
    });
    let topProviders = derived(() => {
      return (aggregates()?.byProvider ?? []).slice(0, 5).map((p) => ({
        name: p.provider ?? "unknown",
        cost: p.totals.totalCost,
        tokens: p.totals.totalTokens,
        count: p.count
      }));
    });
    let costBreakdown = derived(() => {
      if (!totals()) return null;
      const total = totals().totalCost || 1;
      return {
        input: {
          tokens: totals().input,
          cost: totals().inputCost,
          pct: pct(totals().inputCost, total)
        },
        output: {
          tokens: totals().output,
          cost: totals().outputCost,
          pct: pct(totals().outputCost, total)
        },
        cacheRead: {
          tokens: totals().cacheRead,
          cost: totals().cacheReadCost,
          pct: pct(totals().cacheReadCost, total)
        },
        cacheWrite: {
          tokens: totals().cacheWrite,
          cost: totals().cacheWriteCost,
          pct: pct(totals().cacheWriteCost, total)
        }
      };
    });
    let cacheHitRate = derived(() => {
      if (!totals()) return 0;
      const base = totals().input + totals().cacheRead;
      return base > 0 ? totals().cacheRead / base : 0;
    });
    let dailyMax = derived(() => {
      if (!daily().length) return 1;
      const values = daily().map((d) => d.totalTokens);
      return Math.max(...values, 1);
    });
    let timeSeriesProcessed = derived(() => {
      return [];
    });
    head("1y1fchs", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Usage — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-7xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary">Usage Analytics</h1> <p class="text-sm text-text-muted mt-1">Track tokens, costs, and session activity across your gateway.</p></div> <div class="flex items-center gap-2"><div class="flex rounded-lg border border-border-default overflow-hidden"><button${attr_class(`px-3 py-1.5 text-xs font-medium transition-all ${stringify(
      "bg-accent-cyan/20 text-accent-cyan"
    )}`)}>Tokens</button> <button${attr_class(`px-3 py-1.5 text-xs font-medium transition-all ${stringify("text-text-muted hover:text-text-secondary")}`)}>Cost</button></div> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh</button></div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="flex items-center flex-wrap gap-3"><div class="flex items-center gap-2"><span class="text-xs text-text-muted uppercase tracking-wider font-medium">Range</span> <input type="date"${attr("value", startDate)} class="px-3 py-1.5 rounded-lg border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-all"/> <span class="text-text-muted text-sm">to</span> <input type="date"${attr("value", endDate)} class="px-3 py-1.5 rounded-lg border border-border-default bg-bg-tertiary text-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-all"/></div> <div class="flex items-center gap-1.5"><button class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted hover:border-accent-cyan hover:text-accent-cyan transition-all">Today</button> <button class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted hover:border-accent-cyan hover:text-accent-cyan transition-all">7d</button> <button class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted hover:border-accent-cyan hover:text-accent-cyan transition-all">30d</button> <button class="px-2.5 py-1 rounded-md text-xs border border-border-default text-text-muted hover:border-accent-cyan hover:text-accent-cyan transition-all">90d</button></div> `);
    if (sessions().length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-xs text-text-muted ml-auto">${escape_html(sessions().length)} session${escape_html(sessions().length !== 1 ? "s" : "")} in range `);
      if (sessions().length >= 1e3) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="text-accent-amber ml-1">(limit reached)</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-center py-16"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to view usage analytics.</p></div>`);
    } else if (totals()) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"><div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 glow-cyan"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Total Tokens</div> <div class="text-2xl font-bold text-accent-cyan">${escape_html(formatTokens(totals().totalTokens))}</div> <div class="text-xs text-text-muted mt-1">${escape_html(formatTokens(totals().input))} in · ${escape_html(formatTokens(totals().output))} out</div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 glow-purple"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Total Cost</div> <div class="text-2xl font-bold text-accent-purple">${escape_html(formatCost(totals().totalCost))}</div> <div class="text-xs text-text-muted mt-1">${escape_html("USD")} · ${escape_html(formatCost(totals().totalCost / Math.max(sessions().length, 1), 3))} avg/session</div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Sessions</div> <div class="text-2xl font-bold text-accent-green">${escape_html(sessions().length)}</div> <div class="text-xs text-text-muted mt-1">`);
      if (aggregates()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`${escape_html(aggregates().messages.total)} messages · ${escape_html(aggregates().messages.errors)} errors`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`In selected range`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Cache Hit Rate</div> <div${attr_class(`text-2xl font-bold ${stringify(cacheHitRate() > 0.6 ? "text-accent-green" : cacheHitRate() > 0.3 ? "text-accent-amber" : "text-accent-pink")}`)}>${escape_html(cacheHitRate() > 0 ? `${(cacheHitRate() * 100).toFixed(1)}%` : "—")}</div> <div class="text-xs text-text-muted mt-1">${escape_html(formatTokens(totals().cacheRead))} cached · ${escape_html(formatTokens(totals().input))} uncached</div></div></div> `);
      if (aggregates()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"><div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-lg font-bold text-text-primary">${escape_html(aggregates().messages.total)}</div> <div class="text-xs text-text-muted">Messages</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-lg font-bold text-text-primary">${escape_html(aggregates().messages.user)}</div> <div class="text-xs text-text-muted">User Msgs</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-lg font-bold text-text-primary">${escape_html(aggregates().messages.assistant)}</div> <div class="text-xs text-text-muted">Assistant Msgs</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-lg font-bold text-text-primary">${escape_html(aggregates().tools.totalCalls)}</div> <div class="text-xs text-text-muted">Tool Calls</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-lg font-bold text-text-primary">${escape_html(aggregates().tools.uniqueTools)}</div> <div class="text-xs text-text-muted">Unique Tools</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div${attr_class(`text-lg font-bold ${stringify(aggregates().messages.errors > 0 ? "text-accent-pink" : "text-text-primary")}`)}>${escape_html(aggregates().messages.errors)}</div> <div class="text-xs text-text-muted">Errors</div></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (costBreakdown() && totals().totalCost > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><h3 class="text-sm font-semibold text-text-primary mb-3">${escape_html("Token")} Breakdown</h3> <div class="h-4 rounded-full overflow-hidden flex bg-bg-tertiary mb-3">`);
        {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="bg-accent-pink/80 transition-all"${attr_style(`width: ${stringify(pct(totals().output, totals().totalTokens))}%`)}${attr("title", `Output: ${stringify(formatTokens(totals().output))}`)}></div> <div class="bg-accent-cyan/80 transition-all"${attr_style(`width: ${stringify(pct(totals().input, totals().totalTokens))}%`)}${attr("title", `Input: ${stringify(formatTokens(totals().input))}`)}></div> <div class="bg-accent-purple/80 transition-all"${attr_style(`width: ${stringify(pct(totals().cacheWrite, totals().totalTokens))}%`)}${attr("title", `Cache Write: ${stringify(formatTokens(totals().cacheWrite))}`)}></div> <div class="bg-accent-green/80 transition-all"${attr_style(`width: ${stringify(pct(totals().cacheRead, totals().totalTokens))}%`)}${attr("title", `Cache Read: ${stringify(formatTokens(totals().cacheRead))}`)}></div>`);
        }
        $$renderer2.push(`<!--]--></div> <div class="flex flex-wrap gap-x-5 gap-y-1 text-xs"><span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-accent-pink/80"></span> <span class="text-text-muted">Output</span> <span class="text-text-secondary font-medium">${escape_html(
          formatTokens(totals().output)
        )}</span></span> <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-accent-cyan/80"></span> <span class="text-text-muted">Input</span> <span class="text-text-secondary font-medium">${escape_html(
          formatTokens(totals().input)
        )}</span></span> <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-accent-purple/80"></span> <span class="text-text-muted">Cache Write</span> <span class="text-text-secondary font-medium">${escape_html(
          formatTokens(totals().cacheWrite)
        )}</span></span> <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-accent-green/80"></span> <span class="text-text-muted">Cache Read</span> <span class="text-text-secondary font-medium">${escape_html(
          formatTokens(totals().cacheRead)
        )}</span></span></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="grid grid-cols-1 lg:grid-cols-3 gap-4"><div class="lg:col-span-2 rounded-xl border border-border-default bg-bg-secondary/50 p-4"><h3 class="text-sm font-semibold text-text-primary mb-3">Daily ${escape_html("Token")} Usage</h3> `);
      if (daily().length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-end gap-px h-36"><!--[-->`);
        const each_array_1 = ensure_array_like(daily());
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let day = each_array_1[$$index_1];
          const value = day.totalTokens;
          const heightPct = Math.max(value / dailyMax() * 100, 1);
          const dayLabel = (/* @__PURE__ */ new Date(day.date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          $$renderer2.push(`<div class="flex-1 flex flex-col items-center group relative min-w-0"><div class="w-full rounded-t transition-all bg-accent-cyan/60 hover:bg-accent-cyan/90 cursor-default"${attr_style(`height: ${stringify(heightPct)}%`)}${attr("title", `${stringify(dayLabel)}: ${stringify(formatTokens(value))}`)}></div> <div class="absolute bottom-full mb-2 hidden group-hover:block z-10"><div class="glass rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-lg border border-border-default"><div class="font-medium text-text-primary">${escape_html(dayLabel)}</div> <div class="text-text-secondary">${escape_html(formatTokens(day.totalTokens))} tokens</div> <div class="text-text-secondary">${escape_html(formatCost(day.totalCost))}</div></div></div></div>`);
        }
        $$renderer2.push(`<!--]--></div> `);
        if (daily().length >= 2) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex justify-between mt-1.5 text-[10px] text-text-muted px-1"><span>${escape_html((/* @__PURE__ */ new Date(daily()[0].date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</span> `);
          if (daily().length > 2) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span>${escape_html((/* @__PURE__ */ new Date(daily()[Math.floor(daily().length / 2)].date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <span>${escape_html((/* @__PURE__ */ new Date(daily()[daily().length - 1].date + "T12:00:00")).toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</span></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]-->`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="h-36 flex items-center justify-center text-text-muted text-sm">No daily data</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><h3 class="text-sm font-semibold text-text-primary mb-3">Top Models</h3> `);
      if (topModels().length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="space-y-3"><!--[-->`);
        const each_array_2 = ensure_array_like(topModels());
        for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
          let model = each_array_2[$$index_2];
          const maxCost = topModels()[0]?.cost || 1;
          const barWidth = pct(model.cost, maxCost);
          $$renderer2.push(`<div><div class="flex justify-between text-xs mb-1"><span class="text-text-secondary truncate mr-2 font-mono">${escape_html(model.name)}</span> <span class="text-text-muted whitespace-nowrap">${escape_html(formatCost(model.cost))}</span></div> <div class="h-1.5 rounded-full bg-bg-tertiary overflow-hidden"><div class="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-purple transition-all"${attr_style(`width: ${stringify(barWidth)}%`)}></div></div> <div class="text-[10px] text-text-muted mt-0.5">${escape_html(formatTokens(model.tokens))} tokens · ${escape_html(model.count)} msgs</div></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="flex items-center justify-center h-24 text-text-muted text-sm">No model data</div>`);
      }
      $$renderer2.push(`<!--]--> `);
      if (topProviders().length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<h3 class="text-sm font-semibold text-text-primary mt-5 mb-2">Top Providers</h3> <div class="space-y-1.5"><!--[-->`);
        const each_array_3 = ensure_array_like(topProviders());
        for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
          let provider = each_array_3[$$index_3];
          $$renderer2.push(`<div class="flex justify-between text-xs"><span class="text-text-secondary font-mono">${escape_html(provider.name)}</span> <span class="text-text-muted">${escape_html(formatCost(provider.cost))} · ${escape_html(formatTokens(provider.tokens))}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4"><div class="flex items-center justify-between mb-4"><h3 class="text-sm font-semibold text-text-primary">Sessions</h3> <div class="flex items-center gap-2">`);
      $$renderer2.select(
        {
          value: sortBy,
          class: "px-2 py-1 text-xs rounded-lg border border-border-default bg-bg-tertiary text-text-secondary"
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "tokens" }, ($$renderer4) => {
            $$renderer4.push(`Sort: Tokens`);
          });
          $$renderer3.option({ value: "cost" }, ($$renderer4) => {
            $$renderer4.push(`Sort: Cost`);
          });
          $$renderer3.option({ value: "recent" }, ($$renderer4) => {
            $$renderer4.push(`Sort: Recent`);
          });
        }
      );
      $$renderer2.push(` <span class="text-xs text-text-muted">${escape_html(sessions().length)} total</span></div></div> `);
      if (sortedSessions().length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="text-center py-8 text-text-muted text-sm">No sessions in this date range.</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="space-y-1"><!--[-->`);
        const each_array_4 = ensure_array_like(sortedSessions().slice(0, 50));
        for (let $$index_8 = 0, $$length = each_array_4.length; $$index_8 < $$length; $$index_8++) {
          let session = each_array_4[$$index_8];
          const isSelected = selectedSessionKey === session.key;
          const usage = session.usage;
          const value = usage?.totalTokens ?? 0;
          const maxVal = sortedSessions()[0]?.usage?.totalTokens ?? 1;
          const barPct = pct(value, maxVal);
          $$renderer2.push(`<button${attr_class(`w-full text-left rounded-lg p-3 transition-all border ${stringify(isSelected ? "border-accent-cyan/50 bg-accent-cyan/5 glow-cyan" : "border-transparent hover:bg-bg-hover")}`)}><div class="flex items-start gap-3"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-0.5"><span class="text-sm font-medium text-text-primary truncate">${escape_html(sessionLabel(session))}</span> `);
          if (session.channel) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-1.5 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted flex-shrink-0">${escape_html(session.channel)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (session.model) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-1.5 py-0.5 rounded text-[10px] bg-accent-purple/10 text-purple-300 flex-shrink-0 truncate max-w-32">${escape_html(session.model)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <div class="h-1 rounded-full bg-bg-tertiary overflow-hidden mt-1.5 mb-1"><div${attr_class(`h-full rounded-full transition-all ${stringify("bg-accent-cyan/60")}`)}${attr_style(`width: ${stringify(barPct)}%`)}></div></div> <div class="flex items-center gap-3 text-[11px] text-text-muted">`);
          if (usage) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span>${escape_html(formatTokens(usage.totalTokens))} tokens</span> <span>${escape_html(formatCost(usage.totalCost))}</span> `);
            if (usage.messageCounts) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span>${escape_html(usage.messageCounts.total)} msgs</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--> `);
            if (usage.messageCounts?.errors) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="text-accent-pink">${escape_html(usage.messageCounts.errors)} errors</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]-->`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <span class="ml-auto">${escape_html(formatTime(session.updatedAt))}</span></div></div> <svg${attr_class(`w-4 h-4 text-text-muted flex-shrink-0 mt-1 transition-transform ${stringify(isSelected ? "rotate-180" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div> `);
          if (isSelected) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="mt-3 pt-3 border-t border-border-default">`);
            {
              $$renderer2.push("<!--[!-->");
              if (usage) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"><div class="rounded-lg bg-bg-tertiary/50 p-2.5"><div class="text-[10px] text-text-muted uppercase">Input</div> <div class="text-sm font-bold text-accent-cyan">${escape_html(formatTokens(usage.input))}</div> `);
                if (usage.inputCost) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<div class="text-[10px] text-text-muted">${escape_html(formatCost(usage.inputCost, 4))}</div>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                }
                $$renderer2.push(`<!--]--></div> <div class="rounded-lg bg-bg-tertiary/50 p-2.5"><div class="text-[10px] text-text-muted uppercase">Output</div> <div class="text-sm font-bold text-accent-pink">${escape_html(formatTokens(usage.output))}</div> `);
                if (usage.outputCost) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<div class="text-[10px] text-text-muted">${escape_html(formatCost(usage.outputCost, 4))}</div>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                }
                $$renderer2.push(`<!--]--></div> <div class="rounded-lg bg-bg-tertiary/50 p-2.5"><div class="text-[10px] text-text-muted uppercase">Duration</div> <div class="text-sm font-bold text-text-primary">${escape_html(formatDuration(usage.durationMs))}</div> `);
                if (usage.messageCounts) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<div class="text-[10px] text-text-muted">${escape_html(usage.messageCounts.total)} messages</div>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                }
                $$renderer2.push(`<!--]--></div> <div class="rounded-lg bg-bg-tertiary/50 p-2.5"><div class="text-[10px] text-text-muted uppercase">Tools</div> <div class="text-sm font-bold text-text-primary">${escape_html(usage.toolUsage?.totalCalls ?? 0)}</div> <div class="text-[10px] text-text-muted">${escape_html(usage.toolUsage?.uniqueTools ?? 0)} unique</div></div></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> <div class="flex flex-wrap gap-1.5 mb-3">`);
              if (session.agentId) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] bg-accent-cyan/10 text-accent-cyan">agent:${escape_html(session.agentId)}</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (session.modelProvider || session.providerOverride) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] bg-accent-purple/10 text-accent-purple">provider:${escape_html(session.modelProvider ?? session.providerOverride)}</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (session.model) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] bg-accent-amber/10 text-accent-amber">model:${escape_html(session.model)}</span>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> <span class="px-2 py-0.5 rounded text-[10px] bg-bg-tertiary text-text-muted font-mono truncate max-w-80">${escape_html(session.key)}</span></div> `);
              if (usage?.modelUsage && usage.modelUsage.length > 0) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="mb-3"><h4 class="text-xs font-medium text-text-muted mb-1.5">Model Mix</h4> <div class="flex flex-wrap gap-2"><!--[-->`);
                const each_array_5 = ensure_array_like(usage.modelUsage.slice(0, 6));
                for (let $$index_4 = 0, $$length2 = each_array_5.length; $$index_4 < $$length2; $$index_4++) {
                  let mu = each_array_5[$$index_4];
                  $$renderer2.push(`<div class="rounded-lg bg-bg-tertiary/50 px-2.5 py-1.5 text-xs"><span class="text-text-secondary font-mono">${escape_html(mu.model ?? "unknown")}</span> <span class="text-text-muted ml-1.5">${escape_html(formatCost(mu.totals.totalCost))} · ${escape_html(formatTokens(mu.totals.totalTokens))}</span></div>`);
                }
                $$renderer2.push(`<!--]--></div></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (usage?.toolUsage?.tools && usage.toolUsage.tools.length > 0) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="mb-3"><h4 class="text-xs font-medium text-text-muted mb-1.5">Top Tools</h4> <div class="flex flex-wrap gap-1.5"><!--[-->`);
                const each_array_6 = ensure_array_like(usage.toolUsage.tools.slice(0, 8));
                for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
                  let tool = each_array_6[$$index_5];
                  $$renderer2.push(`<span class="px-2 py-0.5 rounded text-[10px] bg-accent-green/10 text-accent-green">${escape_html(tool.name)} ×${escape_html(tool.count)}</span>`);
                }
                $$renderer2.push(`<!--]--></div></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              if (timeSeriesProcessed().length >= 2) {
                $$renderer2.push("<!--[-->");
                $$renderer2.push(`<div class="mb-3"><h4 class="text-xs font-medium text-text-muted mb-1.5">Usage Over Time</h4> <div class="flex items-end gap-px h-16"><!--[-->`);
                const each_array_7 = ensure_array_like(timeSeriesProcessed());
                for (let $$index_6 = 0, $$length2 = each_array_7.length; $$index_6 < $$length2; $$index_6++) {
                  let point = each_array_7[$$index_6];
                  const tsMax = Math.max(...timeSeriesProcessed().map((p) => p.totalTokens), 1);
                  const h = Math.max(point.totalTokens / tsMax * 100, 2);
                  $$renderer2.push(`<div class="flex-1 rounded-t bg-accent-cyan/40 hover:bg-accent-cyan/70 transition-all min-w-[1px]"${attr_style(`height: ${stringify(h)}%`)}${attr("title", `${stringify(new Date(point.timestamp).toLocaleString())}: ${stringify(formatTokens(point.totalTokens))} tokens`)}></div>`);
                }
                $$renderer2.push(`<!--]--></div> <div class="text-[10px] text-text-muted mt-1">${escape_html(timeSeriesProcessed().length)} turns ·
                            ${escape_html(formatTokens(timeSeriesProcessed()[timeSeriesProcessed().length - 1]?.cumulativeTokens ?? 0))} total ·
                            ${escape_html(formatCost(timeSeriesProcessed()[timeSeriesProcessed().length - 1]?.cumulativeCost ?? 0))}</div></div>`);
              } else {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]--> `);
              {
                $$renderer2.push("<!--[!-->");
              }
              $$renderer2.push(`<!--]-->`);
            }
            $$renderer2.push(`<!--]--></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></button>`);
        }
        $$renderer2.push(`<!--]--> `);
        if (sortedSessions().length > 50) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="text-center text-xs text-text-muted py-3">Showing 50 of ${escape_html(sortedSessions().length)} sessions. Narrow the date range for more detail.</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[3-->");
      $$renderer2.push(`<div class="text-center py-16"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg></div> <p class="text-text-muted text-sm">No usage data found for this date range.</p> <p class="text-text-muted text-xs mt-1">Try expanding the date range or check that sessions have been active.</p></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
