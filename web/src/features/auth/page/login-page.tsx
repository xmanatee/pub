import { useAuthActions } from "@convex-dev/auth/react";
import { SiGithub, SiGoogle } from "@icons-pack/react-simple-icons";
import * as React from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { trackSignInStarted } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM } from "~/lib/telegram";

export function LoginPage() {
  const { signIn } = useAuthActions();
  const isStartingSignInRef = React.useRef(false);
  const [pendingProvider, setPendingProvider] = React.useState<"github" | "google" | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const startOAuthSignIn = React.useCallback(
    async (provider: "github" | "google") => {
      if (isStartingSignInRef.current || pendingProvider) return;

      isStartingSignInRef.current = true;
      setAuthError(null);
      setPendingProvider(provider);
      trackSignInStarted(provider);
      pushAuthDebug("oauth_start", { provider, redirectTo: "/pubs" });

      try {
        const result = await signIn(provider, { redirectTo: "/pubs" });
        pushAuthDebug("oauth_start_result", {
          provider,
          hasRedirect: Boolean(result.redirect),
          signingIn: result.signingIn,
          redirect: result.redirect?.toString(),
        });
        if (!result.redirect) {
          isStartingSignInRef.current = false;
          setPendingProvider(null);
        }
        if (!result.redirect && !result.signingIn) {
          pushAuthDebug("oauth_start_incomplete", { provider });
          setAuthError("Could not start sign-in. Please try again.");
        }
      } catch (error) {
        pushAuthDebug("oauth_start_error", { provider, error });
        isStartingSignInRef.current = false;
        setPendingProvider(null);
        setAuthError("Could not start sign-in. Please try again.");
      }
    },
    [pendingProvider, signIn],
  );

  if (IN_TELEGRAM) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <Card className="w-full max-w-sm border-border/50">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <PubLogo size={40} />
            </div>
            <CardTitle className="text-2xl">Sign in to Pub</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-center text-sm text-muted-foreground">
              Telegram sign-in could not be completed. Please try reopening the app.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
      <Card className="w-full max-w-sm border-border/50">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <PubLogo size={40} />
          </div>
          <CardTitle className="text-2xl">Sign in to Pub</CardTitle>
          <CardDescription>Authenticate to manage pubs and API keys</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <Button
            variant="outline"
            className="w-full h-11"
            disabled={pendingProvider !== null}
            onClick={() => {
              void startOAuthSignIn("github");
            }}
          >
            <SiGithub className="h-4 w-4" aria-hidden="true" />
            {pendingProvider === "github" ? "Connecting…" : "Continue with GitHub"}
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
            disabled={pendingProvider !== null}
            onClick={() => {
              void startOAuthSignIn("google");
            }}
          >
            <SiGoogle className="h-4 w-4" aria-hidden="true" />
            {pendingProvider === "google" ? "Connecting…" : "Continue with Google"}
          </Button>
          {authError ? <p className="text-center text-xs text-destructive">{authError}</p> : null}
          <p className="text-center text-xs text-muted-foreground pt-2">
            By continuing, you agree to our terms of service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
