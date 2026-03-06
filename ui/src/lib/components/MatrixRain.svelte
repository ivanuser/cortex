<script lang="ts">
  import { onMount } from 'svelte';
  import { getTheme } from '$lib/stores/theme.svelte';

  const theme = getTheme();
  let canvas: HTMLCanvasElement;

  onMount(() => {
    const ctx = canvas.getContext('2d')!;
    let cols: number;
    let drops: number[];
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*()[]|<>?+-='
      + '\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B3'
      + '\u30B5\u30B7\u30B9\u30BB\u30BD\u30BF\u30C1\u30C4\u30C6\u30C8'
      + '\u30CA\u30CB\u30CC\u30CD\u30CE\u30CF\u30D2\u30D5\u30D8\u30DB'
      + '\u30DE\u30DF\u30E0\u30E1\u30E2\u30E4\u30E6\u30E8\u30E9\u30EA'
      + '\u30EB\u30EC\u30ED\u30EF\u30F3';

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / 16);
      drops = [];
      for (let i = 0; i < cols; i++) {
        drops[i] = Math.random() * -(canvas.height / 16);
      }
    }

    resize();

    let animId: number;
    let wasEnabled = theme.bgAnimation;

    function rain() {
      // Check if animation was just disabled — clear canvas
      if (!theme.bgAnimation) {
        if (wasEnabled) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          wasEnabled = false;
        }
        animId = requestAnimationFrame(rain);
        return;
      }

      // Re-enable: reinit drops if just turned back on
      if (!wasEnabled && theme.bgAnimation) {
        wasEnabled = true;
        resize();
      }

      ctx.fillStyle = 'rgba(10, 14, 26, 0.055)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-cyan').trim() || '#7c4dff';

      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const x = i * 16;
        const y = drops[i] * 16;

        ctx.font = '13px monospace';

        if (Math.random() > 0.97) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = accentColor + 'cc';
          ctx.shadowColor = accentColor;
          ctx.shadowBlur = 4;
        }

        ctx.fillText(ch, x, y);
        ctx.shadowBlur = 0;

        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 0.45;
      }

      animId = requestAnimationFrame(rain);
    }

    rain();
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas bind:this={canvas} class="fixed inset-0 z-0 opacity-25 pointer-events-none"></canvas>
