import type { TunnelSessionVisualState } from "../types";

export interface Tone {
  coreScale: number;
  energy: number;
  glow: number;
  hueA: number;
  hueB: number;
  hueC: number;
  speedMs: number;
  saturation: number;
}

export const VISUAL_THEME: Record<TunnelSessionVisualState, Tone> = {
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

export interface VisualProps {
  tone: Tone;
  hasCanvasContent: boolean;
  className?: string;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
