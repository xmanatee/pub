import { useAuthActions } from "@convex-dev/auth/react";
import { SiGithub, SiGoogle } from "@icons-pack/react-simple-icons";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { trackSignIn, trackSignInStarted } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM } from "~/lib/telegram";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const hasConfiguredConvex = Boolean(import.meta.env.VITE_CONVEX_URL);
  const e2eAuthBaseUrl = import.meta.env.VITE_E2E_AUTH_BASE_URL;
  const hasE2EFallback = Boolean(e2eAuthBaseUrl);
  const effectiveIsLoading = hasConfiguredConvex ? isLoading : false;
  const effectiveIsAuthenticated = hasConfiguredConvex ? isAuthenticated : false;
  const navigate = useNavigate();
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
      pushAuthDebug("oauth_start", { provider, redirectTo: "/dashboard" });

      if (!hasConfiguredConvex && hasE2EFallback && e2eAuthBaseUrl) {
        const url = new URL(`/api/auth/signin/${provider}`, e2eAuthBaseUrl);
        url.searchParams.set("redirectTo", "/dashboard");
        window.location.assign(url.toString());
        return;
      }

      try {
        const result = await signIn(provider, { redirectTo: "/dashboard" });
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
          setAuthError("Could not start sign-in. Please try again.");
        }
      } catch (error) {
        console.error("OAuth sign-in failed to start", error);
        pushAuthDebug("oauth_start_error", { provider, error });
        isStartingSignInRef.current = false;
        setPendingProvider(null);
        setAuthError("Could not start sign-in. Please try again.");
      }
    },
    [hasConfiguredConvex, hasE2EFallback, pendingProvider, signIn],
  );

  React.useEffect(() => {
    pushAuthDebug("login_auth_state", {
      isLoading: effectiveIsLoading,
      isAuthenticated: effectiveIsAuthenticated,
      hasConfiguredConvex,
    });
    if (!effectiveIsLoading && effectiveIsAuthenticated) {
      trackSignIn("oauth");
      navigate({ to: "/dashboard", replace: true });
    }
  }, [effectiveIsAuthenticated, effectiveIsLoading, hasConfiguredConvex, navigate]);

  if (effectiveIsLoading || effectiveIsAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

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
            {authError ? (
              <p className="text-center text-sm text-destructive">{authError}</p>
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Telegram sign-in could not be completed. Please try reopening the app.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hasConfiguredConvex && !hasE2EFallback) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <Card className="w-full max-w-sm border-border/50">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              <PubLogo size={40} />
            </div>
            <CardTitle className="text-2xl">Configuration Required</CardTitle>
            <CardDescription>Set `VITE_CONVEX_URL` to enable authentication.</CardDescription>
          </CardHeader>
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
          <CardDescription>Authenticate to manage publications and API keys</CardDescription>
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
            {pendingProvider === "github" ? "Connecting\u2026" : "Continue with GitHub"}
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
            {pendingProvider === "google" ? "Connecting\u2026" : "Continue with Google"}
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
