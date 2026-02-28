import { useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import { lerp, type VisualProps } from "./shared";

const TAU = Math.PI * 2;
const BASE_COUNT = 120;

export function FlowVisual({ tone, hasCanvasContent, className }: VisualProps) {
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

    const count = BASE_COUNT + Math.round(toneRef.current.energy * 50);
    const px = new Float32Array(count);
    const py = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      px[i] = Math.random() * (w || 800);
      py[i] = Math.random() * (h || 600);
    }

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

      const speed = 16_000 / cur.speedMs;
      const dt = 0.016 * speed;
      t += dt;

      const opacity = hasContentRef.current ? 0.24 : 1;
      ctx.globalAlpha = 1;
      const trailAlpha = 0.04 + (1 - cur.glow) * 0.06;
      ctx.fillStyle = `rgba(0, 0, 0, ${trailAlpha})`;
      ctx.fillRect(0, 0, w, h);

      const vel = 0.6 + cur.energy * 1.8;
      const freq1 = 0.003;
      const freq2 = 0.004;
      const pullStrength = 0.0004 + cur.energy * 0.0006;
      const cx = w * 0.5;
      const cy = h * 0.5;

      for (let i = 0; i < count; i++) {
        const x = px[i];
        const y = py[i];
        const angle = Math.sin(x * freq1 + t) * Math.sin(y * freq2 + t * 0.7) * TAU;
        const dx = Math.cos(angle) * vel + (cx - x) * pullStrength;
        const dy = Math.sin(angle) * vel + (cy - y) * pullStrength;
        px[i] += dx;
        py[i] += dy;

        if (px[i] < -10 || px[i] > w + 10 || py[i] < -10 || py[i] > h + 10) {
          px[i] = cx + (Math.random() - 0.5) * w * 0.8;
          py[i] = cy + (Math.random() - 0.5) * h * 0.8;
        }

        const hueIndex = i % 3;
        const hue = hueIndex === 0 ? cur.hueA : hueIndex === 1 ? cur.hueB : cur.hueC;
        const sat = cur.saturation * 80;
        const size = 1.5 + cur.energy * 1.5;
        ctx.globalAlpha = (0.3 + cur.energy * 0.5) * opacity;
        ctx.fillStyle = `hsl(${hue} ${sat}% 65%)`;
        ctx.beginPath();
        ctx.arc(px[i], py[i], size, 0, TAU);
        ctx.fill();
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
