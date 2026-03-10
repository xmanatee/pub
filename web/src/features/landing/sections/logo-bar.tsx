export function LogoBar() {
  return (
    <section className="border-y border-border/50 bg-muted/50">
      <div className="px-4 sm:px-6 py-8">
        <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-widest mb-6">
          Works with your tools
        </p>
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap text-muted-foreground">
          <span className="font-semibold text-sm">Claude Code</span>
          <span className="font-semibold text-sm">OpenAI Codex</span>
          <span className="font-semibold text-sm">GitHub Actions</span>
          <span className="font-semibold text-sm">Any CLI</span>
        </div>
      </div>
    </section>
  );
}
