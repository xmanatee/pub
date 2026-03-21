import { api } from "@backend/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { Check, ExternalLink, Link2, LogOut, Unlink, X } from "lucide-react";
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { LiveModelSettingsCard } from "~/features/dashboard/components/live-model-settings-card";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { useTelemetryPreference } from "~/hooks/use-telemetry-preference";
import {
  resetIdentity,
  trackAccountDeleted,
  trackProviderDisconnected,
  trackSignOut,
} from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM, telegramOpenLink } from "~/lib/telegram";

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  google: "Google",
  telegram: "Telegram",
};

export function SettingsTab() {
  const providers = useQuery(api.telegram.getLinkedProviders);
  const createLinkToken = useMutation(api.linking.createLinkToken);
  const disconnectProvider = useMutation(api.account.disconnectProvider);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const [linkUrl, setLinkUrl] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [linkLoading, setLinkLoading] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  const { canUseDeveloperMode, developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();
  const { telemetryEnabled, setTelemetryEnabled } = useTelemetryPreference();

  async function handleCreateLink() {
    setLinkLoading(true);
    setLinkError(null);
    try {
      const { token } = await createLinkToken();
      setLinkUrl(`${window.location.origin}/link?token=${token}`);
      pushAuthDebug("account_link_token_created");
    } catch (error) {
      pushAuthDebug("account_link_token_error", error);
      setLinkError("Could not generate a link right now. Please try again.");
    } finally {
      setLinkLoading(false);
    }
  }

  async function handleDisconnect(provider: string) {
    setDisconnecting(provider);
    try {
      await disconnectProvider({ provider });
      trackProviderDisconnected({ provider });
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleSignOut() {
    trackSignOut();
    resetIdentity();
    await signOut();
    navigate({ to: "/", replace: true });
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      trackAccountDeleted();
      resetIdentity();
      await deleteAccount();
      navigate({ to: "/", replace: true });
    } catch (error) {
      setDeleting(false);
      throw error;
    }
  }

  if (!providers) {
    return <div className="text-muted-foreground py-8">Loading\u2026</div>;
  }

  const hasGithub = providers.includes("github");
  const hasGoogle = providers.includes("google");
  const hasTelegram = providers.includes("telegram");
  const canDisconnect = providers.length > 1;

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
              {canDisconnect && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
                  disabled={disconnecting === provider}
                  onClick={() => handleDisconnect(provider)}
                  aria-label={`Disconnect ${PROVIDER_LABELS[provider] ?? provider}`}
                >
                  {disconnecting === provider ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </Button>
              )}
            </div>
          ))}
          {providers.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts linked yet.</p>
          )}
        </CardContent>
      </Card>

      <LiveModelSettingsCard />

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
              <Button variant="outline" size="sm" disabled={linkLoading} onClick={handleCreateLink}>
                <Link2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {linkLoading ? "Generating\u2026" : "Generate link"}
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
          <CardContent>
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm">Enable in-app debug console (Eruda)</p>
                <p className="text-xs text-muted-foreground">
                  Shows a mobile console in Telegram Mini App and keeps global error logs visible.
                </p>
              </div>
              <Switch checked={developerModeEnabled} onCheckedChange={setDeveloperModeEnabled} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Telemetry</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm">Send performance and error data</p>
              <p className="text-xs text-muted-foreground">
                Helps improve reliability and performance. No personal data is sent. Reload the page
                after changing this setting.
              </p>
            </div>
            <Switch checked={telemetryEnabled} onCheckedChange={setTelemetryEnabled} />
          </div>
        </CardContent>
      </Card>

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

      {!IN_TELEGRAM && (
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data including pubs, API keys, and
            live sessions. This action cannot be undone.
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="delete-confirm" className="sr-only">
              Type &quot;delete&quot; to confirm
            </label>
            <Input
              id="delete-confirm"
              placeholder='Type "delete" to confirm'
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="max-w-48"
              autoComplete="off"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteConfirmText !== "delete" || deleting}
              onClick={() => void handleDeleteAccount()}
            >
              <X className="h-4 w-4 mr-1" aria-hidden="true" />
              {deleting ? "Deleting…" : "Delete account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
