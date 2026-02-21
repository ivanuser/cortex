import { l as head, a as attr_class, c as escape_html, s as stringify, e as ensure_array_like, k as attr_style, b as attr, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let pendingApprovals = [];
    let resolvedHistory = [];
    let resolving = /* @__PURE__ */ new Set();
    let now = Date.now();
    let pendingCount = derived(() => pendingApprovals.length);
    let sortedPending = derived(() => {
      return [...pendingApprovals].sort((a, b) => a.expiresAtMs - b.expiresAtMs);
    });
    let totalPatterns = derived(() => {
      return 0;
    });
    function formatTimeRemaining(expiresAtMs) {
      const remaining = expiresAtMs - now;
      if (remaining <= 0) return "Expired";
      const seconds = Math.floor(remaining / 1e3);
      const minutes = Math.floor(seconds / 60);
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    }
    function getTimeRemainingPercent(createdAtMs, expiresAtMs) {
      const total = expiresAtMs - createdAtMs;
      const remaining = expiresAtMs - now;
      if (total <= 0) return 0;
      return Math.max(0, Math.min(100, remaining / total * 100));
    }
    function getTimeColor(expiresAtMs) {
      const remaining = expiresAtMs - now;
      if (remaining <= 1e4) return "text-accent-pink";
      if (remaining <= 3e4) return "text-accent-amber";
      return "text-accent-green";
    }
    function getTimeBarColor(expiresAtMs) {
      const remaining = expiresAtMs - now;
      if (remaining <= 1e4) return "bg-accent-pink";
      if (remaining <= 3e4) return "bg-accent-amber";
      return "bg-accent-green";
    }
    function formatDecisionTime(ms) {
      const d = new Date(ms);
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }
    head("19gsovj", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Exec Approvals — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden svelte-19gsovj"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default svelte-19gsovj"><div class="flex items-start justify-between gap-4 flex-wrap svelte-19gsovj"><div class="svelte-19gsovj"><div class="flex items-center gap-3 svelte-19gsovj"><div${attr_class(`w-10 h-10 rounded-xl border border-border-glow flex items-center justify-center relative ${stringify("")}`, "svelte-19gsovj")} style="background: linear-gradient(135deg, rgba(0, 229, 255, 0.1), rgba(124, 77, 255, 0.1));"><svg class="w-5 h-5 text-accent-cyan svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" class="svelte-19gsovj"></path></svg> `);
    if (pendingCount() > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span${attr_class(`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent-pink text-white text-[10px] font-bold flex items-center justify-center border-2 border-bg-primary ${stringify("")}`, "svelte-19gsovj")}>${escape_html(pendingCount())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="svelte-19gsovj"><h1 class="text-xl font-bold text-text-primary glow-text-cyan svelte-19gsovj">Exec Approvals</h1> <p class="text-sm text-text-muted svelte-19gsovj">Real-time command approval queue and allowlist management</p></div></div></div> <div class="flex items-center bg-bg-tertiary rounded-lg border border-border-default p-0.5 svelte-19gsovj"><button${attr_class(
      `px-3 py-1.5 text-sm rounded-md transition-all flex items-center gap-1.5 ${stringify(
        "bg-bg-hover text-accent-cyan font-medium"
      )}`,
      "svelte-19gsovj"
    )}><svg class="w-4 h-4 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" class="svelte-19gsovj"></path></svg> Queue `);
    if (pendingCount() > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="ml-1 px-1.5 py-0.5 rounded-full bg-accent-pink/20 text-accent-pink text-[10px] font-bold svelte-19gsovj">${escape_html(pendingCount())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></button> <button${attr_class(
      `px-3 py-1.5 text-sm rounded-md transition-all flex items-center gap-1.5 ${stringify("text-text-muted hover:text-text-primary")}`,
      "svelte-19gsovj"
    )}><svg class="w-4 h-4 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" class="svelte-19gsovj"></path></svg> Allowlist `);
    if (totalPatterns() > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="ml-1 px-1.5 py-0.5 rounded-full bg-accent-green/20 text-accent-green text-[10px] font-bold svelte-19gsovj">${escape_html(totalPatterns())}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></button></div></div></div> <div class="flex-1 overflow-y-auto p-4 md:p-6 svelte-19gsovj">`);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-full text-center svelte-19gsovj"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4 svelte-19gsovj"><svg class="w-8 h-8 text-text-muted svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757" class="svelte-19gsovj"></path></svg></div> <p class="text-text-muted text-sm svelte-19gsovj">Connect to the gateway to manage exec approvals.</p></div>`);
    } else {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="space-y-6 svelte-19gsovj"><div class="svelte-19gsovj"><h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2 svelte-19gsovj"><span${attr_class(`w-2 h-2 rounded-full ${stringify(pendingCount() > 0 ? "bg-accent-amber animate-pulse" : "bg-text-muted")}`, "svelte-19gsovj")}></span> Pending Approvals `);
      if (pendingCount() > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="text-accent-amber svelte-19gsovj">(${escape_html(pendingCount())})</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></h2> `);
      if (sortedPending().length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center svelte-19gsovj"><div class="w-12 h-12 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-3 svelte-19gsovj"><svg class="w-6 h-6 text-accent-green svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" class="svelte-19gsovj"></path></svg></div> <p class="text-text-muted text-sm svelte-19gsovj">No pending approval requests</p> <p class="text-text-muted text-xs mt-1 svelte-19gsovj">Requests will appear here in real-time when agents need permission</p></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="space-y-3 svelte-19gsovj"><!--[-->`);
        const each_array = ensure_array_like(sortedPending());
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let approval = each_array[$$index];
          const timePercent = getTimeRemainingPercent(approval.createdAtMs, approval.expiresAtMs);
          const isResolving = resolving.has(approval.id);
          $$renderer2.push(`<div${attr_class(
            `rounded-xl border border-border-default bg-bg-secondary/50 overflow-hidden animate-fade-in ${stringify(timePercent < 20 ? "border-accent-pink/40" : "hover:border-accent-cyan/20")} transition-all`,
            "svelte-19gsovj"
          )}><div class="h-1 bg-bg-tertiary svelte-19gsovj"><div${attr_class(`h-full ${stringify(getTimeBarColor(approval.expiresAtMs))} transition-all duration-1000 ease-linear`, "svelte-19gsovj")}${attr_style(`width: ${stringify(timePercent)}%`)}></div></div> <div class="p-4 svelte-19gsovj"><div class="flex items-start justify-between gap-4 mb-3 svelte-19gsovj"><div class="min-w-0 flex-1 svelte-19gsovj"><div class="flex items-center gap-2 mb-1 svelte-19gsovj"><svg class="w-4 h-4 text-accent-amber flex-shrink-0 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" class="svelte-19gsovj"></path></svg> <code class="text-sm font-mono text-accent-cyan break-all svelte-19gsovj">${escape_html(approval.request.command)}</code></div></div> <div${attr_class(`flex items-center gap-1.5 ${stringify(getTimeColor(approval.expiresAtMs))} text-xs font-mono flex-shrink-0`, "svelte-19gsovj")}><svg class="w-3.5 h-3.5 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" class="svelte-19gsovj"></path></svg> ${escape_html(formatTimeRemaining(approval.expiresAtMs))}</div></div> <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-muted mb-4 svelte-19gsovj">`);
          if (approval.request.cwd) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 font-mono svelte-19gsovj">📁 ${escape_html(approval.request.cwd)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (approval.request.host) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 svelte-19gsovj">🖥️ ${escape_html(approval.request.host)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (approval.request.agentId) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="flex items-center gap-1 svelte-19gsovj">🤖 ${escape_html(approval.request.agentId)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (approval.request.sessionKey) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="font-mono svelte-19gsovj">🔑 ${escape_html(approval.request.sessionKey.length > 20 ? approval.request.sessionKey.slice(0, 20) + "…" : approval.request.sessionKey)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (approval.request.security) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple border border-accent-purple/20 font-mono svelte-19gsovj">${escape_html(approval.request.security)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <span class="font-mono text-text-muted/60 svelte-19gsovj">id: ${escape_html(approval.id.slice(0, 12))}…</span></div> <div class="flex items-center gap-2 svelte-19gsovj"><button${attr("disabled", isResolving, true)} class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all bg-accent-green/15 text-accent-green border border-accent-green/30 hover:bg-accent-green/25 hover:border-accent-green/50 hover:shadow-[0_0_12px_rgba(0,255,136,0.15)] disabled:opacity-40 disabled:cursor-not-allowed svelte-19gsovj">`);
          if (isResolving) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<svg class="w-4 h-4 animate-spin svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" class="svelte-19gsovj"></path></svg>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<svg class="w-4 h-4 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" class="svelte-19gsovj"></path></svg>`);
          }
          $$renderer2.push(`<!--]--> Approve</button> <button${attr("disabled", isResolving, true)} class="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all bg-accent-pink/15 text-accent-pink border border-accent-pink/30 hover:bg-accent-pink/25 hover:border-accent-pink/50 hover:shadow-[0_0_12px_rgba(244,63,158,0.15)] disabled:opacity-40 disabled:cursor-not-allowed svelte-19gsovj"><svg class="w-4 h-4 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" class="svelte-19gsovj"></path></svg> Deny</button></div></div></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="svelte-19gsovj"><h2 class="text-sm font-semibold uppercase tracking-wider text-text-muted mb-4 flex items-center gap-2 svelte-19gsovj"><svg class="w-4 h-4 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" class="svelte-19gsovj"></path></svg> Recent Decisions</h2> `);
      if (resolvedHistory.length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-6 text-center svelte-19gsovj"><p class="text-text-muted text-xs svelte-19gsovj">No resolved requests yet this session</p></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="space-y-2 svelte-19gsovj"><!--[-->`);
        const each_array_1 = ensure_array_like(resolvedHistory);
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let resolved = each_array_1[$$index_1];
          $$renderer2.push(`<div class="flex items-center gap-3 rounded-lg border border-border-default bg-bg-secondary/30 px-4 py-2.5 text-sm svelte-19gsovj"><span${attr_class(
            `w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${stringify(resolved.decision === "approve" ? "bg-accent-green/15 text-accent-green" : "bg-accent-pink/15 text-accent-pink")}`,
            "svelte-19gsovj"
          )}>`);
          if (resolved.decision === "approve") {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<svg class="w-3.5 h-3.5 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" class="svelte-19gsovj"></path></svg>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<svg class="w-3.5 h-3.5 svelte-19gsovj" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" class="svelte-19gsovj"></path></svg>`);
          }
          $$renderer2.push(`<!--]--></span> <code class="text-xs font-mono text-text-primary truncate flex-1 svelte-19gsovj">${escape_html(resolved.command ?? resolved.request?.command ?? resolved.id.slice(0, 16))}</code> <span${attr_class(
            `text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${stringify(resolved.decision === "approve" ? "bg-accent-green/15 text-accent-green border border-accent-green/20" : "bg-accent-pink/15 text-accent-pink border border-accent-pink/20")}`,
            "svelte-19gsovj"
          )}>${escape_html(resolved.decision === "approve" ? "approved" : "denied")}</span> <span class="text-xs text-text-muted font-mono flex-shrink-0 svelte-19gsovj">${escape_html(formatDecisionTime(resolved.resolvedAtMs))}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
