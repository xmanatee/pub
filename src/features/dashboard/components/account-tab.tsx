import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, Link2 } from "lucide-react";
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM, telegramOpenLink } from "~/lib/telegram";
import { api } from "../../../../convex/_generated/api";

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  telegram: "Telegram",
};

export function AccountTab() {
  const providers = useQuery(api.telegram.getLinkedProviders);
  const createLinkToken = useMutation(api.linking.createLinkToken);
  const [linkUrl, setLinkUrl] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { canUseDeveloperMode, developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();

  async function handleCreateLink() {
    setLoading(true);
    setLinkError(null);
    try {
      const { token } = await createLinkToken();
      setLinkUrl(`${window.location.origin}/link?token=${token}`);
      pushAuthDebug("account_link_token_created");
    } catch (error) {
      pushAuthDebug("account_link_token_error", error);
      setLinkError("Could not generate a link right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!providers) {
    return <div className="text-muted-foreground py-8">Loading\u2026</div>;
  }

  const hasGithub = providers.includes("github");
  const hasGoogle = providers.includes("google");
  const hasTelegram = providers.includes("telegram");

  return (
    <div className="space-y-4 mt-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Linked Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {providers.map((provider: string) => (
            <div key={provider} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
              <span className="text-sm">{PROVIDER_LABELS[provider] ?? provider}</span>
              <Badge variant="secondary" className="text-xs">
                Connected
              </Badge>
            </div>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts linked yet.</p>
          )}
        </CardContent>
      </Card>

      {IN_TELEGRAM && (!hasGithub || !hasGoogle) && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Link Another Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Link your GitHub or Google account to access your pubs from the web too.
            </p>
            {linkError ? <p className="text-sm text-destructive">{linkError}</p> : null}
            {linkUrl ? (
              <div className="space-y-2">
                <p className="text-sm">Open this link in a browser to complete linking:</p>
                <Button variant="outline" size="sm" onClick={() => telegramOpenLink(linkUrl)}>
                  <ExternalLink className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Open link page
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" disabled={loading} onClick={handleCreateLink}>
                <Link2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {loading ? "Generating\u2026" : "Generate link"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {canUseDeveloperMode && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Developer Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm">Enable in-app debug console (Eruda)</p>
                <p className="text-xs text-muted-foreground">
                  Shows a mobile console in Telegram Mini App and keeps global error logs visible.
                </p>
              </div>
              <Switch checked={developerModeEnabled} onCheckedChange={setDeveloperModeEnabled} />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.assign("/debug/auth");
              }}
            >
              Open auth debug log
            </Button>
          </CardContent>
        </Card>
      )}

      {!IN_TELEGRAM && !hasTelegram && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Link Telegram</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Open pub.blue from within Telegram to link your Telegram account.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
