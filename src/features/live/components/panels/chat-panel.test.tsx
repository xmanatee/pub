import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  AudioChatEntry,
  ChatEntry,
  ImageChatEntry,
  TextChatEntry,
} from "~/features/live/types/live-types";
import { ChatPanel } from "./chat-panel";

const messagesEndRef = { current: null };

function renderPanel(messages: ChatEntry[]) {
  return renderToStaticMarkup(
    <ChatPanel
      files={[]}
      messages={messages}
      messagesEndRef={messagesEndRef}
      showDeliveryStatus={true}
    />,
  );
}

const USER_TEXT: TextChatEntry = {
  id: "t-user",
  type: "text",
  from: "user",
  content: "Hello from user",
  timestamp: 1000,
  delivery: "delivered",
};

const AGENT_TEXT: TextChatEntry = {
  id: "t-agent",
  type: "text",
  from: "agent",
  content: "Hello from agent",
  timestamp: 1001,
};

const USER_AUDIO: AudioChatEntry = {
  id: "a-user",
  type: "audio",
  from: "user",
  audioUrl: "blob:user-audio",
  mime: "audio/webm",
  size: 4096,
  timestamp: 1002,
  delivery: "sending",
  duration: 3.5,
  waveform: [0.2, 0.5, 0.8, 1, 0.6, 0.3],
};

const AGENT_AUDIO: AudioChatEntry = {
  id: "a-agent",
  type: "audio",
  from: "agent",
  audioUrl: "blob:agent-audio",
  mime: "audio/webm",
  size: 8192,
  timestamp: 1003,
  duration: 7.2,
  waveform: [0.1, 0.4, 0.9, 0.7, 0.5, 0.2],
};

const AUDIO_NO_ANALYSIS: AudioChatEntry = {
  id: "a-pending",
  type: "audio",
  from: "user",
  audioUrl: "blob:pending-audio",
  mime: "audio/webm",
  size: 2048,
  timestamp: 1004,
  delivery: "sending",
};

const USER_IMAGE: ImageChatEntry = {
  id: "i-user",
  type: "image",
  from: "user",
  imageUrl: "blob:user-image",
  mime: "image/png",
  width: 200,
  height: 100,
  timestamp: 1005,
  delivery: "delivered",
};

const AGENT_IMAGE: ImageChatEntry = {
  id: "i-agent",
  type: "image",
  from: "agent",
  imageUrl: "blob:agent-image",
  mime: "image/jpeg",
  timestamp: 1006,
};

describe("ChatPanel snapshots", () => {
  it("renders empty state", () => {
    const html = renderPanel([]);
    expect(html).toContain("No messages yet");
  });

  it("renders user text bubble", () => {
    const html = renderPanel([USER_TEXT]);
    expect(html).toContain("Hello from user");
    expect(html).toContain("justify-end");
    expect(html).toContain("opacity-70");
  });

  it("renders agent text bubble", () => {
    const html = renderPanel([AGENT_TEXT]);
    expect(html).toContain("Hello from agent");
    expect(html).toContain("justify-start");
  });

  it("renders user audio bubble with waveform bars", () => {
    const html = renderPanel([USER_AUDIO]);
    expect(html).toContain("blob:user-audio");
    expect(html).toContain("0:03");
    expect(html).not.toContain("<audio controls");
  });

  it("renders agent audio bubble with waveform bars", () => {
    const html = renderPanel([AGENT_AUDIO]);
    expect(html).toContain("blob:agent-audio");
    expect(html).toContain("0:07");
  });

  it("renders audio bubble with flat bars when analysis is pending", () => {
    const html = renderPanel([AUDIO_NO_ANALYSIS]);
    expect(html).toContain("blob:pending-audio");
    expect(html).toContain("0:00");
  });

  it("renders user image bubble", () => {
    const html = renderPanel([USER_IMAGE]);
    expect(html).toContain("blob:user-image");
    expect(html).toContain("image/png");
    expect(html).toContain('width="200"');
  });

  it("renders agent image bubble", () => {
    const html = renderPanel([AGENT_IMAGE]);
    expect(html).toContain("blob:agent-image");
    expect(html).toContain("image/jpeg");
  });

  it("renders mixed message types together", () => {
    const html = renderPanel([USER_TEXT, AGENT_AUDIO, USER_IMAGE, AGENT_TEXT]);
    expect(html).toContain("Hello from user");
    expect(html).toContain("blob:agent-audio");
    expect(html).toContain("blob:user-image");
    expect(html).toContain("Hello from agent");
  });

  it("renders delivery status icons for each state", () => {
    const sending: TextChatEntry = { ...USER_TEXT, id: "s1", delivery: "sending" };
    const confirming: TextChatEntry = { ...USER_TEXT, id: "s2", delivery: "confirming" };
    const failed: TextChatEntry = { ...USER_TEXT, id: "s3", delivery: "failed" };
    const delivered: TextChatEntry = { ...USER_TEXT, id: "s4", delivery: "delivered" };

    const html = renderPanel([sending, confirming, failed, delivered]);
    const deliveryIcons = html.match(/size-3/g);
    expect(deliveryIcons).toHaveLength(4);
    expect(html).toContain("text-destructive");
  });
});
