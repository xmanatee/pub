import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  isLiveAnimationStyle,
  LIVE_ANIMATION_STYLE_META,
  LIVE_ANIMATION_STYLES,
  type LiveAnimationStyle,
} from "./types";

interface SettingsPanelProps {
  autoOpenCanvas: boolean;
  animationStyle: LiveAnimationStyle;
  developerModeEnabled: boolean;
  fileCount: number;
  hasCanvasContent: boolean;
  messageCount: number;
  onAutoOpenCanvasChange: (value: boolean) => void;
  onAnimationStyleChange: (value: LiveAnimationStyle) => void;
  onClearCanvas: () => void;
  onClearFiles: () => void;
  onClearMessages: () => void;
  onDeveloperModeChange: (value: boolean) => void;
  onShowDeliveryStatusChange: (value: boolean) => void;
  onVoiceModeEnabledChange: (value: boolean) => void;
  showDeliveryStatus: boolean;
  voiceModeEnabled: boolean;
}

export function SettingsPanel({
  autoOpenCanvas,
  animationStyle,
  developerModeEnabled,
  fileCount,
  hasCanvasContent,
  messageCount,
  onAutoOpenCanvasChange,
  onAnimationStyleChange,
  onClearCanvas,
  onClearFiles,
  onClearMessages,
  onDeveloperModeChange,
  onShowDeliveryStatusChange,
  onVoiceModeEnabledChange,
  showDeliveryStatus,
  voiceModeEnabled,
}: SettingsPanelProps) {
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
              <div className="text-sm font-medium">Show delivery status in chat</div>
              <div className="text-xs text-muted-foreground mt-1">
                Show delivery checkmarks under your messages.
              </div>
            </div>
            <Switch checked={showDeliveryStatus} onCheckedChange={onShowDeliveryStatusChange} />
          </div>

          <Separator />

          <div className="space-y-2">
            <div>
              <div className="text-sm font-medium">Canvas live animation</div>
              <div className="text-xs text-muted-foreground mt-1">
                Pick the live background style used in canvas mode.
              </div>
            </div>

            <Tabs
              value={animationStyle}
              onValueChange={(value) => {
                if (isLiveAnimationStyle(value)) onAnimationStyleChange(value);
              }}
            >
              <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted p-1">
                {LIVE_ANIMATION_STYLES.map((style) => (
                  <TabsTrigger key={style} value={style} className="h-10 text-xs px-1">
                    {LIVE_ANIMATION_STYLE_META[style].label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="text-xs text-muted-foreground">
              {LIVE_ANIMATION_STYLE_META[animationStyle].description}
            </div>
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
