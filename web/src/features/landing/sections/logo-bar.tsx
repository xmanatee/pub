export function LogoBar() {
  return (
    <section className="fade-edges-narrow border-y border-border/50 bg-muted/50">
      <div className="px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Works with AI agents
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tighter sm:text-3xl">
            OpenClaw and Claude Code today. Codex and more are coming.
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 text-sm">
            <span className="rounded-full border border-border/60 bg-background/90 px-4 py-2 font-medium text-foreground shadow-sm">
              OpenClaw
            </span>
            <span className="rounded-full border border-border/60 bg-background/90 px-4 py-2 font-medium text-foreground shadow-sm">
              Claude Code
            </span>
            <span className="rounded-full border border-dashed border-border/70 bg-background/60 px-4 py-2 font-medium text-muted-foreground">
              Codex soon
            </span>
            <span className="rounded-full border border-dashed border-border/70 bg-background/60 px-4 py-2 font-medium text-muted-foreground">
              More coming
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
