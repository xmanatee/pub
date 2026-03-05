import { Bot, FileCode2, Globe, Link2, Shield, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: FileCode2,
    title: "Any static content",
    description: "HTML pages, Markdown documents, or plain text. Served with proper MIME types.",
  },
  {
    icon: Zap,
    title: "Instant URLs",
    description:
      "Every file gets a unique URL immediately. Share it, embed it, or open it in a browser. No deploy step.",
  },
  {
    icon: Bot,
    title: "Agent-friendly API",
    description:
      "CLI tool and REST API designed for AI agents. Publish from Claude Code, Codex, or any automation pipeline.",
  },
  {
    icon: Shield,
    title: "Public & private",
    description:
      "Control who sees your content. Publish publicly or keep it private. Toggle visibility anytime.",
  },
  {
    icon: Link2,
    title: "Custom slugs",
    description:
      "Choose your own URL slug or let one be generated. Use `update` to modify existing pubs.",
  },
  {
    icon: Globe,
    title: "Edge delivery",
    description:
      "Content served globally with proper caching. Fast load times for your audience, wherever they are.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="py-24">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Everything you need to publish
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            A simple, powerful platform for getting your content on the web.
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
