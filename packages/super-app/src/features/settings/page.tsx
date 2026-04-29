import { Loader2, Moon, Save, Sun } from "lucide-react";
import * as React from "react";
import { useTryToast } from "~/core/hooks/use-toast";
import { useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { useTheme } from "~/core/shell/theme";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/core/ui/card";
import { Input } from "~/core/ui/input";
import { Label } from "~/core/ui/label";
import { Separator } from "~/core/ui/separator";
import { settingsApi } from "./client";

interface TelegramConfig {
  apiId: number;
  apiHash: string;
}

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const tryToast = useTryToast();
  const cfg = useAsync(() => settingsApi.get("telegram"), []);
  const [tg, setTg] = React.useState({ apiId: "", apiHash: "" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (cfg.state.status !== "loaded" || !cfg.state.value) return;
    const value = cfg.state.value as Partial<TelegramConfig>;
    setTg({
      apiId: typeof value.apiId === "number" ? String(value.apiId) : "",
      apiHash: typeof value.apiHash === "string" ? value.apiHash : "",
    });
  }, [cfg.state]);

  const saveTelegram = async () => {
    const apiIdNum = Number(tg.apiId);
    if (!Number.isFinite(apiIdNum) || apiIdNum <= 0 || !tg.apiHash.trim()) {
      tryToast(() => Promise.reject(new Error("Provide a numeric apiId and an apiHash")), {
        errorTitle: "Invalid Telegram credentials",
      });
      return;
    }
    setBusy(true);
    await tryToast(
      () => settingsApi.set("telegram", { apiId: apiIdNum, apiHash: tg.apiHash.trim() }),
      { successTitle: "Telegram credentials saved" },
    );
    setBusy(false);
    cfg.reload();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" description="Credentials, theme, integrations" />
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-2xl space-y-6 p-6">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>Choose the default surface color.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
              >
                <Sun className="size-3.5" /> Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
              >
                <Moon className="size-3.5" /> Dark
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Telegram</CardTitle>
              <CardDescription>
                Stored at{" "}
                <code className="rounded bg-muted px-1 text-xs">~/.pub-super-app/config.json</code>.
                Get credentials from{" "}
                <a
                  className="text-primary underline-offset-4 hover:underline"
                  href="https://my.telegram.org/apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  my.telegram.org/apps
                </a>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="tg-api-id">API ID</Label>
                <Input
                  id="tg-api-id"
                  inputMode="numeric"
                  value={tg.apiId}
                  onChange={(e) => setTg({ ...tg, apiId: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="1234567"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tg-api-hash">API hash</Label>
                <Input
                  id="tg-api-hash"
                  value={tg.apiHash}
                  onChange={(e) => setTg({ ...tg, apiHash: e.target.value })}
                  placeholder="0123abcdef…"
                />
              </div>
              <Separator />
              <Button onClick={saveTelegram} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Save className="size-3.5" />} Save
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Google (Gmail + Calendar)</CardTitle>
              <CardDescription>
                Mail + Calendar use the <code className="rounded bg-muted px-1 text-xs">gog</code>{" "}
                CLI. Run <code className="rounded bg-muted px-1 text-xs">gog auth login</code> in
                your shell to grant access.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              The gog CLI manages OAuth on disk; super-app simply invokes it via the daemon.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
