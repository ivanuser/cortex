import { l as head, b as attr, c as escape_html, e as ensure_array_like, a as attr_class, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let skills = [];
    let loading = false;
    let searchQuery = "";
    let debouncedSearch = "";
    let filterSource = "all";
    let filtered = derived(() => {
      let list = skills;
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.description?.toLowerCase().includes(q) ?? false) || (s.source?.toLowerCase().includes(q) ?? false));
      }
      return list;
    });
    let stats = derived(() => ({
      total: skills.length,
      bundled: skills.filter((s) => s.bundled).length,
      workspace: skills.filter((s) => s.source === "workspace").length,
      managed: skills.filter((s) => s.source === "managed" || s.source === "clawhub").length
    }));
    function sourceLabel(source, bundled) {
      if (bundled) return "bundled";
      if (source === "workspace") return "workspace";
      if (source === "managed" || source === "clawhub") return "managed";
      return source ?? "unknown";
    }
    function sourceColor(source, bundled) {
      if (bundled) return "bg-accent-purple/20 text-accent-purple border-accent-purple/30";
      if (source === "workspace") return "bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30";
      if (source === "managed" || source === "clawhub") return "bg-accent-green/20 text-accent-green border-accent-green/30";
      return "bg-bg-tertiary text-text-muted border-border-default";
    }
    head("1g4s34r", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Skills — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-6xl mx-auto p-4 md:p-6 space-y-6"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary">Skills</h1> <p class="text-sm text-text-muted mt-1">Agent skill library — bundled, workspace, and installed skills.</p></div> <div class="flex gap-2"><button class="px-3 py-2 rounded-lg text-sm border border-accent-green/30 text-accent-green hover:bg-accent-green/10 transition-all">+ Install</button> <button${attr("disabled", loading, true)} class="px-3 py-2 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">${escape_html("Refresh")}</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="grid grid-cols-4 gap-3"><div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-text-primary">${escape_html(stats().total)}</div> <div class="text-xs text-text-muted">Total</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-purple">${escape_html(stats().bundled)}</div> <div class="text-xs text-text-muted">Bundled</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-cyan">${escape_html(stats().workspace)}</div> <div class="text-xs text-text-muted">Workspace</div></div> <div class="rounded-lg border border-border-default bg-bg-secondary/50 p-3 text-center"><div class="text-xl font-bold text-accent-green">${escape_html(stats().managed)}</div> <div class="text-xs text-text-muted">Managed</div></div></div> <div class="flex gap-3"><div class="relative flex-1"><input type="text"${attr("value", searchQuery)} placeholder="Search skills..." class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan transition-all"/> <svg class="absolute left-3 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg></div> `);
    $$renderer2.select(
      {
        value: filterSource,
        class: "px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-secondary"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "all" }, ($$renderer4) => {
          $$renderer4.push(`All Sources`);
        });
        $$renderer3.option({ value: "bundled" }, ($$renderer4) => {
          $$renderer4.push(`Bundled`);
        });
        $$renderer3.option({ value: "workspace" }, ($$renderer4) => {
          $$renderer4.push(`Workspace`);
        });
        $$renderer3.option({ value: "managed" }, ($$renderer4) => {
          $$renderer4.push(`Managed`);
        });
      }
    );
    $$renderer2.push(`</div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (skills.length === 0 && !loading) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="text-center py-12 text-text-muted">${escape_html(conn.state.status !== "connected" ? "Connect to the gateway to view skills." : "No skills found.")}</div>`);
    } else if (filtered().length === 0) {
      $$renderer2.push("<!--[2-->");
      $$renderer2.push(`<div class="text-center py-12 text-text-muted">No skills match "${escape_html(searchQuery)}"</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="space-y-2"><!--[-->`);
      const each_array_1 = ensure_array_like(filtered());
      for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
        let skill = each_array_1[i];
        $$renderer2.push(`<div class="rounded-xl border border-border-default bg-bg-secondary/50 p-4 transition-all hover:border-border-default/80"><div class="flex items-start gap-3"><div class="flex-1 min-w-0"><div class="flex items-center gap-2 mb-1 flex-wrap"><span class="font-medium text-text-primary">${escape_html(skill.name)}</span> <span${attr_class(`px-1.5 py-0.5 rounded text-[10px] font-mono border ${stringify(sourceColor(skill.source, skill.bundled))}`)}>${escape_html(sourceLabel(skill.source, skill.bundled))}</span> `);
        if (skill.version) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-xs text-text-muted font-mono">v${escape_html(skill.version)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> `);
        if (skill.description) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-xs text-text-secondary leading-relaxed mb-1.5">${escape_html(skill.description)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (skill.filePath) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="text-[10px] text-text-muted/40 font-mono truncate"${attr("title", skill.filePath)}>${escape_html(skill.filePath)}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (skill.error) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="mt-2 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">${escape_html(skill.error)}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="text-xs text-text-muted/40 text-center pt-2">Showing ${escape_html(filtered().length)} of ${escape_html(skills.length)} skills</div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
