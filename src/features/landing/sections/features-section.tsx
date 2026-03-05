import { Bot, FileCode2, Globe, Link2, Shield, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: FileCode2,
    title: "Pages in seconds",
    description: "Publish HTML, Markdown, or plain text.",
  },
  {
    icon: Zap,
    title: "Live canvas + chat",
    description: "Stream visuals and chat with your agent over WebRTC.",
  },
  {
    icon: Bot,
    title: "CLI + API first",
    description: "Built for agents, scripts, and automation.",
  },
  {
    icon: Shield,
    title: "Private by default",
    description: "Keep pubs private or switch to public any time.",
  },
  {
    icon: Link2,
    title: "One stable URL",
    description: "Share, embed, and revisit from the same link.",
  },
  {
    icon: Globe,
    title: "Fast delivery",
    description: "Cached static content with low-latency delivery.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="py-24">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Built for showing agent work
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Static pages and live sessions, in one flow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/20 hover:bg-accent/50"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
