import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { trackSignIn, trackSignInStarted } from "~/lib/analytics";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const wasAuthenticated = React.useRef(false);

  // Detect OAuth callback after hydration to avoid SSR mismatch.
  // During SSR there is no `window`, so this must start as false and
  // flip in a useEffect so the server and client initial renders agree.
  const [isOAuthCallback, setIsOAuthCallback] = React.useState(false);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("code")) {
      setIsOAuthCallback(true);
    }
  }, []);

  React.useEffect(() => {
    if (isAuthenticated) {
      if (!wasAuthenticated.current) {
        wasAuthenticated.current = true;
        trackSignIn("oauth");
      }
      navigate({ to: "/dashboard" });
    }
  }, [isAuthenticated, navigate]);

  // While the auth library exchanges the OAuth code, show a spinner
  // instead of the login form to avoid a confusing flash.
  if (isOAuthCallback && !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-muted-foreground text-sm">Completing sign-in…</div>
      </div>
    );
  }

  // Already authenticated (e.g. returning user) — wait for redirect
  if (isLoading || isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-muted-foreground text-sm">Loading…</div>
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
            onClick={() => {
              trackSignInStarted("github");
              void signIn("github", { redirectTo: "/login" });
            }}
          >
            <GitHubIcon />
            Continue with GitHub
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
            onClick={() => {
              trackSignInStarted("google");
              void signIn("google", { redirectTo: "/login" });
            }}
          >
            <GoogleIcon />
            Continue with Google
          </Button>
          <p className="text-center text-xs text-muted-foreground pt-2">
            By continuing, you agree to our terms of service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function GitHubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-label="GitHub">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-label="Google">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
