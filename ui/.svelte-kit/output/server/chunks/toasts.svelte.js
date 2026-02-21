let toasts = [];
function add(toast) {
  const id = crypto.randomUUID();
  const newToast = {
    ...toast,
    id,
    createdAt: Date.now(),
    duration: toast.duration ?? 5e3
  };
  toasts = [...toasts, newToast];
  if (newToast.duration && newToast.duration > 0) {
    setTimeout(() => remove(id), newToast.duration);
  }
  return id;
}
function remove(id) {
  toasts = toasts.filter((t) => t.id !== id);
}
function clear() {
  toasts = [];
}
function success(title, message, duration) {
  return add({ type: "success", title, message, duration });
}
function error(title, message, duration) {
  return add({ type: "error", title, message, duration });
}
function warning(title, message, duration) {
  return add({ type: "warning", title, message, duration });
}
function info(title, message, duration) {
  return add({ type: "info", title, message, duration });
}
function getToasts() {
  return {
    get list() {
      return toasts;
    },
    add,
    remove,
    clear,
    success,
    error,
    warning,
    info
  };
}
export {
  getToasts as g
};
