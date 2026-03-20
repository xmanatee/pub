import type { ReactNode } from "react";
import { Blob } from "~/components/blob/blob";
import type { BlobTone } from "~/components/blob/blob-tone";
import type { ControlBarTone } from "~/components/control-bar/control-bar-tone";
import type { LiveBlobState } from "~/features/live/types/live-types";
import { LIVE_BLOB_TONES } from "./live-blob-tones";

export interface LiveBlobPresentation {
  controlBarTone: ControlBarTone | null;
  statusButtonContent: ReactNode;
  tone: BlobTone;
}

export function createLiveBlobPresentation(state: LiveBlobState): LiveBlobPresentation {
  const tone = LIVE_BLOB_TONES[state];

  return {
    controlBarTone: createLiveControlBarTone(tone, state),
    statusButtonContent: <Blob tone={tone} />,
    tone,
  };
}

function createLiveControlBarTone(tone: BlobTone, state: LiveBlobState): ControlBarTone | null {
  if (state === "idle") return null;

  const saturation = Math.round(tone.saturation * 80);
  const luminosity = Math.round(60 + tone.glow * 8);
  const color = (hue: number) => `hsl(${hue}, ${saturation}%, ${luminosity}%)`;

  return {
    backgroundSize: tone.energy > 0.5 ? "300%" : "200%",
    colorA: color(tone.hueA),
    colorB: color(tone.hueB),
    colorC: color(tone.hueC),
    opacity: Math.round(tone.glow * 90) / 100,
    speedMs: tone.energy < 0.3 ? 0 : Math.round(tone.speedMs * 0.15),
  };
}
