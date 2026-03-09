/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { ChatEntry } from "~/features/live-chat/types/live-chat-types";
import {
  createMockLiveSession,
  LiveSessionProvider,
} from "~/features/pub/contexts/live-session-context";
import { ChatPanel } from "./chat-panel";

// Mock developer-mode to avoid eruda side-effects
vi.mock("~/lib/developer-mode", () => ({
  isDeveloperModeEnabled: vi.fn(() => false),
  setDeveloperModeEnabled: vi.fn(),
  subscribeDeveloperMode: vi.fn(() => () => {}),
  initDeveloperMode: vi.fn(),
}));

describe("ChatPanel", () => {
  it("renders correctly with messages", () => {
    const messages: ChatEntry[] = [
      {
        id: "1",
        from: "user",
        type: "text",
        content: "Hello",
        timestamp: Date.now(),
        delivery: "confirmed",
      },
    ];
    const mockValue = createMockLiveSession({
      messages,
    });

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <LiveSessionProvider value={mockValue}>
          <ChatPanel />
        </LiveSessionProvider>
      </TooltipProvider>,
    );
    expect(html).toContain("Hello");
  });

  it("shows empty state when no messages", () => {
    const mockValue = createMockLiveSession({
      messages: [],
    });
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <LiveSessionProvider value={mockValue}>
          <ChatPanel />
        </LiveSessionProvider>
      </TooltipProvider>,
    );
    expect(html).toContain("No messages yet");
  });
});
