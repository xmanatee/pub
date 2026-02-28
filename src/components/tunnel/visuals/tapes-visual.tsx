import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { lerp, type VisualProps } from "./shared";

const TAU = Math.PI * 2;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface Ribbon {
  phaseOffset: number;
  widthScale: number;
  hueKey: "hueA" | "hueB" | "hueC";
  alphaScale: number;
}

const RIBBONS: Ribbon[] = [
  { phaseOffset: 0, widthScale: 1, hueKey: "hueA", alphaScale: 1 },
  { phaseOffset: TAU / 3, widthScale: 0.8, hueKey: "hueB", alphaScale: 0.8 },
  { phaseOffset: (2 * TAU) / 3, widthScale: 0.6, hueKey: "hueC", alphaScale: 0.65 },
];

export function TapesVisual({ tone, hasCanvasContent, className }: VisualProps) {
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
    let nextSwitch = 8;

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
      phase += dt * 0.25;

      freqX = lerp(freqX, targetFreqX, 0.002);
      freqY = lerp(freqY, targetFreqY, 0.002);

      if (t > nextSwitch) {
        const freqs = [2, 3, 5];
        targetFreqX = freqs[Math.floor(Math.random() * freqs.length)];
        targetFreqY = freqs[Math.floor(Math.random() * freqs.length)];
        nextSwitch = t + 7 + Math.random() * 6;
      }

      const opacity = hasContentRef.current ? 0.24 : 1;
      ctx.globalAlpha = 1;
      const trailAlpha = 0.03 + (1 - cur.glow) * 0.05;
      ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.5;
      const amp = Math.min(w, h) * 0.22 * cur.coreScale;
      const maxDist = Math.min(w, h) * 0.4;
      const sat = cur.saturation * 80;
      const steps = 400;
      const segSize = 20;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (const ribbon of RIBBONS) {
        const baseWidth = (5 + cur.energy * 5) * ribbon.widthScale;
        const hue = cur[ribbon.hueKey];
        const baseAlpha = (0.35 + cur.energy * 0.45) * ribbon.alphaScale * opacity;
        ctx.lineWidth = baseWidth;

        for (let seg = 0; seg < steps; seg += segSize) {
          const segEnd = Math.min(seg + segSize, steps);
          const midIdx = Math.floor((seg + segEnd) / 2);
          const midP = (midIdx / steps) * TAU;
          const midX = cx + Math.sin(freqX * midP + phase + ribbon.phaseOffset) * amp;
          const midY = cy + Math.sin(freqY * midP + ribbon.phaseOffset * 0.5) * amp;
          const dist = Math.hypot(midX - cx, midY - cy);
          const envelope = 1 - smoothstep(0.7, 1.0, dist / maxDist);

          ctx.globalAlpha = baseAlpha * envelope;
          ctx.strokeStyle = `hsl(${hue} ${sat}% 62%)`;
          ctx.beginPath();

          for (let i = seg; i <= segEnd; i++) {
            const p = (i / steps) * TAU;
            const x = cx + Math.sin(freqX * p + phase + ribbon.phaseOffset) * amp;
            const y = cy + Math.sin(freqY * p + ribbon.phaseOffset * 0.5) * amp;
            if (i === seg) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          ctx.stroke();
        }
      }

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
