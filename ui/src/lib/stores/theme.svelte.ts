// ═══════════════════════════════════════════════
// Theme Store — Accent color + brightness management
// ═══════════════════════════════════════════════

export interface AccentOption {
  name: string;
  value: string;
}

export const ACCENT_COLORS: AccentOption[] = [
  { name: "Cyan", value: "#00e5ff" },
  { name: "Purple", value: "#7c4dff" },
  { name: "Pink", value: "#f43f9e" },
  { name: "Green", value: "#00ff88" },
  { name: "Amber", value: "#ffb300" },
  { name: "Red", value: "#ff3d5a" },
  { name: "Orange", value: "#ff6b2b" },
  { name: "Teal", value: "#00ffc8" },
];

const STORAGE_KEY = "cortex-accent-color";
const BRIGHTNESS_KEY = "cortex-brightness";
const ANIMATION_KEY = "cortex-bg-animation";
const DEFAULT_COLOR = "#00e5ff";
const DEFAULT_BRIGHTNESS = 50; // 0-100 scale

class ThemeStore {
  accentColor = $state(DEFAULT_COLOR);
  brightness = $state(DEFAULT_BRIGHTNESS);
  bgAnimation = $state(true);

  constructor() {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^#[0-9a-fA-F]{6}$/.test(saved)) {
        this.accentColor = saved;
      }
      const savedBrightness = localStorage.getItem(BRIGHTNESS_KEY);
      if (savedBrightness !== null) {
        const val = parseInt(savedBrightness, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) {
          this.brightness = val;
        }
      }
      const savedAnimation = localStorage.getItem(ANIMATION_KEY);
      if (savedAnimation !== null) {
        this.bgAnimation = savedAnimation !== "false";
      }
      this.apply();
    }
  }

  setAccent(color: string) {
    this.accentColor = color;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, color);
      this.apply();
    }
  }

  setBrightness(value: number) {
    this.brightness = Math.max(0, Math.min(100, value));
    if (typeof window !== "undefined") {
      localStorage.setItem(BRIGHTNESS_KEY, String(this.brightness));
      this.apply();
    }
  }

  setBgAnimation(enabled: boolean) {
    this.bgAnimation = enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem(ANIMATION_KEY, String(enabled));
    }
  }

  apply() {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--color-accent-cyan", this.accentColor);
    root.style.setProperty("--color-text-accent", this.accentColor);
    root.style.setProperty("--color-border-glow", this.accentColor + "33");
    root.style.setProperty("--color-info", this.accentColor);

    // Brightness: 0=darkest, 50=default, 100=brightest
    // Maps to a multiplier for panel/bg brightness
    const factor = this.brightness / 50; // 0→0, 50→1, 100→2
    // Base backgrounds: scale from very dark to lighter
    const bgR = Math.round(13 * factor);
    const bgG = Math.round(18 * factor);
    const bgB = Math.round(32 * factor);
    const bg2R = Math.round(21 * factor);
    const bg2G = Math.round(29 * factor);
    const bg2B = Math.round(48 * factor);
    const bg3R = Math.round(31 * factor);
    const bg3G = Math.round(39 * factor);
    const bg3B = Math.round(64 * factor);

    root.style.setProperty("--color-bg-primary", `rgb(${bgR}, ${bgG}, ${bgB})`);
    root.style.setProperty("--color-bg-secondary", `rgb(${bg2R}, ${bg2G}, ${bg2B})`);
    root.style.setProperty("--color-bg-tertiary", `rgb(${bg3R}, ${bg3G}, ${bg3B})`);

    // Panel accent mix percentage scales with brightness
    const panelMix = Math.round(4 + factor * 6); // 4-16%
    root.style.setProperty("--hud-panel-mix", `${panelMix}%`);

    // Scanline & vignette opacity inverse of brightness
    const scanlineOpacity = Math.max(0, 0.12 - factor * 0.04);
    const vignetteOpacity = Math.max(0, 0.7 - factor * 0.2);
    root.style.setProperty("--hud-scanline-opacity", String(scanlineOpacity));
    root.style.setProperty("--hud-vignette-opacity", String(vignetteOpacity));
  }
}

let instance: ThemeStore | undefined;

export function getTheme(): ThemeStore {
  if (!instance) {
    instance = new ThemeStore();
  }
  return instance;
}
