type CSSVars = Record<string, string>;

export interface ControlBarTone {
  backgroundSize: string;
  colorA: string;
  colorB: string;
  colorC: string;
  opacity: number;
  speedMs: number;
}

export function controlBarToneStyle(tone?: ControlBarTone | null): CSSVars {
  if (!tone) {
    return {
      "--cb-color-a": "transparent",
      "--cb-color-b": "transparent",
      "--cb-color-c": "transparent",
      "--cb-speed": "0ms",
      "--cb-opacity": "0",
      "--cb-bg-size": "200%",
    };
  }

  return {
    "--cb-color-a": tone.colorA,
    "--cb-color-b": tone.colorB,
    "--cb-color-c": tone.colorC,
    "--cb-speed": `${tone.speedMs}ms`,
    "--cb-opacity": `${tone.opacity}`,
    "--cb-bg-size": tone.backgroundSize,
  };
}
