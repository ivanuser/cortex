<script lang="ts">
  import { getMessages } from '$lib/stores/messages.svelte';
  import { getConnection } from '$lib/stores/connection.svelte';
  import { getSessions } from '$lib/stores/sessions.svelte';
  import MessageBubble from './MessageBubble.svelte';
  import { getDateGroup } from '$lib/utils/time';
  import { tick } from 'svelte';

  const msgs = getMessages();
  const conn = getConnection();
  const sessions = getSessions();

  let scrollContainer: HTMLDivElement | undefined = $state();
  let autoScroll = $state(true);
  let newMessageCount = $state(0);

  // Track the last known message count to detect new messages when scrolled up
  let lastKnownCount = $state(0);

  // Auto-scroll when new messages arrive or streaming content updates
  $effect(() => {
    // Track these to trigger re-run
    const currentCount = msgs.list.length;
    void msgs.streamingContent;

    if (autoScroll && scrollContainer) {
      tick().then(() => {
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
      newMessageCount = 0;
      lastKnownCount = currentCount;
    } else if (currentCount > lastKnownCount) {
      // New messages arrived while user is scrolled up
      newMessageCount += currentCount - lastKnownCount;
      lastKnownCount = currentCount;
    }
  });

  function handleScroll() {
    if (!scrollContainer) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    const wasAutoScroll = autoScroll;
    autoScroll = scrollHeight - scrollTop - clientHeight < 100;
    if (autoScroll && !wasAutoScroll) {
      newMessageCount = 0;
    }
  }

  function scrollToBottom() {
    autoScroll = true;
    newMessageCount = 0;
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }
  }

  // Detect if messages come from mixed channels (to conditionally show badges)
  let hasMixedChannels = $derived.by(() => {
    const channels = new Set<string>();
    for (const m of msgs.list) {
      if (m.channel) channels.add(m.channel);
    }
    return channels.size > 1;
  });

  // Group messages by date for separators
  let messagesWithDates = $derived.by(() => {
    const result: Array<{ type: 'separator'; date: string } | { type: 'message'; message: typeof msgs.list[0] }> = [];
    let lastDateGroup = '';

    for (const message of msgs.list) {
      const dateGroup = getDateGroup(message.timestamp);
      
      if (dateGroup !== lastDateGroup) {
        result.push({ type: 'separator', date: dateGroup });
        lastDateGroup = dateGroup;
      }
      
      result.push({ type: 'message', message });
    }

    return result;
  });

  // Get current session info for empty state
  let activeSession = $derived(sessions.list.find((s: any) => s.key === sessions.activeKey));
  let sessionTitle = $derived(activeSession ? sessions.getSessionTitle(activeSession) : '');

  // Quick action suggestions for empty state
  const quickActions = [
    { emoji: '💬', label: 'Ask a question', text: 'Help me understand...' },
    { emoji: '✍️', label: 'Write something', text: 'Write a...' },
    { emoji: '🔍', label: 'Research a topic', text: 'Research...' },
    { emoji: '💡', label: 'Brainstorm ideas', text: 'Brainstorm ideas for...' },
  ];

  function startQuickAction(text: string) {
    // Dispatch a custom event that ChatInput can listen for
    const event = new CustomEvent('cortex:prefill', { detail: { text }, bubbles: true });
    scrollContainer?.dispatchEvent(event);
  }
</script>

<div
  bind:this={scrollContainer}
  onscroll={handleScroll}
  class="flex-1 overflow-y-auto px-4 py-6"
>
  <div class="max-w-4xl mx-auto">
    {#if msgs.loadingHistory}
      <div class="flex items-center justify-center py-12">
        <div class="flex items-center gap-3 text-text-muted">
          <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="text-sm">Loading history...</span>
        </div>
      </div>
    {:else if msgs.list.length === 0 && !msgs.streaming}
      <!-- Enhanced empty state -->
      <div class="flex flex-col items-center justify-center py-16 md:py-24 text-center animate-fade-in">
        <!-- Logo with glow effect -->
        <div class="relative mb-8">
          <div class="absolute inset-0 w-32 h-32 md:w-40 md:h-40 rounded-full bg-accent-cyan/10 blur-2xl"></div>
          <img src="/logo.png" alt="Cortex" class="relative w-32 h-32 md:w-40 md:h-40 drop-shadow-lg" />
        </div>

        <h2 class="text-2xl md:text-3xl font-bold gradient-text mb-3">
          {#if sessionTitle}
            {sessionTitle}
          {:else}
            Welcome to Cortex
          {/if}
        </h2>
        
        <p class="text-text-muted text-sm md:text-base max-w-md mb-8">
          {#if conn.state.status === 'connected'}
            Start a conversation — ask anything, explore ideas, or get help with a task.
          {:else}
            Configure your gateway connection in
            <a href="/settings" class="text-accent-cyan hover:underline">Settings</a>
            to get started.
          {/if}
        </p>

        <!-- Quick action suggestions -->
        {#if conn.state.status === 'connected'}
          <div class="grid grid-cols-2 gap-3 w-full max-w-lg">
            {#each quickActions as action}
              <button
                onclick={() => startQuickAction(action.text)}
                class="flex items-center gap-3 px-4 py-3 rounded-xl text-left
                       glass hover:bg-bg-hover border border-border-default hover:border-accent-cyan/30
                       transition-all duration-200 group/action"
              >
                <span class="text-xl">{action.emoji}</span>
                <span class="text-sm text-text-secondary group-hover/action:text-text-primary transition-colors">
                  {action.label}
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <!-- Messages with date separators -->
      {#each messagesWithDates as item}
        {#if item.type === 'separator'}
          <div class="flex items-center justify-center my-6">
            <div class="flex-1 h-px bg-border-default"></div>
            <span class="px-4 text-xs text-text-muted font-medium bg-bg-primary">
              {item.date}
            </span>
            <div class="flex-1 h-px bg-border-default"></div>
          </div>
        {:else}
          <div class="virtual-item">
            <MessageBubble message={item.message} showChannel={hasMixedChannels} />
          </div>
        {/if}
      {/each}

      <!-- Streaming message -->
      {#if msgs.streaming}
        <MessageBubble
          streaming={true}
          streamingContent={msgs.streamingContent}
          streamingThinkingContent={msgs.streamingThinkingContent}
          streamingToolCalls={msgs.streamingToolCalls}
          showChannel={false}
        />
      {/if}
    {/if}
  </div>

  <!-- Scroll to bottom button -->
  {#if !autoScroll}
    <button
      onclick={scrollToBottom}
      class="fixed bottom-24 right-8 flex items-center gap-2 px-4 py-2.5 rounded-full glass-strong border-accent-cyan/30
        text-accent-cyan hover:text-accent-cyan hover:border-accent-cyan/50 hover:scale-105
        transition-all duration-200 shadow-xl animate-fade-in z-30"
      style="box-shadow: 0 0 20px rgba(124, 77, 255, 0.15), 0 4px 20px rgba(0, 0, 0, 0.3)"
      aria-label="Scroll to bottom"
    >
      {#if newMessageCount > 0}
        <span class="text-xs font-medium">{newMessageCount} new</span>
      {/if}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    </button>
  {/if}
</div>
