/**
 * Browser Push Notifications manager for Cortex
 * Shows notifications when assistant messages arrive while the tab is in the background.
 */

const STORAGE_KEY_NOTIFY_MESSAGES = 'cortex:notifyOnMessages';
const STORAGE_KEY_NOTIFY_DISCONNECT = 'cortex:notifyOnDisconnect';

// ─── Reactive state ────────────────────────────

let permission = $state<NotificationPermission>('default');
let notifyOnMessages = $state(true);
let notifyOnDisconnect = $state(false);
let supported = $state(false);

// ─── Init (call once from a component $effect) ─

function init(): void {
  if (typeof window === 'undefined') return;

  supported = 'Notification' in window;
  if (supported) {
    permission = Notification.permission;
  }

  // Restore preferences from localStorage
  const storedMsg = localStorage.getItem(STORAGE_KEY_NOTIFY_MESSAGES);
  const storedDis = localStorage.getItem(STORAGE_KEY_NOTIFY_DISCONNECT);
  notifyOnMessages = storedMsg !== null ? storedMsg === 'true' : true;
  notifyOnDisconnect = storedDis !== null ? storedDis === 'true' : false;
}

// ─── Permission ────────────────────────────────

async function requestPermission(): Promise<NotificationPermission> {
  if (!supported) return 'denied';

  const result = await Notification.requestPermission();
  permission = result;
  return result;
}

// ─── Notify ────────────────────────────────────

function notify(title: string, body: string, options?: NotificationOptions): void {
  if (!supported) return;
  if (permission !== 'granted') return;
  // Only notify when the tab is not visible
  if (typeof document !== 'undefined' && !document.hidden) return;

  const notification = new Notification(title, {
    body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: 'cortex-notification',
    ...options
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}

// ─── Preference setters ────────────────────────

function setNotifyOnMessages(value: boolean): void {
  notifyOnMessages = value;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_NOTIFY_MESSAGES, String(value));
  }
}

function setNotifyOnDisconnect(value: boolean): void {
  notifyOnDisconnect = value;
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_NOTIFY_DISCONNECT, String(value));
  }
}

// ─── Export ────────────────────────────────────

export function getNotifications() {
  return {
    get permission() { return permission; },
    get notifyOnMessages() { return notifyOnMessages; },
    get notifyOnDisconnect() { return notifyOnDisconnect; },
    get supported() { return supported; },
    init,
    requestPermission,
    notify,
    setNotifyOnMessages,
    setNotifyOnDisconnect
  };
}
