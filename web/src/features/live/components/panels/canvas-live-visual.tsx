import { BlobVisual } from "~/features/live/components/visuals/blob-visual";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";
import type { LiveVisualState } from "~/features/live/types/live-types";
import { cn } from "~/lib/utils";

interface CanvasLiveVisualProps {
  className?: string;
  fadeOut?: boolean;
  hasCanvasContent: boolean;
  state: LiveVisualState;
}

export function CanvasLiveVisual({
  className,
  fadeOut = false,
  hasCanvasContent,
  state,
}: CanvasLiveVisualProps) {
  const tone = VISUAL_THEME[state];

  return (
    <div className={cn("absolute inset-0 pointer-events-none", className)}>
      <BlobVisual
        className={cn(fadeOut && "opacity-0")}
        hasCanvasContent={hasCanvasContent}
        tone={tone}
      />
    </div>
  );
}
