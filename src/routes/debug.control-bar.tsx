import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ControlBar } from "~/components/tunnel/control-bar";
import type { TunnelSessionVisualState, TunnelViewMode } from "~/components/tunnel/types";

const DEBUG_PREVIEW_TEXT = "Debug preview message";
const DEBUG_BUTTON_CLASS = "rounded-md border border-border px-3 py-1.5 text-sm";

const ALL_VISUAL_STATES: TunnelSessionVisualState[] = [
  "connecting",
  "disconnected",
  "waiting-content",
  "idle",
  "agent-thinking",
  "agent-replying",
];

export const Route = createFileRoute("/debug/control-bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: ControlBarDebugPage,
});

function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<TunnelViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [showAllStates, setShowAllStates] = useState(false);
  const [activeState, setActiveState] = useState<TunnelSessionVisualState>("idle");
  const clearPreview = () => setChatPreview(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Control Bar Debug</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={DEBUG_BUTTON_CLASS}
            onClick={() => setChatPreview(DEBUG_PREVIEW_TEXT)}
          >
            Show preview
          </button>
          <button type="button" className={DEBUG_BUTTON_CLASS} onClick={clearPreview}>
            Hide preview
          </button>
          <button
            type="button"
            className={DEBUG_BUTTON_CLASS}
            onClick={() => setShowAllStates((v) => !v)}
          >
            {showAllStates ? "Single state" : "All states"}
          </button>
          <button
            type="button"
            className={DEBUG_BUTTON_CLASS}
            onClick={() => {
              setViewMode("canvas");
              clearPreview();
            }}
          >
            Reset
          </button>
        </div>

        {!showAllStates && (
          <div className="mt-4 flex flex-wrap gap-1">
            {ALL_VISUAL_STATES.map((state) => (
              <button
                key={state}
                type="button"
                className={`${DEBUG_BUTTON_CLASS} ${activeState === state ? "bg-foreground text-background" : ""}`}
                onClick={() => setActiveState(state)}
              >
                {state}
              </button>
            ))}
          </div>
        )}
      </div>

      {showAllStates ? (
        <div className="mx-auto max-w-3xl space-y-6 px-4 pb-80" data-testid="all-states-grid">
          {ALL_VISUAL_STATES.map((state) => (
            <StatePreview key={state} state={state} viewMode={viewMode} />
          ))}
        </div>
      ) : (
        <ControlBar
          chatPreview={chatPreview}
          sendDisabled={activeState === "connecting" || activeState === "disconnected"}
          bridge={null}
          onDismissPreview={clearPreview}
          onSendAudio={() => {}}
          onSendChat={() => {}}
          onChangeView={setViewMode}
          viewMode={viewMode}
          visualState={activeState}
          voiceModeEnabled
        />
      )}
    </div>
  );
}

function StatePreview({
  state,
  viewMode,
}: {
  state: TunnelSessionVisualState;
  viewMode: TunnelViewMode;
}) {
  return (
    <div data-testid={`state-${state}`}>
      <div className="mb-2 text-xs font-medium text-muted-foreground">{state}</div>
      <div className="relative h-20">
        <ControlBar
          chatPreview={null}
          sendDisabled={state === "connecting" || state === "disconnected"}
          bridge={null}
          onDismissPreview={() => {}}
          onSendAudio={() => {}}
          onSendChat={() => {}}
          onChangeView={() => {}}
          viewMode={viewMode}
          visualState={state}
          voiceModeEnabled={false}
        />
      </div>
    </div>
  );
}
