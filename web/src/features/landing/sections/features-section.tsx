const PRINCIPLES = [
  {
    title: "Adaptive interfaces",
    description: "The interface changes with the task instead of forcing every task into one app.",
  },
  {
    title: "Built for you",
    description: "Your agent can shape the UI around your workflow, machine, and services.",
  },
  {
    title: "Private by design",
    description: "Live sessions connect peer-to-peer to your host machine and agent.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="border-t border-border/50 py-24">
      <div className="px-4 sm:px-6">
        <div className="mb-14 max-w-2xl text-left">
          <h2 className="mb-4 text-3xl font-bold tracking-tighter sm:text-4xl">
            Three simple ideas
          </h2>
          <p className="max-w-2xl text-lg text-muted-foreground">This is the core of Pub.</p>
        </div>

        <div className="grid grid-cols-1 gap-8 border-t border-border/50 pt-8 md:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <div
              key={principle.title}
              className={
                index < PRINCIPLES.length - 1 ? "md:border-r md:border-border/50 md:pr-8" : ""
              }
            >
              <h3 className="text-lg font-semibold tracking-tight">{principle.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {principle.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
