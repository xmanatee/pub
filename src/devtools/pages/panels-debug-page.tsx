import { createRef } from "react";
import { BatchSection } from "~/devtools/components/batch-section";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import type { ChatEntry, ReceivedFile } from "~/features/live-chat/types/live-chat-types";

const SAMPLE_MESSAGES: ChatEntry[] = [
  { id: "1", from: "user", type: "text", content: "Hello!", timestamp: 1, delivery: "confirmed" },
  {
    id: "2",
    from: "agent",
    type: "text",
    content: "Hi there! How can I help you today?",
    timestamp: 2,
  },
  {
    id: "3",
    from: "user",
    type: "text",
    content: "Show me something",
    timestamp: 3,
    delivery: "sent",
  },
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

export function PanelsDebugPage() {
  const chatPanel = (
    <ChatPanel files={SAMPLE_FILES} messages={SAMPLE_MESSAGES} messagesEndRef={messagesEndRef} />
  );

  const settingsPanel = (
    <SettingsPanel
      model={{
        behavior: {
          autoOpenCanvas: true,
          canUseDeveloperMode: true,
          developerModeEnabled: false,
          voiceModeEnabled: false,
        },
        stats: {
          fileCount: 1,
          hasCanvasContent: true,
          messageCount: 3,
        },
      }}
      actions={{
        onAutoOpenCanvasChange: noop,
        onClearCanvas: noop,
        onClearFiles: noop,
        onClearMessages: noop,
        onDeveloperModeChange: noop,
        onVoiceModeEnabledChange: noop,
      }}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
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
