import { l as head, b as attr, c as escape_html, e as ensure_array_like, a as attr_class, s as stringify } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let jobs = [];
    let busy = false;
    let expandedJobId = null;
    function formatSchedule(s) {
      if (s.kind === "cron") return `cron: ${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
      if (s.kind === "every") {
        const ms = s.everyMs ?? 0;
        if (ms >= 864e5) return `every ${Math.round(ms / 864e5)}d`;
        if (ms >= 36e5) return `every ${Math.round(ms / 36e5)}h`;
        if (ms >= 6e4) return `every ${Math.round(ms / 6e4)}m`;
        return `every ${Math.round(ms / 1e3)}s`;
      }
      if (s.kind === "at") return `at: ${s.at ? new Date(s.at).toLocaleString() : "n/a"}`;
      return s.kind;
    }
    function formatTime(ts) {
      if (!ts) return "never";
      const d = new Date(ts);
      const now = Date.now();
      const diff = now - ts;
      if (Math.abs(diff) < 6e4) return "just now";
      if (diff > 0 && diff < 36e5) return `${Math.floor(diff / 6e4)}m ago`;
      if (diff > 0 && diff < 864e5) return `${Math.floor(diff / 36e5)}h ago`;
      if (diff < 0) {
        const absDiff = Math.abs(diff);
        if (absDiff < 36e5) return `in ${Math.floor(absDiff / 6e4)}m`;
        if (absDiff < 864e5) return `in ${Math.floor(absDiff / 36e5)}h`;
      }
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    }
    head("up3gvt", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Cron Jobs — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary">Cron Jobs</h1> <p class="text-sm text-text-muted mt-1">Schedule wakeups and recurring agent runs.</p></div> <div class="flex items-center gap-3">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-4 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/30 hover:shadow-[0_0_12px_rgba(0,229,255,0.25)] transition-all disabled:opacity-50 disabled:cursor-not-allowed">+ Create Job</button> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed">↻ Refresh</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="text-xs text-text-muted">${escape_html(jobs.length)} job${escape_html(jobs.length !== 1 ? "s" : "")} · ${escape_html(jobs.filter((j) => j.enabled).length)} enabled `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (jobs.length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="text-center py-16 text-text-muted"><div class="text-4xl mb-3">⏰</div> <p class="text-lg mb-1">No cron jobs configured</p> <p class="text-sm mb-4">Create your first scheduled job to get started.</p> <button class="px-4 py-2 rounded-lg text-sm font-medium bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 transition-all">+ Create Job</button></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="space-y-3"><!--[-->`);
      const each_array_7 = ensure_array_like(jobs);
      for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
        let job = each_array_7[$$index_7];
        $$renderer2.push(`<div${attr_class(`rounded-xl border bg-bg-secondary/50 transition-all duration-200 ${stringify(job.enabled ? "border-border-default hover:border-border-default/80" : "border-border-default/50 opacity-60")} ${stringify(expandedJobId === job.id ? "shadow-[0_0_12px_rgba(0,229,255,0.1)]" : "")}`)}><div class="flex items-center gap-3 p-4"><button${attr("disabled", busy, true)}${attr_class(`w-10 h-6 rounded-full transition-colors relative flex-shrink-0 cursor-pointer ${stringify(job.enabled ? "bg-accent-green/30" : "bg-bg-tertiary")}`)}${attr("title", `${stringify(job.enabled ? "Disable" : "Enable")} job`)}><div${attr_class(`absolute top-1 w-4 h-4 rounded-full transition-all duration-200 ${stringify(job.enabled ? "left-5 bg-accent-green" : "left-1 bg-text-muted")}`)}></div></button> <button class="flex-1 text-left min-w-0"><div class="flex items-center gap-2 flex-wrap"><span class="font-medium text-text-primary truncate">${escape_html(job.name || job.id)}</span> <span${attr_class(`px-2 py-0.5 rounded text-xs ${stringify(job.payload.kind === "agentTurn" ? "bg-accent-purple/20 text-accent-purple" : "bg-accent-cyan/20 text-accent-cyan")}`)}>${escape_html(job.payload.kind === "agentTurn" ? "agent" : "event")}</span> <span class="px-2 py-0.5 rounded text-xs bg-bg-tertiary text-text-muted">${escape_html(job.sessionTarget)}</span></div> <div class="text-xs text-text-muted mt-1 flex items-center gap-3 flex-wrap"><span>${escape_html(formatSchedule(job.schedule))}</span> `);
        if (job.nextRunAt) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-accent-cyan/70">Next: ${escape_html(formatTime(job.nextRunAt))}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.lastRunAt) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span>Last: ${escape_html(formatTime(job.lastRunAt))}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (job.runCount) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span>${escape_html(job.runCount)} runs</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></button> <div class="flex items-center gap-1 flex-shrink-0"><button${attr("disabled", busy, true)} class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-purple transition-colors disabled:opacity-50" title="Edit job"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button> <button${attr("disabled", busy, true)} class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-green transition-colors disabled:opacity-50" title="Run now"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg></button> <button${attr("disabled", busy, true)} class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors disabled:opacity-50" title="View run history"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></button> <button${attr("disabled", busy, true)} class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-red-400 transition-colors disabled:opacity-50" title="Delete job"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button></div></div> `);
        if (expandedJobId === job.id) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="border-t border-border-default p-4 space-y-3 text-sm">`);
          if (job.description) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted text-xs">Description</span> <p class="text-text-secondary">${escape_html(job.description)}</p></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> <div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div><span class="text-text-muted text-xs block">Schedule</span> <span class="text-text-secondary font-mono text-xs">${escape_html(formatSchedule(job.schedule))}</span></div> <div><span class="text-text-muted text-xs block">Target</span> <span class="text-text-secondary">${escape_html(job.sessionTarget)}</span></div> <div><span class="text-text-muted text-xs block">Notify</span> <span class="text-text-secondary">${escape_html(job.notify ? "Yes" : "No")}</span></div> <div><span class="text-text-muted text-xs block">ID</span> <span class="text-text-secondary font-mono text-xs break-all">${escape_html(job.id)}</span></div></div> <div><span class="text-text-muted text-xs block mb-1">Payload</span> <pre class="p-2 rounded bg-bg-tertiary text-text-secondary font-mono text-xs overflow-x-auto">${escape_html(JSON.stringify(job.payload, null, 2))}</pre></div> `);
          if (job.delivery) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div><span class="text-text-muted text-xs block mb-1">Delivery</span> <pre class="p-2 rounded bg-bg-tertiary text-text-secondary font-mono text-xs">${escape_html(JSON.stringify(job.delivery, null, 2))}</pre></div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> `);
          if (job.lastError) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">Last error: ${escape_html(job.lastError)}</div>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
