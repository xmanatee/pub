import type { Id } from "@backend/_generated/dataModel";
import { Star } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { isFullscreenSupported } from "~/hooks/use-fullscreen";

export function SettingsPanel() {
  const {
    autoFullscreen,
    autoOpenCanvas,
    availableAgents,
    canUseDeveloperMode,
    clearFiles,
    clearMessages,
    defaultAgentName,
    developerModeEnabled,
    files,
    hasCanvasContent,
    messages,
    selectedHostId,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    setDeveloperModeEnabled,
    setSelectedHostId,
    setVoiceModeEnabled,
    voiceModeEnabled,
  } = useLiveSession();

  const canSwitchAgent = availableAgents.length > 1;

  return (
    <div
      className="absolute inset-0 overflow-y-auto p-4 pb-36 space-y-3"
      style={{ paddingTop: "calc(var(--safe-top) + 1rem)" }}
    >
      {canSwitchAgent && (
        <AgentCard
          availableAgents={availableAgents}
          defaultAgentName={defaultAgentName}
          selectedHostId={selectedHostId}
          onSelect={setSelectedHostId}
          onSetDefault={setDefaultAgentName}
        />
      )}

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Behavior</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Auto-open canvas on canvas updates</div>
              <div className="text-xs text-muted-foreground mt-1">
                Automatically switch to canvas when the live canvas content changes.
              </div>
            </div>
            <Switch checked={autoOpenCanvas} onCheckedChange={setAutoOpenCanvas} />
          </div>

          {isFullscreenSupported() && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Auto-fullscreen</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Prompt to enter fullscreen when opening a pub.
                  </div>
                </div>
                <Switch checked={autoFullscreen} onCheckedChange={setAutoFullscreen} />
              </div>
            </>
          )}

          <Separator />

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium">Voice mode</div>
              <div className="text-xs text-muted-foreground mt-1">
                Enable the voice streaming button in the control bar.
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1">
                In development — may be unstable.
              </div>
            </div>
            <Switch checked={voiceModeEnabled} onCheckedChange={setVoiceModeEnabled} disabled />
          </div>

          {canUseDeveloperMode && (
            <>
              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">Developer mode</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Enable Eruda and keep rich error logs visible in the Mini App.
                  </div>
                </div>
                <Switch checked={developerModeEnabled} onCheckedChange={setDeveloperModeEnabled} />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Live Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pb-4">
          <div className="text-xs text-muted-foreground">
            Messages: {messages.length} · Files: {files.length} · Canvas:{" "}
            {hasCanvasContent ? "loaded" : "empty"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearMessages}>
              Clear chat messages
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearFiles}>
              Clear file list
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentCard({
  availableAgents,
  defaultAgentName,
  selectedHostId,
  onSelect,
  onSetDefault,
}: {
  availableAgents: Array<{ hostId: Id<"hosts">; agentName: string }>;
  defaultAgentName: string | null;
  selectedHostId: Id<"hosts"> | null;
  onSelect: (hostId: Id<"hosts"> | null) => void;
  onSetDefault: (name: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">Agent</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-2 pb-3">
        {availableAgents.map((agent) => {
          const isCurrent = agent.hostId === selectedHostId;
          const isDefault = agent.agentName === defaultAgentName;

          return (
            <div
              key={agent.hostId}
              className={`flex items-center gap-2 rounded-lg px-2 py-2 ${isCurrent ? "bg-accent" : ""}`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left text-sm font-medium truncate"
                onClick={() => onSelect(agent.hostId)}
                disabled={isCurrent}
              >
                {agent.agentName}
                {isCurrent && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(active)</span>
                )}
              </button>

              <button
                type="button"
                className="shrink-0 rounded-md p-1 hover:bg-accent"
                onClick={() => onSetDefault(isDefault ? null : agent.agentName)}
                aria-label={isDefault ? "Remove default" : `Set ${agent.agentName} as default`}
              >
                <Star
                  className={`size-4 ${isDefault ? "fill-current text-foreground" : "text-muted-foreground"}`}
                />
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
