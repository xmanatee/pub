import type { Id } from "@backend/_generated/dataModel";
import type { LiveAgentProfileOption } from "@shared/live-agent-profile";
import { Star } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { resolveDefaultLiveProfileId } from "~/features/live/model/agent-selection";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { isFullscreenSupported } from "~/hooks/use-fullscreen";
import { cn } from "~/lib/utils";

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
    liveProfilesByAgent,
    messages,
    selectedHostId,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    setDeveloperModeEnabled,
    setLiveProfileForAgent,
    setSelectedHostId,
    setVoiceModeEnabled,
    voiceModeEnabled,
  } = useLiveSession();

  const canSwitchAgent = availableAgents.length > 1;
  const selectedAgent = selectedHostId
    ? availableAgents.find((agent) => agent.hostId === selectedHostId)
    : availableAgents.length === 1
      ? availableAgents[0]
      : null;

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

      {selectedAgent && (selectedAgent.liveProfiles ?? []).length > 0 && (
        <LiveProfileCard
          profiles={selectedAgent.liveProfiles ?? []}
          selectedProfileId={liveProfilesByAgent[selectedAgent.agentName] ?? null}
          onSelectProfile={(profileId) =>
            setLiveProfileForAgent(selectedAgent.agentName, profileId)
          }
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
                    Keep detailed pub errors and source controls visible while debugging.
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
  availableAgents: Array<{
    hostId: Id<"hosts">;
    agentName: string;
    liveProfiles?: LiveAgentProfileOption[];
  }>;
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

function LiveProfileCard({
  profiles,
  selectedProfileId,
  onSelectProfile,
}: {
  profiles: LiveAgentProfileOption[];
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string) => void;
}) {
  const selectedProfileIsAvailable = profiles.some((profile) => profile.id === selectedProfileId);
  const activeProfileId = selectedProfileIsAvailable
    ? selectedProfileId
    : (resolveDefaultLiveProfileId(profiles) ?? null);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Profile</CardTitle>
        <CardDescription>Used for new live sessions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {profiles.map((profile) => {
            const isCurrent = activeProfileId === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                aria-pressed={isCurrent}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors",
                  isCurrent
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border/60 bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
                onClick={() => onSelectProfile(profile.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{profile.label}</div>
                  {isCurrent ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      Current
                    </span>
                  ) : null}
                </div>
                {profile.description && (
                  <p className="mt-2 text-xs text-muted-foreground">{profile.description}</p>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Changes apply on the next live connection. Existing sessions keep their current profile.
        </p>
      </CardContent>
    </Card>
  );
}
