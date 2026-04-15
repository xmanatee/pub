import { Loader2 } from "lucide-react";
import * as React from "react";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { Input } from "~/core/ui/input";
import { telegram } from "./client";
import type { TelegramAuthState } from "./commands";

export function AuthFlow({ auth, onChange }: { auth: TelegramAuthState; onChange: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? <Loader2 className="animate-spin" /> : undefined;

  if (auth.status === "not-configured") {
    return (
      <Shell title="Telegram not configured" error={null}>
        <p className="text-xs text-muted-foreground">
          Add your Telegram API credentials to{" "}
          <code className="rounded bg-muted px-1">~/.pub-super-app/config.json</code>:
        </p>
        <pre className="rounded-md bg-muted p-3 text-xs">{`{
  "telegram": {
    "apiId": 1234567,
    "apiHash": "your-api-hash"
  }
}`}</pre>
        <p className="text-xs text-muted-foreground">
          Get credentials from{" "}
          <a
            className="underline"
            href="https://my.telegram.org/apps"
            target="_blank"
            rel="noreferrer"
          >
            my.telegram.org/apps
          </a>
          , then reload this page.
        </p>
      </Shell>
    );
  }

  if (auth.status === "logged-out") {
    return (
      <Shell title="Sign in to Telegram" error={error}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => telegram.sendCode(phone));
          }}
        >
          <Input
            type="tel"
            placeholder="+1 555 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!phone || busy}>
            {label ?? "Send code"}
          </Button>
        </form>
      </Shell>
    );
  }
  if (auth.status === "code-sent") {
    return (
      <Shell title="Enter the code" description={`Sent to ${auth.phone}`} error={error}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() =>
              telegram.verify({
                phone: auth.phone,
                phoneCodeHash: auth.phoneCodeHash,
                code,
              }),
            );
          }}
        >
          <Input
            inputMode="numeric"
            placeholder="12345"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" className="w-full" disabled={!code || busy}>
            {label ?? "Verify"}
          </Button>
        </form>
      </Shell>
    );
  }
  return (
    <Shell title="Two-factor password" error={error}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => telegram.password(password));
        }}
      >
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" disabled={!password || busy}>
          {label ?? "Sign in"}
        </Button>
      </form>
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
  error,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  error: string | null;
}) {
  return (
    <Card className="mx-auto w-full max-w-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
