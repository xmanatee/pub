import { BatchSection } from "~/devtools/components/batch-section";
import { createLiveBlobPresentation } from "~/features/live/blob/live-blob-presentation";
import { LIVE_BLOB_TONES } from "~/features/live/blob/live-blob-tones";
import { CanvasLiveBlob } from "~/features/live/components/panels/canvas-live-blob";

const ALL_BLOB_STATES = Object.keys(LIVE_BLOB_TONES) as (keyof typeof LIVE_BLOB_TONES)[];

export function BlobDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Blob Debug</h1>

        <BatchSection
          title="Blob States"
          testId="batch-blob-state"
          cellHeight={280}
          items={ALL_BLOB_STATES.map((state) => ({
            label: state,
            content: (
              <div className="absolute inset-0 bg-background">
                <CanvasLiveBlob
                  hasCanvasContent={false}
                  tone={createLiveBlobPresentation(state).tone}
                />
              </div>
            ),
          }))}
        />
      </div>
    </div>
  );
}
