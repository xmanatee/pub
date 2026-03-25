import { type PubSortKey, SORT_OPTIONS } from "~/features/pubs/lib/sort-pubs";
import { cn } from "~/lib/utils";

export function PubSortChips({
  value,
  onChange,
}: {
  value: PubSortKey;
  onChange: (key: PubSortKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SORT_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            key === value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
