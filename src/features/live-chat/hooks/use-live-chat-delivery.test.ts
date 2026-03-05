import { describe, expect, it } from "vitest";
import type { ChatEntry, TextChatEntry } from "~/features/live-chat/types/live-chat-types";
import {
  createInitialLiveChatDeliveryState,
  type LiveChatDeliveryState,
  liveChatDeliveryReducer,
} from "./use-live-chat-delivery";

type LiveChatDeliveryAction = Parameters<typeof liveChatDeliveryReducer>[1];

function apply(
  state: LiveChatDeliveryState,
  actions: LiveChatDeliveryAction[],
): LiveChatDeliveryState {
  return actions.reduce((current, action) => liveChatDeliveryReducer(current, action), state);
}

const USER_TEXT: TextChatEntry = {
  id: "u-1",
  type: "text",
  from: "user",
  content: "hello",
  timestamp: 1,
  delivery: "sending",
};

const AGENT_TEXT: TextChatEntry = {
  id: "a-1",
  type: "text",
  from: "agent",
  content: "hey",
  timestamp: 2,
};

describe("liveChatDeliveryReducer", () => {
  it("upserts by id instead of duplicating", () => {
    const initial = createInitialLiveChatDeliveryState();
    const state = apply(initial, [
      { type: "UPSERT_MESSAGE", entry: USER_TEXT },
      { type: "UPSERT_MESSAGE", entry: { ...USER_TEXT, content: "updated" } },
    ]);
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]).toMatchObject({ id: "u-1", content: "updated" });
  });

  it("keeps delivery transitions monotonic", () => {
    const initial = createInitialLiveChatDeliveryState();
    const state = apply(initial, [
      { type: "UPSERT_MESSAGE", entry: USER_TEXT },
      { type: "MARK_MESSAGE_SENT_IF_PENDING", messageId: "u-1" },
      { type: "MARK_MESSAGE_RECEIVED", messageId: "u-1" },
      { type: "MARK_MESSAGE_CONFIRMED", messageId: "u-1" },
      { type: "MARK_MESSAGE_FAILED", messageId: "u-1" },
    ]);
    const [message] = state.messages;
    if (message.from !== "user") throw new Error("Expected user message");
    expect(message.delivery).toBe("confirmed");
  });

  it("fails only sent messages on disconnect fallback", () => {
    const initial = createInitialLiveChatDeliveryState();
    const sentUser: TextChatEntry = { ...USER_TEXT, id: "u-2", delivery: "sent" };
    const receivedUser: TextChatEntry = { ...USER_TEXT, id: "u-3", delivery: "received" };
    const state = apply(initial, [
      { type: "UPSERT_MESSAGE", entry: sentUser },
      { type: "UPSERT_MESSAGE", entry: receivedUser },
      { type: "UPSERT_MESSAGE", entry: AGENT_TEXT },
      { type: "FAIL_SENT_MESSAGES" },
    ]);

    const byId = new Map(
      state.messages.map((entry) => [entry.id, entry] satisfies [string, ChatEntry]),
    );
    const failed = byId.get("u-2");
    const kept = byId.get("u-3");
    if (!failed || failed.from !== "user") throw new Error("Expected sent user message");
    if (!kept || kept.from !== "user") throw new Error("Expected received user message");

    expect(failed.delivery).toBe("failed");
    expect(kept.delivery).toBe("received");
    expect(byId.get("a-1")?.from).toBe("agent");
  });

  it("updates waveform analysis without changing message ordering", () => {
    const initial = createInitialLiveChatDeliveryState();
    const audioMessage: ChatEntry = {
      id: "audio-1",
      type: "audio",
      from: "agent",
      audioUrl: "blob:audio",
      mime: "audio/webm",
      size: 123,
      timestamp: 3,
    };

    const state = apply(initial, [
      { type: "UPSERT_MESSAGE", entry: USER_TEXT },
      { type: "UPSERT_MESSAGE", entry: audioMessage },
      {
        type: "UPDATE_AUDIO_MESSAGE_ANALYSIS",
        messageId: "audio-1",
        duration: 2.4,
        waveform: [0.2, 0.4, 0.6],
      },
    ]);

    expect(state.messages.map((m) => m.id)).toEqual(["u-1", "audio-1"]);
    const updated = state.messages[1];
    expect(updated.type).toBe("audio");
    if (updated.type !== "audio") throw new Error("Expected audio message");
    expect(updated.duration).toBe(2.4);
    expect(updated.waveform).toEqual([0.2, 0.4, 0.6]);
  });
});
