import type { ReactNode } from "react";
import { PubCardSkeleton } from "./pub-card-skeleton";

/** Stable keys for skeleton placeholders — referentially-stable so React reconciliation behaves well. */
const SKELETON_KEYS = Array.from({ length: 16 }, (_, i) => `skeleton-${i}`);

export function PubCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

export function PubCardSkeletons({ count }: { count: number }) {
  return (
    <>
      {SKELETON_KEYS.slice(0, count).map((key) => (
        <PubCardSkeleton key={key} />
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
