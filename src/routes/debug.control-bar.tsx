import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ControlBar } from "~/components/tunnel/control-bar";
import type { TunnelViewMode } from "~/components/tunnel/types";

const DEBUG_PREVIEW_TEXT = "Debug preview message";
const DEBUG_BUTTON_CLASS = "rounded-md border border-border px-3 py-1.5 text-sm";

export const Route = createFileRoute("/debug/control-bar")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: ControlBarDebugPage,
});

function ControlBarDebugPage() {
  const [viewMode, setViewMode] = useState<TunnelViewMode>("canvas");
  const [chatPreview, setChatPreview] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const clearPreview = () => setChatPreview(null);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-xl font-semibold">Control Bar Debug</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={DEBUG_BUTTON_CLASS}
            onClick={() => setChatPreview(DEBUG_PREVIEW_TEXT)}
          >
            Show preview
          </button>
          <button type="button" className={DEBUG_BUTTON_CLASS} onClick={clearPreview}>
            Hide preview
          </button>
          <button
            type="button"
            className={DEBUG_BUTTON_CLASS}
            onClick={() => {
              setViewMode("canvas");
              clearPreview();
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <ControlBar
        chatPreview={chatPreview}
        collapsed={collapsed}
        disabled={false}
        bridge={null}
        onDismissPreview={clearPreview}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onSendAudio={() => {}}
        onSendChat={() => {}}
        onChangeView={setViewMode}
        viewMode={viewMode}
        voiceModeEnabled
      />
    </div>
  );
}
