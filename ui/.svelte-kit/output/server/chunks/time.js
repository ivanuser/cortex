function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60 * 1e3) {
    return "just now";
  }
  if (diff < 60 * 60 * 1e3) {
    const minutes = Math.floor(diff / (60 * 1e3));
    return `${minutes}m ago`;
  }
  if (diff < 24 * 60 * 60 * 1e3) {
    const hours = Math.floor(diff / (60 * 60 * 1e3));
    return `${hours}h ago`;
  }
  if (diff < 7 * 24 * 60 * 60 * 1e3) {
    const days = Math.floor(diff / (24 * 60 * 60 * 1e3));
    return `${days}d ago`;
  }
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function getDateGroup(timestamp) {
  const now = /* @__PURE__ */ new Date();
  const messageDate = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDay = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
  if (messageDay.getTime() === today.getTime()) {
    return "Today";
  } else if (messageDay.getTime() === yesterday.getTime()) {
    return "Yesterday";
  } else {
    return messageDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: messageDate.getFullYear() !== now.getFullYear() ? "numeric" : void 0
    });
  }
}
export {
  formatRelativeTime as f,
  getDateGroup as g
};
