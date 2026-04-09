import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useTunnelTransport } from "~/features/live/hooks/use-tunnel-transport";

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? "https://pub-relay.mishaplots.workers.dev";

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
    <div className="fixed inset-0 flex flex-col bg-background">
      {tunnels.length > 1 ? (
        <TunnelSelector
          tunnels={tunnels}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      ) : null}
      <TunnelFrame tunnel={tunnel} />
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

function TunnelFrame({ tunnel }: { tunnel: TunnelInfo }) {
  const iframeSrc = `${RELAY_URL}/t/${tunnel.token}/`;
  const tunnelWsUrl = useMemo(
    () => `${RELAY_URL.replace(/^http/, "ws")}/ws/${tunnel.token}`,
    [tunnel.token],
  );

  const transport = useTunnelTransport(tunnelWsUrl);

  return (
    <div className="flex-1 min-h-0 relative">
      <iframe
        src={iframeSrc}
        className="absolute inset-0 w-full h-full border-0"
        allow="camera; microphone; display-capture; geolocation; fullscreen"
        title="Tunnel App"
      />
      {transport.connected ? (
        <div className="absolute bottom-4 right-4 px-2 py-1 rounded bg-green-500/20 text-green-600 text-xs">
          Connected
        </div>
      ) : null}
    </div>
  );
}
