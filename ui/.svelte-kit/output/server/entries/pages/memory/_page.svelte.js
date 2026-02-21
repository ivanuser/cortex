import { l as head, b as attr, c as escape_html, e as ensure_array_like, a as attr_class, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
import { f as formatRelativeTime } from "../../../chunks/time.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let query = "";
    let results = [];
    let totalResults = 0;
    let searchLimit = 20;
    let selectedEntry = null;
    let rpcAvailable = null;
    let probing = false;
    let filesLoading = false;
    let activeFile = null;
    let memoryFiles = derived(() => []);
    function truncate(text, max) {
      if (text.length <= max) return text;
      return text.slice(0, max) + "…";
    }
    function formatBytes(bytes) {
      if (!bytes) return "-";
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    }
    function getFileIcon(name) {
      if (name.endsWith(".md")) return "📄";
      if (name.endsWith(".json")) return "📋";
      if (name.endsWith(".yml") || name.endsWith(".yaml")) return "⚙️";
      if (name.endsWith(".ts") || name.endsWith(".js")) return "📜";
      return "📎";
    }
    head("1czmmpc", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Memory — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default"><div class="flex items-center justify-between flex-wrap gap-3"><div><h1 class="text-xl font-bold text-text-primary flex items-center gap-2"><span class="text-accent-purple">🧠</span> Memory</h1> <p class="text-sm text-text-muted">Agent memory system — hybrid BM25 + vector retrieval</p></div> <div class="flex items-center gap-2">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <button${attr("disabled", probing, true)} class="px-3 py-1.5 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">${escape_html("Refresh")}</button></div></div></div> <div class="flex-1 overflow-y-auto p-4 md:p-6"><div class="max-w-6xl mx-auto space-y-6"><div class="glass rounded-xl border border-border-default p-4"><div class="flex items-center gap-3"><div class="flex-1 relative"><svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input type="text"${attr("value", query)}${attr("placeholder", "Memory search requires CLI — see below")}${attr("disabled", rpcAvailable === false, true)} class="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border-default bg-bg-input text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-purple focus:shadow-[0_0_8px_rgba(124,77,255,0.15)] transition-all disabled:opacity-50"/></div> `);
    $$renderer2.select(
      {
        value: searchLimit,
        disabled: rpcAvailable === false,
        class: "px-3 py-2.5 rounded-lg border border-border-default bg-bg-input text-sm text-text-primary focus:outline-none focus:border-accent-purple disabled:opacity-50"
      },
      ($$renderer3) => {
        $$renderer3.option({ value: 10 }, ($$renderer4) => {
          $$renderer4.push(`10`);
        });
        $$renderer3.option({ value: 20 }, ($$renderer4) => {
          $$renderer4.push(`20`);
        });
        $$renderer3.option({ value: 50 }, ($$renderer4) => {
          $$renderer4.push(`50`);
        });
      }
    );
    $$renderer2.push(` <button${attr("disabled", !query.trim() || rpcAvailable === false, true)} class="px-5 py-2.5 rounded-lg text-sm font-medium bg-accent-purple/20 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/30 transition-all disabled:opacity-40">${escape_html("Search")}</button></div></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (results.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="space-y-3"><div class="text-sm text-text-muted">${escape_html(totalResults)} result${escape_html("s")} for "<span class="text-accent-purple">${escape_html(query)}</span>"</div> <!--[-->`);
      const each_array = ensure_array_like(results);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let entry = each_array[i];
        $$renderer2.push(`<button${attr_class(`w-full text-left glass rounded-xl border transition-all ${stringify(selectedEntry?.id === entry.id ? "border-accent-purple/50 bg-accent-purple/5" : "border-border-default hover:border-border-hover")}`)}><div class="p-4"><div class="flex items-center gap-2 mb-2"><span class="text-xs font-mono text-accent-purple">#${escape_html(i + 1)}</span> `);
        if (entry.score !== void 0) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-xs px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple font-mono">${escape_html((entry.score * 100).toFixed(1))}%</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (entry.source) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">${escape_html(entry.source)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <p class="text-sm text-text-primary leading-relaxed">${escape_html(selectedEntry?.id === entry.id ? entry.content : truncate(entry.content, 300))}</p> `);
        if (selectedEntry?.id === entry.id && entry.metadata) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<pre class="mt-3 pt-3 border-t border-border-default text-xs text-text-secondary font-mono bg-bg-primary rounded-lg p-3 overflow-x-auto">${escape_html(JSON.stringify(entry.metadata, null, 2))}</pre>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></button>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="grid grid-cols-1 lg:grid-cols-2 gap-4"><div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><span class="text-accent-cyan">⚙️</span> Configuration</h3> <p class="text-xs text-text-muted mb-4">Memory search engine settings from gateway config.</p> `);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="text-text-muted text-sm">Memory search not configured.</div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><span class="text-accent-purple">💻</span> CLI Commands</h3> <p class="text-xs text-text-muted mb-4">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`Available CLI commands for memory management.`);
    }
    $$renderer2.push(`<!--]--></p> <div class="space-y-3"><div class="rounded-lg bg-bg-primary border border-border-default p-3"><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Check Status</div> <code class="text-sm text-accent-cyan font-mono">openclaw memory status</code> <p class="text-[10px] text-text-muted mt-1">Shows index stats, store path, embedding info</p></div> <div class="rounded-lg bg-bg-primary border border-border-default p-3"><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Search</div> <code class="text-sm text-accent-cyan font-mono">openclaw memory search "your query"</code> <p class="text-[10px] text-text-muted mt-1">Hybrid BM25 + vector search across indexed files</p></div> <div class="rounded-lg bg-bg-primary border border-border-default p-3"><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Re-index</div> <code class="text-sm text-accent-cyan font-mono">openclaw memory index</code> <p class="text-[10px] text-text-muted mt-1">Rebuild the memory index from workspace files</p></div></div></div></div> <div class="glass rounded-xl border border-border-default p-5"><div class="flex items-center justify-between mb-1"><h3 class="text-sm font-semibold text-text-primary flex items-center gap-2"><span class="text-accent-amber">📝</span> Workspace Files</h3> <button${attr("disabled", filesLoading, true)} class="text-[10px] text-text-muted hover:text-accent-cyan transition-all disabled:opacity-50">${escape_html("↻ Refresh")}</button></div> <p class="text-xs text-text-muted mb-4">Agent workspace files — MEMORY.md is your long-term memory store.</p> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (memoryFiles().length === 0) {
      $$renderer2.push("<!--[1-->");
      $$renderer2.push(`<div class="text-center py-8 text-text-muted text-sm">${escape_html(conn.state.status !== "connected" ? "Connect to the gateway to view files." : "No workspace files found.")}</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex gap-4 min-h-0"><div class="w-52 flex-shrink-0 space-y-1 overflow-y-auto max-h-[500px]"><!--[-->`);
      const each_array_2 = ensure_array_like(memoryFiles());
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let file = each_array_2[$$index_2];
        $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${stringify(activeFile === file.name ? "bg-accent-purple/10 text-accent-purple border border-accent-purple/20" : "hover:bg-bg-hover text-text-secondary border border-transparent")}`)}><span class="text-xs flex-shrink-0">${escape_html(getFileIcon(file.name))}</span> <div class="min-w-0 flex-1"><div class="font-mono truncate">${escape_html(file.name)}</div> <div class="text-[10px] text-text-muted mt-0.5">${escape_html(file.missing ? "missing" : formatBytes(file.size))} `);
        if (file.updatedAtMs && !file.missing) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`· ${escape_html(formatRelativeTime(file.updatedAtMs))}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div> `);
        if (file.missing) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-1 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400 flex-shrink-0">missing</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="flex-1 min-w-0 flex flex-col">`);
      {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="flex items-center justify-center h-48 text-text-muted text-sm rounded-lg border border-border-default/50 bg-bg-tertiary/30">Select a file to view or edit</div>`);
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2"><span>🏗️</span> How Memory Works</h3> <p class="text-xs text-text-muted mb-4">Architecture of the agent memory system.</p> <div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4"><div class="text-sm font-medium text-accent-cyan mb-2">📥 Indexing</div> <p class="text-xs text-text-secondary leading-relaxed">Workspace files (markdown, configs, logs) are chunked and embedded into vectors using the configured embedding model. Stored in a local SQLite database with both BM25 and vector indices.</p></div> <div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4"><div class="text-sm font-medium text-accent-purple mb-2">🔍 Hybrid Search</div> <p class="text-xs text-text-secondary leading-relaxed">Queries use both BM25 keyword matching (exact terms) and vector cosine similarity (semantic meaning). Results are ranked by combined score for best relevance.</p></div> <div class="rounded-lg bg-bg-tertiary/30 border border-border-default p-4"><div class="text-sm font-medium text-accent-amber mb-2">🤖 Agent Integration</div> <p class="text-xs text-text-secondary leading-relaxed">The agent automatically searches memory during conversations when relevant context might exist. Memories are indexed on heartbeat cycles and during compaction flushes.</p></div></div></div></div></div></div>`);
  });
}
export {
  _page as default
};
