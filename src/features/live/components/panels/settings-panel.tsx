import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import type { Id } from "../../../../../convex/_generated/dataModel";

export function SettingsPanel() {
  const {
    availableAgents,
    autoOpenCanvas,
    canUseDeveloperMode,
    clearFiles,
    clearMessages,
    developerModeEnabled,
    files,
    hasCanvasContent,
    messages,
    selectedPresenceId,
    setAutoOpenCanvas,
    setDeveloperModeEnabled,
    setSelectedPresenceId,
    setVoiceModeEnabled,
    voiceModeEnabled,
  } = useLiveSession();

  return (
    <div
      className="absolute inset-0 overflow-y-auto p-4 pb-36 space-y-3"
      style={{ paddingTop: "calc(var(--safe-top) + 1rem)" }}
    >
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

          {availableAgents.length > 1 && (
            <>
              <Separator />

              <div className="space-y-2">
                <div>
                  <div className="text-sm font-medium">Target agent</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Switch the live session to a specific online agent.
                  </div>
                </div>
                <select
                  value={selectedPresenceId ?? ""}
                  onChange={(event) =>
                    setSelectedPresenceId(
                      event.target.value.length > 0
                        ? (event.target.value as Id<"agentPresence">)
                        : null,
                    )
                  }
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {availableAgents.map((agent) => (
                    <option key={agent.presenceId} value={agent.presenceId}>
                      {agent.agentName}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

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
