import { useState } from "react";
import { BatchSection } from "~/devtools/components/batch-section";
import { ControlBar } from "~/features/live/components/control-bar/control-bar";
import type { LiveViewMode, LiveVisualState, SessionState } from "~/features/live/types/live-types";

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
  const model = {
    agentName,
    chatPreview,
    collapsed,
    lastTakeoverAt,
    sendDisabled: visualState === "connecting" || visualState === "disconnected",
    sessionState,
    viewMode: "canvas" as const,
    visualState,
    voiceModeEnabled: false,
  };

  const transport = {
    bridge: null,
    micGranted: false,
  };

  const actions = {
    onChangeView: noop,
    onClose: noop,
    onDismissPreview: noop,
    onMicGranted: noop,
    onSendAudio: noop,
    onSendChat: noop,
    onTakeover: sessionState ? noop : undefined,
    onToggleCollapsed: noop,
  };

  return (
    <ControlBar model={model} transport={transport} actions={actions} initialInput={initialInput} />
  );
}

export function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<LiveVisualState>("idle");
  const [collapsed, setCollapsed] = useState(false);

  const interactiveModel = {
    agentName: "Oz",
    chatPreview,
    collapsed,
    sendDisabled: activeState === "connecting" || activeState === "disconnected",
    sessionState: undefined,
    viewMode,
    visualState: activeState,
    voiceModeEnabled: true,
  };

  const interactiveTransport = {
    bridge: null,
    micGranted: false,
  };

  const interactiveActions = {
    onChangeView: setViewMode,
    onClose: noop,
    onDismissPreview: () => setChatPreview(null),
    onMicGranted: noop,
    onSendAudio: noop,
    onSendChat: noop,
    onTakeover: undefined,
    onToggleCollapsed: () => setCollapsed((v) => !v),
  };

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
              model={interactiveModel}
              transport={interactiveTransport}
              actions={interactiveActions}
            />
          </div>
        </details>
      </div>
    </div>
  );
}
