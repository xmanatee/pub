import { AppWindow, Bot, Layers, Lock, RefreshCw, Zap } from "lucide-react";

const FEATURES = [
  {
    icon: AppWindow,
    title: "Real-time interfaces",
    description: "Your agent generates UIs that update live as you interact.",
  },
  {
    icon: Layers,
    title: "Adapts to your task",
    description: "Charts, forms, dashboards — the right interface for every moment.",
  },
  {
    icon: Bot,
    title: "Works with any agent",
    description: "CLI and API-first. Connects to Claude Code, Codex, or your own tools.",
  },
  {
    icon: Lock,
    title: "Private by default",
    description: "Your interfaces stay private until you choose to share.",
  },
  {
    icon: RefreshCw,
    title: "Persistent URLs",
    description: "Every pub gets a stable link. Revisit, update, or go live from it.",
  },
  {
    icon: Zap,
    title: "Instant delivery",
    description: "WebRTC peer-to-peer. Low latency, no waiting.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="py-24">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Your data, your way
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Your agent creates the interface. You stay in control.
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
