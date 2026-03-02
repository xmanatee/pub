import { createFileRoute, redirect } from "@tanstack/react-router";
import { BatchSection } from "~/components/debug/batch-section";
import { CanvasLiveVisual } from "~/components/live/canvas-live-visual";
import type { LiveAnimationStyle, LiveVisualState } from "~/components/live/types";

const ALL_VISUAL_STATES: LiveVisualState[] = [
  "connecting",
  "disconnected",
  "waiting-content",
  "idle",
  "agent-thinking",
  "agent-replying",
];

const ALL_STYLES: LiveAnimationStyle[] = ["aurora", "orb", "blob"];

export const Route = createFileRoute("/debug/visuals")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: VisualsDebugPage,
});

function VisualsDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Visuals Debug</h1>

        {ALL_STYLES.map((style) => (
          <BatchSection
            key={style}
            title={`${style.charAt(0).toUpperCase()}${style.slice(1)} — Visual States`}
            testId={`batch-visual-${style}`}
            cellHeight={280}
            items={ALL_VISUAL_STATES.map((state) => ({
              label: state,
              content: (
                <div className="absolute inset-0 bg-background">
                  <CanvasLiveVisual hasCanvasContent={false} state={state} styleType={style} />
                </div>
              ),
            }))}
          />
        ))}
      </div>
    </div>
  );
}
