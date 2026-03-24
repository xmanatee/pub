import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { FileText, Key, Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ApiKeysTab } from "~/features/dashboard/components/api-keys-tab";
import { PubsTab } from "~/features/dashboard/components/pubs-tab";
import { SettingsTab } from "~/features/dashboard/components/settings-tab";
import { trackDashboardTabChanged } from "~/lib/analytics";

type DashboardTab = "pubs" | "keys" | "settings";

export function DashboardPage() {
  const onlineAgentCount = useQuery(api.presence.getOnlineAgentCount);

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
