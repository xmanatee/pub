import { api } from "@backend/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { FileText, Key, Settings } from "lucide-react";
import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ApiKeysTab } from "~/features/dashboard/components/api-keys-tab";
import { PubsTab } from "~/features/dashboard/components/pubs-tab";
import { SettingsTab } from "~/features/dashboard/components/settings-tab";
import { trackDashboardTabChanged } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";

type DashboardTab = "pubs" | "keys" | "settings";

export function DashboardPage() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const onlineAgentCount = useQuery(api.presence.getOnlineAgentCount);

  React.useEffect(() => {
    pushAuthDebug("dashboard_auth_state", {
      isLoading,
      isAuthenticated,
    });
    if (!isLoading && !isAuthenticated) {
      pushAuthDebug("dashboard_redirect_login", {});
      navigate({ to: "/login", replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8">
      <Tabs
        defaultValue="pubs"
        onValueChange={(tab) => {
          trackDashboardTabChanged({ tab: tab as DashboardTab });
        }}
      >
        <TabsList>
          <TabsTrigger value="pubs">
            <FileText className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Pubs
          </TabsTrigger>
          <TabsTrigger value="keys">
            <Key className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Agents and Keys
            <span className="ml-2 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
              {onlineAgentCount ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pubs">
          <PubsTab />
        </TabsContent>
        <TabsContent value="keys">
          <ApiKeysTab />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
