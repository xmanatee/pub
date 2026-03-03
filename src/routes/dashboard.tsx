import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  Clock,
  ExternalLink,
  FileText,
  Key,
  LogOut,
  Plus,
  Radio,
  Rss,
  Trash2,
  User,
} from "lucide-react";
import * as React from "react";
import { AccountTab } from "~/components/account-tab";
import { CopyButton } from "~/components/copy-button";
import { PubCard } from "~/components/pub-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  resetIdentity,
  trackApiKeyCopied,
  trackApiKeyCreated,
  trackApiKeyDeleted,
  trackDashboardTabChanged,
  trackSignOut,
} from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { IN_TELEGRAM, telegramConfirm } from "~/lib/telegram";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const hasConfiguredConvex = Boolean(import.meta.env.VITE_CONVEX_URL);
  const hasE2EFallback = Boolean(import.meta.env.VITE_E2E_AUTH_BASE_URL);
  const effectiveIsLoading = hasConfiguredConvex ? isLoading : false;
  const effectiveIsAuthenticated = hasConfiguredConvex ? isAuthenticated : false;
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
        <div className="text-muted-foreground">Loading\u2026</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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

function formatRelativeTime(timestamp: number): string {
  const diff = timestamp - Date.now();
  if (diff <= 0) return "expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m`;
}

function ActiveLives() {
  const lives = useQuery(api.pubs.listActiveLives);
  if (!lives || lives.length === 0) return null;

  return (
    <div className="space-y-2 mb-6">
      <h3 className="text-sm font-medium text-muted-foreground">Live Now</h3>
      {lives.map((s) => (
        <a
          key={s.slug}
          href={`/p/${s.slug}`}
          className="group flex items-center justify-between rounded-lg border border-emerald-600/20 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 transition-colors hover:border-emerald-600/40"
        >
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600 animate-pulse" aria-hidden="true" />
            <span className="font-medium text-sm">{s.slug}</span>
            <Badge
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-600/20 text-xs"
            >
              {s.hasConnection ? "Connected" : "Waiting"}
            </Badge>
            <Badge variant="outline" className="gap-1 text-orange-600 border-orange-600/20 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {formatRelativeTime(s.expiresAt)}
            </Badge>
          </div>
          <ExternalLink
            className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </a>
      ))}
    </div>
  );
}

function PubsTab() {
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listByUser, {}, { initialNumItems: 12 });
  const toggleVisibility = useMutation(api.pubs.toggleVisibility);
  const deletePub = useMutation(api.pubs.deleteByUser);

  const slugs = pubs?.map((p) => p.slug) ?? [];
  const viewCounts = useQuery(api.analytics.getViewCounts, slugs.length > 0 ? { slugs } : "skip");

  if (status === "LoadingFirstPage") {
    return <div className="text-muted-foreground py-8">Loading\u2026</div>;
  }

  if (pubs.length === 0) {
    return (
      <Card className="mt-4 border-border/50 border-dashed">
        <CardContent className="flex flex-col items-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-medium mb-1">No pubs yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Use the CLI or API to create your first pub.
          </p>
          <div className="rounded-lg bg-navy text-white px-4 py-3 font-mono text-sm">
            <span className="text-primary">$</span> pubblue create index.html
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      <ActiveLives />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pubs.map((pub) => (
          <PubCard
            key={pub._id}
            pub={pub}
            viewCount={viewCounts?.[pub.slug]}
            onToggleVisibility={(id) => toggleVisibility({ id })}
            onDelete={(id) => deletePub({ id })}
          />
        ))}

        {status === "CanLoadMore" && (
          <div className="col-span-full text-center pt-4">
            <Button variant="outline" size="sm" onClick={() => loadMore(12)}>
              Load more
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="col-span-full text-center pt-4 text-muted-foreground text-sm">
            Loading more\u2026
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeysTab() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useMutation(api.apiKeys.create);
  const deleteKey = useMutation(api.apiKeys.deleteKey);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const user = useQuery(api.users.currentUser);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setLoading(true);
    try {
      const result = await createKey({ name: newKeyName.trim() });
      trackApiKeyCreated({ name: newKeyName.trim() });
      setCreatedKey(result.key);
      setNewKeyName("");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: Id<"apiKeys">) {
    if (!(await telegramConfirm("Delete this API key? This cannot be undone."))) return;
    const key = keys?.find((k) => k._id === id);
    if (key) trackApiKeyDeleted({ name: key.name });
    await deleteKey({ id });
  }

  const siteUrl = import.meta.env.VITE_CONVEX_URL
    ? import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site")
    : "";
  const rssUrl = user?._id ? `${siteUrl}/rss/${user._id}` : null;

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <label htmlFor="api-key-name" className="sr-only">
          API key name
        </label>
        <Input
          id="api-key-name"
          placeholder="Key name (e.g. my-agent)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" disabled={loading || !newKeyName.trim()} size="sm">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Create key
        </Button>
      </form>

      {createdKey && (
        <Card className="border-emerald-600/20 bg-emerald-50 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-800 dark:text-emerald-200">
              API key created! Copy it now — you won't see it again.
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 rounded flex-1 break-all font-mono">
                {createdKey}
              </code>
              <CopyButton
                text={createdKey}
                label="Copy API key"
                onCopy={() => trackApiKeyCopied()}
              />
            </div>
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-xs"
              onClick={() => setCreatedKey(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {rssUrl && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border/50 px-4 py-2">
          <Rss className="h-4 w-4 text-orange-500 shrink-0" aria-hidden="true" />
          <span>RSS feed:</span>
          <code className="text-xs font-mono truncate flex-1">{rssUrl}</code>
          <CopyButton text={rssUrl} label="Copy RSS URL" />
        </div>
      )}

      {!keys ? (
        <div className="text-muted-foreground">Loading\u2026</div>
      ) : keys.length === 0 ? (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Key className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No API keys yet</p>
            <p className="text-sm text-muted-foreground">
              Create one to start publishing via CLI or API.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div
              key={k._id}
              className="group flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:border-primary/20"
            >
              <div>
                <div className="font-medium text-sm">{k.name}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  <code className="font-mono">{k.keyPreview}</code> &middot; Created{" "}
                  {new Date(k.createdAt).toLocaleDateString()}
                  {k.lastUsedAt && ` · Last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 text-destructive hover:text-destructive hover-reveal"
                onClick={() => handleDelete(k._id)}
                aria-label="Delete key"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
