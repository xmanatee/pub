import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { lerp, type VisualProps } from "./shared";

const TAU = Math.PI * 2;

export function LissajousVisual({ tone, hasCanvasContent, className }: VisualProps) {
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

    let raf: number;
    let t = 0;
    let freqX = 3;
    let freqY = 2;
    let phase = 0;
    let targetFreqX = 3;
    let targetFreqY = 2;
    let nextSwitch = 6;

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
      const dt = 0.006 * speed;
      t += dt;
      phase += dt * 0.3;

      freqX = lerp(freqX, targetFreqX, 0.005);
      freqY = lerp(freqY, targetFreqY, 0.005);

      if (t > nextSwitch) {
        const freqs = [2, 3, 4, 5, 7];
        targetFreqX = freqs[Math.floor(Math.random() * freqs.length)];
        targetFreqY = freqs[Math.floor(Math.random() * freqs.length)];
        nextSwitch = t + 5 + Math.random() * 5;
      }

      const opacity = hasContentRef.current ? 0.24 : 1;
      ctx.globalAlpha = 1;
      const trailAlpha = 0.02 + (1 - cur.glow) * 0.04;
      ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const ampX = Math.min(w, h) * 0.35 * cur.coreScale;
      const ampY = ampX;
      const lineWidth = 1 + cur.energy * 2;
      const steps = 600;

      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.globalAlpha = (0.4 + cur.energy * 0.5) * opacity;

      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = (i / steps) * TAU;
        const x = cx + Math.sin(freqX * p + phase) * ampX;
        const y = cy + Math.sin(freqY * p) * ampY;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const hueProgress = (t * 10) % 360;
      const sat = cur.saturation * 80;
      ctx.strokeStyle = `hsl(${(cur.hueA + hueProgress) % 360} ${sat}% 62%)`;
      ctx.stroke();

      ctx.globalAlpha = (0.15 + cur.energy * 0.2) * opacity;
      ctx.lineWidth = lineWidth * 0.6;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = (i / steps) * TAU;
        const x = cx + Math.sin(freqX * p + phase + 0.5) * ampX * 0.9;
        const y = cy + Math.sin(freqY * p + 0.3) * ampY * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `hsl(${(cur.hueB + hueProgress) % 360} ${sat}% 58%)`;
      ctx.stroke();

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
