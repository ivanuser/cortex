import { l as head, a as attr_class, b as attr, e as ensure_array_like, c as escape_html, s as stringify } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let configIssues = [];
    head("1gp6n77", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Config — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-5xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-4"><div><h1 class="text-2xl font-bold text-text-primary">Gateway Configuration</h1> <p class="text-sm text-text-muted mt-1">Edit your OpenClaw gateway settings `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></p></div> <div class="flex items-center gap-2"><div class="flex rounded-lg border border-border-default overflow-hidden"><button${attr_class(`px-3 py-1.5 text-xs font-medium transition-all ${stringify(
      "bg-accent-cyan/20 text-accent-cyan"
    )}`)}>Form</button> <button${attr_class(`px-3 py-1.5 text-xs font-medium transition-all ${stringify("text-text-muted hover:text-text-secondary")}`)}>Raw JSON</button></div> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh</button></div></div> `);
    if (configIssues.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="rounded-xl border border-status-error/30 bg-status-error/10 p-4"><p class="text-sm font-medium text-status-error mb-2">⚠️ Configuration Issues</p> <!--[-->`);
      const each_array = ensure_array_like(configIssues);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let issue = each_array[$$index];
        $$renderer2.push(`<p class="text-xs text-status-error/80 font-mono">${escape_html(issue.path ? `[${issue.path}] ` : "")}${escape_html(issue.message)}</p>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="text-center py-16"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to edit configuration.</p></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
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
