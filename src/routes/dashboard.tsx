import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Key,
  Lock,
  LogOut,
  Plus,
  Trash2,
} from "lucide-react";
import * as React from "react";
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
  trackPublicationDeleted,
  trackPublicationLinkCopied,
  trackSignOut,
  trackVisibilityToggled,
} from "~/lib/analytics";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();

  // Wait for auth state to fully settle before redirecting.
  // ConvexAuthProvider may need an extra render cycle to process an OAuth
  // callback code in the URL, so we delay the "not authenticated" decision.
  const [authSettled, setAuthSettled] = React.useState(false);

  React.useEffect(() => {
    if (isLoading) {
      setAuthSettled(false);
      return;
    }
    const timer = setTimeout(() => setAuthSettled(true), 300);
    return () => clearTimeout(timer);
  }, [isLoading]);

  React.useEffect(() => {
    if (authSettled && !isAuthenticated) {
      navigate({ to: "/login" });
    }
  }, [authSettled, isAuthenticated, navigate]);

  if (!authSettled || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your publications and API keys
          </p>
        </div>
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
          <LogOut className="h-4 w-4 mr-1" />
          Sign out
        </Button>
      </div>

      <Tabs
        defaultValue="publications"
        onValueChange={(tab) => trackDashboardTabChanged({ tab: tab as "publications" | "keys" })}
      >
        <TabsList>
          <TabsTrigger value="publications">
            <FileText className="h-4 w-4 mr-1.5" />
            Publications
          </TabsTrigger>
          <TabsTrigger value="keys">
            <Key className="h-4 w-4 mr-1.5" />
            API Keys
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publications">
          <PublicationsTab />
        </TabsContent>
        <TabsContent value="keys">
          <ApiKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CopyButton({ text, onCopy }: { text: string; onCopy?: () => void }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={() => {
        navigator.clipboard.writeText(text);
        onCopy?.();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      title="Copy URL"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function PublicationsTab() {
  const publications = useQuery(api.publications.listByUser);
  const toggleVisibility = useMutation(api.publications.toggleVisibility);
  const deletePub = useMutation(api.publications.deleteByUser);

  if (!publications) {
    return <div className="text-muted-foreground py-8">Loading...</div>;
  }

  if (publications.length === 0) {
    return (
      <Card className="mt-4 border-border/50 border-dashed">
        <CardContent className="flex flex-col items-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="font-medium mb-1">No publications yet</p>
          <p className="text-sm text-muted-foreground mb-6">
            Use the CLI or API to publish your first file.
          </p>
          <div className="rounded-lg bg-navy text-white px-4 py-3 font-mono text-sm">
            <span className="text-primary">$</span> pubblue publish index.html
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2 mt-4">
      {publications.map((pub) => (
        <div
          key={pub._id}
          className="group flex items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:border-primary/20"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`/p/${pub.slug}`}
                className="font-medium text-sm hover:text-primary transition-colors truncate"
              >
                {pub.title || pub.filename}
              </a>
              <Badge variant="secondary" className="text-xs">
                {pub.contentType}
              </Badge>
              {pub.isPublic ? (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 text-emerald-600 border-emerald-600/20"
                >
                  <Globe className="h-3 w-3" />
                  public
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-xs gap-1 text-amber-600 border-amber-600/20"
                >
                  <Lock className="h-3 w-3" />
                  private
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              /{pub.slug} &middot; {new Date(pub.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div className="flex items-center gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton
              text={`${window.location.origin}/p/${encodeURIComponent(pub.slug)}`}
              onCopy={() => trackPublicationLinkCopied({ slug: pub.slug })}
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
              <a
                href={`/p/${encodeURIComponent(pub.slug)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Open"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                trackVisibilityToggled({
                  slug: pub.slug,
                  newVisibility: pub.isPublic ? "private" : "public",
                });
                toggleVisibility({ id: pub._id });
              }}
              title={pub.isPublic ? "Make private" : "Make public"}
            >
              {pub.isPublic ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm("Delete this publication?")) {
                  trackPublicationDeleted({
                    slug: pub.slug,
                    contentType: pub.contentType,
                  });
                  deletePub({ id: pub._id });
                }
              }}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ApiKeysTab() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useMutation(api.apiKeys.create);
  const removeKey = useMutation(api.apiKeys.remove);
  const [newKeyName, setNewKeyName] = React.useState("");
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

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
    if (!confirm("Delete this API key? This cannot be undone.")) return;
    const key = keys?.find((k) => k._id === id);
    if (key) trackApiKeyDeleted({ name: key.name });
    await removeKey({ id });
  }

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="Key name (e.g. my-agent)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !newKeyName.trim()} size="sm">
          <Plus className="h-4 w-4 mr-1" />
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
              <CopyButton text={createdKey} onCopy={() => trackApiKeyCopied()} />
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

      {!keys ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : keys.length === 0 ? (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Key className="h-8 w-8 text-muted-foreground" />
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
                className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(k._id)}
                title="Delete key"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
