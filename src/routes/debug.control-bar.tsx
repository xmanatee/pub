import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { BatchSection } from "~/components/debug/batch-section";
import { ControlBar } from "~/components/live/control-bar";
import type { LiveViewMode, LiveVisualState, SessionState } from "~/components/live/types";

const ALL_VISUAL_STATES: LiveVisualState[] = [
  "connecting",
  "disconnected",
  "waiting-content",
  "idle",
  "agent-thinking",
  "agent-replying",
];

const DEBUG_PREVIEW_TEXT = "Debug preview message";
const DEBUG_MULTILINE_TEXT =
  "First line of message\nSecond line continues\nThird line here\nAnd a fourth line too";
const DEBUG_BUTTON_CLASS = "rounded-md border border-border px-3 py-1.5 text-sm";

const noop = () => {};

export const Route = createFileRoute("/debug/control-bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: ControlBarDebugPage,
});

function StaticControlBar({
  agentName = null,
  visualState = "idle",
  chatPreview = null,
  collapsed = false,
  sessionState,
  lastTakeoverAt,
  initialInput,
}: {
  agentName?: string | null;
  visualState?: LiveVisualState;
  chatPreview?: string | null;
  collapsed?: boolean;
  sessionState?: SessionState;
  lastTakeoverAt?: number;
  initialInput?: string;
}) {
  return (
    <ControlBar
      agentName={agentName}
      chatPreview={chatPreview}
      collapsed={collapsed}
      sendDisabled={visualState === "connecting" || visualState === "disconnected"}
      bridge={null}
      initialInput={initialInput}
      lastTakeoverAt={lastTakeoverAt}
      onClose={noop}
      onDismissPreview={noop}
      onTakeover={sessionState ? noop : undefined}
      onToggleCollapsed={noop}
      micGranted={false}
      onMicGranted={noop}
      onSendAudio={noop}
      onSendChat={noop}
      sessionState={sessionState}
      onChangeView={noop}
      viewMode="canvas"
      visualState={visualState}
      voiceModeEnabled={false}
    />
  );
}

function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<LiveVisualState>("idle");
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Control Bar Debug</h1>

        <BatchSection
          title="Visual States"
          testId="batch-visual-state"
          items={ALL_VISUAL_STATES.map((state) => ({
            label: state,
            content: <StaticControlBar visualState={state} />,
          }))}
        />

        <div className="max-w-md">
          <BatchSection
            title="Collapsed — Mobile"
            testId="batch-collapsed-mobile"
            items={[
              { label: "expanded", content: <StaticControlBar /> },
              { label: "collapsed", content: <StaticControlBar collapsed /> },
            ]}
          />
        </div>

        <BatchSection
          title="Collapsed — Desktop"
          testId="batch-collapsed-desktop"
          items={[
            { label: "expanded", content: <StaticControlBar /> },
            { label: "collapsed", content: <StaticControlBar collapsed /> },
          ]}
        />

        <BatchSection
          title="Chat Preview"
          testId="batch-preview"
          items={[
            { label: "without preview", content: <StaticControlBar /> },
            {
              label: "with preview",
              content: <StaticControlBar agentName="Oz" chatPreview={DEBUG_PREVIEW_TEXT} />,
            },
          ]}
          cellHeight={160}
        />

        <BatchSection
          title="Takeover"
          testId="batch-takeover"
          items={[
            {
              label: "needs takeover",
              content: <StaticControlBar sessionState="needs-takeover" />,
            },
            {
              label: "taken over — cooldown",
              content: (
                <StaticControlBar sessionState="taken-over" lastTakeoverAt={Date.now() - 5_000} />
              ),
            },
            {
              label: "taken over — expired",
              content: (
                <StaticControlBar sessionState="taken-over" lastTakeoverAt={Date.now() - 30_000} />
              ),
            },
          ]}
        />

        <BatchSection
          title="Multiline Input"
          testId="batch-multiline"
          items={[
            { label: "single line", content: <StaticControlBar /> },
            {
              label: "multiline",
              content: <StaticControlBar initialInput={DEBUG_MULTILINE_TEXT} />,
            },
          ]}
          cellHeight={160}
        />

        <details className="mt-10">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Interactive single-state view
          </summary>
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={DEBUG_BUTTON_CLASS}
                onClick={() => setChatPreview(DEBUG_PREVIEW_TEXT)}
              >
                Show preview
              </button>
              <button
                type="button"
                className={DEBUG_BUTTON_CLASS}
                onClick={() => setChatPreview(null)}
              >
                Hide preview
              </button>
              <button
                type="button"
                className={DEBUG_BUTTON_CLASS}
                onClick={() => {
                  setViewMode("canvas");
                  setChatPreview(null);
                }}
              >
                Reset
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
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
          </div>
          <div className="relative mt-4 h-80">
            <ControlBar
              agentName="Oz"
              chatPreview={chatPreview}
              collapsed={collapsed}
              sendDisabled={activeState === "connecting" || activeState === "disconnected"}
              bridge={null}
              onClose={noop}
              onDismissPreview={() => setChatPreview(null)}
              onToggleCollapsed={() => setCollapsed((v) => !v)}
              micGranted={false}
              onMicGranted={noop}
              onSendAudio={noop}
              onSendChat={noop}
              onChangeView={setViewMode}
              viewMode={viewMode}
              visualState={activeState}
              voiceModeEnabled
            />
          </div>
        </details>
      </div>
    </div>
  );
}
