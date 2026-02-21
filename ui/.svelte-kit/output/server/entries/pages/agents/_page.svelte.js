import { l as head, b as attr, c as escape_html, e as ensure_array_like, a as attr_class, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection, a as gateway } from "../../../chunks/connection.svelte.js";
import { g as getToasts } from "../../../chunks/toasts.svelte.js";
import { f as formatRelativeTime } from "../../../chunks/time.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    getConnection();
    const toasts = getToasts();
    let agents = [];
    let defaultAgentId = "";
    let selectedAgentId = null;
    let loading = false;
    let activeTab = "overview";
    let identity = null;
    let modelOptions = [];
    let modelPrimary = "";
    let modelFallbacks = "";
    let configSaving = false;
    let filesList = null;
    let filesLoading = false;
    let activeFile = null;
    let fileContent = "";
    let fileDraft = "";
    let fileSaving = false;
    let skills = [];
    let skillsLoading = false;
    let channelsLoading = false;
    let cronJobs = [];
    let cronLoading = false;
    let selectedAgent = derived(() => agents.find((a) => a.id === selectedAgentId) ?? null);
    let agentContext = derived(() => {
      if (!selectedAgent()) return null;
      const agentConfig = resolveAgentConfig(selectedAgent().id);
      const workspace = filesList?.workspace || agentConfig?.workspace || selectedAgent().workspace || "/home/ihoner";
      const model = resolveModelLabel(agentConfig?.model ?? selectedAgent().model);
      const identityName = identity?.name || selectedAgent().identity?.name || selectedAgent().name || selectedAgent().id;
      const identityEmoji = identity?.emoji || selectedAgent().identity?.emoji || "-";
      const skillFilter = agentConfig?.skills ?? selectedAgent().skills;
      const skillsLabel = Array.isArray(skillFilter) ? `${skillFilter.length} selected` : "all skills";
      const isDefault = selectedAgent().id === defaultAgentId;
      return {
        workspace,
        model,
        identityName,
        identityEmoji,
        skillsLabel,
        isDefault
      };
    });
    let isDirty = derived(() => fileDraft !== fileContent && activeFile !== null);
    let agentCronJobs = derived(() => cronJobs.filter((j) => j.agentId === selectedAgentId || !j.agentId && selectedAgentId === defaultAgentId));
    function resolveAgentConfig(agentId) {
      return null;
    }
    function resolveModelLabel(model) {
      if (!model) return "-";
      if (typeof model === "string") return model.trim() || "-";
      if (typeof model === "object" && model) {
        const m = model;
        const primary = typeof m.primary === "string" ? m.primary.trim() : "";
        if (primary) {
          const fallbacks = Array.isArray(m.fallbacks) ? m.fallbacks.length : 0;
          return fallbacks > 0 ? `${primary} (+${fallbacks} fallback)` : primary;
        }
      }
      return "-";
    }
    function resolveAgentEmoji(agent) {
      const e = identity?.emoji || agent.identity?.emoji || "";
      return e.trim() || "🤖";
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
    const tabs = [
      { key: "overview", label: "Overview", icon: "📊" },
      { key: "files", label: "Files", icon: "📁" },
      { key: "tools", label: "Tools", icon: "🔧" },
      { key: "skills", label: "Skills", icon: "⚡" },
      { key: "channels", label: "Channels", icon: "💬" },
      { key: "cron", label: "Cron Jobs", icon: "⏰" }
    ];
    const TOOL_SECTIONS = [
      {
        id: "fs",
        label: "Files",
        tools: ["read", "write", "edit", "apply_patch"]
      },
      { id: "runtime", label: "Runtime", tools: ["exec", "process"] },
      { id: "web", label: "Web", tools: ["web_search", "web_fetch"] },
      {
        id: "sessions",
        label: "Sessions",
        tools: [
          "sessions_list",
          "sessions_history",
          "sessions_send",
          "sessions_spawn",
          "session_status"
        ]
      },
      { id: "ui", label: "UI", tools: ["browser", "canvas"] },
      { id: "messaging", label: "Messaging", tools: ["message"] },
      {
        id: "automation",
        label: "Automation",
        tools: ["cron", "gateway"]
      },
      { id: "nodes", label: "Nodes", tools: ["nodes"] },
      { id: "agents", label: "Agents", tools: ["agents_list"] },
      { id: "media", label: "Media", tools: ["image", "tts"] }
    ];
    async function loadIdentity(agentId) {
      try {
        const res = await gateway.call("agent.identity.get", { agentId });
        identity = res ?? null;
      } catch {
        identity = null;
      }
    }
    async function loadFiles(agentId) {
      filesLoading = true;
      activeFile = null;
      fileContent = "";
      fileDraft = "";
      try {
        const res = await gateway.call("agents.files.list", { agentId });
        filesList = res ?? null;
      } catch (e) {
        toasts.error("Failed to load files", String(e));
      } finally {
        filesLoading = false;
      }
    }
    function selectAgent(id) {
      selectedAgentId = id;
      activeTab = "overview";
      activeFile = null;
      identity = null;
      loadIdentity(id);
      loadFiles(id);
    }
    function isToolAllowed(toolName) {
      const agent = selectedAgent();
      if (!agent?.tools) return "default";
      const deny = agent.tools.deny ?? [];
      const allow = agent.tools.allow ?? [];
      const alsoAllow = agent.tools.alsoAllow ?? [];
      if (deny.includes(toolName) || deny.includes("*")) return "denied";
      if (allow.includes(toolName) || allow.includes("*") || alsoAllow.includes(toolName)) return "allowed";
      return "default";
    }
    function formatSchedule(job) {
      const s = job.schedule;
      if (!s) return "-";
      if (s.kind === "cron" && s.expr) return `cron: ${s.expr}`;
      if (s.kind === "every" && s.everyMs) return `every ${Math.round(s.everyMs / 6e4)}m`;
      if (s.kind === "at" && s.at) return `at: ${new Date(s.at).toLocaleString()}`;
      return JSON.stringify(s);
    }
    head("h3sa6j", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Agents — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="px-4 md:px-6 py-4 border-b border-border-default flex items-center justify-between flex-shrink-0"><div><h1 class="text-xl font-bold text-text-primary flex items-center gap-2"><span class="text-accent-cyan">🤖</span> Agents</h1> <p class="text-sm text-text-muted">Manage agent workspaces, tools, and identities.</p></div> <button${attr("disabled", loading, true)} class="px-3 py-1.5 rounded-lg text-sm border border-border-default hover:border-accent-cyan text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50 flex items-center gap-1.5">`);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> Refresh</button></div> <div class="flex-1 flex min-h-0 overflow-hidden"><div class="hidden md:flex w-48 border-r border-border-default bg-bg-secondary/30 flex-col flex-shrink-0"><div class="p-3 border-b border-border-default"><div class="text-xs font-medium text-text-muted uppercase tracking-wider">Agents</div> <div class="text-xs text-text-muted mt-0.5">${escape_html(agents.length)} configured</div></div> <div class="flex-1 overflow-y-auto"><!--[-->`);
    const each_array = ensure_array_like(agents);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let agent = each_array[$$index];
      $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-3 transition-all border-l-2 group ${stringify(selectedAgentId === agent.id ? "border-accent-cyan bg-accent-cyan/5" : "border-transparent hover:bg-bg-hover")}`)}><div class="flex items-center gap-2"><span class="text-lg">${escape_html(resolveAgentEmoji(agent))}</span> <div class="min-w-0 flex-1"><div${attr_class(`text-sm font-medium truncate ${stringify(selectedAgentId === agent.id ? "text-accent-cyan" : "text-text-primary group-hover:text-text-primary")}`)}>${escape_html(agent.identity?.name || agent.name || agent.id)}</div> <div class="text-[10px] text-text-muted font-mono">${escape_html(agent.id)}</div></div></div> `);
      if (agent.id === defaultAgentId) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold bg-accent-purple/20 text-accent-purple">default</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="flex-1 flex flex-col min-w-0 overflow-hidden">`);
    if (agents.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="md:hidden flex-shrink-0 p-3 border-b border-border-default bg-bg-secondary/30">`);
      $$renderer2.select(
        {
          value: selectedAgentId ?? "",
          onchange: (e) => selectAgent(e.currentTarget.value),
          class: "w-full px-3 py-2 text-sm rounded-lg border border-border-default bg-bg-tertiary text-text-primary focus:outline-none focus:border-accent-cyan"
        },
        ($$renderer3) => {
          $$renderer3.option({ value: "", disabled: true }, ($$renderer4) => {
            $$renderer4.push(`Select agent…`);
          });
          $$renderer3.push(`<!--[-->`);
          const each_array_1 = ensure_array_like(agents);
          for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
            let agent = each_array_1[$$index_1];
            $$renderer3.option({ value: agent.id }, ($$renderer4) => {
              $$renderer4.push(`${escape_html(agent.identity?.name ?? agent.name ?? agent.id)}
                ${escape_html(agent.id === defaultAgentId ? " (default)" : "")}`);
            });
          }
          $$renderer3.push(`<!--]-->`);
        }
      );
      $$renderer2.push(`</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (!selectedAgent()) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-1 flex items-center justify-center text-text-muted">Select an agent to view details</div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex-shrink-0 border-b border-border-default"><div class="px-4 md:px-6 pt-4 pb-3 flex items-center justify-between flex-wrap gap-2"><div class="flex items-center gap-3"><span class="text-2xl">${escape_html(resolveAgentEmoji(selectedAgent()))}</span> <div><h2 class="text-lg font-bold text-text-primary">${escape_html(agentContext()?.identityName ?? selectedAgent().id)}</h2> <p class="text-xs text-text-muted">Agent workspace and routing.</p></div></div> <div class="flex items-center gap-2 text-xs text-text-muted"><span class="font-mono">${escape_html(selectedAgent().id)}</span> `);
      if (agentContext()?.isDefault) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="px-1.5 py-0.5 rounded bg-accent-purple/20 text-accent-purple text-[10px] uppercase font-semibold">default</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></div> <div class="flex gap-0 px-4 md:px-6 overflow-x-auto"><!--[-->`);
      const each_array_2 = ensure_array_like(tabs);
      for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
        let tab = each_array_2[$$index_2];
        $$renderer2.push(`<button${attr_class(`px-4 py-2 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${stringify(activeTab === tab.key ? "border-accent-cyan text-accent-cyan bg-accent-cyan/5" : "border-transparent text-text-muted hover:text-text-secondary hover:border-border-default")}`)}>${escape_html(tab.label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div></div> <div class="flex-1 overflow-y-auto">`);
      if (activeTab === "overview") {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<div class="p-6 space-y-6"><div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Overview</h3> <p class="text-xs text-text-muted mb-4">Workspace paths and identity metadata.</p> <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"><div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Workspace</div> <div class="text-sm font-mono text-text-primary">${escape_html(agentContext()?.workspace)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Primary Model</div> <div class="text-sm font-mono text-text-primary">${escape_html(agentContext()?.model)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Identity Name</div> <div class="text-sm text-text-primary">${escape_html(agentContext()?.identityName)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Default</div> <div class="text-sm text-text-primary">${escape_html(agentContext()?.isDefault ? "yes" : "no")}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Identity Emoji</div> <div class="text-lg">${escape_html(agentContext()?.identityEmoji)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-1">Skills Filter</div> <div class="text-sm text-text-primary">${escape_html(agentContext()?.skillsLabel)}</div></div></div></div> <div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Model Selection</h3> <p class="text-xs text-text-muted mb-4">Primary model and fallback configuration.</p> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div><label class="block text-xs text-text-muted mb-1.5">Primary model (default)</label> `);
        $$renderer2.select(
          {
            value: modelPrimary,
            class: "w-full bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-cyan transition-all"
          },
          ($$renderer3) => {
            $$renderer3.option({ value: "" }, ($$renderer4) => {
              $$renderer4.push(`— select —`);
            });
            $$renderer3.push(`<!--[-->`);
            const each_array_3 = ensure_array_like(modelOptions);
            for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
              let opt = each_array_3[$$index_3];
              $$renderer3.option({ value: opt.value }, ($$renderer4) => {
                $$renderer4.push(`${escape_html(opt.label)}`);
              });
            }
            $$renderer3.push(`<!--]-->`);
            {
              $$renderer3.push("<!--[!-->");
            }
            $$renderer3.push(`<!--]-->`);
          }
        );
        $$renderer2.push(`</div> <div><label class="block text-xs text-text-muted mb-1.5">Fallbacks (comma-separated)</label> <input${attr("value", modelFallbacks)} placeholder="provider/model, provider/model" class="w-full bg-bg-input border border-border-default rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted/40 focus:outline-none focus:border-accent-cyan transition-all"/></div></div> <div class="flex justify-end gap-2 mt-4"><button${attr("disabled", configSaving, true)} class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-text-primary transition-all">Reload Config</button> <button${attr("disabled", configSaving, true)} class="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30 transition-all disabled:opacity-50">${escape_html("Save")}</button></div></div></div>`);
      } else if (activeTab === "files") {
        $$renderer2.push("<!--[1-->");
        $$renderer2.push(`<div class="flex-1 flex min-h-0 h-full"><div class="w-56 border-r border-border-default bg-bg-tertiary/30 overflow-y-auto flex-shrink-0"><div class="p-3 border-b border-border-default flex items-center justify-between"><span class="text-xs font-medium text-text-muted">Core Files</span> <button${attr("disabled", filesLoading, true)} class="text-[10px] text-text-muted hover:text-accent-cyan transition-all">${escape_html(filesLoading ? "..." : "↻")}</button></div> `);
        if (filesList?.workspace) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="px-3 py-1.5 text-[10px] font-mono text-text-muted/60 truncate border-b border-border-default/50">${escape_html(filesList.workspace)}</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> `);
        if (filesLoading) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="p-4 text-text-muted text-sm">Loading…</div>`);
        } else if (!filesList?.files?.length) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<div class="p-4 text-text-muted text-sm">No workspace files</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<!--[-->`);
          const each_array_4 = ensure_array_like(filesList.files);
          for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
            let file = each_array_4[$$index_4];
            $$renderer2.push(`<button${attr_class(`w-full text-left px-3 py-2 text-sm transition-all flex items-center gap-2 ${stringify(activeFile === file.name ? "bg-accent-cyan/10 text-accent-cyan" : "hover:bg-bg-hover text-text-secondary")}`)}><span class="text-xs">${escape_html(getFileIcon(file.name))}</span> <div class="min-w-0 flex-1"><div class="truncate font-mono text-xs">${escape_html(file.name)}</div> <div class="text-[10px] text-text-muted">${escape_html(file.missing ? "missing" : formatBytes(file.size))} `);
            if (file.updatedAtMs && !file.missing) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`· ${escape_html(formatRelativeTime(file.updatedAtMs))}`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div></div> `);
            if (file.missing) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="px-1 py-0.5 rounded text-[9px] bg-amber-500/20 text-amber-400">missing</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></button>`);
          }
          $$renderer2.push(`<!--]-->`);
        }
        $$renderer2.push(`<!--]--></div> <div class="flex-1 flex flex-col min-w-0">`);
        if (!activeFile) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="flex-1 flex items-center justify-center text-text-muted text-sm">Select a file to view or edit</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-secondary/30 flex-shrink-0"><div class="flex items-center gap-2"><span class="text-sm font-mono font-medium text-text-primary">${escape_html(activeFile)}</span> `);
          if (isDirty()) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<span class="w-2 h-2 rounded-full bg-accent-amber"></span>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--></div> <div class="flex items-center gap-2"><button${attr("disabled", !isDirty(), true)} class="px-2.5 py-1 rounded text-xs text-text-muted hover:text-text-primary transition-all disabled:opacity-30">Reset</button> <button${attr("disabled", !isDirty() || fileSaving, true)}${attr_class(`px-3 py-1 rounded text-xs transition-all ${stringify(isDirty() ? "bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/30 hover:bg-accent-cyan/30" : "bg-bg-tertiary text-text-muted cursor-not-allowed")}`)}>${escape_html("Save")}</button></div></div> <textarea class="flex-1 w-full p-4 bg-bg-primary text-text-primary font-mono text-sm resize-none focus:outline-none border-none" spellcheck="false">`);
          const $$body = escape_html(fileDraft);
          if ($$body) {
            $$renderer2.push(`${$$body}`);
          }
          $$renderer2.push(`</textarea>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else if (activeTab === "tools") {
        $$renderer2.push("<!--[2-->");
        $$renderer2.push(`<div class="p-6 space-y-4"><div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Tool Policy</h3> <p class="text-xs text-text-muted mb-4">Tool access configuration for this agent. `);
        if (selectedAgent()?.tools?.profile) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-accent-cyan/20 text-accent-cyan font-mono">profile: ${escape_html(selectedAgent().tools.profile)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></p> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"><!--[-->`);
        const each_array_5 = ensure_array_like(TOOL_SECTIONS);
        for (let $$index_6 = 0, $$length = each_array_5.length; $$index_6 < $$length; $$index_6++) {
          let section = each_array_5[$$index_6];
          $$renderer2.push(`<div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3"><div class="text-xs font-semibold text-text-primary mb-2 uppercase tracking-wider">${escape_html(section.label)}</div> <div class="space-y-1"><!--[-->`);
          const each_array_6 = ensure_array_like(section.tools);
          for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
            let tool = each_array_6[$$index_5];
            const status = isToolAllowed(tool);
            $$renderer2.push(`<div class="flex items-center justify-between py-1"><span class="text-xs font-mono text-text-secondary">${escape_html(tool)}</span> <span${attr_class(`text-[10px] px-1.5 py-0.5 rounded font-medium ${stringify(status === "allowed" ? "bg-accent-green/15 text-accent-green" : status === "denied" ? "bg-red-500/15 text-red-400" : "bg-bg-tertiary text-text-muted")}`)}>${escape_html(status)}</span></div>`);
          }
          $$renderer2.push(`<!--]--></div></div>`);
        }
        $$renderer2.push(`<!--]--></div></div></div>`);
      } else if (activeTab === "skills") {
        $$renderer2.push("<!--[3-->");
        $$renderer2.push(`<div class="p-6 space-y-4"><div class="glass rounded-xl border border-border-default p-5"><div class="flex items-center justify-between mb-4"><div><h3 class="text-sm font-semibold text-text-primary">Skills</h3> <p class="text-xs text-text-muted">Installed skills available to this agent.</p></div> <button${attr("disabled", skillsLoading, true)} class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-50">${escape_html("Refresh")}</button></div> `);
        if (skills.length === 0) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<div class="text-text-muted text-sm">No skills installed.</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"><!--[-->`);
          const each_array_7 = ensure_array_like(skills);
          for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
            let skill = each_array_7[$$index_7];
            $$renderer2.push(`<div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3"><div class="flex items-center gap-2 mb-1"><span class="text-xs">⚡</span> <span class="text-sm font-medium text-text-primary">${escape_html(skill.name)}</span> `);
            if (skill.bundled) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="px-1 py-0.5 rounded text-[9px] bg-accent-purple/20 text-accent-purple">bundled</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div> `);
            if (skill.source) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div class="text-[10px] text-text-muted font-mono truncate">${escape_html(skill.source)}</div>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else if (activeTab === "channels") {
        $$renderer2.push("<!--[4-->");
        $$renderer2.push(`<div class="p-6 space-y-4"><div class="grid grid-cols-1 lg:grid-cols-2 gap-4">`);
        if (agentContext()) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Agent Context</h3> <p class="text-xs text-text-muted mb-4">Workspace, identity, and model configuration.</p> <div class="grid grid-cols-2 gap-3"><div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Workspace</div> <div class="text-xs font-mono text-text-primary">${escape_html(agentContext().workspace)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Model</div> <div class="text-xs font-mono text-text-primary">${escape_html(agentContext().model)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Identity</div> <div class="text-xs font-mono text-text-primary">${escape_html(agentContext().identityName)}</div></div> <div><div class="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Default</div> <div class="text-xs font-mono text-text-primary">${escape_html(agentContext().isDefault ? "yes" : "no")}</div></div></div></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <div class="glass rounded-xl border border-border-default p-5"><div class="flex items-center justify-between mb-4"><div><h3 class="text-sm font-semibold text-text-primary">Channels</h3> <p class="text-xs text-text-muted">Gateway-wide channel status.</p></div> <button${attr("disabled", channelsLoading, true)} class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">${escape_html("Refresh")}</button></div> `);
        {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="text-text-muted text-sm">Load channels to see live status.</div>`);
        }
        $$renderer2.push(`<!--]--></div></div></div>`);
      } else if (activeTab === "cron") {
        $$renderer2.push("<!--[5-->");
        $$renderer2.push(`<div class="p-6 space-y-4"><div class="grid grid-cols-1 lg:grid-cols-2 gap-4">`);
        if (agentContext()) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Agent Context</h3> <p class="text-xs text-text-muted mb-3">Workspace and scheduling targets.</p> <div class="grid grid-cols-2 gap-3 text-xs"><div><span class="text-text-muted">Workspace</span> <div class="font-mono text-text-primary">${escape_html(agentContext().workspace)}</div></div> <div><span class="text-text-muted">Model</span> <div class="font-mono text-text-primary">${escape_html(agentContext().model)}</div></div></div></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <div class="glass rounded-xl border border-border-default p-5"><div class="flex items-center justify-between mb-3"><div><h3 class="text-sm font-semibold text-text-primary">Scheduler</h3> <p class="text-xs text-text-muted">Gateway cron status.</p></div> <button${attr("disabled", cronLoading, true)} class="px-3 py-1.5 rounded-lg text-xs border border-border-default text-text-secondary hover:text-accent-cyan transition-all disabled:opacity-50">${escape_html("Refresh")}</button></div> <div class="grid grid-cols-3 gap-4"><div class="text-center"><div class="text-lg font-bold text-text-primary">${escape_html("No")}</div> <div class="text-[10px] text-text-muted uppercase">Enabled</div></div> <div class="text-center"><div class="text-lg font-bold text-text-primary">${escape_html("-")}</div> <div class="text-[10px] text-text-muted uppercase">Jobs</div></div> <div class="text-center"><div class="text-lg font-bold text-text-primary">${escape_html("-")}</div> <div class="text-[10px] text-text-muted uppercase">Next Wake</div></div></div></div></div> <div class="glass rounded-xl border border-border-default p-5"><h3 class="text-sm font-semibold text-text-primary mb-1">Agent Cron Jobs</h3> <p class="text-xs text-text-muted mb-4">Scheduled jobs targeting this agent.</p> `);
        if (agentCronJobs().length === 0) {
          $$renderer2.push("<!--[1-->");
          $$renderer2.push(`<div class="text-text-muted text-sm">No jobs assigned to this agent.</div>`);
        } else {
          $$renderer2.push("<!--[!-->");
          $$renderer2.push(`<div class="space-y-2"><!--[-->`);
          const each_array_9 = ensure_array_like(agentCronJobs());
          for (let $$index_9 = 0, $$length = each_array_9.length; $$index_9 < $$length; $$index_9++) {
            let job = each_array_9[$$index_9];
            $$renderer2.push(`<div class="rounded-lg border border-border-default bg-bg-tertiary/30 p-3"><div class="flex items-center justify-between mb-1"><span class="text-sm font-medium text-text-primary">${escape_html(job.name || job.jobId || job.id)}</span> <span${attr_class(`px-1.5 py-0.5 rounded text-[10px] font-medium ${stringify(job.enabled !== false ? "bg-accent-green/15 text-accent-green" : "bg-amber-500/15 text-amber-400")}`)}>${escape_html(job.enabled !== false ? "enabled" : "disabled")}</span></div> <div class="flex items-center gap-2 text-[10px] text-text-muted"><span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">${escape_html(formatSchedule(job))}</span> `);
            if (job.sessionTarget) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">${escape_html(job.sessionTarget)}</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--> `);
            if (job.payload?.kind) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="px-1.5 py-0.5 rounded bg-bg-tertiary font-mono">${escape_html(job.payload.kind)}</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div></div>`);
          }
          $$renderer2.push(`<!--]--></div>`);
        }
        $$renderer2.push(`<!--]--></div></div>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div></div></div>`);
  });
}
export {
  _page as default
};
