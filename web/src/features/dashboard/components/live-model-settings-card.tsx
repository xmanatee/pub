import { api } from "@backend/_generated/api";
import { DEFAULT_LIVE_MODEL_PROFILE, type LiveModelProfile } from "@shared/live-model-profile";
import { useMutation, useQuery } from "convex/react";
import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { trackError } from "~/lib/analytics";
import { cn } from "~/lib/utils";

const MODEL_OPTIONS: Array<{
  value: LiveModelProfile;
  label: string;
  description: string;
}> = [
  {
    value: "fast",
    label: "Fast",
    description: "Lowest latency. Best when you want quick turns and lighter reasoning.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Default tradeoff for most live sessions.",
  },
  {
    value: "thorough",
    label: "Thorough",
    description: "More deliberate and expensive. Best when depth matters more than speed.",
  },
];

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Could not save model preference right now. Please try again.";
}

export function LiveModelSettingsCard() {
  const user = useQuery(api.users.currentUser);
  const setLiveModelProfile = useMutation(api.users.setLiveModelProfile);
  const [pendingProfile, setPendingProfile] = React.useState<LiveModelProfile | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activeProfile = pendingProfile ?? user?.liveModelProfile ?? DEFAULT_LIVE_MODEL_PROFILE;
  const saving = pendingProfile !== null;

  async function handleSelect(profile: LiveModelProfile) {
    if (saving || profile === activeProfile) return;

    setPendingProfile(profile);
    setError(null);
    try {
      await setLiveModelProfile({ liveModelProfile: profile });
    } catch (error) {
      const message = mutationErrorMessage(error);
      trackError(error instanceof Error ? error : new Error(message), {
        area: "dashboard",
        feature: "live_model_preference",
        profile,
      });
      setError(message);
    } finally {
      setPendingProfile(null);
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Live Model</CardTitle>
        <CardDescription>
          Used for new live sessions. Claude bridges map this to Haiku, Sonnet, or Opus.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          {MODEL_OPTIONS.map((option) => {
            const selected = activeProfile === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => void handleSelect(option.value)}
                aria-pressed={selected}
                disabled={saving}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                  selected
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border/60 bg-card hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium">{option.label}</div>
                  {selected ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{option.description}</p>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Changes apply on the next live connect. Existing live sessions keep their current model.
        </p>

        {saving ? <p className="text-xs text-muted-foreground">Saving…</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
