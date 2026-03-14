import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { smoothLerp, smoothLerpHue, type VisualProps } from "./shared";

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
  const rafRef = useRef<number | null>(null);
  const drawRef = useRef<((timestamp: number) => void) | null>(null);
  const lastTimeRef = useRef(0);

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

    let cachedGrad: CanvasGradient | null = null;
    let cachedInnerGrad: CanvasGradient | null = null;
    let cachedHueA = Number.NaN;
    let cachedHueB = Number.NaN;
    let cachedHueC = Number.NaN;
    let cachedSat = Number.NaN;
    let cachedOpacity = Number.NaN;
    let cachedCoreScale = Number.NaN;

    const BLUR_SCALE = 0.25;
    const offscreen = document.createElement("canvas");
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      offscreen.width = w * BLUR_SCALE;
      offscreen.height = h * BLUR_SCALE;
      cachedGrad = null;
      cachedInnerGrad = null;
    };

    resize();
    const observer = new ResizeObserver(() => resize());
    observer.observe(canvas);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const phases = Array.from(
      { length: POINTS },
      (_, i) => (i / POINTS) * TAU + Math.random() * 0.8,
    );
    const innerPhases = Array.from(
      { length: INNER_POINTS },
      (_, i) => (i / INNER_POINTS) * TAU + Math.random() * 1.0 + 1.0,
    );

    let t = 0;

    const draw = (timestamp: number) => {
      const dt = lastTimeRef.current
        ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
        : 0.016;
      lastTimeRef.current = timestamp;

      const target = toneRef.current;
      const cur = currentToneRef.current;
      cur.hueA = smoothLerpHue(cur.hueA, target.hueA, 3.0, dt);
      cur.hueB = smoothLerpHue(cur.hueB, target.hueB, 3.0, dt);
      cur.hueC = smoothLerpHue(cur.hueC, target.hueC, 3.0, dt);
      cur.energy = smoothLerp(cur.energy, target.energy, 3.0, dt);
      cur.speedMs = smoothLerp(cur.speedMs, target.speedMs, 3.0, dt);
      cur.glow = smoothLerp(cur.glow, target.glow, 3.0, dt);
      cur.saturation = smoothLerp(cur.saturation, target.saturation, 3.0, dt);
      cur.coreScale = smoothLerp(cur.coreScale, target.coreScale, 3.0, dt);

      const speed = 16_000 / cur.speedMs;
      t += dt * speed;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.48;
      const baseRadius = Math.min(w, h) * 0.22 * cur.coreScale;
      const innerRadius = baseRadius * 0.5;
      const amp1 = baseRadius * 0.2 * cur.energy;
      const amp2 = baseRadius * 0.12 * cur.energy;
      const amp3 = baseRadius * 0.07 * cur.energy;
      const amp4 = baseRadius * 0.03 * cur.energy * cur.energy;

      const pts: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const ph = phases[i];
        const wobble = Math.sin(t * 0.7 + ph * 1.9) * 0.04 * cur.energy;
        const angle = (i / POINTS) * TAU + wobble;
        const r =
          baseRadius +
          Math.sin(t + ph) * amp1 +
          Math.sin(t * 1.7 + ph * 2.3) * amp2 +
          Math.sin(t * 2.3 + ph * 3.1) * amp3 +
          Math.sin(t * 3.1 + ph * 4.7) * amp4;
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      const opacity = hasContentRef.current ? 0.24 : 1;
      const sat = cur.saturation * 80;

      if (
        !cachedGrad ||
        !cachedInnerGrad ||
        Math.abs(cur.hueA - cachedHueA) > 0.5 ||
        Math.abs(cur.hueB - cachedHueB) > 0.5 ||
        Math.abs(cur.hueC - cachedHueC) > 0.5 ||
        Math.abs(sat - cachedSat) > 0.5 ||
        Math.abs(opacity - cachedOpacity) > 0.001 ||
        Math.abs(cur.coreScale - cachedCoreScale) > 0.005
      ) {
        cachedGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseRadius * 1.5);
        cachedGrad.addColorStop(0, `hsl(${cur.hueA} ${sat}% 62% / ${0.7 * opacity})`);
        cachedGrad.addColorStop(0.5, `hsl(${cur.hueB} ${sat}% 56% / ${0.5 * opacity})`);
        cachedGrad.addColorStop(1, `hsl(${cur.hueC} ${sat}% 50% / ${0.15 * opacity})`);
        cachedInnerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerRadius * 1.4);
        cachedInnerGrad.addColorStop(0, `hsl(${cur.hueA} ${sat}% 76% / ${0.6 * opacity})`);
        cachedInnerGrad.addColorStop(0.6, `hsl(${cur.hueB} ${sat}% 68% / ${0.3 * opacity})`);
        cachedInnerGrad.addColorStop(1, "transparent");
        cachedHueA = cur.hueA;
        cachedHueB = cur.hueB;
        cachedHueC = cur.hueC;
        cachedSat = sat;
        cachedOpacity = opacity;
        cachedCoreScale = cur.coreScale;
      }

      buildBlobPath(ctx, pts, POINTS);
      ctx.fillStyle = cachedGrad;
      ctx.fill();

      offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offCtx.save();
      offCtx.scale(BLUR_SCALE, BLUR_SCALE);
      buildBlobPath(offCtx, pts, POINTS);
      offCtx.fillStyle = cachedGrad;
      offCtx.fill();
      offCtx.restore();
      ctx.globalAlpha = (0.12 + cur.energy * 0.18) * opacity;
      ctx.drawImage(offscreen, 0, 0, w, h);

      ctx.globalAlpha = (0.2 + cur.energy * 0.4) * opacity;
      ctx.strokeStyle = `hsl(${cur.hueA} ${sat}% 74%)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerAmp1 = innerRadius * 0.22 * cur.energy;
      const innerAmp2 = innerRadius * 0.12 * cur.energy;
      const innerPts: [number, number][] = [];
      for (let i = 0; i < INNER_POINTS; i++) {
        const ph = innerPhases[i];
        const wobble = Math.sin(t * 0.9 + ph * 2.1) * 0.06 * cur.energy;
        const angle = (i / INNER_POINTS) * TAU + wobble;
        const r =
          innerRadius +
          Math.sin(t * 1.3 + ph) * innerAmp1 +
          Math.sin(t * 2.1 + ph * 1.7) * innerAmp2;
        innerPts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
      }

      ctx.globalAlpha = 1;
      buildBlobPath(ctx, innerPts, INNER_POINTS);
      ctx.fillStyle = cachedInnerGrad;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    drawRef.current = draw;
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      drawRef.current = null;
      lastTimeRef.current = 0;
      observer.disconnect();
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
