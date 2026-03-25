import { api } from "@backend/_generated/api";
import type { Id } from "@backend/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Key, Plus, Terminal, Trash2 } from "lucide-react";
import * as React from "react";
import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { trackApiKeyCopied, trackApiKeyCreated, trackApiKeyDeleted } from "~/lib/analytics";
import { telegramConfirm } from "~/lib/telegram";

const INSTALL_COMMAND = "curl -fsSL pub.blue/install.sh | bash";

export function AgentsPage() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useMutation(api.apiKeys.create);
  const deleteKey = useMutation(api.apiKeys.deleteKey);
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
    if (!(await telegramConfirm("Delete this API key? This cannot be undone."))) return;
    const key = keys?.find((k) => k._id === id);
    if (key) trackApiKeyDeleted({ name: key.name });
    await deleteKey({ id });
  }

  return (
    <div className="px-4 sm:px-6 py-8 space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-border/50 px-4 py-2">
        <Terminal className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Install CLI:</span>
        <code className="text-xs font-mono truncate flex-1">{INSTALL_COMMAND}</code>
        <CopyButton text={INSTALL_COMMAND} label="Copy install command" />
      </div>

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

      {!keys ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : keys.length === 0 ? (
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Key className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No API keys yet</p>
            <p className="text-sm text-muted-foreground">
              Create one to connect your agent via CLI or API.
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
              <div className="flex items-center gap-2">
                {k.agentName && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {k.agentName}
                  </span>
                )}
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
