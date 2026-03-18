import { api } from "@backend/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileText, Loader2, Play } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { PubSortChips } from "~/features/dashboard/components/pub-sort-chips";
import { PubsGrid } from "~/features/dashboard/components/pubs-grid";
import type { PubSortKey } from "~/features/dashboard/lib/sort-pubs";
import { trackError } from "~/lib/analytics";

const PAGE_SIZE = 20;

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Failed to start live";
}

export function PubsTab() {
  const [sortKey, setSortKey] = React.useState<PubSortKey>("lastViewed");
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listByUser, { sortKey }, { initialNumItems: PAGE_SIZE });

  const navigate = useNavigate();
  const [startingLive, setStartingLive] = React.useState(false);

  const toggleVisibility = useMutation(api.pubs.toggleVisibility);
  const deletePub = useMutation(api.pubs.deleteByUser);
  const createDraftForLive = useMutation(api.pubs.createDraftForLive);
  const agentOnline = useQuery(api.presence.isCurrentUserAgentOnline);

  const lives = useQuery(api.pubs.listActiveLives);
  const liveSlugs = React.useMemo<Set<string>>(
    () => new Set(lives?.map((live) => live.slug) ?? []),
    [lives],
  );

  const canStartLive = agentOnline === true && !startingLive;

  async function handleStartLive() {
    if (!canStartLive) return;
    setStartingLive(true);
    try {
      const { slug } = await createDraftForLive({});
      await navigate({
        to: "/p/$slug",
        params: { slug },
      });
    } catch (error) {
      const message = mutationErrorMessage(error);
      const normalizedError = error instanceof Error ? error : new Error(message);
      trackError(normalizedError, {
        area: "dashboard",
        feature: "start_live",
      });
    } finally {
      setStartingLive(false);
    }
  }

  if (status === "LoadingFirstPage") {
    return <div className="text-muted-foreground py-8">Loading&hellip;</div>;
  }

  const disabled = agentOnline !== true || startingLive;
  const ariaLabel = startingLive
    ? "Starting live…"
    : agentOnline === undefined
      ? "Checking agent availability"
      : disabled
        ? "Agent offline"
        : "Go live";

  const goLiveButton = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex items-center justify-end px-3"
      style={{ paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={() => void handleStartLive()}
        disabled={disabled}
        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl transition-opacity hover:opacity-90 disabled:opacity-50"
        aria-label={ariaLabel}
        title={ariaLabel}
      >
        {startingLive || agentOnline === undefined ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Play className="size-5 fill-current" />
        )}
      </button>
    </div>
  );

  if (pubs.length === 0) {
    return (
      <div className="mt-4">
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No pubs yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Use the CLI or API to create your first pub.
            </p>
            <div className="rounded-lg bg-navy text-white px-4 py-3 font-mono text-sm">
              <span className="text-primary">$</span> pub create index.html
            </div>
          </CardContent>
        </Card>
        {goLiveButton}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <PubSortChips value={sortKey} onChange={setSortKey} />
      <PubsGrid
        pubs={pubs}
        liveSlugs={liveSlugs}
        onToggleVisibility={(id) => toggleVisibility({ id })}
        onDelete={(id) => deletePub({ id })}
      />
      {status === "CanLoadMore" && (
        <div className="text-center pt-2">
          <Button variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
            Load more
          </Button>
        </div>
      )}
      {status === "LoadingMore" && (
        <div className="text-center pt-2 text-muted-foreground text-sm">Loading more&hellip;</div>
      )}
      {goLiveButton}
    </div>
  );
}
