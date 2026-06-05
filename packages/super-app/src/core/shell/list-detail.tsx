import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

export type ListDetailItemsState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "loaded"; items: T[] };

export interface ListDetailProps<T extends { id: string }> {
  state: ListDetailItemsState<T>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderRow: (item: T, isActive: boolean) => React.ReactNode;
  renderDetail: (item: T) => React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filter?: (item: T, query: string) => boolean;
  onRetry?: () => void;
  listClassName?: string;
  detailEmpty?: React.ReactNode;
}

export function ListDetail<T extends { id: string }>({
  state,
  selectedId,
  onSelect,
  renderRow,
  renderDetail,
  emptyTitle,
  emptyDescription,
  emptyAction,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filter,
  onRetry,
  listClassName,
  detailEmpty,
}: ListDetailProps<T>) {
  const items = state.status === "loaded" ? state.items : [];
  const filtered =
    filter && searchValue && state.status === "loaded"
      ? items.filter((it) => filter(it, searchValue.trim().toLowerCase()))
      : items;
  const selected = filtered.find((it) => it.id === selectedId) ?? null;

  return (
    <div className="grid h-full min-h-0 layout-list-detail divide-x">
      <div className={cn("flex min-h-0 flex-col", listClassName)}>
        {onSearchChange ? (
          <div className="shrink-0 border-b px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label={searchPlaceholder ?? "Search"}
                value={searchValue ?? ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder ?? "Search…"}
                className="h-8 pl-7"
              />
            </div>
          </div>
        ) : null}
        {state.status === "loading" ? (
          <SkeletonList count={8} itemClassName="h-12" className="space-y-2 p-3" />
        ) : state.status === "error" ? (
          <ErrorState error={state.error} onRetry={onRetry} />
        ) : filtered.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="p-1">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedId === item.id}
                  onClick={() => onSelect(item.id)}
                  className={cn(
                    "block w-full rounded-md text-left",
                    selectedId === item.id
                      ? "bg-accent"
                      : "hover:bg-accent/50 focus-visible:bg-accent/60",
                  )}
                >
                  {renderRow(item, selectedId === item.id)}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
      <div className="min-h-0">
        {selected
          ? renderDetail(selected)
          : (detailEmpty ?? (
              <EmptyState title="Nothing selected" description="Pick something from the list." />
            ))}
      </div>
    </div>
  );
}
