import { createFileRoute, redirect } from "@tanstack/react-router";
import { createRef } from "react";
import { BatchSection } from "~/components/debug/batch-section";
import { ChatPanel } from "~/components/live/chat-panel";
import { SettingsPanel } from "~/components/live/settings-panel";
import type { ChatEntry, ReceivedFile } from "~/components/live/types";

export const Route = createFileRoute("/debug/panels")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: PanelsDebugPage,
});

const SAMPLE_MESSAGES: ChatEntry[] = [
  { id: "1", from: "user", type: "text", content: "Hello!", timestamp: 1, delivery: "delivered" },
  {
    id: "2",
    from: "agent",
    type: "text",
    content: "Hi there! How can I help you today?",
    timestamp: 2,
  },
  { id: "3", from: "user", type: "text", content: "Show me something", timestamp: 3 },
];

const SAMPLE_FILES: ReceivedFile[] = [
  {
    id: "f1",
    filename: "report.pdf",
    mime: "application/pdf",
    size: 24576,
    downloadUrl: "#",
    timestamp: 4,
  },
];

const messagesEndRef = createRef<HTMLDivElement>();
const noop = () => {};

function TmaWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={
        {
          "--device-safe-top": "47px",
          "--content-safe-top": "40px",
          "--safe-top": "87px",
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

function PanelsDebugPage() {
  const chatPanel = (
    <ChatPanel
      files={SAMPLE_FILES}
      messages={SAMPLE_MESSAGES}
      messagesEndRef={messagesEndRef}
      showDeliveryStatus
    />
  );

  const settingsPanel = (
    <SettingsPanel
      autoOpenCanvas
      animationStyle="aurora"
      developerModeEnabled={false}
      fileCount={1}
      hasCanvasContent
      messageCount={3}
      onAutoOpenCanvasChange={noop}
      onAnimationStyleChange={noop}
      onClearCanvas={noop}
      onClearFiles={noop}
      onClearMessages={noop}
      onDeveloperModeChange={noop}
      onShowDeliveryStatusChange={noop}
      onVoiceModeEnabledChange={noop}
      showDeliveryStatus
      voiceModeEnabled={false}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Panels Debug</h1>

        <BatchSection
          title="Panels — Default"
          testId="batch-panels-default"
          cellHeight={400}
          items={[
            { label: "chat", content: chatPanel },
            { label: "settings", content: settingsPanel },
          ]}
        />

        <BatchSection
          title="Panels — TMA Fullscreen"
          testId="batch-panels-tma"
          cellHeight={400}
          items={[
            {
              label: "chat (tma)",
              content: <TmaWrapper>{chatPanel}</TmaWrapper>,
            },
            {
              label: "settings (tma)",
              content: <TmaWrapper>{settingsPanel}</TmaWrapper>,
            },
          ]}
        />
      </div>
    </div>
  );
}
