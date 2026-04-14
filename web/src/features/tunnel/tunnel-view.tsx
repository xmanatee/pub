import { api } from "@backend/_generated/api";
import { DEFAULT_RELAY_URL } from "@shared/tunnel-protocol-core";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { createLiveBlobPresentation } from "~/features/live/blob/live-blob-presentation";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import { LiveSessionProvider } from "~/features/pub/contexts/live-session-context";
import { useTunnelLiveModel } from "./hooks/use-tunnel-live-model";

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? DEFAULT_RELAY_URL;

interface TunnelInfo {
  token: string;
  hostId: string;
  agentName?: string;
  createdAt: number;
}

export function TunnelView() {
  const tunnels = useQuery(api.tunnels.getActiveTunnelsForUser);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!tunnels || tunnels.length === 0) {
    return <TunnelEmptyState />;
  }

  const tunnel = tunnels[Math.min(selectedIndex, tunnels.length - 1)];
  return (
    <div className="flex-1 flex flex-col bg-background">
      {tunnels.length > 1 ? (
        <TunnelSelector
          tunnels={tunnels}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      ) : null}
      <TunnelSession tunnel={tunnel} />
    </div>
  );
}

function TunnelEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground">
      <div className="text-center space-y-2">
        <p className="text-lg font-medium">No active tunnels</p>
        <p className="text-sm">Waiting for an agent to connect</p>
      </div>
    </div>
  );
}

function TunnelSelector({
  tunnels,
  selectedIndex,
  onSelect,
}: {
  tunnels: TunnelInfo[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex gap-1 p-2 border-b border-border bg-muted/30">
      {tunnels.map((t, i) => (
        <button
          key={t.hostId}
          type="button"
          onClick={() => onSelect(i)}
          className={`px-3 py-1 rounded text-sm ${
            i === selectedIndex
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {t.agentName ?? "Agent"}
        </button>
      ))}
    </div>
  );
}

function TunnelSession({ tunnel }: { tunnel: TunnelInfo }) {
  const tunnelWsUrl = useMemo(
    () => `${RELAY_URL.replace(/^http/, "ws")}/ws/${tunnel.token}`,
    [tunnel.token],
  );
  const model = useTunnelLiveModel(tunnelWsUrl, tunnel.agentName);
  const liveBlob = createLiveBlobPresentation(model.blobState);

  return (
    <LiveSessionProvider value={model}>
      <div className="flex-1 min-h-0 flex flex-col relative">
        {model.viewMode === "chat" ? (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ChatPanel />
          </div>
        ) : (
          <TunnelFrame token={tunnel.token} />
        )}
        <ControlBar
          shellTone={liveBlob.controlBarTone}
          statusButtonContent={liveBlob.statusButtonContent}
        />
      </div>
    </LiveSessionProvider>
  );
}

function TunnelFrame({ token }: { token: string }) {
  const iframeSrc = `${RELAY_URL}/t/${token}/`;

  return (
    <div className="flex-1 min-h-0 relative">
      <iframe
        src={iframeSrc}
        className="absolute inset-0 w-full h-full border-0"
        allow="camera; microphone; display-capture; geolocation; fullscreen"
        title="Tunnel App"
      />
    </div>
  );
}
