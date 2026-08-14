"use client";

import { useEffect, useRef } from "react";

/**
 * Full-viewport dust burst used by the God Mode switch.
 *
 * Renders on a canvas rather than DOM nodes — a few hundred particles as
 * individual elements would mean that many style recalcs per frame, and the
 * canvas repaint is a single draw call. Particles spawn across the screen and
 * drift upward while shrinking and fading, which reads as the page breaking
 * into powder rather than a generic fade.
 *
 * `onComplete` fires once, when the burst has fully faded — the caller uses
 * it to swap routes so the navigation lands exactly as the dust clears.
 */
export function GodModeTransition({
  active,
  durationMs = 900,
  onComplete,
}: {
  active: boolean;
  durationMs?: number;
  onComplete: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const palette = ["#FBBF24", "#A7F3D0", "#F5F1E8", "#111111", "#FDFBF7"];

    type Particle = {
      x: number;
      y: number;
      size: number;
      vx: number;
      vy: number;
      color: string;
      born: number;
      life: number;
    };

    const particles: Particle[] = [];
    const cols = 26;
    const rows = 16;
    const cellW = width / cols;
    const cellH = height / rows;
    const start = performance.now();

    // One particle per grid cell plus jitter, so the dust reads as coming
    // from the whole screen rather than a corner burst.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const delay = (r / rows) * 120 + (c / cols) * 180 + Math.random() * 160;
        particles.push({
          x: c * cellW + cellW / 2 + (Math.random() - 0.5) * cellW,
          y: r * cellH + cellH / 2 + (Math.random() - 0.5) * cellH,
          size: 1.5 + Math.random() * 3.5,
          vx: (Math.random() - 0.5) * 60,
          vy: -40 - Math.random() * 90,
          color: palette[Math.floor(Math.random() * palette.length)],
          born: start + delay,
          life: durationMs * 0.55 + Math.random() * durationMs * 0.35,
        });
      }
    }

    let raf = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        const t = now - p.born;
        if (t < 0) continue;
        const progress = Math.min(1, t / p.life);
        if (progress >= 1) continue;

        const ease = 1 - (1 - progress) ** 3;
        const x = p.x + p.vx * ease;
        const y = p.y + p.vy * ease;
        const alpha = 1 - progress;
        const size = p.size * (1 - progress * 0.6);

        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, size, size);
      }
      ctx.globalAlpha = 1;

      if (now - start < durationMs + 200) {
        raf = requestAnimationFrame(draw);
      } else {
        onCompleteRef.current();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs]);

  if (!active) return null;

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[999]" />;
}
