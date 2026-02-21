import { l as head, c as escape_html, b as attr, e as ensure_array_like, a as attr_class, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
    const conn = getConnection();
    let entries = [];
    let filterText = "";
    let debouncedFilterText = "";
    let autoFollow = true;
    let levelFilters = {
      trace: true,
      debug: true,
      info: true,
      warn: true,
      error: true,
      fatal: true
    };
    let filteredEntries = derived(() => {
      const needle = debouncedFilterText.trim().toLowerCase();
      return entries.filter((entry) => {
        if (entry.level && !levelFilters[entry.level]) return false;
        if (!needle) return true;
        const haystack = [entry.message, entry.subsystem, entry.raw].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(needle);
      });
    });
    let activeFilterCount = derived(() => LEVELS.filter((l) => !levelFilters[l]).length);
    function formatTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        fractionalSecondDigits: 3
      });
    }
    function levelColor(level) {
      switch (level) {
        case "trace":
          return "text-gray-500";
        case "debug":
          return "text-blue-400";
        case "info":
          return "text-accent-cyan";
        case "warn":
          return "text-amber-400";
        case "error":
          return "text-red-400";
        case "fatal":
          return "text-accent-pink";
        default:
          return "text-text-muted";
      }
    }
    function levelBg(level) {
      switch (level) {
        case "trace":
          return "bg-gray-500/10";
        case "debug":
          return "bg-blue-400/10";
        case "info":
          return "bg-accent-cyan/10";
        case "warn":
          return "bg-amber-400/10";
        case "error":
          return "bg-red-400/10";
        case "fatal":
          return "bg-accent-pink/10";
        default:
          return "";
      }
    }
    function chipColor(level) {
      switch (level) {
        case "trace":
          return "border-gray-500/40 text-gray-400 has-[:checked]:bg-gray-500/20 has-[:checked]:border-gray-500";
        case "debug":
          return "border-blue-400/40 text-blue-400 has-[:checked]:bg-blue-400/20 has-[:checked]:border-blue-400";
        case "info":
          return "border-accent-cyan/40 text-accent-cyan has-[:checked]:bg-accent-cyan/20 has-[:checked]:border-accent-cyan";
        case "warn":
          return "border-amber-400/40 text-amber-400 has-[:checked]:bg-amber-400/20 has-[:checked]:border-amber-400";
        case "error":
          return "border-red-400/40 text-red-400 has-[:checked]:bg-red-400/20 has-[:checked]:border-red-400";
        case "fatal":
          return "border-accent-pink/40 text-accent-pink has-[:checked]:bg-accent-pink/20 has-[:checked]:border-accent-pink";
      }
    }
    head("1lsf4ps", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Logs — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-1 flex flex-col max-w-full p-4 md:p-6 overflow-hidden"><div class="flex items-center justify-between mb-4 flex-shrink-0 flex-wrap gap-3"><div><h1 class="text-2xl font-bold text-text-primary flex items-center gap-3"><span class="text-accent-cyan">📋</span> Logs</h1> <p class="text-sm text-text-muted mt-0.5">Live gateway log tail `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></p></div> <div class="flex items-center gap-3"><span class="text-xs text-text-muted font-mono">${escape_html(filteredEntries().length)}${escape_html(activeFilterCount() > 0 ? ` / ${entries.length}` : "")} entries</span> <button${attr("disabled", filteredEntries().length === 0, true)} class="px-3 py-2 rounded-lg text-xs border border-border-default hover:border-accent-purple text-text-secondary hover:text-accent-purple transition-all disabled:opacity-50 disabled:cursor-not-allowed">Export</button> <button${attr("disabled", conn.state.status !== "connected", true)} class="px-3 py-2 rounded-lg text-xs border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh</button></div></div> `);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-1 flex items-center justify-center"><div class="rounded-xl border border-border-default bg-bg-secondary/50 p-8 text-center"><div class="text-text-muted text-sm">Connect to the gateway to view logs.</div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex flex-wrap items-center gap-3 mb-3 flex-shrink-0"><div class="relative flex-1 min-w-[200px] max-w-sm"><svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input${attr("value", filterText)} placeholder="Filter logs…" class="w-full bg-bg-input border border-border-default rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan focus:shadow-[0_0_8px_rgba(0,229,255,0.15)] transition-all"/></div> <div class="flex items-center gap-1.5"><!--[-->`);
      const each_array = ensure_array_like(LEVELS);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let level = each_array[$$index];
        $$renderer2.push(`<label${attr_class(`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border cursor-pointer transition-all select-none ${stringify(chipColor(level))}`)}><input type="checkbox"${attr("checked", levelFilters[level], true)} class="sr-only"/> ${escape_html(level)}</label>`);
      }
      $$renderer2.push(`<!--]--></div> <label class="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none ml-auto"><input type="checkbox"${attr("checked", autoFollow, true)} class="w-3.5 h-3.5 rounded border-border-default bg-bg-input accent-accent-cyan"/> Auto-scroll</label></div> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <div class="flex-1 overflow-y-auto bg-bg-input/30 border border-border-default rounded-xl">`);
      if (filteredEntries().length === 0) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center justify-center h-full text-text-muted/40 text-sm">${escape_html(entries.length === 0 ? "Waiting for log entries…" : "No entries match current filters")}</div>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<div class="divide-y divide-border-default/30"><!--[-->`);
        const each_array_1 = ensure_array_like(filteredEntries());
        for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
          let entry = each_array_1[$$index_1];
          $$renderer2.push(`<div${attr_class(`virtual-item flex items-start gap-0 px-3 py-1 hover:bg-bg-hover/30 transition-colors text-xs font-mono ${stringify(levelBg(entry.level))}`)}><span class="w-[85px] flex-shrink-0 text-text-muted/70 select-all">${escape_html(formatTime(entry.time))}</span> <span${attr_class(`w-[50px] flex-shrink-0 font-bold uppercase ${stringify(levelColor(entry.level))}`)}>${escape_html(entry.level ?? "")}</span> `);
          if (entry.subsystem) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="w-[140px] flex-shrink-0 text-accent-purple/70 truncate"${attr("title", entry.subsystem)}>${escape_html(entry.subsystem)}</span>`);
          } else {
            $$renderer2.push("<!--[!-->");
            $$renderer2.push(`<span class="w-[140px] flex-shrink-0"></span>`);
          }
          $$renderer2.push(`<!--]--> <span class="flex-1 text-text-secondary break-all select-all whitespace-pre-wrap">${escape_html(entry.message)}</span></div>`);
        }
        $$renderer2.push(`<!--]--></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="flex items-center justify-between mt-2 flex-shrink-0 text-[10px] text-text-muted/50 font-mono"><span>`);
      {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<span class="inline-block w-1.5 h-1.5 rounded-full bg-text-muted/30 mr-1"></span> Paused`);
      }
      $$renderer2.push(`<!--]--></span> <span>Buffer: ${escape_html(entries.length)}/2000 `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></span></div>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
