import { AlertTriangle } from "lucide-react";
import { Button } from "~/core/ui/button";
import { EmptyState } from "./empty-state";

export function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle className="size-6" />}
      title="Something went wrong"
      description={error}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    />
  );
}
