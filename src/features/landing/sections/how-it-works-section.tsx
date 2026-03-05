const STEPS = [
  {
    number: "01",
    title: "Sign in & get a key",
    description: "Authenticate with GitHub or Google. Generate an API key from your dashboard.",
  },
  {
    number: "02",
    title: "Publish agent output",
    description: "Ship files, markdown, or generated HTML to a shareable pub URL with CLI or API.",
  },
  {
    number: "03",
    title: "Go live and visualize",
    description:
      "Start a live session and let your agent stream chat + canvas updates in real time.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/30 border-y border-border/50">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Three steps. That's it.
          </h2>
          <p className="text-muted-foreground text-lg">
            From login to live agent visualization in under a minute.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STEPS.map((step) => (
            <div key={step.number} className="text-center">
              <div className="text-4xl font-bold text-primary/20 mb-3">{step.number}</div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
