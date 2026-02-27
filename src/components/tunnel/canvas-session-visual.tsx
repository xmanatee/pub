import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import "./canvas-session-visual.css";
import type { TunnelAnimationStyle, TunnelSessionVisualState } from "./types";

interface Tone {
  coreScale: number;
  energy: number;
  glow: number;
  hueA: number;
  hueB: number;
  hueC: number;
  speedMs: number;
  saturation: number;
}

const VISUAL_THEME: Record<TunnelSessionVisualState, Tone> = {
  connecting: {
    coreScale: 0.82,
    energy: 0.34,
    hueA: 210,
    hueB: 220,
    hueC: 235,
    saturation: 0.7,
    speedMs: 26_000,
    glow: 0.55,
  },
  disconnected: {
    coreScale: 0.78,
    energy: 0.26,
    hueA: 8,
    hueB: 355,
    hueC: 330,
    saturation: 0.78,
    speedMs: 24_000,
    glow: 0.52,
  },
  "waiting-content": {
    coreScale: 0.9,
    energy: 0.46,
    hueA: 208,
    hueB: 214,
    hueC: 228,
    saturation: 0.78,
    speedMs: 20_000,
    glow: 0.62,
  },
  idle: {
    coreScale: 1,
    energy: 0.62,
    hueA: 210,
    hueB: 168,
    hueC: 295,
    saturation: 1.08,
    speedMs: 16_000,
    glow: 0.82,
  },
  "agent-replying": {
    coreScale: 1.18,
    energy: 0.98,
    hueA: 195,
    hueB: 132,
    hueC: 304,
    saturation: 1.2,
    speedMs: 7_000,
    glow: 1,
  },
};

interface CanvasSessionVisualProps {
  className?: string;
  fadeOut?: boolean;
  hasCanvasContent: boolean;
  state: TunnelSessionVisualState;
  styleType: TunnelAnimationStyle;
}

function VisualLayer({
  className,
  hasCanvasContent,
  styleType,
  tone,
}: {
  className?: string;
  hasCanvasContent: boolean;
  styleType: TunnelAnimationStyle;
  tone: Tone;
}) {
  const style = {
    "--tv-hue-a": `${tone.hueA}`,
    "--tv-hue-b": `${tone.hueB}`,
    "--tv-hue-c": `${tone.hueC}`,
    "--tv-saturation": `${tone.saturation}`,
    "--tv-glow": `${tone.glow}`,
    "--tv-energy": `${tone.energy}`,
    "--tv-speed-ms": `${tone.speedMs}ms`,
    "--tv-core-scale": `${tone.coreScale}`,
    "--tv-opacity": hasCanvasContent ? "0.24" : "1",
  } as CSSProperties;

  return (
    <div
      className={cn("tunnel-visual", `tunnel-visual--${styleType}`, className)}
      style={style}
      aria-hidden
    >
      <div className="tunnel-visual__layer tunnel-visual__layer-a" />
      <div className="tunnel-visual__layer tunnel-visual__layer-b" />
      <div className="tunnel-visual__layer tunnel-visual__layer-c" />
      <div className="tunnel-visual__ring tunnel-visual__ring-a" />
      <div className="tunnel-visual__ring tunnel-visual__ring-b" />
      <div className="tunnel-visual__mesh tunnel-visual__mesh-a" />
      <div className="tunnel-visual__mesh tunnel-visual__mesh-b" />
      <div className="tunnel-visual__center">
        <div className="tunnel-visual__center-halo" />
        <div className="tunnel-visual__center-ring tunnel-visual__center-ring-a" />
        <div className="tunnel-visual__center-ring tunnel-visual__center-ring-b" />
        <div className="tunnel-visual__center-glyph" />
      </div>
      <div className="tunnel-visual__grain" />
      <div className="tunnel-visual__vignette" />
    </div>
  );
}

export function CanvasSessionVisual({
  className,
  fadeOut = false,
  hasCanvasContent,
  state,
  styleType,
}: CanvasSessionVisualProps) {
  const tone = VISUAL_THEME[state];
  const previousToneRef = useRef<Tone>(tone);
  const [previousTone, setPreviousTone] = useState<Tone | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (previousToneRef.current === tone) return;
    setPreviousTone(previousToneRef.current);
    previousToneRef.current = tone;
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setPreviousTone(null);
      setIsTransitioning(false);
    }, 420);
    return () => clearTimeout(timer);
  }, [tone]);

  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      {previousTone ? (
        <VisualLayer
          className="tunnel-visual-fade-out"
          hasCanvasContent={hasCanvasContent}
          styleType={styleType}
          tone={previousTone}
        />
      ) : null}
      <VisualLayer
        className={cn(
          isTransitioning ? "tunnel-visual-fade-in" : undefined,
          fadeOut && "opacity-0",
        )}
        hasCanvasContent={hasCanvasContent}
        styleType={styleType}
        tone={tone}
      />
    </div>
  );
}
