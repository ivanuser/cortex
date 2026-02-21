import { a as attr_class, s as stringify, c as escape_html, b as attr, j as derived } from "./index.js";
import { g as getConnection } from "./connection.svelte.js";
function ConnectionStatus($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    const statusConfig = {
      disconnected: { color: "bg-red-500", pulse: false, label: "Disconnected" },
      connecting: { color: "bg-amber-500", pulse: true, label: "Connecting..." },
      authenticating: {
        color: "bg-amber-500",
        pulse: true,
        label: "Authenticating..."
      },
      connected: { color: "bg-accent-green", pulse: false, label: "Connected" },
      error: { color: "bg-red-500", pulse: true, label: "Error" }
    };
    let config = derived(() => statusConfig[conn.state.status] ?? statusConfig.disconnected);
    let reconnectAttempts = 0;
    $$renderer2.push(`<div${attr_class(`flex items-center gap-2 px-3 py-1.5 rounded-lg glass text-xs transition-all duration-300 ${stringify(conn.state.status === "connected" ? "gradient-bg glow-green" : "")}`)}><div class="relative flex items-center"><span${attr_class(`block w-2 h-2 rounded-full ${stringify(config().color)} transition-colors duration-300 ${stringify(conn.state.status === "connected" ? "glow-green" : "")}`)}></span> `);
    if (config().pulse) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span${attr_class(`absolute block w-2 h-2 rounded-full ${stringify(config().color)} animate-ping opacity-75`)}></span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div> <span${attr_class(`text-text-secondary transition-colors duration-300 ${stringify(conn.state.status === "connected" ? "text-accent-green" : "")}`)}>${escape_html(config().label)}</span> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (conn.state.status === "connected") {
      $$renderer2.push("<!--[-->");
      if (conn.state.serverVersion) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="text-text-muted">v${escape_html(conn.state.serverVersion)}</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      if (conn.state.connId) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<span class="text-text-muted font-mono text-xs">${escape_html(conn.state.connId.substring(0, 8))}</span>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <button class="ml-2 p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-red transition-colors" title="Disconnect"><svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (conn.state.status === "error" && conn.state.error) {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<span class="text-red-400 truncate max-w-48"${attr("title", conn.state.error)}>${escape_html(conn.state.error)}</span>`);
    } else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> `);
    if ((conn.state.status === "error" || conn.state.status === "disconnected") && reconnectAttempts > 0) ;
    else {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  ConnectionStatus as C
};
