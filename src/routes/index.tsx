import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bot, FileCode2, Globe, Link2, Shield, Terminal, Zap } from "lucide-react";
import { PubLogo } from "~/components/pub-logo";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <LogoBar />
      <FeaturesSection />
      <HowItWorksSection />
      <CodeSection />
      <CtaSection />
    </div>
  );
}

/* ---------- Hero ---------- */

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs font-medium gap-1.5">
            <Zap className="h-3 w-3" />
            Built for developers and AI agents
          </Badge>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[1.05] mb-6">
            Publish content.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Get a URL instantly.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Push HTML, Markdown, CSS, or JS to the web in one command. Built for quick demos,
            previews, and agent-generated content.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="h-12 px-8 text-base"
              asChild
              onClick={() => trackCtaClicked({ cta: "start_publishing", location: "hero" })}
            >
              <Link to="/login">
                Start publishing
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-8 text-base"
              asChild
              onClick={() => trackCtaClicked({ cta: "see_how_it_works", location: "hero" })}
            >
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          {/* Terminal preview */}
          <div className="mt-16 max-w-xl mx-auto">
            <div className="rounded-xl border border-border/50 bg-navy text-white overflow-hidden shadow-2xl shadow-primary/10">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <span className="ml-2 text-xs text-white/40 font-mono">terminal</span>
              </div>
              <div className="p-5 font-mono text-sm leading-relaxed">
                <div className="text-white/40">$ publish upload index.html</div>
                <div className="text-emerald-400 mt-1">
                  Published: https://pub.blue/serve/k8f2m9
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Logo bar / trust signals ---------- */

function LogoBar() {
  return (
    <section className="border-y border-border/50 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-widest mb-6">
          Works with your tools
        </p>
        <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap text-muted-foreground">
          <span className="font-semibold text-sm">Claude Code</span>
          <span className="font-semibold text-sm">OpenAI Codex</span>
          <span className="font-semibold text-sm">GitHub Actions</span>
          <span className="font-semibold text-sm">Any CLI</span>
        </div>
      </div>
    </section>
  );
}

/* ---------- Features ---------- */

function FeaturesSection() {
  const features = [
    {
      icon: FileCode2,
      title: "Any static content",
      description:
        "HTML pages, CSS stylesheets, JavaScript files, Markdown documents, or plain text. Served with proper MIME types.",
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
        "Choose your own URL slug or let one be generated. Re-publish to the same slug to update in place.",
    },
    {
      icon: Globe,
      title: "Edge delivery",
      description:
        "Content served globally with proper caching. Fast load times for your audience, wherever they are.",
    },
  ];

  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Everything you need to publish
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            A simple, powerful platform for getting your content on the web.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-xl border border-border/50 bg-card p-6 transition-colors hover:border-primary/20 hover:bg-accent/50"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-5 w-5 text-primary" />
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

/* ---------- How it works ---------- */

function HowItWorksSection() {
  const steps = [
    {
      number: "01",
      title: "Sign in & get a key",
      description: "Authenticate with GitHub or Google. Generate an API key from your dashboard.",
    },
    {
      number: "02",
      title: "Configure the CLI",
      description:
        "Run one command to set up the CLI with your API key. Or use the REST API directly.",
    },
    {
      number: "03",
      title: "Publish & share",
      description: "Upload any file. Get back a URL. Share it with anyone, anywhere.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-muted/30 border-y border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Three steps. That's it.
          </h2>
          <p className="text-muted-foreground text-lg">From zero to published in under a minute.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {steps.map((step) => (
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

/* ---------- Code example ---------- */

function CodeSection() {
  return (
    <section className="py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            Simple as one command
          </h2>
          <p className="text-muted-foreground text-lg">
            Publish from terminal, CI, or your AI agent.
          </p>
        </div>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-border/50 bg-navy overflow-hidden shadow-2xl shadow-primary/5">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              <div className="ml-auto flex items-center gap-1.5 text-white/40">
                <Terminal className="h-3.5 w-3.5" />
                <span className="text-xs font-mono">terminal</span>
              </div>
            </div>
            <div className="p-6 font-mono text-sm leading-relaxed space-y-6">
              {/* Example 1 */}
              <div>
                <div className="text-white/40 text-xs mb-1"># Publish a file</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> publish upload index.html
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Published: https://pub.blue/serve/k8f2m9
                </div>
              </div>

              {/* Example 2 */}
              <div>
                <div className="text-white/40 text-xs mb-1"># Custom slug + title</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> publish upload --slug my-demo --title
                  "Demo Page" report.md
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Published: https://pub.blue/serve/my-demo
                </div>
              </div>

              {/* Example 3 */}
              <div>
                <div className="text-white/40 text-xs mb-1"># Pipe from stdin</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> echo "&lt;h1&gt;Hello&lt;/h1&gt;" |
                  publish upload-content --filename page.html
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Published: https://pub.blue/serve/w3n7q1
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Final CTA ---------- */

function CtaSection() {
  return (
    <section className="py-24 border-t border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <PubLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">Ready to publish?</h2>
        <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
          Sign up in seconds. Get your API key. Start publishing.
        </p>
        <Button
          size="lg"
          className="h-12 px-8 text-base"
          asChild
          onClick={() => trackCtaClicked({ cta: "get_started_free", location: "bottom_cta" })}
        >
          <Link to="/login">
            Get started free
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
