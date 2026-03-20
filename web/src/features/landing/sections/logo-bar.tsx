export function LogoBar() {
  return (
    <section className="border-y border-border/50 bg-muted/50">
      <div className="px-4 py-6 sm:px-6">
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Works with AI agents
        </p>
        <p className="mx-auto max-w-xl text-center text-sm text-muted-foreground">
          OpenClaw and Claude Code today. Codex and more are coming.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-medium text-foreground">
            OpenClaw
          </span>
          <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1.5 font-medium text-foreground">
            Claude Code
          </span>
          <span className="rounded-full border border-dashed border-border/70 bg-background/60 px-3 py-1.5 font-medium text-muted-foreground">
            Codex soon
          </span>
          <span className="rounded-full border border-dashed border-border/70 bg-background/60 px-3 py-1.5 font-medium text-muted-foreground">
            More coming
          </span>
        </div>
      </div>
    </section>
  );
}
