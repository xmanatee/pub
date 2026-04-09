import { api } from "@backend/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileText, Loader2, Play } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { OnboardingGuide } from "~/features/pubs/components/onboarding-guide";
import { PubSortChips } from "~/features/pubs/components/pub-sort-chips";
import { PubsGrid } from "~/features/pubs/components/pubs-grid";
import type { PubSortKey } from "~/features/pubs/lib/sort-pubs";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { trackError } from "~/lib/analytics";

const PAGE_SIZE = 20;

function mutationErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Failed to start live";
}

export function PubsPage() {
  const [sortKey, setSortKey] = React.useState<PubSortKey>("mostViewed");
  const {
    results: pubs,
    status,
    loadMore,
  } = usePaginatedQuery(api.pubs.listByUser, { sortKey }, { initialNumItems: PAGE_SIZE });

  const navigate = useNavigate();
  const [startingLive, setStartingLive] = React.useState(false);

  const toggleVisibility = useMutation(api.pubs.toggleVisibility);
  const deletePub = useMutation(api.pubs.deleteByUser);
  const duplicatePub = useMutation(api.pubs.duplicateByUser);
  const createDraftForLive = useMutation(api.pubs.createDraftForLive);
  const agentOnline = useQuery(api.presence.isCurrentUserAgentOnline);
  const { developerModeEnabled } = useDeveloperMode();
  const keys = useQuery(api.apiKeys.list);

  const lives = useQuery(api.connections.listActiveConnections);
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
        area: "pubs",
        feature: "start_live",
      });
    } finally {
      setStartingLive(false);
    }
  }

  if (status === "LoadingFirstPage") {
    return (
      <div className="px-4 sm:px-6 py-8">
        <div className="text-muted-foreground py-8">Loading&hellip;</div>
      </div>
    );
  }

  const hasApiKeys = (keys?.length ?? 0) > 0;
  const isNewUser = pubs.length === 0 && !hasApiKeys;

  if (isNewUser) {
    return (
      <div className="px-4 sm:px-6 py-8">
        <OnboardingGuide hasApiKeys={hasApiKeys} agentOnline={agentOnline} />
      </div>
    );
  }

  const disabled = agentOnline !== true || startingLive;
  const ariaLabel = startingLive
    ? "Starting live..."
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
      <div className="px-4 sm:px-6 py-8">
        <Card className="border-border/50 border-dashed">
          <CardContent className="flex flex-col items-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="font-medium mb-1">No pubs yet</p>
            <p className="text-sm text-muted-foreground mb-6">
              Start a live session and your agent will create pubs automatically.
            </p>
          </CardContent>
        </Card>
        {goLiveButton}
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-8 space-y-4">
      <PubSortChips value={sortKey} onChange={setSortKey} />
      <PubsGrid
        pubs={pubs}
        liveSlugs={liveSlugs}
        onToggleVisibility={(id) => toggleVisibility({ id })}
        onDelete={(id) => deletePub({ id })}
        onDuplicate={
          developerModeEnabled
            ? (id) => {
                duplicatePub({ id }).catch((error) => {
                  console.error("Failed to duplicate pub", error);
                });
              }
            : undefined
        }
        developerMode={developerModeEnabled}
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
