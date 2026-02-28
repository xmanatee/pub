import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import "./canvas-session-visual.css";
import type { TunnelAnimationStyle, TunnelSessionVisualState } from "./types";
import { BlobVisual } from "./visuals/blob-visual";
import { FlowVisual } from "./visuals/flow-visual";
import { LissajousVisual } from "./visuals/lissajous-visual";
import { OrbVisual } from "./visuals/orb-visual";
import { type Tone, VISUAL_THEME, type VisualProps } from "./visuals/shared";

interface CanvasSessionVisualProps {
  className?: string;
  fadeOut?: boolean;
  hasCanvasContent: boolean;
  state: TunnelSessionVisualState;
  styleType: TunnelAnimationStyle;
}

function AuroraLayer({
  className,
  hasCanvasContent,
  tone,
}: {
  className?: string;
  hasCanvasContent: boolean;
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
    <div className={cn("tunnel-visual", className)} style={style} aria-hidden>
      <div className="tunnel-visual__layer tunnel-visual__layer-a" />
      <div className="tunnel-visual__layer tunnel-visual__layer-b" />
      <div className="tunnel-visual__layer tunnel-visual__layer-c" />
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

function VisualForStyle({
  styleType,
  tone,
  hasCanvasContent,
  className,
}: VisualProps & { styleType: TunnelAnimationStyle }) {
  switch (styleType) {
    case "aurora":
      return <AuroraLayer className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
    case "orb":
      return <OrbVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
    case "flow":
      return <FlowVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
    case "lissajous":
      return (
        <LissajousVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />
      );
    case "blob":
      return <BlobVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
  }
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

  const isCSS = styleType === "aurora" || styleType === "orb";

  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      {isCSS && previousTone ? (
        <VisualForStyle
          className="tunnel-visual-fade-out"
          hasCanvasContent={hasCanvasContent}
          styleType={styleType}
          tone={previousTone}
        />
      ) : null}
      <VisualForStyle
        className={cn(
          isCSS && isTransitioning ? "tunnel-visual-fade-in" : undefined,
          fadeOut && "opacity-0",
        )}
        hasCanvasContent={hasCanvasContent}
        styleType={styleType}
        tone={tone}
      />
    </div>
  );
}
