import { cn } from "~/core/cn";
import { Skeleton } from "./skeleton";

export function SkeletonList({
  count,
  itemClassName,
  className,
}: {
  count: number;
  itemClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder, never reordered
        <Skeleton key={i} className={cn("h-10 w-full", itemClassName)} />
      ))}
    </div>
  );
}
