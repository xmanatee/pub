import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "~/lib/utils";
import "./canvas-live-visual.css";
import { BlobVisual } from "~/features/live/components/visuals/blob-visual";
import { OrbVisual } from "~/features/live/components/visuals/orb-visual";
import {
  type Tone,
  VISUAL_THEME,
  type VisualProps,
} from "~/features/live/components/visuals/shared";
import type { LiveAnimationStyle, LiveVisualState } from "~/features/live/types/live-types";

interface CanvasLiveVisualProps {
  className?: string;
  fadeOut?: boolean;
  hasCanvasContent: boolean;
  state: LiveVisualState;
  styleType: LiveAnimationStyle;
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
    <div className={cn("live-visual", className)} style={style} aria-hidden>
      <div className="live-visual__layer live-visual__layer-a" />
      <div className="live-visual__layer live-visual__layer-b" />
      <div className="live-visual__layer live-visual__layer-c" />
      <div className="live-visual__center">
        <div className="live-visual__center-halo" />
        <div className="live-visual__center-ring live-visual__center-ring-a" />
        <div className="live-visual__center-ring live-visual__center-ring-b" />
        <div className="live-visual__center-glyph" />
      </div>
      <div className="live-visual__grain" />
      <div className="live-visual__vignette" />
    </div>
  );
}

function VisualForStyle({
  styleType,
  tone,
  hasCanvasContent,
  className,
}: VisualProps & { styleType: LiveAnimationStyle }) {
  switch (styleType) {
    case "aurora":
      return <AuroraLayer className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
    case "orb":
      return <OrbVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
    case "blob":
      return <BlobVisual className={className} hasCanvasContent={hasCanvasContent} tone={tone} />;
  }
}

export function CanvasLiveVisual({
  className,
  fadeOut = false,
  hasCanvasContent,
  state,
  styleType,
}: CanvasLiveVisualProps) {
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
          className="live-visual-fade-out"
          hasCanvasContent={hasCanvasContent}
          styleType={styleType}
          tone={previousTone}
        />
      ) : null}
      <VisualForStyle
        className={cn(
          isCSS && isTransitioning ? "live-visual-fade-in" : undefined,
          fadeOut && "opacity-0",
        )}
        hasCanvasContent={hasCanvasContent}
        styleType={styleType}
        tone={tone}
      />
    </div>
  );
}
