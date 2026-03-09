import { useState } from "react";
import { BatchSection } from "~/devtools/components/batch-section";
import type { LiveViewMode, LiveVisualState, SessionState } from "~/features/live/types/live-types";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import {
  createMockLiveSession,
  LiveSessionProvider,
} from "~/features/pub/contexts/live-session-context";

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

function StaticControlBar({
  agentName = "Agent",
  visualState = "idle",
  chatPreview = null,
  collapsed = false,
  sessionState = "active",
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
  const value = createMockLiveSession({
    agentName,
    preview: chatPreview ? { text: chatPreview, source: "agent", severity: undefined } : null,
    controlBarCollapsed: collapsed,
    lastTakeoverAt,
    connected: visualState !== "connecting" && visualState !== "disconnected",
    sessionState,
    visualState,
    uiState:
      sessionState === "needs-takeover" || sessionState === "taken-over"
        ? (sessionState as any)
        : visualState === "connecting"
          ? "connecting"
          : "idle",
  });

  return (
    <LiveSessionProvider value={value}>
      <ControlBar initialInput={initialInput} />
    </LiveSessionProvider>
  );
}

export function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<LiveVisualState>("idle");
  const [collapsed, setCollapsed] = useState(false);

  const interactiveValue = createMockLiveSession({
    agentName: "Agent",
    preview: chatPreview ? { text: chatPreview, source: "agent", severity: undefined } : null,
    controlBarCollapsed: collapsed,
    connected: activeState !== "connecting" && activeState !== "disconnected",
    sessionState: "active",
    viewMode,
    visualState: activeState,
    voiceModeEnabled: true,
    uiState: activeState === "connecting" ? "connecting" : "idle",
    setViewMode,
    dismissPreview: () => setChatPreview(null),
    setControlBarCollapsed: setCollapsed,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
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
              content: <StaticControlBar agentName="Agent" chatPreview={DEBUG_PREVIEW_TEXT} />,
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
            <LiveSessionProvider value={interactiveValue}>
              <ControlBar />
            </LiveSessionProvider>
          </div>
        </details>
      </div>
    </div>
  );
}
