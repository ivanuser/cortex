<div class="scanlines-overlay"></div>
<div class="vignette-overlay"></div>

<style>
  .scanlines-overlay {
    position: fixed;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent, transparent 2px,
      rgba(0, 0, 0, var(--hud-scanline-opacity, 0.08)) 2px, rgba(0, 0, 0, var(--hud-scanline-opacity, 0.08)) 4px
    );
    pointer-events: none;
    z-index: 50;
  }

  .vignette-overlay {
    position: fixed;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, var(--hud-vignette-opacity, 0.55)) 100%);
    pointer-events: none;
    z-index: 51;
  }
</style>
