import type { ReactNode } from "react";
import { PubCardSkeleton } from "./pub-card-skeleton";

export function PubCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

export function PubCardSkeletons({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeletons are interchangeable placeholders that never reorder
        <PubCardSkeleton key={i} />
      ))}
    </>
  );
}

export function PubCardGridSkeleton() {
  return (
    <PubCardGrid>
      <PubCardSkeletons count={4} />
    </PubCardGrid>
  );
}
