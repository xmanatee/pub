import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import type { LiveViewMode } from "../types/live-types";
import { SettingsPanel } from "./panels/settings-panel";

/**
 * Single source of truth for the overlay panels (chat, settings) that the live
 * view-mode selector toggles. Used by both the pub route and the tunnel route
 * so the renderer can never silently drift from the selector.
 *
 * The exhaustive switch makes adding a new view mode a typecheck error.
 */
export function LiveOverlayPanels({ viewMode }: { viewMode: LiveViewMode }) {
  switch (viewMode) {
    case "canvas":
      return null;
    case "chat":
      return <ChatPanel />;
    case "settings":
      return <SettingsPanel />;
  }
}
