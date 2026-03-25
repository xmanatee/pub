import { api } from "@backend/_generated/api";
import { SiTelegram } from "@icons-pack/react-simple-icons";
import { useMutation } from "convex/react";
import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { pushAuthDebug } from "~/lib/auth-debug";
import { telegramOpenLink } from "~/lib/telegram";

interface Props {
  createAccount: () => Promise<void>;
  onDone: () => void;
}

export function TelegramNotLinkedPage({ createAccount, onDone }: Props) {
  const createLinkToken = useMutation(api.linking.createLinkToken);
  const [loading, setLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateAccount() {
    setLoading(true);
    setError(null);
    try {
      await createAccount();
      pushAuthDebug("telegram_account_created");
      onDone();
    } catch (err) {
      pushAuthDebug("telegram_account_create_error", err);
      setError("Could not create account. Please try again.");
      setLoading(false);
    }
  }

  async function handleLinkExisting() {
    setLoading(true);
    setError(null);
    try {
      await createAccount();
      const { token } = await createLinkToken();
      const url = `${window.location.origin}/link?token=${token}`;
      pushAuthDebug("telegram_link_token_created");
      setLinkUrl(url);
    } catch (err) {
      pushAuthDebug("telegram_link_flow_error", err);
      setError("Could not start linking. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (linkUrl) {
    return (
      <CenteredCard
        title="Link Your Account"
        description="Open this link in a browser to connect your existing account."
      >
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={() => telegramOpenLink(linkUrl)}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open in browser
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={onDone}
          >
            Continue to pubs
          </Button>
        </div>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard
      title="Welcome to Pub"
      description="Your Telegram account is not linked to a Pub account."
    >
      <div className="space-y-3">
        <Button
          className="w-full h-11"
          disabled={loading}
          onClick={() => void handleCreateAccount()}
        >
          <SiTelegram className="h-4 w-4" aria-hidden="true" />
          {loading ? "Creating…" : "Create account"}
        </Button>
        <div className="relative my-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full h-11"
          disabled={loading}
          onClick={() => void handleLinkExisting()}
        >
          {loading ? "Connecting…" : "Link existing account"}
        </Button>
        {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
      </div>
    </CenteredCard>
  );
}

function CenteredCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm border-border/50">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <PubLogo size={40} />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-4">{children}</CardContent>
      </Card>
    </div>
  );
}
