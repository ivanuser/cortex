<script lang="ts">
  import { goto } from '$app/navigation';

  let { showHelp = $bindable(false) } = $props<{ showHelp?: boolean }>();

  // Page navigation mapping: Ctrl+1 through Ctrl+9
  const pageRoutes: string[] = [
    '/',           // 1 = Chat
    '/overview',   // 2 = Overview
    '/channels',   // 3 = Channels
    '/instances',  // 4 = Instances
    '/sessions',   // 5 = Sessions
    '/usage',      // 6 = Usage
    '/cron',       // 7 = Cron Jobs
    '/approvals',  // 8 = Approvals
    '/agents'      // 9 = Agents
  ];

  function isInputFocused(): boolean {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((el as HTMLElement).isContentEditable) return true;
    return false;
  }

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    // Escape — always works, even in inputs
    if (e.key === 'Escape') {
      if (showHelp) {
        showHelp = false;
        e.preventDefault();
        return;
      }
      // Blur any focused input
      if (document.activeElement && document.activeElement !== document.body) {
        (document.activeElement as HTMLElement).blur?.();
      }
      return;
    }

    // Don't trigger shortcuts when typing in inputs
    if (isInputFocused()) return;

    // Ctrl/Cmd + K → Focus chat input
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      goto('/').then(() => {
        // Small delay to ensure the page has rendered
        requestAnimationFrame(() => {
          const input = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(
            'textarea[data-chat-input], input[data-chat-input], textarea, .chat-input textarea'
          );
          input?.focus();
        });
      });
      return;
    }

    // Ctrl/Cmd + / → Toggle shortcut help
    if (mod && e.key === '/') {
      e.preventDefault();
      showHelp = !showHelp;
      return;
    }

    // Ctrl/Cmd + , → Settings
    if (mod && e.key === ',') {
      e.preventDefault();
      goto('/settings');
      return;
    }

    // Ctrl/Cmd + 1-9 → Navigate by page number
    if (mod && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key) - 1;
      if (idx < pageRoutes.length) {
        e.preventDefault();
        goto(pageRoutes[idx]);
      }
      return;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
