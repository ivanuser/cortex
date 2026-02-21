import { l as head, e as ensure_array_like, a as attr_class, k as attr_style, s as stringify, b as attr, c as escape_html } from "../../../chunks/index.js";
import { g as getConnection } from "../../../chunks/connection.svelte.js";
import { g as getTheme, A as ACCENT_COLORS } from "../../../chunks/theme.svelte.js";
import { C as ConnectionStatus } from "../../../chunks/ConnectionStatus.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    const conn = getConnection();
    const theme = getTheme();
    let url = conn.url || "";
    let token = conn.token || "";
    let userName = "";
    head("1i19ct2", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Settings — Cortex</title>`);
      });
    });
    $$renderer2.push(`<div class="h-full overflow-y-auto"><div class="max-w-2xl mx-auto px-4 md:px-6 py-6 md:py-8"><a href="/" class="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent-cyan transition-colors mb-8"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg> Back to Chat</a> <div class="flex items-center gap-4 mb-8"><img src="/logo.png" alt="Cortex" class="w-16 h-16 rounded-xl"/> <div><h1 class="text-2xl font-bold text-accent-cyan glow-text-cyan">Settings</h1> <p class="text-sm text-text-muted">Customize your Cortex experience</p></div></div> <div class="glass rounded-2xl p-6 space-y-6 mb-6"><h2 class="text-lg font-semibold text-text-primary flex items-center gap-2"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg> Appearance</h2> <div><label class="block text-sm font-medium text-text-secondary mb-3">Accent Color</label> <div class="flex flex-wrap gap-3"><!--[-->`);
    const each_array = ensure_array_like(ACCENT_COLORS);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let color = each_array[$$index];
      $$renderer2.push(`<button${attr_class("group relative w-12 h-12 rounded-xl transition-all duration-200 hover:scale-110", void 0, {
        "ring-2": theme.accentColor === color.value,
        "ring-offset-2": theme.accentColor === color.value,
        "ring-offset-bg-primary": theme.accentColor === color.value
      })}${attr_style(`background-color: ${stringify(color.value)}; ${stringify(theme.accentColor === color.value ? `ring-color: ${color.value}; box-shadow: 0 0 20px ${color.value}44, 0 0 40px ${color.value}22;` : "")}`)}${attr("title", color.name)}${attr("aria-label", `Set accent color to ${stringify(color.name)}`)}${attr("aria-pressed", theme.accentColor === color.value)}>`);
      if (theme.accentColor === color.value) {
        $$renderer2.push("<!--[-->");
        $$renderer2.push(`<svg class="w-5 h-5 absolute inset-0 m-auto text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>`);
      } else {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--> <span class="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">${escape_html(color.name)}</span></button>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="mt-4 flex items-center gap-3"><label for="custom-accent-color" class="text-sm text-text-muted">Custom:</label> <input id="custom-accent-color" type="color"${attr("value", theme.accentColor)} class="w-10 h-10 rounded-lg border border-border-default bg-bg-input cursor-pointer [&amp;::-webkit-color-swatch-wrapper]:p-1 [&amp;::-webkit-color-swatch]:rounded-md [&amp;::-webkit-color-swatch]:border-none [&amp;::-moz-color-swatch]:rounded-md [&amp;::-moz-color-swatch]:border-none"/> <span class="text-sm font-mono text-text-muted">${escape_html(theme.accentColor)}</span></div></div> <div class="border-t border-border-default pt-4"><p class="text-sm text-text-muted mb-3">Preview</p> <div class="flex flex-wrap items-center gap-3"><span class="text-accent-cyan font-medium">Accent text</span> <button class="px-3 py-1.5 rounded-lg text-sm bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan glow-cyan">Button</button> <span class="inline-block w-3 h-3 rounded-full bg-accent-cyan glow-cyan"></span> <span class="text-sm text-text-secondary">Link: <a href="#preview" class="text-accent-cyan hover:underline">example</a></span> <code class="text-sm font-mono px-2 py-0.5 rounded"${attr_style(`background: color-mix(in srgb, ${stringify(theme.accentColor)} 8%, transparent); border: 1px solid color-mix(in srgb, ${stringify(theme.accentColor)} 15%, transparent); color: ${stringify(theme.accentColor)};`)}>code</code></div></div></div> <div class="glass rounded-2xl p-6 space-y-6 mb-6"><h2 class="text-lg font-semibold text-text-primary flex items-center gap-2"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg> Profile</h2> <div class="flex flex-col sm:flex-row items-start gap-6"><div class="flex flex-col items-center gap-3"><div class="relative group">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<div class="w-24 h-24 rounded-full bg-accent-cyan/10 border-2 border-dashed border-accent-cyan/30 flex items-center justify-center"><svg class="w-10 h-10 text-accent-cyan/40" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg></div>`);
    }
    $$renderer2.push(`<!--]--></div> <button class="px-3 py-1.5 rounded-lg text-xs font-medium border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/10 transition-all">${escape_html("Upload Photo")}</button> <input type="file" accept="image/*" class="hidden"/> <p class="text-[10px] text-text-muted">Max 2MB · Stored in browser</p></div> <div class="flex-1 w-full"><label for="user-name" class="block text-sm font-medium text-text-secondary mb-2">Display Name</label> <div class="flex gap-2"><input id="user-name" type="text"${attr("value", userName)} placeholder="Your name" class="flex-1 px-3 py-2 rounded-lg border border-border-default bg-bg-input text-sm text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-cyan/50"/> <button class="px-3 py-2 rounded-lg text-sm font-medium bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 transition-all">Save</button></div> <p class="text-xs text-text-muted mt-1.5">Shown next to your messages in chat</p></div></div></div> <div class="glass rounded-2xl p-6 space-y-6 mb-6"><h2 class="text-lg font-semibold text-text-primary flex items-center gap-2"><svg class="w-5 h-5 text-accent-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg> Notifications</h2> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<p class="text-sm text-text-muted">Your browser does not support notifications.</p>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="mb-6">`);
    ConnectionStatus($$renderer2);
    $$renderer2.push(`<!----></div> <div class="glass rounded-2xl p-6 space-y-6 mb-6"><h2 class="text-lg font-semibold text-text-primary flex items-center gap-2"><svg class="w-5 h-5 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"></path></svg> Gateway Connection</h2> <div><label for="gateway-url" class="block text-sm font-medium text-text-secondary mb-2">Gateway WebSocket URL</label> <input id="gateway-url" type="text"${attr("value", url)} placeholder="ws://192.168.1.242:18789 or wss://openclaw.honercloud.com" class="w-full px-4 py-3 rounded-xl bg-bg-input border border-border-default text-text-primary placeholder:text-text-muted text-sm font-mono focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all"/> <p class="text-xs text-text-muted mt-1.5">Use <code class="text-accent-cyan">ws://</code> for local, <code class="text-accent-cyan">wss://</code> for TLS</p></div> <div><label for="gateway-token" class="block text-sm font-medium text-text-secondary mb-2">Auth Token</label> <div class="relative"><input id="gateway-token"${attr("type", "password")}${attr("value", token)} placeholder="Gateway authentication token" class="w-full px-4 py-3 pr-12 rounded-xl bg-bg-input border border-border-default text-text-primary placeholder:text-text-muted text-sm font-mono focus:outline-none focus:border-accent-cyan/50 focus:ring-1 focus:ring-accent-cyan/20 transition-all"/> <button class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors" type="button"${attr("aria-label", "Show token")}>`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>`);
    }
    $$renderer2.push(`<!--]--></button></div> <p class="text-xs text-text-muted mt-1.5">Find this in <code class="text-accent-cyan">~/.openclaw/openclaw.json</code> → <code class="text-accent-cyan">gateway.auth.token</code></p></div> <div class="flex items-center gap-3 pt-2"><button class="px-5 py-2.5 rounded-xl text-sm font-medium bg-accent-cyan/20 border border-accent-cyan/30 text-accent-cyan hover:bg-accent-cyan/30 transition-all glow-cyan">${escape_html("Save Settings")}</button> `);
    if (conn.state.status === "connected") {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<button class="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all">Disconnect</button>`);
    } else {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<button${attr("disabled", !url || !token, true)}${attr_class(`px-5 py-2.5 rounded-xl text-sm font-medium ${stringify(url && token ? "bg-accent-purple/20 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/30 glow-purple" : "bg-bg-tertiary border border-border-default text-text-muted cursor-not-allowed opacity-50")} transition-all`)}>Connect</button>`);
    }
    $$renderer2.push(`<!--]--></div></div> <div class="glass rounded-2xl p-6"><h2 class="text-lg font-semibold text-text-primary mb-4">About Cortex</h2> <div class="space-y-3 text-sm text-text-secondary"><p><strong class="text-text-primary">Version:</strong> 1.0.0</p> <p><strong class="text-text-primary">Protocol:</strong> OpenClaw Gateway WS v3</p> <p><strong class="text-text-primary">Source:</strong> <a href="https://gitlab.honercloud.com/llm/cortex" target="_blank" rel="noopener" class="text-accent-cyan hover:underline">gitlab.honercloud.com/llm/cortex</a></p> <p class="text-text-muted text-xs mt-4">Cortex is a cyberpunk command center for OpenClaw — connecting directly to the Gateway WebSocket
          for real-time chat, session management, and system control.</p></div></div></div></div>`);
  });
}
export {
  _page as default
};
