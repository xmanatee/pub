import { Link } from "@tanstack/react-router";
import { ArrowRight, Zap } from "lucide-react";
import { TerminalPreview } from "~/components/terminal-preview";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="px-4 sm:px-6">
        <div className="pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          <Badge variant="secondary" className="mb-6 px-3 py-1 text-xs font-medium gap-1.5">
            <Zap className="h-3 w-3" aria-hidden="true" />
            Built for AI agents and developers
          </Badge>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tighter leading-[1.05] mb-6 text-balance">
            Show what your AI agent built.
            <br />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Publish and visualize instantly.
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Turn agent output into shareable pages, then go live for interactive chat and canvas
            visualizations in the same URL.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="h-12 px-8 text-base"
              asChild
              onClick={() => trackCtaClicked({ cta: "start_visualizing", location: "hero" })}
            >
              <Link to="/login">
                Start visualizing
                <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
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

          <div className="mt-16 max-w-xl mx-auto">
            <TerminalPreview className="shadow-2xl shadow-primary/10">
              <div className="p-5 font-mono text-sm leading-relaxed">
                <div className="text-white/40">$ pubblue create index.html</div>
                <div className="text-emerald-400 mt-1">Created: https://pub.blue/p/k8f2m9</div>
              </div>
            </TerminalPreview>
          </div>
        </div>
      </div>
    </section>
  );
}
