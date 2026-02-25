import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import * as React from "react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/link")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
  component: LinkPage,
});

function LinkPage() {
  const { token } = Route.useSearch();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const tokenInfo = useQuery(api.linking.getLinkTokenInfo, token ? { token } : "skip");
  const completeMerge = useMutation(api.linking.completeMerge);
  const [merged, setMerged] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const mergeAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!isAuthenticated || mergeAttemptedRef.current || !tokenInfo?.valid) return;
    mergeAttemptedRef.current = true;

    completeMerge({ token })
      .then(() => setMerged(true))
      .catch(() => setError("Failed to link accounts. The token may have expired."));
  }, [isAuthenticated, tokenInfo, token, completeMerge]);

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
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
        <div className="text-muted-foreground text-sm">Linking accounts...</div>
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
          onClick={() => void signIn("github", { redirectTo: `/link?token=${token}` })}
        >
          Continue with GitHub
        </Button>
        <Button
          variant="outline"
          className="w-full h-11"
          onClick={() => void signIn("google", { redirectTo: `/link?token=${token}` })}
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
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] px-4">
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
