import type { Id } from "@backend/_generated/dataModel";
import { useState } from "react";
import { ControlBarProvider } from "~/components/control-bar/control-bar-controller";
import { BatchSection } from "~/devtools/components/batch-section";
import { createLiveBlobPresentation } from "~/features/live/blob/live-blob-presentation";
import type {
  LiveBlobState,
  LiveControlBarState,
  LiveViewMode,
  SessionState,
} from "~/features/live/types/live-types";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import {
  createMockLiveSession,
  LiveSessionProvider,
} from "~/features/pub/contexts/live-session-context";

const ALL_BLOB_STATES: LiveBlobState[] = [
  "content-loading",
  "offline",
  "connecting",
  "disconnected",
  "waiting-content",
  "idle",
  "agent-thinking",
  "agent-replying",
  "recording",
  "voice-mode",
  "command-running",
  "error",
];

const DEBUG_PREVIEW_TEXT = "Debug preview message";
const DEBUG_MULTILINE_TEXT =
  "First line of message\nSecond line continues\nThird line here\nAnd a fourth line too";
const DEBUG_BUTTON_CLASS = "rounded-md border border-border px-3 py-1.5 text-sm";

function resolveDebugControlBarState(
  blobState: LiveBlobState,
  sessionState: SessionState,
): LiveControlBarState {
  if (sessionState === "needs-takeover" || sessionState === "taken-over") return sessionState;
  if (blobState === "connecting") return "connecting";
  if (blobState === "disconnected") return "disconnected";
  if (blobState === "offline") return "offline";
  if (blobState === "recording") return "recording";
  if (blobState === "voice-mode") return "voice-mode";
  return "idle";
}

function resolveDebugTransportStatus(blobState: LiveBlobState) {
  if (blobState === "connecting") return "connecting";
  if (blobState === "disconnected") return "disconnected";
  return "connected";
}

function StaticControlBar({
  agentName = "Agent",
  availableAgents,
  blobState = "idle",
  controlBarState,
  chatPreview,
  collapsed = false,
  defaultAgentName,
  sessionState = "active",
  lastTakeoverAt,
  initialInput,
}: {
  agentName?: string;
  availableAgents?: Array<{ hostId: Id<"hosts">; agentName: string }>;
  blobState?: LiveBlobState;
  controlBarState?: LiveControlBarState;
  chatPreview?: string;
  collapsed?: boolean;
  defaultAgentName?: string | null;
  sessionState?: SessionState;
  lastTakeoverAt?: number;
  initialInput?: string;
}) {
  const resolvedControlBarState =
    controlBarState ?? resolveDebugControlBarState(blobState, sessionState);

  const value = createMockLiveSession({
    agentName,
    availableAgents: availableAgents ?? [],
    defaultAgentName: defaultAgentName ?? null,
    preview: chatPreview ? { text: chatPreview, source: "agent", severity: undefined } : null,
    controlBarCollapsed: collapsed,
    lastTakeoverAt,
    connected:
      blobState !== "connecting" && blobState !== "disconnected" && blobState !== "offline",
    hasCanvasContent: true,
    liveRequested: true,
    sessionState,
    controlBarState: resolvedControlBarState,
    transportStatus: resolveDebugTransportStatus(blobState),
    blobState,
  });
  const liveBlob = createLiveBlobPresentation(blobState);

  return (
    <ControlBarProvider>
      <LiveSessionProvider value={value}>
        <ControlBar
          initialInput={initialInput}
          shellTone={liveBlob.controlBarTone}
          statusButtonContent={liveBlob.statusButtonContent}
        />
      </LiveSessionProvider>
    </ControlBarProvider>
  );
}

export function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [activeState, setActiveState] = useState<LiveBlobState>("idle");
  const [collapsed, setCollapsed] = useState(false);

  const interactiveValue = createMockLiveSession({
    agentName: "Agent",
    preview: chatPreview ? { text: chatPreview, source: "agent", severity: undefined } : null,
    controlBarCollapsed: collapsed,
    connected:
      activeState !== "connecting" && activeState !== "disconnected" && activeState !== "offline",
    hasCanvasContent: true,
    liveRequested: true,
    sessionState: "active",
    viewMode,
    controlBarState: resolveDebugControlBarState(activeState, "active"),
    transportStatus: resolveDebugTransportStatus(activeState),
    blobState: activeState,
    voiceModeEnabled: true,
    setViewMode,
    dismissPreview: () => setChatPreview(null),
    toggleControlBar: () => setCollapsed((prev) => !prev),
  });
  const interactiveBlob = createLiveBlobPresentation(activeState);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Control Bar Debug</h1>

        <BatchSection
          title="Blob States"
          testId="batch-blob-state"
          items={ALL_BLOB_STATES.map((state) => ({
            label: state,
            content: <StaticControlBar blobState={state} />,
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
          title="Modes: Normal, Preview"
          testId="batch-preview"
          items={[
            { label: "normal", content: <StaticControlBar /> },
            {
              label: "preview",
              content: <StaticControlBar agentName="Agent" chatPreview={DEBUG_PREVIEW_TEXT} />,
            },
          ]}
          cellHeight={200}
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
          title="Agent Selection"
          testId="batch-agent-selection"
          items={[
            {
              label: "two agents, no default",
              content: (
                <StaticControlBar
                  controlBarState="agent-selection"
                  availableAgents={[
                    { hostId: "h1" as never, agentName: "Claude" },
                    { hostId: "h2" as never, agentName: "GPT" },
                  ]}
                />
              ),
            },
            {
              label: "two agents, default set",
              content: (
                <StaticControlBar
                  controlBarState="agent-selection"
                  availableAgents={[
                    { hostId: "h1" as never, agentName: "Claude" },
                    { hostId: "h2" as never, agentName: "GPT" },
                  ]}
                  defaultAgentName="Claude"
                />
              ),
            },
            {
              label: "three agents, no default",
              content: (
                <StaticControlBar
                  controlBarState="agent-selection"
                  availableAgents={[
                    { hostId: "h1" as never, agentName: "Claude" },
                    { hostId: "h2" as never, agentName: "GPT" },
                    { hostId: "h3" as never, agentName: "Gemini" },
                  ]}
                />
              ),
            },
            {
              label: "three agents, default set",
              content: (
                <StaticControlBar
                  controlBarState="agent-selection"
                  availableAgents={[
                    { hostId: "h1" as never, agentName: "Claude" },
                    { hostId: "h2" as never, agentName: "GPT" },
                    { hostId: "h3" as never, agentName: "Gemini" },
                  ]}
                  defaultAgentName="GPT"
                />
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
              {ALL_BLOB_STATES.map((state) => (
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
          <div className="relative mt-4 h-80" style={{ transform: "translateZ(0)" }}>
            <ControlBarProvider>
              <LiveSessionProvider value={interactiveValue}>
                <ControlBar
                  shellTone={interactiveBlob.controlBarTone}
                  statusButtonContent={interactiveBlob.statusButtonContent}
                />
              </LiveSessionProvider>
            </ControlBarProvider>
          </div>
        </details>
      </div>
    </div>
  );
}
