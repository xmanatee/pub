export interface BlobTone {
  coreScale: number;
  energy: number;
  glow: number;
  hueA: number;
  hueB: number;
  hueC: number;
  saturation: number;
  speedMs: number;
}

export interface BlobProps {
  tone: BlobTone;
  dimmed?: boolean;
  className?: string;
}

export function smoothLerp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function smoothLerpHue(current: number, target: number, rate: number, dt: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  const result = current + delta * (1 - Math.exp(-rate * dt));
  return ((result % 360) + 360) % 360;
}
