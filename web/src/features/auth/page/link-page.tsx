import { api } from "@backend/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import * as React from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { pushAuthDebug } from "~/lib/auth-debug";

export function LinkPage({ token }: { token: string }) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const tokenInfo = useQuery(api.linking.getLinkTokenInfo, token ? { token } : "skip");
  const completeMerge = useMutation(api.linking.completeMerge);
  const [merged, setMerged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mergeAttemptedRef = React.useRef(false);

  const startLinkSignIn = React.useCallback(
    async (provider: "github" | "google") => {
      try {
        pushAuthDebug("link_signin_start", { provider, tokenPresent: Boolean(token) });
        const result = await signIn(provider, { redirectTo: `/link?token=${token}` });
        if (!result.redirect && !result.signingIn) {
          console.warn(`Link sign-in did not start for provider: ${provider}`);
          pushAuthDebug("link_signin_incomplete", { provider });
          setError("Could not start sign-in. Please try again.");
        }
      } catch (err) {
        pushAuthDebug("link_signin_error", { provider, err });
        setError("Could not start sign-in. Please try again.");
      }
    },
    [signIn, token],
  );

  React.useEffect(() => {
    pushAuthDebug("link_state", {
      authLoading,
      isAuthenticated,
      tokenPresent: Boolean(token),
      tokenValid: tokenInfo?.valid ?? null,
    });
    if (!isAuthenticated || mergeAttemptedRef.current || !tokenInfo?.valid) return;
    mergeAttemptedRef.current = true;

    completeMerge({ token })
      .then(() => setMerged(true))
      .catch((err) => {
        pushAuthDebug("link_complete_merge_error", err);
        setError("Failed to link accounts. The token may have expired.");
      });
  }, [authLoading, isAuthenticated, tokenInfo, token, completeMerge]);

  if (!token) {
    return (
      <CenteredCard title="Invalid Link" description="No link token provided.">
        <p className="text-sm text-muted-foreground">
          Generate a link from the Telegram Mini App to link your accounts.
        </p>
      </CenteredCard>
    );
  }

  if (merged) {
    return (
      <CenteredCard title="Accounts Linked" description="Your accounts have been linked.">
        <p className="text-sm text-muted-foreground">
          You can close this page and return to Telegram.
        </p>
      </CenteredCard>
    );
  }

  if (error) {
    return (
      <CenteredCard title="Linking Failed" description={error}>
        <p className="text-sm text-muted-foreground">
          Try generating a new link from the Telegram Mini App.
        </p>
      </CenteredCard>
    );
  }

  if (tokenInfo && !tokenInfo.valid) {
    return (
      <CenteredCard title="Link Expired" description="This link token is invalid or expired.">
        <p className="text-sm text-muted-foreground">
          Generate a new link from the Telegram Mini App.
        </p>
      </CenteredCard>
    );
  }

  if (authLoading || !tokenInfo) {
    return (
      <div className="auth-panel-min-height flex items-center justify-center px-4">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="auth-panel-min-height flex items-center justify-center px-4">
        <div className="text-muted-foreground text-sm">Linking accounts…</div>
      </div>
    );
  }

  return (
    <CenteredCard
      title="Link Your Account"
      description={
        tokenInfo.userName
          ? `Sign in to link with ${tokenInfo.userName}'s Telegram account`
          : "Sign in to link with your Telegram account"
      }
    >
      <div className="space-y-3">
        <Button
          variant="outline"
          className="w-full h-11"
          onClick={() => {
            void startLinkSignIn("github");
          }}
        >
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          className="w-full h-11"
          onClick={() => {
            void startLinkSignIn("google");
          }}
        >
          Continue with Google
        </Button>
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
    <div className="auth-panel-min-height flex items-center justify-center px-4">
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
