import type { ReactNode } from "react";
import { PubCardSkeleton } from "./pub-card-skeleton";

const INITIAL_SKELETON_COUNT = 4;

export function PubCardGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

export function PubCardGridSkeleton() {
  return (
    <PubCardGrid>
      {Array.from({ length: INITIAL_SKELETON_COUNT }, (_, i) => (
        <PubCardSkeleton key={i} />
      ))}
    </PubCardGrid>
  );
}
