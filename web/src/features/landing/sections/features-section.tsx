import { Blend, RefreshCcw, UserRound } from "lucide-react";

const PRINCIPLES = [
  {
    icon: UserRound,
    tag: "Perspective",
    title: "Built around the person",
    description: "The interface should follow the user, not an average template.",
  },
  {
    icon: Blend,
    tag: "Composition",
    title: "Composed from real context",
    description: "Your tools, data, and routines become the material.",
  },
  {
    icon: RefreshCcw,
    tag: "Adaptation",
    title: "Changed when the need changes",
    description: "The right interface for today may not be the right one tomorrow.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="border-t border-border/50 py-24">
      <div className="px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="max-w-2xl text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              A new default
            </p>
            <h2 className="mb-4 text-3xl font-bold tracking-tighter sm:text-4xl">
              The End of Generic Software
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground">
              Software has spent decades standardizing people. Pub starts from the opposite
              assumption: your workflows are specific, your context matters, and your interfaces
              should reflect that.
            </p>
          </div>

          <div className="space-y-4">
            {PRINCIPLES.map((principle) => (
              <div
                key={principle.title}
                className="rounded-3xl border border-border/60 bg-background/90 p-5 shadow-sm transition-colors duration-200 hover:border-primary/20"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                    <principle.icon className="h-5 w-5" aria-hidden="true" />
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      {principle.tag}
                    </p>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {principle.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
