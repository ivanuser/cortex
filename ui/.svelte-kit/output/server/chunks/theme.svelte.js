const ACCENT_COLORS = [
  { name: "Cyan", value: "#00e5ff" },
  { name: "Purple", value: "#7c4dff" },
  { name: "Pink", value: "#f43f9e" },
  { name: "Green", value: "#00ff88" },
  { name: "Amber", value: "#ffb300" },
  { name: "Red", value: "#ff3d5a" },
  { name: "Orange", value: "#ff6b2b" },
  { name: "Teal", value: "#00ffc8" }
];
const STORAGE_KEY = "cortex-accent-color";
const DEFAULT_COLOR = "#7c4dff";
class ThemeStore {
  accentColor = DEFAULT_COLOR;
  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) {
        this.accentColor = saved;
      }
      this.apply();
    }
  }
  setAccent(color) {
    this.accentColor = color;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, color);
      this.apply();
    }
  }
  apply() {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--color-accent-cyan", this.accentColor);
    root.style.setProperty("--color-text-accent", this.accentColor);
    root.style.setProperty("--color-border-glow", this.accentColor + "33");
    root.style.setProperty("--color-info", this.accentColor);
  }
}
let instance;
function getTheme() {
  if (!instance) {
    instance = new ThemeStore();
  }
  return instance;
}
export {
  ACCENT_COLORS as A,
  getTheme as g
};
