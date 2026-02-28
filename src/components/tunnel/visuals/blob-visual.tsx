import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { lerp, type VisualProps } from "./shared";

const TAU = Math.PI * 2;
const POINTS = 7;
const INNER_POINTS = 4;

function buildBlobPath(ctx: CanvasRenderingContext2D, pts: [number, number][], count: number) {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const next = pts[(i + 1) % count];
    const after = pts[(i + 2) % count];
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
}

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
    const innerPhases = Array.from(
      { length: INNER_POINTS },
      (_, i) => (i / INNER_POINTS) * TAU + Math.random() * 0.8 + 1.0,
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
      const amp3 = baseRadius * 0.06 * cur.energy;

      const pts: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const angle = (i / POINTS) * TAU;
        const ph = phases[i];
        const r =
          baseRadius +
          Math.sin(t + ph) * amp1 +
          Math.sin(t * 1.7 + ph * 2.3) * amp2 +
          Math.sin(t * 2.3 + ph * 3.1) * amp3;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      const opacity = hasContentRef.current ? 0.24 : 1;
      const sat = cur.saturation * 80;

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.5);
      grad.addColorStop(0, `hsl(${cur.hueA} ${sat}% 62% / ${0.7 * opacity})`);
      grad.addColorStop(0.5, `hsl(${cur.hueB} ${sat}% 56% / ${0.5 * opacity})`);
      grad.addColorStop(1, `hsl(${cur.hueC} ${sat}% 50% / ${0.15 * opacity})`);

      buildBlobPath(ctx, pts, POINTS);
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.globalAlpha = (0.12 + cur.energy * 0.18) * opacity;
      ctx.filter = `blur(${24 + cur.energy * 16}px)`;
      ctx.fill();
      ctx.filter = "none";

      buildBlobPath(ctx, pts, POINTS);
      ctx.globalAlpha = (0.2 + cur.energy * 0.4) * opacity;
      ctx.strokeStyle = `hsl(${cur.hueA} ${sat}% 74%)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerRadius = baseRadius * 0.5;
      const innerAmp1 = innerRadius * 0.22 * cur.energy;
      const innerAmp2 = innerRadius * 0.12 * cur.energy;
      const innerPts: [number, number][] = [];
      for (let i = 0; i < INNER_POINTS; i++) {
        const angle = (i / INNER_POINTS) * TAU;
        const ph = innerPhases[i];
        const r =
          innerRadius +
          Math.sin(t * 1.3 + ph) * innerAmp1 +
          Math.sin(t * 2.1 + ph * 1.7) * innerAmp2;
        innerPts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      const innerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius * 1.4);
      innerGrad.addColorStop(0, `hsl(${cur.hueA} ${sat}% 76% / ${0.6 * opacity})`);
      innerGrad.addColorStop(0.6, `hsl(${cur.hueB} ${sat}% 68% / ${0.3 * opacity})`);
      innerGrad.addColorStop(1, "transparent");

      ctx.globalAlpha = 1;
      buildBlobPath(ctx, innerPts, INNER_POINTS);
      ctx.fillStyle = innerGrad;
      ctx.fill();

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
