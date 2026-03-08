import { BatchSection } from "~/devtools/components/batch-section";
import { CanvasLiveVisual } from "~/features/live/components/panels/canvas-live-visual";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";

const ALL_VISUAL_STATES = Object.keys(VISUAL_THEME) as (keyof typeof VISUAL_THEME)[];

export function VisualsDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Visuals Debug</h1>

        <BatchSection
          title="Blob — Visual States"
          testId="batch-visual-blob"
          cellHeight={280}
          items={ALL_VISUAL_STATES.map((state) => ({
            label: state,
            content: (
              <div className="absolute inset-0 bg-background">
                <CanvasLiveVisual hasCanvasContent={false} state={state} />
              </div>
            ),
          }))}
        />
      </div>
    </div>
  );
}
