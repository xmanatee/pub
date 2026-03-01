interface BatchItem {
  label: string;
  content: React.ReactNode;
  width?: number;
}

interface BatchSectionProps {
  title: string;
  testId: string;
  items: BatchItem[];
  cellHeight?: number;
}

export function BatchSection({ title, testId, items, cellHeight = 120 }: BatchSectionProps) {
  return (
    <section data-testid={testId} className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="border border-border/50 rounded-lg overflow-hidden"
            style={item.width ? { width: item.width } : undefined}
          >
            <div className="bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">
              {item.label}
            </div>
            <div
              className="relative overflow-hidden"
              style={{ height: cellHeight, transform: "translateZ(0)" }}
            >
              {item.content}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
