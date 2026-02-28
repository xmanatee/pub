import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { lerp, type VisualProps } from "./shared";

const TAU = Math.PI * 2;
const POINTS = 7;

export function BlobVisual({ tone, hasCanvasContent, className }: VisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toneRef = useRef(tone);
  const currentToneRef = useRef({ ...tone });
  const hasContentRef = useRef(hasCanvasContent);

  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  useEffect(() => {
    hasContentRef.current = hasCanvasContent;
  }, [hasCanvasContent]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let w = 0;
    let h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const phases = Array.from(
      { length: POINTS },
      (_, i) => (i / POINTS) * TAU + Math.random() * 0.5,
    );

    let raf: number;
    let t = 0;

    const draw = () => {
      const target = toneRef.current;
      const cur = currentToneRef.current;
      const lerpRate = 0.02;
      cur.hueA = lerp(cur.hueA, target.hueA, lerpRate);
      cur.hueB = lerp(cur.hueB, target.hueB, lerpRate);
      cur.hueC = lerp(cur.hueC, target.hueC, lerpRate);
      cur.energy = lerp(cur.energy, target.energy, lerpRate);
      cur.speedMs = lerp(cur.speedMs, target.speedMs, lerpRate);
      cur.glow = lerp(cur.glow, target.glow, lerpRate);
      cur.saturation = lerp(cur.saturation, target.saturation, lerpRate);
      cur.coreScale = lerp(cur.coreScale, target.coreScale, lerpRate);

      const speed = 16_000 / cur.speedMs;
      t += 0.012 * speed;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.48;
      const baseRadius = Math.min(w, h) * 0.22 * cur.coreScale;
      const amp1 = baseRadius * 0.18 * cur.energy;
      const amp2 = baseRadius * 0.1 * cur.energy;

      const pts: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const angle = (i / POINTS) * TAU;
        const ph = phases[i];
        const r = baseRadius + Math.sin(t + ph) * amp1 + Math.sin(t * 1.7 + ph * 2.3) * amp2;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      const opacity = hasContentRef.current ? 0.24 : 1;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.5);
      const sat = cur.saturation * 80;
      grad.addColorStop(0, `hsl(${cur.hueA} ${sat}% 62% / ${0.7 * opacity})`);
      grad.addColorStop(0.5, `hsl(${cur.hueB} ${sat}% 56% / ${0.5 * opacity})`);
      grad.addColorStop(1, `hsl(${cur.hueC} ${sat}% 50% / ${0.15 * opacity})`);

      ctx.beginPath();
      for (let i = 0; i < POINTS; i++) {
        const next = pts[(i + 1) % POINTS];
        const after = pts[(i + 2) % POINTS];
        const cpx = (next[0] + after[0]) / 2;
        const cpy = (next[1] + after[1]) / 2;
        if (i === 0) {
          const first = pts[0];
          const firstNext = pts[1];
          ctx.moveTo((first[0] + firstNext[0]) / 2, (first[1] + firstNext[1]) / 2);
        }
        ctx.quadraticCurveTo(next[0], next[1], cpx, cpy);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.globalAlpha = (0.12 + cur.energy * 0.18) * opacity;
      ctx.filter = `blur(${24 + cur.energy * 16}px)`;
      ctx.fill();
      ctx.filter = "none";

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={cn("absolute inset-0 h-full w-full", className)}
      aria-hidden
    />
  );
}
