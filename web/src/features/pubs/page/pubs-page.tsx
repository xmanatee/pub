import { api } from "@backend/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileText, Loader2, Play } from "lucide-react";
import * as React from "react";
import { EmptyStateCard } from "~/components/empty-state-card";
import { PubCardGridSkeleton } from "~/components/pub-card-grid";
import { Button } from "~/components/ui/button";
import { OnboardingGuide } from "~/features/pubs/components/onboarding-guide";
import { PubSortChips } from "~/features/pubs/components/pub-sort-chips";
import { PubsGrid } from "~/features/pubs/components/pubs-grid";
import { derivePubsPageState } from "~/features/pubs/lib/pubs-page-state";
import type { PubSortKey } from "~/features/pubs/lib/sort-pubs";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { trackError } from "~/lib/analytics";

const PAGE_SIZE = 20;
const LOAD_MORE_SKELETONS = 2;

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

  const state = derivePubsPageState({
    status,
    pubs,
    apiKeysLoaded: keys !== undefined,
    hasApiKeys: (keys?.length ?? 0) > 0,
  });

  async function handleStartLive() {
    setStartingLive(true);
    try {
      const { slug } = await createDraftForLive({});
      await navigate({ to: "/p/$slug", params: { slug } });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Failed to start live");
      trackError(normalizedError, { area: "pubs", feature: "start_live" });
    } finally {
      setStartingLive(false);
    }
  }

  if (state.kind === "onboarding") {
    return (
      <div className="px-4 sm:px-6 py-8">
        <OnboardingGuide hasApiKeys={false} agentOnline={agentOnline} />
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

  const body = (() => {
    switch (state.kind) {
      case "loading":
        return <PubCardGridSkeleton />;
      case "empty":
        return (
          <EmptyStateCard
            icon={FileText}
            title="No pubs yet"
            description="Start a live session and your agent will create pubs automatically."
          />
        );
      case "populated":
        return (
          <>
            <PubsGrid
              pubs={state.pubs}
              liveSlugs={liveSlugs}
              pending={state.isLoadingMore ? LOAD_MORE_SKELETONS : 0}
              onToggleVisibility={(id) => toggleVisibility({ id })}
              onDelete={(id) => deletePub({ id })}
              onDuplicate={(id) => {
                duplicatePub({ id }).catch((error) => {
                  console.error("Failed to duplicate pub", error);
                });
              }}
              developerMode={developerModeEnabled}
            />
            {state.canLoadMore && (
              <div className="text-center pt-2">
                <Button variant="outline" size="sm" onClick={() => loadMore(PAGE_SIZE)}>
                  Load more
                </Button>
              </div>
            )}
          </>
        );
    }
  })();

  return (
    <div className="px-4 sm:px-6 py-8 space-y-4">
      <PubSortChips value={sortKey} onChange={setSortKey} />
      {body}
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
    </div>
  );
}
