import { Loader2 } from "lucide-react";
import * as React from "react";
import type { TelegramAuthState } from "~/commands/results";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { type CommandName, invoke } from "~/lib/pub";

export function AuthFlow({ auth, onChange }: { auth: TelegramAuthState; onChange: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (action: CommandName, params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await invoke(action, params);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "logged-out") {
    return (
      <PhoneStep
        busy={busy}
        error={error}
        onSubmit={(phone) => run("telegram.auth.send-code", { phone })}
      />
    );
  }
  if (auth.status === "code-sent") {
    return (
      <CodeStep
        phone={auth.phone}
        busy={busy}
        error={error}
        onSubmit={(code) =>
          run("telegram.auth.verify", {
            phone: auth.phone,
            phoneCodeHash: auth.phoneCodeHash,
            code,
          })
        }
      />
    );
  }
  if (auth.status === "needs-password") {
    return (
      <PasswordStep
        busy={busy}
        error={error}
        onSubmit={(password) => run("telegram.auth.password", { password })}
      />
    );
  }
  return null;
}

function StepShell({
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

function SubmitButton({
  busy,
  disabled,
  label,
}: {
  busy: boolean;
  disabled: boolean;
  label: string;
}) {
  return (
    <Button type="submit" className="w-full" disabled={disabled}>
      {busy ? <Loader2 className="animate-spin" /> : label}
    </Button>
  );
}

function PhoneStep({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (phone: string) => void;
}) {
  const [phone, setPhone] = React.useState("");
  return (
    <StepShell title="Sign in to Telegram" error={error}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(phone);
        }}
      >
        <Input
          type="tel"
          placeholder="+1 555 123 4567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <SubmitButton busy={busy} disabled={!phone || busy} label="Send code" />
      </form>
    </StepShell>
  );
}

function CodeStep({
  phone,
  busy,
  error,
  onSubmit,
}: {
  phone: string;
  busy: boolean;
  error: string | null;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = React.useState("");
  return (
    <StepShell title="Enter the code" description={`Sent to ${phone}`} error={error}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(code);
        }}
      >
        <Input
          inputMode="numeric"
          placeholder="12345"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <SubmitButton busy={busy} disabled={!code || busy} label="Verify" />
      </form>
    </StepShell>
  );
}

function PasswordStep({
  busy,
  error,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = React.useState("");
  return (
    <StepShell title="Two-factor password" error={error}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(password);
        }}
      >
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <SubmitButton busy={busy} disabled={!password || busy} label="Sign in" />
      </form>
    </StepShell>
  );
}
