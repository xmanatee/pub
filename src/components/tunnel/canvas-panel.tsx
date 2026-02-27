export function CanvasPanel({ html }: { html: string | null }) {
  if (!html) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Waiting for content...</p>
      </div>
    );
  }

  return (
    <iframe
      srcDoc={`<base target="_blank">${html}`}
      sandbox="allow-scripts allow-popups allow-forms"
      className="absolute inset-0 w-full h-full border-none"
      title="Canvas"
    />
  );
}
