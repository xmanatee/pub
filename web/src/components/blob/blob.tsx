import { useEffect, useRef } from "react";
import { type BlobProps, smoothLerp, smoothLerpHue } from "~/components/blob/blob-tone";
import { cn } from "~/lib/utils";

const TAU = Math.PI * 2;
const POINTS = 7;
const INNER_POINTS = 4;
const RADIUS_FRACTION = 0.42;
const WOBBLE_MAX = 0.3;

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

export function Blob({ tone, dimmed = false, className }: BlobProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const toneRef = useRef(tone);
  const currentToneRef = useRef({ ...tone });
  const dimmedRef = useRef(dimmed);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    toneRef.current = tone;
  }, [tone]);

  useEffect(() => {
    dimmedRef.current = dimmed;
  }, [dimmed]);

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

    const blurScale = 0.25;
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
      offscreen.width = w * blurScale;
      offscreen.height = h * blurScale;
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
      (_, index) => (index / POINTS) * TAU + Math.random() * 0.8,
    );
    const innerPhases = Array.from(
      { length: INNER_POINTS },
      (_, index) => (index / INNER_POINTS) * TAU + Math.random() * 1.0 + 1.0,
    );

    let t = 0;

    const draw = (timestamp: number) => {
      const dt = lastTimeRef.current
        ? Math.min((timestamp - lastTimeRef.current) / 1000, 0.1)
        : 0.016;
      lastTimeRef.current = timestamp;

      const target = toneRef.current;
      const currentTone = currentToneRef.current;
      currentTone.hueA = smoothLerpHue(currentTone.hueA, target.hueA, 3.0, dt);
      currentTone.hueB = smoothLerpHue(currentTone.hueB, target.hueB, 3.0, dt);
      currentTone.hueC = smoothLerpHue(currentTone.hueC, target.hueC, 3.0, dt);
      currentTone.energy = smoothLerp(currentTone.energy, target.energy, 3.0, dt);
      currentTone.speedMs = smoothLerp(currentTone.speedMs, target.speedMs, 3.0, dt);
      currentTone.glow = smoothLerp(currentTone.glow, target.glow, 3.0, dt);
      currentTone.saturation = smoothLerp(currentTone.saturation, target.saturation, 3.0, dt);
      currentTone.coreScale = smoothLerp(currentTone.coreScale, target.coreScale, 3.0, dt);

      const speed = 16_000 / currentTone.speedMs;
      t += dt * speed;

      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.48;
      const maxRadius = Math.min(w, h) * RADIUS_FRACTION * currentTone.coreScale;
      const innerMaxRadius = maxRadius * 0.4;
      const wobbleBudget = maxRadius * WOBBLE_MAX * currentTone.energy;
      const centerRadius = maxRadius - wobbleBudget;
      const amp1 = wobbleBudget * 0.48;
      const amp2 = wobbleBudget * 0.28;
      const amp3 = wobbleBudget * 0.17;
      const amp4 = wobbleBudget * 0.07;

      const points: [number, number][] = [];
      for (let i = 0; i < POINTS; i++) {
        const phase = phases[i];
        const wobble = Math.sin(t * 0.7 + phase * 1.9) * 0.04 * currentTone.energy;
        const angle = (i / POINTS) * TAU + wobble;
        const radius =
          centerRadius +
          Math.sin(t + phase) * amp1 +
          Math.sin(t * 1.7 + phase * 2.3) * amp2 +
          Math.sin(t * 2.3 + phase * 3.1) * amp3 +
          Math.sin(t * 3.1 + phase * 4.7) * amp4;
        points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }

      const opacity = dimmedRef.current ? 0.24 : 1;
      const saturation = currentTone.saturation * 80;

      if (
        !cachedGrad ||
        !cachedInnerGrad ||
        Math.abs(currentTone.hueA - cachedHueA) > 0.5 ||
        Math.abs(currentTone.hueB - cachedHueB) > 0.5 ||
        Math.abs(currentTone.hueC - cachedHueC) > 0.5 ||
        Math.abs(saturation - cachedSat) > 0.5 ||
        Math.abs(opacity - cachedOpacity) > 0.001 ||
        Math.abs(currentTone.coreScale - cachedCoreScale) > 0.005
      ) {
        cachedGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius * 1.2);
        cachedGrad.addColorStop(
          0,
          `hsl(${currentTone.hueA} ${saturation}% 62% / ${0.7 * opacity})`,
        );
        cachedGrad.addColorStop(
          0.5,
          `hsl(${currentTone.hueB} ${saturation}% 56% / ${0.5 * opacity})`,
        );
        cachedGrad.addColorStop(
          1,
          `hsl(${currentTone.hueC} ${saturation}% 50% / ${0.15 * opacity})`,
        );
        cachedInnerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, innerMaxRadius * 1.4);
        cachedInnerGrad.addColorStop(
          0,
          `hsl(${currentTone.hueA} ${saturation}% 76% / ${0.6 * opacity})`,
        );
        cachedInnerGrad.addColorStop(
          0.6,
          `hsl(${currentTone.hueB} ${saturation}% 68% / ${0.3 * opacity})`,
        );
        cachedInnerGrad.addColorStop(1, "transparent");
        cachedHueA = currentTone.hueA;
        cachedHueB = currentTone.hueB;
        cachedHueC = currentTone.hueC;
        cachedSat = saturation;
        cachedOpacity = opacity;
        cachedCoreScale = currentTone.coreScale;
      }

      buildBlobPath(ctx, points, POINTS);
      ctx.fillStyle = cachedGrad;
      ctx.fill();

      offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offCtx.save();
      offCtx.scale(blurScale, blurScale);
      buildBlobPath(offCtx, points, POINTS);
      offCtx.fillStyle = cachedGrad;
      offCtx.fill();
      offCtx.restore();
      ctx.globalAlpha = (0.12 + currentTone.energy * 0.18) * opacity;
      ctx.drawImage(offscreen, 0, 0, w, h);

      ctx.globalAlpha = (0.2 + currentTone.energy * 0.4) * opacity;
      ctx.strokeStyle = `hsl(${currentTone.hueA} ${saturation}% 74%)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const innerWobble = innerMaxRadius * WOBBLE_MAX * currentTone.energy;
      const innerCenter = innerMaxRadius - innerWobble;
      const innerAmp1 = innerWobble * 0.65;
      const innerAmp2 = innerWobble * 0.35;
      const innerPoints: [number, number][] = [];
      for (let i = 0; i < INNER_POINTS; i++) {
        const phase = innerPhases[i];
        const wobble = Math.sin(t * 0.9 + phase * 2.1) * 0.06 * currentTone.energy;
        const angle = (i / INNER_POINTS) * TAU + wobble;
        const radius =
          innerCenter +
          Math.sin(t * 1.3 + phase) * innerAmp1 +
          Math.sin(t * 2.1 + phase * 1.7) * innerAmp2;
        innerPoints.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
      }

      ctx.globalAlpha = 1;
      buildBlobPath(ctx, innerPoints, INNER_POINTS);
      ctx.fillStyle = cachedInnerGrad;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = 0;
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={cn("block h-full w-full", className)} aria-hidden />;
}
