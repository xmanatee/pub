import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { PubPreviewFrame } from "./pub-preview-frame";

export function PubCardSkeleton() {
  return (
    <Card className="overflow-hidden border-border/50" data-testid="pub-card-skeleton">
      <PubPreviewFrame>
        <Skeleton className="h-full w-full rounded-none" />
      </PubPreviewFrame>
      <CardContent className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Skeleton className="h-3 w-3 rounded-full shrink-0" />
          <Skeleton className="h-3 w-20" />
          <div className="flex-1" />
          <Skeleton className="h-7 w-7" />
        </div>
      </CardContent>
    </Card>
  );
}
