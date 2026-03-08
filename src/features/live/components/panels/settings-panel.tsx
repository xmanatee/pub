import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";

export interface SettingsPanelModel {
  behavior: {
    autoOpenCanvas: boolean;
    canUseDeveloperMode: boolean;
    developerModeEnabled: boolean;
    voiceModeEnabled: boolean;
  };
  stats: {
    fileCount: number;
    hasCanvasContent: boolean;
    messageCount: number;
  };
}

export interface SettingsPanelActions {
  onAutoOpenCanvasChange: (value: boolean) => void;
  onClearCanvas: () => void;
  onClearFiles: () => void;
  onClearMessages: () => void;
  onDeveloperModeChange: (value: boolean) => void;
  onVoiceModeEnabledChange: (value: boolean) => void;
}

interface SettingsPanelProps {
  model: SettingsPanelModel;
  actions: SettingsPanelActions;
}

export function SettingsPanel({ model, actions }: SettingsPanelProps) {
  const { behavior, stats } = model;
  const {
    onAutoOpenCanvasChange,
    onClearCanvas,
    onClearFiles,
    onClearMessages,
    onDeveloperModeChange,
    onVoiceModeEnabledChange,
  } = actions;

  const { autoOpenCanvas, canUseDeveloperMode, developerModeEnabled, voiceModeEnabled } = behavior;
  const { fileCount, hasCanvasContent, messageCount } = stats;

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
              <div className="text-sm font-medium">Auto-open canvas on incoming HTML</div>
              <div className="text-xs text-muted-foreground mt-1">
                Automatically switch to canvas when new HTML is received.
              </div>
            </div>
            <Switch checked={autoOpenCanvas} onCheckedChange={onAutoOpenCanvasChange} />
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
            <Switch checked={voiceModeEnabled} onCheckedChange={onVoiceModeEnabledChange} />
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
                <Switch checked={developerModeEnabled} onCheckedChange={onDeveloperModeChange} />
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
            Messages: {messageCount} · Files: {fileCount} · Canvas:{" "}
            {hasCanvasContent ? "loaded" : "empty"}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClearMessages}>
              Clear chat messages
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClearFiles}>
              Clear file list
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearCanvas}
              disabled={!hasCanvasContent}
            >
              Clear canvas
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
