import { BatchSection } from "~/devtools/components/batch-section";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import type {
  AudioChatEntry,
  ChatEntry,
  ImageChatEntry,
  SystemChatEntry,
  TextChatEntry,
} from "~/features/live-chat/types/live-chat-types";
import {
  createMockLiveSession,
  LiveSessionProvider,
} from "~/features/pub/contexts/live-session-context";

const SAMPLE_WAVEFORM = Array.from({ length: 40 }, (_, i) => {
  const t = i / 39;
  return Math.abs(Math.sin(t * Math.PI * 3)) * 0.7 + ((i * 7 + 3) % 11) / 36;
});

const USER_TEXT: TextChatEntry = {
  id: "t-user",
  type: "text",
  from: "user",
  content: "Hey, can you hear me?",
  timestamp: 1000,
  delivery: "confirmed",
};

const AGENT_TEXT: TextChatEntry = {
  id: "t-agent",
  type: "text",
  from: "agent",
  content: "Yes, loud and clear!",
  timestamp: 1001,
};

const USER_AUDIO: AudioChatEntry = {
  id: "a-user",
  type: "audio",
  from: "user",
  audioUrl: "",
  mime: "audio/webm",
  size: 4096,
  timestamp: 1002,
  delivery: "confirmed",
  duration: 3.5,
  waveform: SAMPLE_WAVEFORM,
};

const AGENT_AUDIO: AudioChatEntry = {
  id: "a-agent",
  type: "audio",
  from: "agent",
  audioUrl: "",
  mime: "audio/webm",
  size: 8192,
  timestamp: 1003,
  duration: 12.8,
  waveform: SAMPLE_WAVEFORM.slice().reverse(),
};

const AUDIO_PENDING: AudioChatEntry = {
  id: "a-pending",
  type: "audio",
  from: "user",
  audioUrl: "",
  mime: "audio/webm",
  size: 2048,
  timestamp: 1004,
  delivery: "sending",
};

const USER_IMAGE: ImageChatEntry = {
  id: "i-user",
  type: "image",
  from: "user",
  imageUrl:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'><rect fill='%23ccc' width='200' height='100'/><text x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23666'>200x100</text></svg>",
  mime: "image/png",
  width: 200,
  height: 100,
  timestamp: 1005,
  delivery: "confirmed",
};

const AGENT_IMAGE: ImageChatEntry = {
  id: "i-agent",
  type: "image",
  from: "agent",
  imageUrl:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120'><rect fill='%23aab' width='160' height='120'/><text x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23446'>160x120</text></svg>",
  mime: "image/jpeg",
  timestamp: 1006,
};

const SENDING_TEXT: TextChatEntry = { ...USER_TEXT, id: "d-sending", delivery: "sending" };
const SENT_TEXT: TextChatEntry = { ...USER_TEXT, id: "d-sent", delivery: "sent" };
const RECEIVED_TEXT: TextChatEntry = { ...USER_TEXT, id: "d-received", delivery: "received" };
const CONFIRMED_TEXT: TextChatEntry = { ...USER_TEXT, id: "d-confirmed", delivery: "confirmed" };
const FAILED_TEXT: TextChatEntry = {
  ...USER_TEXT,
  id: "d-failed",
  content: "This one failed",
  delivery: "failed",
};

const SYSTEM_WARNING: SystemChatEntry = {
  id: "s-warning",
  type: "system",
  from: "system",
  content: "Connection quality degraded",
  severity: "warning",
  timestamp: 1007,
};

const SYSTEM_ERROR: SystemChatEntry = {
  id: "s-error",
  type: "system",
  from: "system",
  content: "Live connection dropped. Reconnect to continue.",
  severity: "error",
  timestamp: 1008,
};

function StaticChat({ messages }: { messages: ChatEntry[] }) {
  const mockValue = createMockLiveSession({
    messages,
  });

  return (
    <div className="relative h-full bg-background">
      <LiveSessionProvider value={mockValue}>
        <ChatPanel />
      </LiveSessionProvider>
    </div>
  );
}

export function ChatBubblesDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Chat Bubbles Debug</h1>

        <BatchSection
          title="Text Bubbles"
          testId="batch-text-bubbles"
          cellHeight={100}
          items={[
            { label: "user", content: <StaticChat messages={[USER_TEXT]} /> },
            { label: "agent", content: <StaticChat messages={[AGENT_TEXT]} /> },
          ]}
        />

        <BatchSection
          title="Audio Bubbles"
          testId="batch-audio-bubbles"
          cellHeight={100}
          items={[
            { label: "user — with waveform", content: <StaticChat messages={[USER_AUDIO]} /> },
            { label: "agent — with waveform", content: <StaticChat messages={[AGENT_AUDIO]} /> },
            {
              label: "pending — flat bars",
              content: <StaticChat messages={[AUDIO_PENDING]} />,
            },
          ]}
        />

        <BatchSection
          title="Image Bubbles"
          testId="batch-image-bubbles"
          cellHeight={180}
          items={[
            { label: "user", content: <StaticChat messages={[USER_IMAGE]} /> },
            { label: "agent", content: <StaticChat messages={[AGENT_IMAGE]} /> },
          ]}
        />

        <BatchSection
          title="Delivery Statuses"
          testId="batch-delivery-statuses"
          cellHeight={100}
          items={[
            { label: "sending", content: <StaticChat messages={[SENDING_TEXT]} /> },
            { label: "sent", content: <StaticChat messages={[SENT_TEXT]} /> },
            { label: "received", content: <StaticChat messages={[RECEIVED_TEXT]} /> },
            { label: "confirmed", content: <StaticChat messages={[CONFIRMED_TEXT]} /> },
            { label: "failed", content: <StaticChat messages={[FAILED_TEXT]} /> },
          ]}
        />

        <BatchSection
          title="System Messages"
          testId="batch-system-messages"
          cellHeight={100}
          items={[
            { label: "warning", content: <StaticChat messages={[SYSTEM_WARNING]} /> },
            { label: "error", content: <StaticChat messages={[SYSTEM_ERROR]} /> },
          ]}
        />

        <BatchSection
          title="Mixed Conversation"
          testId="batch-mixed-conversation"
          cellHeight={360}
          items={[
            {
              label: "full conversation",
              content: (
                <StaticChat
                  messages={[
                    USER_TEXT,
                    AGENT_TEXT,
                    USER_AUDIO,
                    AGENT_AUDIO,
                    USER_IMAGE,
                    AGENT_IMAGE,
                    SYSTEM_WARNING,
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
