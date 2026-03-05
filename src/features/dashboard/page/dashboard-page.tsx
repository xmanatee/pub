import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "@tanstack/react-router";
import { FileText, Key, LogOut, User } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { AccountTab } from "~/features/dashboard/components/account-tab";
import { ApiKeysTab } from "~/features/dashboard/components/api-keys-tab";
import { PubsTab } from "~/features/dashboard/components/pubs-tab";
import { useEffectiveAuth } from "~/hooks/use-effective-auth";
import { resetIdentity, trackDashboardTabChanged, trackSignOut } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM } from "~/lib/telegram";

export function DashboardPage() {
  const {
    isAuthenticated: effectiveIsAuthenticated,
    isLoading: effectiveIsLoading,
    hasConfiguredConvex,
    hasE2EFallback,
  } = useEffectiveAuth();
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  React.useEffect(() => {
    pushAuthDebug("dashboard_auth_state", {
      isLoading: effectiveIsLoading,
      isAuthenticated: effectiveIsAuthenticated,
      hasConfiguredConvex,
      hasE2EFallback,
    });
    if (!effectiveIsLoading && !effectiveIsAuthenticated) {
      pushAuthDebug("dashboard_redirect_login", {});
      navigate({ to: "/login", replace: true });
    }
  }, [effectiveIsLoading, effectiveIsAuthenticated, hasConfiguredConvex, hasE2EFallback, navigate]);

  if (effectiveIsLoading || !effectiveIsAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your pubs and API keys</p>
        </div>
        {!IN_TELEGRAM && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              trackSignOut();
              resetIdentity();
              void signOut();
            }}
            className="text-muted-foreground"
          >
            <LogOut className="h-4 w-4 mr-1" aria-hidden="true" />
            Sign out
          </Button>
        )}
      </div>

      <Tabs
        defaultValue="pubs"
        onValueChange={(tab) => {
          if (tab === "pubs" || tab === "keys" || tab === "account") {
            trackDashboardTabChanged({ tab });
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="pubs">
            <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Pubs
          </TabsTrigger>
          <TabsTrigger value="keys">
            <Key className="h-4 w-4 mr-1.5" aria-hidden="true" />
            API Keys
          </TabsTrigger>
          <TabsTrigger value="account">
            <User className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pubs">
          <PubsTab />
        </TabsContent>
        <TabsContent value="keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="account">
          <AccountTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
