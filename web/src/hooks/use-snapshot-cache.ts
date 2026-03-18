import * as React from "react";

export function useSnapshotCache() {
  const [snapshots, setSnapshots] = React.useState<Map<string, string>>(new Map());

  const handleSnapshot = React.useCallback((slug: string, html: string) => {
    setSnapshots((prev) => {
      if (prev.has(slug)) return prev;
      const next = new Map(prev);
      next.set(slug, html);
      return next;
    });
  }, []);

  return { snapshots, handleSnapshot } as const;
}
