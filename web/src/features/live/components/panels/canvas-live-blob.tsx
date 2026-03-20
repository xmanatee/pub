import { Blob } from "~/components/blob/blob";
import type { BlobTone } from "~/components/blob/blob-tone";
import { cn } from "~/lib/utils";

interface CanvasLiveBlobProps {
  className?: string;
  fadeOut?: boolean;
  hasCanvasContent: boolean;
  tone: BlobTone;
}

export function CanvasLiveBlob({
  className,
  fadeOut = false,
  hasCanvasContent,
  tone,
}: CanvasLiveBlobProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex items-center justify-center pointer-events-none",
        className,
      )}
    >
      <Blob
        className={cn("aspect-square h-1/2", fadeOut && "opacity-0")}
        dimmed={hasCanvasContent}
        tone={tone}
      />
    </div>
  );
}
