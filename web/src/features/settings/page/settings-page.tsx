import { api } from "@backend/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { SiGithub, SiGoogle, SiTelegram } from "@icons-pack/react-simple-icons";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ExternalLink, Link2, LogOut, X } from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { LiveModelSettingsCard } from "~/features/settings/components/live-model-settings-card";
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

const PROVIDER_CONFIG: Record<
  string,
  { label: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  github: { label: "GitHub", Icon: SiGithub },
  google: { label: "Google", Icon: SiGoogle },
  telegram: { label: "Telegram", Icon: SiTelegram },
};

export function SettingsPage() {
  const accounts = useQuery(api.telegram.getLinkedProviders);
  const createLinkToken = useMutation(api.linking.createLinkToken);
  const disconnectProvider = useMutation(api.account.disconnectProvider);
  const deleteAccount = useMutation(api.account.deleteAccount);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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

  if (!accounts) {
    return (
      <div className="px-4 sm:px-6 py-8">
        <div className="text-muted-foreground py-8">Loading...</div>
      </div>
    );
  }

  const connectedProviders = new Set(accounts.map((a) => a.provider));
  const hasGithub = connectedProviders.has("github");
  const hasGoogle = connectedProviders.has("google");
  const hasTelegram = connectedProviders.has("telegram");
  const canDisconnect = accounts.length > 1;

  const showTelegramLinkHint = !IN_TELEGRAM && !hasTelegram;
  const showWebLinkAction = IN_TELEGRAM && (!hasGithub || !hasGoogle);

  return (
    <div className="px-4 sm:px-6 py-8 space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Linked Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {accounts.length === 0 && (
            <p className="text-sm text-muted-foreground">No accounts linked yet.</p>
          )}
          {accounts.map((account) => {
            const config = PROVIDER_CONFIG[account.provider];
            const Icon = config?.Icon;
            const label = config?.label ?? account.provider;
            return (
              <div
                key={account.provider}
                className="flex items-center justify-between rounded-lg border border-border/50 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    {account.identifier && (
                      <div className="text-xs text-muted-foreground truncate">
                        {account.identifier}
                      </div>
                    )}
                  </div>
                </div>
                {canDisconnect && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-destructive shrink-0"
                    disabled={disconnecting === account.provider}
                    onClick={() => void handleDisconnect(account.provider)}
                  >
                    {disconnecting === account.provider ? "..." : "Disconnect"}
                  </Button>
                )}
              </div>
            );
          })}
          {showTelegramLinkHint && (
            <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/50 px-4 py-3">
              <SiTelegram className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">
                Open pub.blue in Telegram to link your Telegram account.
              </p>
            </div>
          )}
          {showWebLinkAction && (
            <div className="rounded-lg border border-dashed border-border/50 px-4 py-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Link your GitHub or Google account to access your pubs from the web too.
              </p>
              {linkError ? <p className="text-xs text-destructive">{linkError}</p> : null}
              {linkUrl ? (
                <Button variant="outline" size="sm" onClick={() => telegramOpenLink(linkUrl)}>
                  <ExternalLink className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  Open link page
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={linkLoading}
                  onClick={handleCreateLink}
                >
                  <Link2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                  {linkLoading ? "Generating..." : "Generate link"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <LiveModelSettingsCard />

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

      {!IN_TELEGRAM && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="h-4 w-4 mr-1.5" aria-hidden="true" />
          Sign out
        </Button>
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
              {deleting ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
