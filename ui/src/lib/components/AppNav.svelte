<script lang="ts">
  import { page } from '$app/stores';
  import { getConnection } from '$lib/stores/connection.svelte';

  const conn = getConnection();

  type NavItem = {
    label: string;
    href: string;
    icon: string;
    badge?: () => string | null;
  };

  type NavGroup = {
    label: string;
    items: NavItem[];
  };

  const navGroups: NavGroup[] = [
    {
      label: 'Chat',
      items: [
        { label: 'Chat', href: '/', icon: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z' }
      ]
    },
    {
      label: 'Control',
      items: [
        { label: 'Overview', href: '/overview', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
        { label: 'Channels', href: '/channels', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101' },
        { label: 'Instances', href: '/instances', icon: 'M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728M12 12h.01' },
        { label: 'Sessions', href: '/sessions', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { label: 'Usage', href: '/usage', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { label: 'Cron Jobs', href: '/cron', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        { label: 'Approvals', href: '/approvals', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' }
      ]
    },
    {
      label: 'Agent',
      items: [
        { label: 'Agents', href: '/agents', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
        { label: 'Skills', href: '/skills', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
        { label: 'Nodes', href: '/nodes', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
        { label: 'Memory', href: '/memory', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' }
      ]
    },
    {
      label: 'Settings',
      items: [
        { label: 'Connection', href: '/settings', icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101' },
        { label: 'Gateway Config', href: '/config', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
        { label: 'Debug', href: '/debug', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
        { label: 'Logs', href: '/logs', icon: 'M4 6h16M4 12h16m-7 6h7' }
      ]
    }
  ];

  let {
    collapsed = $bindable(false),
    mobileOpen = $bindable(false),
    onshortcuthelp,
    onnavigate
  } = $props<{
    collapsed?: boolean;
    mobileOpen?: boolean;
    onshortcuthelp?: () => void;
    onnavigate?: () => void;
  }>();

  function isActive(href: string, currentPath: string): boolean {
    if (href === '/') return currentPath === '/';
    return currentPath.startsWith(href);
  }

  function handleLinkClick() {
    // On mobile, close the nav overlay when a link is clicked
    if (mobileOpen) {
      mobileOpen = false;
      onnavigate?.();
    }
  }
</script>

<!-- Mobile: hidden by default, shown as fixed overlay when mobileOpen is true -->
<!-- Desktop: always visible as sidebar -->
<nav
  aria-label="Main navigation"
  class="h-full flex flex-col border-r border-border-default bg-bg-secondary/80 transition-all duration-300
         max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-64 max-md:shadow-2xl
         max-md:transition-transform max-md:duration-300 max-md:ease-in-out"
  class:w-56={!collapsed}
  class:w-14={collapsed}
  class:max-md:translate-x-0={mobileOpen}
  class:max-md:-translate-x-full={!mobileOpen}
>
  <!-- Logo header -->
  <div class="flex items-center gap-2 p-3 border-b border-border-default">
    <!-- Mobile: always show expanded header with close button -->
    <div class="hidden max-md:flex items-center gap-2 w-full">
      <img src="/logo.png" alt="Cortex" class="w-8 h-8 rounded-lg" />
      <span class="text-base font-bold gradient-text tracking-wider">CORTEX</span>
      <button
        onclick={() => mobileOpen = false}
        class="ml-auto p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
        aria-label="Close navigation"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Desktop: normal collapsed/expanded behavior -->
    <div class="max-md:hidden flex items-center gap-2 w-full">
      {#if !collapsed}
        <img src="/logo.png" alt="Cortex" class="w-8 h-8 rounded-lg" />
        <span class="text-base font-bold gradient-text tracking-wider">CORTEX</span>
        <button
          onclick={() => collapsed = true}
          class="ml-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
          aria-label="Collapse navigation"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      {:else}
        <button
          onclick={() => collapsed = false}
          class="mx-auto p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors"
          aria-label="Expand navigation"
        >
          <img src="/logo.png" alt="Cortex" class="w-7 h-7 rounded-lg" />
        </button>
      {/if}
    </div>
  </div>

  <!-- Nav groups -->
  <div class="flex-1 overflow-y-auto py-2">
    {#each navGroups as group}
      {#if !collapsed}
        <div class="px-3 pt-3 pb-1">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-text-muted/60">
            {group.label}
          </span>
        </div>
      {:else}
        <!-- Desktop collapsed: divider; Mobile: always show label -->
        <div class="max-md:hidden pt-2 pb-1">
          <div class="mx-auto w-6 h-px bg-border-default"></div>
        </div>
        <div class="hidden max-md:block px-3 pt-3 pb-1">
          <span class="text-[10px] font-semibold uppercase tracking-widest text-text-muted/60">
            {group.label}
          </span>
        </div>
      {/if}

      {#each group.items as item}
        {@const active = isActive(item.href, $page.url.pathname)}
        <a
          href={item.href}
          aria-current={active ? 'page' : undefined}
          class="flex items-center gap-2.5 mx-2 my-0.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-200
                 max-md:py-2.5 max-md:text-base
                 {active 
                   ? 'gradient-bg glow-cyan text-accent-cyan font-medium' 
                   : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'}"
          class:md:justify-center={collapsed}
          title={collapsed ? item.label : undefined}
          onclick={handleLinkClick}
        >
          <svg class="w-4 h-4 max-md:w-5 max-md:h-5 flex-shrink-0 {active ? 'text-accent-cyan' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
          </svg>
          {#if !collapsed}
            <span>{item.label}</span>
          {:else}
            <!-- Desktop collapsed: hidden; Mobile: always show -->
            <span class="hidden max-md:inline">{item.label}</span>
          {/if}
        </a>
      {/each}
    {/each}
  </div>

  <!-- Shortcut help button + Connection status footer -->
  <div class="p-2 border-t border-border-default">
    <div class="flex justify-center mb-1">
      <button
        onclick={() => onshortcuthelp?.()}
        class="w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-mono font-semibold text-text-muted hover:text-accent-cyan hover:bg-bg-hover transition-colors"
        title="Keyboard shortcuts (Ctrl+/)"
        aria-label="Show keyboard shortcuts"
      >
        ?
      </button>
    </div>
  </div>
  <div class="p-2 border-t border-border-default" aria-live="polite" role="status">
    {#if !collapsed}
      <div class="flex items-center gap-2 px-2 py-1.5 text-xs">
        <span class="w-2 h-2 rounded-full flex-shrink-0
          {conn.state.status === 'connected' ? 'bg-accent-green glow-green' : 
           conn.state.status === 'connecting' || conn.state.status === 'authenticating' ? 'bg-amber-500 animate-pulse' : 
           'bg-red-500'}" aria-hidden="true"></span>
        <span class="text-text-muted truncate">
          {conn.state.status === 'connected' ? `v${conn.state.serverVersion ?? '?'}` : conn.state.status}
        </span>
      </div>
    {:else}
      <!-- Desktop collapsed: dot only -->
      <div class="max-md:hidden flex justify-center py-1">
        <span class="w-2.5 h-2.5 rounded-full
          {conn.state.status === 'connected' ? 'bg-accent-green glow-green' : 
           conn.state.status === 'connecting' || conn.state.status === 'authenticating' ? 'bg-amber-500 animate-pulse' : 
           'bg-red-500'}" aria-hidden="true"></span>
        <span class="sr-only">{conn.state.status}</span>
      </div>
      <!-- Mobile: always show expanded status -->
      <div class="hidden max-md:flex items-center gap-2 px-2 py-1.5 text-xs">
        <span class="w-2 h-2 rounded-full flex-shrink-0
          {conn.state.status === 'connected' ? 'bg-accent-green glow-green' : 
           conn.state.status === 'connecting' || conn.state.status === 'authenticating' ? 'bg-amber-500 animate-pulse' : 
           'bg-red-500'}" aria-hidden="true"></span>
        <span class="text-text-muted truncate">
          {conn.state.status === 'connected' ? `v${conn.state.serverVersion ?? '?'}` : conn.state.status}
        </span>
      </div>
    {/if}
  </div>
</nav>
