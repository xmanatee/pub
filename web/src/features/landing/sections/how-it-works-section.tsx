const STEPS = [
  {
    number: "01",
    title: "Install the CLI",
    description: "One command. Works on macOS and Linux.",
  },
  {
    number: "02",
    title: "Connect your agent",
    description: "Add your API key and start the daemon.",
  },
  {
    number: "03",
    title: "Get adaptive interfaces",
    description: "Your agent generates real-time UIs tailored to your task.",
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-24 bg-muted/50 border-y border-border/50">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Up and running in a minute
          </h2>
          <p className="text-muted-foreground text-lg">
            Install, connect, and let your agent do the rest.
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
