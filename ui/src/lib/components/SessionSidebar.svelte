<script lang="ts">
  import { getSessions } from '$lib/stores/sessions.svelte';
  import { getMessages } from '$lib/stores/messages.svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getToasts } from '$lib/stores/toasts.svelte';
  import { gateway, type Session } from '$lib/gateway';
  import ConnectionStatus from './ConnectionStatus.svelte';

  const sessions = getSessions();
  const msgs = getMessages();
  const conn = getConnection();
  const toasts = getToasts();

  let { 
    collapsed = $bindable(false),
    mobileOpen = $bindable(false),
    onMobileSessionSelect
  } = $props<{
    collapsed?: boolean;
    mobileOpen?: boolean;
    onMobileSessionSelect?: (key: string) => void;
  }>();

  // Search and filter state
  let searchQuery = $state('');
  let activeFilter = $state<'all' | 'main' | 'isolated' | 'subagent'>('all');
  let isCreatingSession = $state(false);

  // Filtered sessions list
  let filteredSessions = $derived.by(() => {
    let filtered = sessions.list;

    // Apply text search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((session: Session) => {
        const title = sessions.getSessionTitle(session).toLowerCase();
        const key = session.key.toLowerCase();
        const lastMessage = session.lastMessage?.toLowerCase() || '';
        return title.includes(query) || key.includes(query) || lastMessage.includes(query);
      });
    }

    // Apply type filter
    if (activeFilter !== 'all') {
      filtered = filtered.filter((session: Session) => {
        if (activeFilter === 'main') {
          return session.key === sessions.mainKey || session.key.includes(':main');
        } else if (activeFilter === 'isolated') {
          return !session.key.includes(':main') && !session.key.includes(':subagent:');
        } else if (activeFilter === 'subagent') {
          return session.key.includes(':subagent:');
        }
        return true;
      });
    }

    return filtered;
  });

  function selectSession(key: string) {
    sessions.setActiveSession(key);
    msgs.loadHistory(key);
    // On mobile, also trigger the mobile-specific handler
    onMobileSessionSelect?.(key);
  }

  function formatTime(ts?: number | string): string {
    if (!ts) return '';
    const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function truncate(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max) + '…';
  }

  function getSessionType(session: Session): 'main' | 'isolated' | 'subagent' {
    if (session.key === sessions.mainKey || session.key.includes(':main')) {
      return 'main';
    } else if (session.key.includes(':subagent:')) {
      return 'subagent';
    }
    return 'isolated';
  }

  function getChannelBadgeColor(channel?: string): string {
    if (!channel) return 'bg-bg-tertiary text-text-muted';
    switch (channel.toLowerCase()) {
      case 'discord': return 'bg-purple-500/20 text-purple-300';
      case 'telegram': return 'bg-blue-500/20 text-blue-300';
      case 'whatsapp': return 'bg-green-500/20 text-green-300';
      case 'webchat': return 'bg-cyan-500/20 text-cyan-300';
      default: return 'bg-bg-tertiary text-text-muted';
    }
  }

  function getSessionTypeIcon(type: 'main' | 'isolated' | 'subagent'): string {
    switch (type) {
      case 'main': return 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'; // Star
      case 'isolated': return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z'; // Circle
      case 'subagent': return 'M12 2l2 7h7l-5.5 4L17 20l-5-3.5L7 20l1.5-7L3 9h7l2-7z'; // Branch/tree
    }
  }

  async function createNewSession() {
    if (!gateway.connected || isCreatingSession) return;
    
    isCreatingSession = true;
    try {
      // Try to create a new isolated session
      const sessionKey = `agent:main:isolated:${crypto.randomUUID()}`;
      
      // Use chat.send to implicitly create the session
      await gateway.chatSend(sessionKey, 'Hello! This is a new isolated session.');
      
      // Refresh sessions list and switch to the new session
      await sessions.fetchSessions();
      sessions.setActiveSession(sessionKey);
      msgs.loadHistory(sessionKey);
      
      toasts.success('Session Created', 'New isolated session created successfully');
    } catch (error) {
      console.error('Failed to create session:', error);
      toasts.error('Failed to Create Session', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      isCreatingSession = false;
    }
  }
</script>

<aside
  class="h-full flex flex-col border-r border-border-default bg-bg-secondary transition-all duration-300 overflow-hidden
         md:relative md:translate-x-0
         fixed left-0 top-0 z-50 w-72
         md:z-auto"
  class:md:w-72={!collapsed}
  class:md:w-0={collapsed}
  class:-translate-x-full={!mobileOpen}
  class:translate-x-0={mobileOpen}
>
  {#if !collapsed}
    <!-- Header with logo -->
    <div class="flex items-center gap-3 p-4 border-b border-border-default">
      <img src="/logo.png" alt="Cortex" class="w-10 h-10 rounded-lg" />
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-semibold gradient-text tracking-wide">CORTEX</h1>
      </div>
      
      <!-- Mobile close button -->
      <button
        onclick={() => mobileOpen = false}
        class="p-2 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors md:hidden min-h-11"
        aria-label="Close sidebar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      <!-- Desktop collapse button -->
      <button
        onclick={() => collapsed = true}
        class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors hidden md:block"
        aria-label="Collapse sidebar"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>
    </div>

    <!-- Connection status -->
    <div class="px-3 py-2 border-b border-border-default">
      <ConnectionStatus />
    </div>

    <!-- Search and filters -->
    <div class="p-3 space-y-2 border-b border-border-default">
      <!-- Search input -->
      <div class="relative">
        <label for="session-search" class="sr-only">Search sessions</label>
        <input
          id="session-search"
          type="text"
          bind:value={searchQuery}
          placeholder="Search sessions..."
          class="w-full pl-8 pr-3 py-2 text-sm rounded-lg glass border border-border-default bg-bg-tertiary
                 text-text-primary placeholder-text-muted
                 focus:outline-none focus:border-accent-cyan focus:glow-cyan
                 transition-all duration-200"
        />
        <svg class="absolute left-2.5 top-2.5 w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <!-- Filter buttons -->
      <div class="flex gap-1">
        {#each [
          { key: 'all' as const, label: 'All' },
          { key: 'main' as const, label: 'Main' },
          { key: 'isolated' as const, label: 'Isolated' },
          { key: 'subagent' as const, label: 'Sub' }
        ] as filter}
          <button
            onclick={() => activeFilter = filter.key}
            class="flex-1 px-2 py-1 text-xs rounded transition-all
                  {activeFilter === filter.key 
                    ? 'gradient-bg gradient-border glow-cyan text-text-primary' 
                    : 'border border-border-default hover:border-accent-cyan text-text-muted hover:text-text-secondary'}"
          >
            {filter.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Session list header -->
    <div class="px-3 py-2 flex items-center justify-between">
      <span class="text-xs font-medium text-text-muted uppercase tracking-wider">
        Sessions ({filteredSessions.length})
      </span>
      <div class="flex gap-1">
        <!-- New session button -->
        <button
          onclick={createNewSession}
          disabled={!conn.state.status || conn.state.status !== 'connected' || isCreatingSession}
          class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-green transition-colors
                 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Create new session"
          aria-label="Create new session"
        >
          {#if isCreatingSession}
            <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
          {/if}
        </button>

        <!-- Refresh button -->
        <button
          onclick={() => sessions.fetchSessions()}
          class="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent-cyan transition-colors"
          aria-label="Refresh sessions"
          disabled={sessions.loading}
        >
          <svg class="w-4 h-4" class:animate-spin={sessions.loading} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Session list -->
    <div class="flex-1 overflow-y-auto">
      {#if sessions.loading}
        <!-- Skeleton loading placeholders -->
        <div class="px-2 pb-2 space-y-1">
          {#each Array(5) as _}
            <div class="px-3 py-2.5 rounded-lg border border-transparent">
              <div class="flex items-center justify-between mb-1.5">
                <div class="h-4 w-32 rounded bg-bg-tertiary skeleton-pulse"></div>
                <div class="h-3 w-8 rounded bg-bg-tertiary skeleton-pulse"></div>
              </div>
              <div class="h-3 w-48 rounded bg-bg-tertiary skeleton-pulse" style="animation-delay: 0.1s"></div>
            </div>
          {/each}
        </div>
      {:else if filteredSessions.length === 0}
        <div class="px-4 py-8 text-center text-text-muted text-sm">
          {#if searchQuery.trim()}
            No sessions match your search
          {:else if activeFilter !== 'all'}
            No {activeFilter} sessions found
          {:else if conn.state.status === 'connected'}
            No sessions found
          {:else}
            Connect to see sessions
          {/if}
        </div>
      {/if}

      <div class="px-2 pb-2 space-y-1">
        {#each filteredSessions as session (session.key)}
          {@const sessionType = getSessionType(session)}
          <button
            onclick={() => selectSession(session.key)}
            class="w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200 group
              {session.key === sessions.activeKey
                ? 'gradient-border gradient-bg glow-cyan'
                : 'hover:bg-bg-hover border border-transparent'
              }"
          >
            <!-- Session header -->
            <div class="flex items-center justify-between mb-1">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <!-- Session type icon -->
                <svg 
                  class="w-3 h-3 flex-shrink-0 
                        {sessionType === 'main' ? 'text-accent-purple' :
                         sessionType === 'subagent' ? 'text-accent-amber' : 'text-accent-cyan'}" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path d={getSessionTypeIcon(sessionType)} />
                </svg>
                
                <!-- Session title -->
                <span class="text-sm font-medium truncate
                  {session.key === sessions.activeKey ? 'text-accent-cyan' : 'text-text-primary'}">
                  {sessions.getSessionTitle(session)}
                </span>
              </div>
              
              <!-- Last activity time -->
              <span class="text-xs text-text-muted flex-shrink-0 ml-2">
                {formatTime(session.lastActivityAt ?? session.lastActivity)}
              </span>
            </div>

            <!-- Last message -->
            {#if session.lastMessage}
              <p class="text-xs text-text-muted truncate mb-1">{truncate(session.lastMessage, 60)}</p>
            {:else}
              <p class="text-xs text-text-muted/50 truncate mb-1 italic">No messages yet</p>
            {/if}
            
            <!-- Metadata badges -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <!-- Model badge (shortened) -->
              {#if session.model}
                {@const shortModel = session.model.replace(/^(anthropic|openai|google|meta)\//i, '').split('/').pop()?.slice(0, 20) ?? session.model}
                <span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-accent-purple/15 text-purple-300/80 leading-none">
                  {shortModel}
                </span>
              {/if}

              <!-- Channel badge -->
              {#if session.channel}
                <span class="inline-block text-[10px] px-1.5 py-0.5 rounded leading-none {getChannelBadgeColor(session.channel)}">
                  {session.channel}
                </span>
              {/if}

              <!-- Message count -->
              {#if session.messageCount}
                <span class="inline-block text-[10px] px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted leading-none">
                  {session.messageCount} msgs
                </span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>

    <!-- Footer — settings link -->
    <div class="p-3 border-t border-border-default">
      <a
        href="/settings"
        class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-hover hover:text-accent-purple transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </a>
    </div>
  {/if}
</aside>