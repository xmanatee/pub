import type { Tone } from "~/features/live/components/visuals/shared";
import type { LiveVisualState } from "~/features/live/types/live-types";

type CSSVars = Record<string, string>;

export function controlBarStyleFromTone(tone: Tone, state: LiveVisualState): CSSVars {
  if (state === "idle") {
    return {
      "--cb-color-a": "transparent",
      "--cb-color-b": "transparent",
      "--cb-color-c": "transparent",
      "--cb-speed": "0ms",
      "--cb-opacity": "0",
      "--cb-bg-size": "200%",
    };
  }

  const sat = Math.round(tone.saturation * 80);
  const lum = Math.round(60 + tone.glow * 8);
  const toHsl = (hue: number) => `hsl(${hue}, ${sat}%, ${lum}%)`;

  const speed = tone.energy < 0.3 ? 0 : Math.round(tone.speedMs * 0.15);
  const opacity = Math.round(tone.glow * 90) / 100;
  const bgSize = tone.energy > 0.5 ? "300%" : "200%";

  return {
    "--cb-color-a": toHsl(tone.hueA),
    "--cb-color-b": toHsl(tone.hueB),
    "--cb-color-c": toHsl(tone.hueC),
    "--cb-speed": `${speed}ms`,
    "--cb-opacity": `${opacity}`,
    "--cb-bg-size": bgSize,
  };
}
