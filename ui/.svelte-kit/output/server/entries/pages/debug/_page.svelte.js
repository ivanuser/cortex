import { l as head, b as attr, c as escape_html, e as ensure_array_like, a as attr_class, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let debugModels = [];
    let callMethod = "status";
    let callParams = "{}";
    let callHistory = [];
    let securityAudit = derived(() => {
      return null;
    });
    let securityTone = derived(() => {
      if (!securityAudit()) return "";
      const critical = securityAudit().critical ?? 0;
      const warn = securityAudit().warn ?? 0;
      if (critical > 0) return "error";
      if (warn > 0) return "warn";
      return "ok";
    });
    head("1cmtigg", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Debug — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-7xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary flex items-center gap-3"><span class="text-accent-cyan">⚡</span> Debug Console</h1> <p class="text-sm text-text-muted mt-1">Gateway diagnostics, snapshots, and raw RPC access.</p></div> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-4 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh All</button></div> `);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center"><div class="text-text-muted text-sm">Connect to the gateway to use debug tools.</div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="rounded-xl border border-accent-cyan/30 bg-bg-secondary/60 p-5 shadow-[0_0_30px_rgba(0,229,255,0.06)]"><div class="flex items-center justify-between mb-4"><div><h2 class="text-lg font-semibold text-accent-cyan flex items-center gap-2"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Manual RPC Console</h2> <p class="text-xs text-text-muted mt-0.5">Send raw gateway methods with JSON params. <kbd class="text-accent-cyan/70">Ctrl+Enter</kbd> to execute.</p></div></div> <div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="space-y-3"><div><label for="rpc-method" class="block text-xs font-medium text-text-muted mb-1.5">Method</label> <input id="rpc-method"${attr("value", callMethod)} placeholder="e.g. status, health, models.list" class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)] transition-all"/></div> <div><label for="rpc-params" class="block text-xs font-medium text-text-muted mb-1.5">Params (JSON)</label> <textarea id="rpc-params" rows="6" placeholder="{ }" class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)] transition-all resize-y">`);
      const $$body = escape_html(callParams);
      if ($$body) {
        $$renderer2.push(`${$$body}`);
      }
      $$renderer2.push(`</textarea></div> <button${attr("disabled", !callMethod.trim(), true)} class="w-full py-2.5 rounded-lg text-sm font-medium transition-all bg-accent-cyan/10 border border-accent-cyan/40 text-accent-cyan hover:bg-accent-cyan/20 hover:border-accent-cyan hover:shadow-[0_0_15px_rgba(0,229,255,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`Execute`);
      }
      $$renderer2.push(`<!--]--></button></div> <div class="flex flex-col"><div class="text-xs font-medium text-text-muted mb-1.5">Result</div> <div class="flex-1 bg-bg-input border border-border-default rounded-lg overflow-hidden relative">`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="h-full flex items-center justify-center text-text-muted/40 text-sm">Response will appear here</div>`);
      }
      $$renderer2.push(`<!--]--></div></div></div> `);
      if (callHistory.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="mt-4 pt-3 border-t border-border-default"><div class="text-xs font-medium text-text-muted mb-2">Recent Calls</div> <div class="flex flex-wrap gap-2"><!--[-->`);
        const each_array = ensure_array_like(callHistory.slice(0, 8));
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let entry = each_array[$$index];
          $$renderer2.push(`<button${attr_class(`px-2.5 py-1 rounded text-xs font-mono border transition-all ${stringify(entry.error ? "border-red-500/30 text-red-400/70 hover:border-red-500/60 hover:text-red-400" : "border-accent-green/30 text-accent-green/70 hover:border-accent-green/60 hover:text-accent-green")} bg-bg-input hover:bg-bg-hover`)}${attr("title", `${stringify(entry.method)} @ ${stringify(new Date(entry.ts).toLocaleTimeString())}`)}>${escape_html(entry.method)}</button>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="grid grid-cols-1 lg:grid-cols-2 gap-5"><div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5"><div class="flex items-center justify-between mb-4"><h2 class="text-sm font-semibold text-text-primary flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-accent-green animate-pulse"></span> Status</h2> `);
      if (securityAudit()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span${attr_class(`px-2 py-0.5 rounded text-xs font-medium ${stringify(securityTone() === "error" ? "bg-red-500/20 text-red-400" : securityTone() === "warn" ? "bg-amber-500/20 text-amber-400" : "bg-accent-green/20 text-accent-green")}`)}>${escape_html(securityTone() === "error" ? `${securityAudit().critical} critical` : securityTone() === "warn" ? `${securityAudit().warn} warnings` : "Clean")}</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="text-sm text-text-muted">No data loaded</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5"><div class="flex items-center gap-2 mb-4"><span class="w-2 h-2 rounded-full bg-accent-purple"></span> <h2 class="text-sm font-semibold text-text-primary">Health</h2></div> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="text-sm text-text-muted">No data loaded</div>`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="grid grid-cols-1 lg:grid-cols-2 gap-5"><div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5"><div class="flex items-center gap-2 mb-4"><span class="w-2 h-2 rounded-full bg-accent-amber"></span> <h2 class="text-sm font-semibold text-text-primary">Models</h2> <span class="ml-auto text-xs text-text-muted font-mono">${escape_html(debugModels.length)} registered</span></div> `);
      if (debugModels.length > 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="space-y-1.5 max-h-64 overflow-y-auto"><!--[-->`);
        const each_array_3 = ensure_array_like(debugModels);
        for (let i = 0, $$length = each_array_3.length; i < $$length; i++) {
          let model = each_array_3[i];
          $$renderer2.push(`<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-input/50 border border-border-default/50 hover:border-accent-amber/30 transition-colors group"><span class="text-[10px] text-text-muted font-mono w-5 text-right">${escape_html(i + 1)}</span> <span class="text-sm font-mono text-text-secondary group-hover:text-accent-amber transition-colors truncate">${escape_html(typeof model === "object" && model !== null ? model.id ?? model.name ?? JSON.stringify(model) : String(model))}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="text-sm text-text-muted">No models available</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="rounded-xl border border-border-default bg-bg-secondary/50 p-5"><div class="flex items-center gap-2 mb-4"><span class="w-2 h-2 rounded-full bg-accent-pink animate-pulse"></span> <h2 class="text-sm font-semibold text-text-primary">Last Heartbeat</h2></div> `);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="text-sm text-text-muted">No heartbeat data</div>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
