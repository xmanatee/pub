import { createFileRoute, redirect } from "@tanstack/react-router";
import { BatchSection } from "~/components/debug/batch-section";
import { TakenOverBanner, TakeoverPrompt } from "~/components/live/live-takeover";

const noop = () => {};
const STATIC_CLASS = "flex items-center justify-center bg-background";

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
                <TakeoverPrompt className={STATIC_CLASS} onTakeover={noop} onDismiss={noop} />
              ),
            },
          ]}
          cellHeight={180}
        />

        <BatchSection
          title="Taken Over Banner"
          testId="batch-taken-over-banner"
          items={[
            {
              label: "cooldown active (15s remaining)",
              content: (
                <TakenOverBanner
                  className={STATIC_CLASS}
                  lastTakeoverAt={Date.now() - 5_000}
                  onReclaim={noop}
                />
              ),
            },
            {
              label: "cooldown expired",
              content: (
                <TakenOverBanner
                  className={STATIC_CLASS}
                  lastTakeoverAt={Date.now() - 30_000}
                  onReclaim={noop}
                />
              ),
            },
          ]}
          cellHeight={180}
        />
      </div>
    </div>
  );
}
