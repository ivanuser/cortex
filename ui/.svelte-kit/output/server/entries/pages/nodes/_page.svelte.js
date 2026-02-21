import { l as head, b as attr, a as attr_class, c as escape_html, e as ensure_array_like, s as stringify, j as derived } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
import { f as formatRelativeTime } from "../../../chunks/time.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    let nodes = [];
    let pendingNodes = [];
    let viewMode = "grid";
    let expandedNodeId = null;
    let searchQuery = "";
    let approvingId = null;
    let rejectingId = null;
    let pendingDevices = [];
    let deviceApprovingId = null;
    let deviceRejectingId = null;
    const capIcons = {
      camera: {
        icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
        color: "text-accent-pink",
        label: "Camera",
        description: "Capture photos and video from device cameras"
      },
      screen: {
        icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
        color: "text-accent-purple",
        label: "Screen",
        description: "Screen capture and recording"
      },
      browser: {
        icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
        color: "text-accent-cyan",
        label: "Browser",
        description: "Web browser automation and control"
      },
      system: {
        icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
        color: "text-accent-green",
        label: "System/Exec",
        description: "Execute shell commands and system operations"
      },
      location: {
        icon: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
        color: "text-accent-amber",
        label: "Location",
        description: "GPS and location services"
      },
      canvas: {
        icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
        color: "text-accent-cyan",
        label: "Canvas",
        description: "Visual canvas rendering and UI display"
      }
    };
    let filteredNodes = derived(() => {
      if (!searchQuery.trim()) return nodes;
      const q = searchQuery.toLowerCase();
      return nodes.filter((n) => {
        const name = String(n.displayName || n.nodeId || "").toLowerCase();
        const ip = String(n.remoteIp || "").toLowerCase();
        return name.includes(q) || ip.includes(q);
      });
    });
    let stats = derived(() => {
      const total = nodes.length;
      const online = nodes.filter((n) => Boolean(n.connected)).length;
      const offline = total - online;
      const allCaps = /* @__PURE__ */ new Set();
      for (const n of nodes) {
        const caps = Array.isArray(n.caps) ? n.caps : [];
        for (const c of caps) allCaps.add(String(c));
      }
      return { total, online, offline, capabilities: allCaps.size };
    });
    let selectedNode = derived(() => {
      return null;
    });
    function getNodeStatus(node) {
      if (Boolean(node.connected)) return "online";
      const lastSeen = node.lastSeen ?? node.lastSeenMs;
      if (typeof lastSeen === "number" && lastSeen > 0) {
        const fiveMin = 5 * 60 * 1e3;
        if (Date.now() - lastSeen < fiveMin) return "stale";
      }
      return "offline";
    }
    function getStatusColor(status) {
      switch (status) {
        case "online":
          return "bg-accent-green";
        case "stale":
          return "bg-accent-amber";
        default:
          return "bg-red-500";
      }
    }
    function getStatusGlow(status) {
      switch (status) {
        case "online":
          return "glow-green";
        case "stale":
          return "glow-amber";
        default:
          return "";
      }
    }
    function getStatusBorderColor(status) {
      switch (status) {
        case "online":
          return "border-accent-green/30";
        case "stale":
          return "border-accent-amber/30";
        default:
          return "border-border-default";
      }
    }
    function getNodeCaps(node) {
      return Array.isArray(node.caps) ? node.caps.map(String) : [];
    }
    function getNodeCommands(node) {
      return Array.isArray(node.commands) ? node.commands.map(String) : [];
    }
    function formatLastSeen(node) {
      const ts = node.lastSeen ?? node.lastSeenMs;
      if (typeof ts === "number" && ts > 0) return formatRelativeTime(ts);
      if (Boolean(node.connected)) return "now";
      return "unknown";
    }
    function formatConnectionDuration(node) {
      const connectedAt = node.connectedAt ?? node.connectedAtMs;
      if (typeof connectedAt !== "number" || connectedAt <= 0) return "—";
      const durationMs = Date.now() - connectedAt;
      const seconds = Math.floor(durationMs / 1e3);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      if (days > 0) return `${days}d ${hours % 24}h`;
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
      return `${seconds}s`;
    }
    function formatAbsoluteTime(ts) {
      if (typeof ts !== "number" || ts <= 0) return "—";
      return new Date(ts).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    head("1urd2h6", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Node Fleet — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full flex flex-col overflow-hidden"><div class="flex-shrink-0 p-4 md:p-6 pb-4 border-b border-border-default"><div class="flex items-start justify-between gap-4 flex-wrap"><div><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl gradient-bg border border-border-glow flex items-center justify-center flex-shrink-0"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div> <div><h1 class="text-xl font-bold text-text-primary glow-text-cyan">Node Fleet</h1> <p class="text-sm text-text-muted">Paired devices, capabilities, and command exposure</p></div></div></div> <div class="flex items-center gap-2"><div class="relative"><svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg> <input type="text" placeholder="Search nodes..."${attr("value", searchQuery)} class="pl-9 pr-3 py-1.5 text-sm bg-bg-input border border-border-default rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 w-48 transition-all"/></div> <div class="flex items-center bg-bg-tertiary rounded-lg border border-border-default p-0.5"><button${attr_class(`p-1.5 rounded-md transition-all ${stringify(
      "bg-bg-hover text-accent-cyan"
    )}`)} title="Grid view"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg></button> <button${attr_class(`p-1.5 rounded-md transition-all ${stringify("text-text-muted hover:text-text-primary")}`)} title="List view"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg></button></div> <button class="flex items-center gap-1.5 px-3 py-1.5 text-sm gradient-bg border border-border-glow rounded-lg text-text-primary hover:brightness-110 transition-all"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg> Add Node</button> <button${attr("disabled", conn.state.status !== "connected", true)} class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-bg-tertiary border border-border-default rounded-lg text-text-secondary hover:text-accent-cyan hover:border-accent-cyan/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"><svg${attr_class(`w-4 h-4 ${stringify("")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> ${escape_html("Refresh")}</button></div></div> `);
    if (nodes.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex items-center gap-4 mt-4"><div class="flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-accent-cyan"></span> <span class="text-text-muted">Total</span> <span class="text-text-primary font-mono font-semibold">${escape_html(stats().total)}</span></div> <div class="flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-accent-green glow-pulse"></span> <span class="text-text-muted">Online</span> <span class="text-accent-green font-mono font-semibold">${escape_html(stats().online)}</span></div> <div class="flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-red-500"></span> <span class="text-text-muted">Offline</span> <span class="text-text-secondary font-mono font-semibold">${escape_html(stats().offline)}</span></div> <div class="flex items-center gap-1.5 text-xs"><span class="w-2 h-2 rounded-full bg-accent-purple"></span> <span class="text-text-muted">Capabilities</span> <span class="text-text-secondary font-mono font-semibold">${escape_html(stats().capabilities)}</span></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (pendingNodes.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-shrink-0 mx-4 md:mx-6 mt-4"><div class="p-4 rounded-xl border border-accent-amber/30 bg-accent-amber/5 animate-pulse-slow"><div class="flex items-center gap-2 mb-3"><svg class="w-5 h-5 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <h3 class="text-sm font-semibold text-accent-amber">${escape_html(pendingNodes.length)} Pending Pairing Request${escape_html(pendingNodes.length > 1 ? "s" : "")}</h3></div> <div class="space-y-2"><!--[-->`);
      const each_array = ensure_array_like(pendingNodes);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let req = each_array[$$index];
        const reqId = String(req.requestId ?? req.id ?? "");
        const name = String(req.displayName ?? req.nodeId ?? "Unknown");
        const ip = String(req.ip ?? req.address ?? "");
        $$renderer2.push(`<div class="flex items-center justify-between p-3 rounded-lg bg-bg-primary/50 border border-border-default"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-accent-amber/20 flex items-center justify-center"><svg class="w-4 h-4 text-accent-amber" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div> <div><p class="text-sm font-medium text-text-primary">${escape_html(name)}</p> `);
        if (ip) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-xs text-text-muted">${escape_html(ip)}</p>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div> <div class="flex items-center gap-2"><button${attr("disabled", approvingId === reqId, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50">${escape_html(approvingId === reqId ? "Approving…" : "✓ Approve")}</button> <button${attr("disabled", rejectingId === reqId, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50">${escape_html(rejectingId === reqId ? "Rejecting…" : "✗ Reject")}</button></div></div>`);
      }
      $$renderer2.push(`<!--]--></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (pendingDevices.length > 0) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex-shrink-0 mx-4 md:mx-6 mt-4"><div class="p-4 rounded-xl border border-accent-cyan/30 bg-accent-cyan/5 animate-pulse-slow"><div class="flex items-center gap-2 mb-3"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg> <h3 class="text-sm font-semibold text-accent-cyan">${escape_html(pendingDevices.length)} Pending Device Pairing${escape_html(pendingDevices.length > 1 ? "s" : "")}</h3></div> <div class="space-y-2"><!--[-->`);
      const each_array_1 = ensure_array_like(pendingDevices);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let req = each_array_1[$$index_1];
        const reqId = String(req.requestId ?? req.id ?? "");
        const name = String(req.displayName ?? "Web Client");
        const ip = String(req.remoteIp ?? req.ip ?? "");
        const role = String(req.role ?? "operator");
        $$renderer2.push(`<div class="flex items-center justify-between p-3 rounded-lg bg-bg-primary/50 border border-border-default"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-lg bg-accent-cyan/20 flex items-center justify-center"><svg class="w-4 h-4 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg></div> <div><p class="text-sm font-medium text-text-primary">${escape_html(name)}</p> <p class="text-xs text-text-muted">${escape_html(role)}`);
        if (ip) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`· ${escape_html(ip)}`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></p></div></div> <div class="flex items-center gap-2"><button${attr("disabled", deviceApprovingId === reqId, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30 transition-colors disabled:opacity-50">${escape_html(deviceApprovingId === reqId ? "Approving…" : "✓ Approve")}</button> <button${attr("disabled", deviceRejectingId === reqId, true)} class="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-red/20 text-accent-red border border-accent-red/30 hover:bg-accent-red/30 transition-colors disabled:opacity-50">${escape_html(deviceRejectingId === reqId ? "Rejecting…" : "✗ Reject")}</button></div></div>`);
      }
      $$renderer2.push(`<!--]--></div></div></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <div class="flex-1 overflow-y-auto p-4 md:p-6">`);
    if (conn.state.status !== "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-full text-center"><div class="w-16 h-16 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 9.9a9 9 0 01-4.242-1.757"></path></svg></div> <p class="text-text-muted text-sm">Connect to the gateway to view the node fleet.</p></div>`);
    } else if (filteredNodes().length === 0) {
      $$renderer2.push("<!--[3-->");
      $$renderer2.push(`<div class="flex flex-col items-center justify-center h-64 text-center"><div class="w-14 h-14 rounded-2xl bg-bg-tertiary border border-border-default flex items-center justify-center mb-4"><svg class="w-7 h-7 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg></div> `);
      if (searchQuery.trim()) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<p class="text-text-muted text-sm">No nodes matching "<span class="text-accent-cyan">${escape_html(searchQuery)}</span>"</p>`);
      } else {
        $$renderer2.push("<!--[!-->");
        $$renderer2.push(`<p class="text-text-muted text-sm">No nodes found. Pair a device to get started.</p>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="flex flex-col gap-4"><div${attr_class(
        "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
      )}><!--[-->`);
      const each_array_3 = ensure_array_like(filteredNodes());
      for (let $$index_7 = 0, $$length = each_array_3.length; $$index_7 < $$length; $$index_7++) {
        let node = each_array_3[$$index_7];
        const nodeId = String(node.nodeId ?? node.id ?? "");
        const status = getNodeStatus(node);
        const isExpanded = expandedNodeId === nodeId;
        const displayName = typeof node.displayName === "string" && node.displayName.trim() || nodeId;
        const caps = getNodeCaps(node);
        const commands = getNodeCommands(node);
        $$renderer2.push(`<div${attr_class(isExpanded && viewMode === "grid" ? "col-span-full" : "")}><button${attr_class(`w-full text-left glass rounded-xl border transition-all duration-300 cursor-pointer ${stringify(isExpanded ? "border-accent-cyan/40 " + getStatusGlow(status) : getStatusBorderColor(status) + " hover:border-accent-cyan/20")} hover:bg-bg-hover/50 animate-fade-in`)}><div${attr_class(`p-4 ${stringify("")}`)}><div${attr_class(`flex items-center gap-3 ${stringify("mb-3")}`)}><div class="relative"><span${attr_class(`block w-3 h-3 rounded-full ${stringify(getStatusColor(status))} ${stringify(status === "online" ? "glow-pulse" : "")}`)}></span> `);
        if (status === "online") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span${attr_class(`absolute inset-0 w-3 h-3 rounded-full ${stringify(getStatusColor(status))} animate-ping opacity-30`)}></span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="min-w-0"><h3${attr_class(`text-sm font-semibold text-text-primary truncate ${stringify(status === "online" ? "glow-text-cyan" : "")}`)}>${escape_html(displayName)}</h3> `);
        {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<p class="text-xs text-text-muted truncate font-mono mt-0.5">${escape_html(nodeId.length > 16 ? nodeId.slice(0, 16) + "…" : nodeId)}</p>`);
        }
        $$renderer2.push(`<!--]--></div> <span${attr_class(`ml-auto text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${stringify(status === "online" ? "bg-accent-green/15 text-accent-green border border-accent-green/20" : status === "stale" ? "bg-accent-amber/15 text-accent-amber border border-accent-amber/20" : "bg-red-500/10 text-red-400 border border-red-500/20")}`)}>${escape_html(status)}</span></div> <div${attr_class("")}><div${attr_class("flex items-center gap-3 text-xs text-text-muted mb-3")}>`);
        if (typeof node.remoteIp === "string") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="flex items-center gap-1 font-mono"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9"></path></svg> ${escape_html(node.remoteIp)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--> <span class="flex items-center gap-1"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> ${escape_html(formatLastSeen(node))}</span> `);
        if (typeof node.version === "string") {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="font-mono">v${escape_html(node.version)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div> <div class="flex flex-wrap gap-1.5"><!--[-->`);
        const each_array_4 = ensure_array_like(caps.slice(0, 8));
        for (let $$index_3 = 0, $$length2 = each_array_4.length; $$index_3 < $$length2; $$index_3++) {
          let cap = each_array_4[$$index_3];
          const capInfo = capIcons[cap];
          $$renderer2.push(`<span${attr_class(`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary border border-border-default ${stringify(capInfo?.color ?? "text-text-secondary")} hover:border-accent-cyan/30 transition-colors`)}>`);
          if (capInfo) {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"${attr("d", capInfo.icon)}></path></svg>`);
          } else {
            $$renderer2.push("<!--[!-->");
          }
          $$renderer2.push(`<!--]--> ${escape_html(cap)}</span>`);
        }
        $$renderer2.push(`<!--]--> `);
        if (caps.length > 8) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<span class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary border border-border-default text-text-muted">+${escape_html(caps.length - 8)}</span>`);
        } else {
          $$renderer2.push("<!--[!-->");
        }
        $$renderer2.push(`<!--]--></div></div> <div${attr_class("mt-3 flex justify-center")}><svg${attr_class(`w-4 h-4 text-text-muted transition-transform duration-200 ${stringify(isExpanded ? "rotate-180" : "")}`)} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></div></div></button> `);
        if (isExpanded && selectedNode()) {
          $$renderer2.push("<!--[-->");
          $$renderer2.push(`<div class="mt-2 rounded-xl border border-accent-cyan/20 bg-bg-secondary/80 overflow-hidden animate-slide-in-up"><div class="flex border-b border-border-default bg-bg-tertiary/50"><button${attr_class(`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${stringify(
            "text-accent-cyan border-accent-cyan"
          )}`)}><span class="flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> Details</span></button> <button${attr_class(`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${stringify("text-text-muted border-transparent hover:text-text-primary hover:border-accent-purple/30")}`)}><span class="flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg> Invoke</span></button> <button${attr_class(`px-4 py-2.5 text-sm font-medium transition-all border-b-2 ${stringify("text-text-muted border-transparent hover:text-text-primary hover:border-accent-green/30")}`)}><span class="flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg> Exec Allowlist</span></button></div> <div class="p-5">`);
          {
            $$renderer2.push("<!--[-->");
            $$renderer2.push(`<div class="space-y-5"><div><h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">System Information</h4> <div class="grid grid-cols-2 md:grid-cols-4 gap-3"><div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Node ID</span> <span class="text-xs text-text-primary font-mono break-all">${escape_html(nodeId)}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">IP Address</span> <span class="text-xs text-text-primary font-mono">${escape_html(typeof selectedNode().remoteIp === "string" ? selectedNode().remoteIp : "—")}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Version</span> <span class="text-xs text-text-primary font-mono">${escape_html(typeof selectedNode().version === "string" ? "v" + selectedNode().version : "—")}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Platform</span> <span class="text-xs text-text-primary font-mono">${escape_html(typeof selectedNode().platform === "string" ? selectedNode().platform : typeof selectedNode().os === "string" ? selectedNode().os : "—")}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Paired</span> <span${attr_class(`text-xs ${stringify(Boolean(selectedNode().paired) ? "text-accent-green" : "text-red-400")}`)}>${escape_html(Boolean(selectedNode().paired) ? "✓ Yes" : "✗ No")}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Connected</span> <span${attr_class(`text-xs ${stringify(Boolean(selectedNode().connected) ? "text-accent-green" : "text-red-400")}`)}>${escape_html(Boolean(selectedNode().connected) ? "✓ Online" : "✗ Offline")}</span></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Last Seen</span> <span class="text-xs text-text-primary">${escape_html(formatLastSeen(selectedNode()))}</span> `);
            if (typeof (selectedNode().lastSeen ?? selectedNode().lastSeenMs) === "number") {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<span class="text-[10px] text-text-muted block mt-0.5">${escape_html(formatAbsoluteTime(selectedNode().lastSeen ?? selectedNode().lastSeenMs))}</span>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div> <div class="rounded-lg border border-border-default bg-bg-primary/50 p-3"><span class="text-[10px] uppercase tracking-wider text-text-muted block mb-1">Uptime</span> <span class="text-xs text-text-primary">${escape_html(formatConnectionDuration(selectedNode()))}</span></div></div></div> `);
            if (caps.length > 0) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div><h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Capabilities</h4> <div class="grid grid-cols-1 md:grid-cols-2 gap-2"><!--[-->`);
              const each_array_5 = ensure_array_like(caps);
              for (let $$index_4 = 0, $$length2 = each_array_5.length; $$index_4 < $$length2; $$index_4++) {
                let cap = each_array_5[$$index_4];
                const capInfo = capIcons[cap];
                $$renderer2.push(`<div class="flex items-start gap-3 rounded-lg border border-border-default bg-bg-primary/50 p-3"><div${attr_class(`w-8 h-8 rounded-lg bg-bg-tertiary border border-border-default flex items-center justify-center flex-shrink-0 ${stringify(capInfo?.color ?? "text-text-secondary")}`)}>`);
                if (capInfo) {
                  $$renderer2.push("<!--[-->");
                  $$renderer2.push(`<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"${attr("d", capInfo.icon)}></path></svg>`);
                } else {
                  $$renderer2.push("<!--[!-->");
                  $$renderer2.push(`<span class="text-xs">⚡</span>`);
                }
                $$renderer2.push(`<!--]--></div> <div class="min-w-0"><span class="text-sm font-medium text-text-primary">${escape_html(capInfo?.label ?? cap)}</span> <p class="text-xs text-text-muted mt-0.5">${escape_html(capInfo?.description ?? `Provides ${cap} capability`)}</p></div></div>`);
              }
              $$renderer2.push(`<!--]--></div></div>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--> `);
            if (commands.length > 0) {
              $$renderer2.push("<!--[-->");
              $$renderer2.push(`<div><h4 class="text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">Registered Commands</h4> <div class="flex flex-wrap gap-2"><!--[-->`);
              const each_array_6 = ensure_array_like(commands);
              for (let $$index_5 = 0, $$length2 = each_array_6.length; $$index_5 < $$length2; $$index_5++) {
                let cmd = each_array_6[$$index_5];
                $$renderer2.push(`<span class="px-3 py-1.5 rounded-lg text-xs font-mono bg-accent-purple/10 text-accent-purple border border-accent-purple/20 hover:bg-accent-purple/20 transition-colors">${escape_html(cmd)}</span>`);
              }
              $$renderer2.push(`<!--]--></div></div>`);
            } else {
              $$renderer2.push("<!--[!-->");
            }
            $$renderer2.push(`<!--]--></div>`);
          }
          $$renderer2.push(`<!--]--></div></div>`);
        } else {
          $$renderer2.push("<!--[!-->");
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
