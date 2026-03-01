interface BatchItem {
  label: string;
  content: React.ReactNode;
}

interface BatchSectionProps {
  title: string;
  testId: string;
  items: BatchItem[];
  cellHeight?: number;
}

export function BatchSection({ title, testId, items, cellHeight = 120 }: BatchSectionProps) {
  return (
    <section data-testid={testId} className="bg-white p-6">
      <div className="mb-5 text-center text-sm font-semibold">{title}</div>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 text-xs text-muted-foreground">{item.label}</div>
            <div
              className="relative overflow-hidden border border-black"
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
