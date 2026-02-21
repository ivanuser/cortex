/**
 * Toast notification system store
 */

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  createdAt: number;
}

// ─── Reactive state ────────────────────────────

let toasts = $state<Toast[]>([]);

// ─── Functions ─────────────────────────────────

function add(toast: Omit<Toast, 'id' | 'createdAt'>): string {
  const id = crypto.randomUUID();
  const newToast: Toast = {
    ...toast,
    id,
    createdAt: Date.now(),
    duration: toast.duration ?? 5000
  };

  toasts = [...toasts, newToast];

  // Auto-remove after duration
  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => remove(id), newToast.duration);
  }

  return id;
}

function remove(id: string): void {
  toasts = toasts.filter(t => t.id !== id);
}

function clear(): void {
  toasts = [];
}

// Convenience methods
function success(title: string, message?: string, duration?: number): string {
  return add({ type: 'success', title, message, duration });
}

function error(title: string, message?: string, duration?: number): string {
  return add({ type: 'error', title, message, duration });
}

function warning(title: string, message?: string, duration?: number): string {
  return add({ type: 'warning', title, message, duration });
}

function info(title: string, message?: string, duration?: number): string {
  return add({ type: 'info', title, message, duration });
}

// ─── Export ────────────────────────────────────

export function getToasts() {
  return {
    get list() { return toasts; },
    add,
    remove,
    clear,
    success,
    error,
    warning,
    info
  };
}