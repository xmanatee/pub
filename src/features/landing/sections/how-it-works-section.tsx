const STEPS = [
  {
    number: "01",
    title: "Sign in + key",
    description: "Sign in, then create an API key.",
  },
  {
    number: "02",
    title: "Create a pub",
    description: "Send HTML, Markdown, or text with CLI or API.",
  },
  {
    number: "03",
    title: "Go live",
    description: "Stream chat and canvas updates in real time.",
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
          <p className="text-muted-foreground text-lg">From sign-in to live in under a minute.</p>
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
