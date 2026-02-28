import type { CSSProperties } from "react";
import { cn } from "~/lib/utils";
import type { VisualProps } from "./shared";
import "./orb-visual.css";

export function OrbVisual({ tone, hasCanvasContent, className }: VisualProps) {
  const expand = `${10 + tone.energy * 30}%`;
  const style = {
    "--orb-speed": `${tone.speedMs}ms`,
    "--orb-energy": `${tone.energy}`,
    "--orb-expand": expand,
    "--orb-core-scale": `${0.15 + tone.coreScale * 0.7}`,
    "--orb-color-a": `hsl(${tone.hueA} ${tone.saturation * 80}% 60% / 0.6)`,
    "--orb-color-b": `hsl(${tone.hueB} ${tone.saturation * 78}% 58% / 0.55)`,
    "--orb-color-c": `hsl(${tone.hueC} ${tone.saturation * 76}% 62% / 0.5)`,
    "--tv-opacity": hasCanvasContent ? "0.24" : "1",
  } as CSSProperties;

  return (
    <div className={cn("orb-visual", className)} style={style} aria-hidden>
      <div className="orb-visual__container">
        <div className="orb-visual__petal orb-visual__petal-0" />
        <div className="orb-visual__petal orb-visual__petal-1" />
        <div className="orb-visual__petal orb-visual__petal-2" />
        <div className="orb-visual__petal orb-visual__petal-3" />
        <div className="orb-visual__petal orb-visual__petal-4" />
        <div className="orb-visual__petal orb-visual__petal-5" />
        <div className="orb-visual__core" />
      </div>
    </div>
  );
}
