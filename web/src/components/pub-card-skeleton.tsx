import type { HTMLAttributes } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";
import { PubPreviewFrame } from "./pub-preview-frame";

function SkeletonBlock({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export function PubCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/50" data-testid="pub-card-skeleton">
      <PubPreviewFrame>
        <SkeletonBlock className="h-full w-full rounded-none" />
      </PubPreviewFrame>
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <SkeletonBlock className="h-3 w-3 rounded-full shrink-0" />
          <SkeletonBlock className="h-3 w-20" />
          <div className="flex-1" />
          <SkeletonBlock className="h-7 w-7" />
        </div>
      </CardContent>
    </Card>
  );
}
