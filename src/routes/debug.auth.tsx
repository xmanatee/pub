import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  type AuthDebugEntry,
  clearAuthDebugLog,
  getAuthDebugLog,
  pushAuthDebug,
} from "~/lib/auth-debug";

export const Route = createFileRoute("/debug/auth")({
  component: AuthDebugPage,
});

function AuthDebugPage() {
  const [entries, setEntries] = React.useState<AuthDebugEntry[]>(() => getAuthDebugLog());
  const [copied, setCopied] = React.useState(false);

  const refresh = React.useCallback(() => {
    setEntries(getAuthDebugLog());
  }, []);

  React.useEffect(() => {
    pushAuthDebug("debug_page_open", { entries: getAuthDebugLog().length });
    refresh();
  }, [refresh]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Auth Debug Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={refresh}>
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const text = JSON.stringify(entries, null, 2);
                void navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? "Copied" : "Copy JSON"}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                clearAuthDebugLog();
                setEntries([]);
              }}
            >
              Clear
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Entries: <span className="font-mono">{entries.length}</span>
          </p>

          <pre className="rounded-md border border-border/50 bg-muted/30 p-4 text-xs overflow-auto max-h-[65vh]">
            {entries.length === 0
              ? "No auth events captured yet."
              : JSON.stringify(entries, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
