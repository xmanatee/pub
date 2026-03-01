import { createFileRoute, redirect } from "@tanstack/react-router";
import { BatchSection } from "~/components/debug/batch-section";
import { ControlBarTakeoverMode } from "~/components/live/control-bar-takeover-mode";

const noop = () => {};
const CONTROL_BAR_CLASS =
  "flex w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/88 px-1.5 shadow-lg backdrop-blur-xl";
const CONTROL_HEIGHT_CLASS = "min-h-12";
const ACTION_BUTTON_CLASS = "shrink-0";

export const Route = createFileRoute("/debug/live-takeover")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: LiveTakeoverDebugPage,
});

function LiveTakeoverDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Live Takeover Debug</h1>

        <BatchSection
          title="Takeover Prompt"
          testId="batch-takeover-prompt"
          items={[
            {
              label: "needs takeover",
              content: (
                <ControlBarTakeoverMode
                  actionButtonClass={ACTION_BUTTON_CLASS}
                  controlBarClass={CONTROL_BAR_CLASS}
                  controlHeightClass={CONTROL_HEIGHT_CLASS}
                  lastTakeoverAt={undefined}
                  onExit={noop}
                  onTakeover={noop}
                  sessionState="needs-takeover"
                />
              ),
            },
          ]}
          cellHeight={80}
        />

        <BatchSection
          title="Taken Over Banner"
          testId="batch-taken-over-banner"
          items={[
            {
              label: "cooldown active (15s remaining)",
              content: (
                <ControlBarTakeoverMode
                  actionButtonClass={ACTION_BUTTON_CLASS}
                  controlBarClass={CONTROL_BAR_CLASS}
                  controlHeightClass={CONTROL_HEIGHT_CLASS}
                  lastTakeoverAt={Date.now() - 5_000}
                  onExit={noop}
                  onTakeover={noop}
                  sessionState="taken-over"
                />
              ),
            },
            {
              label: "cooldown expired",
              content: (
                <ControlBarTakeoverMode
                  actionButtonClass={ACTION_BUTTON_CLASS}
                  controlBarClass={CONTROL_BAR_CLASS}
                  controlHeightClass={CONTROL_HEIGHT_CLASS}
                  lastTakeoverAt={Date.now() - 30_000}
                  onExit={noop}
                  onTakeover={noop}
                  sessionState="taken-over"
                />
              ),
            },
          ]}
          cellHeight={80}
        />
      </div>
    </div>
  );
}
