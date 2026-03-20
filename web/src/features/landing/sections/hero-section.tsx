import { Link } from "@tanstack/react-router";
import { ArrowRight, Github } from "lucide-react";
import { Blob } from "~/components/blob/blob";
import { TerminalPreview } from "~/components/terminal-preview";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

const HERO_BLOB_TONE = {
  coreScale: 1.1,
  energy: 0.72,
  glow: 0.5,
  hueA: 186,
  hueB: 211,
  hueC: 169,
  saturation: 0.92,
  speedMs: 7600,
};

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(12,27,45,0.04),transparent_32%,transparent_100%)]" />
        <div className="absolute inset-x-0 top-0 h-[30rem] sm:h-[34rem]">
          <Blob tone={HERO_BLOB_TONE} dimmed className="opacity-90" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,transparent_0,transparent_28%,rgba(248,250,252,0.92)_72%)] dark:bg-[radial-gradient(circle_at_top,transparent_0,transparent_22%,rgba(2,6,23,0.82)_72%)]" />
      </div>

      <div className="px-4 sm:px-6">
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center py-12 sm:py-14">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)] lg:gap-10">
            <div className="text-left">
              <p className="mb-4 text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase sm:text-sm">
                Adaptive interfaces for AI agents
              </p>

              <h1 className="max-w-2xl text-balance text-5xl font-bold leading-[1.02] tracking-tighter sm:text-6xl lg:text-[4.15rem]">
                One app to rule them all.
              </h1>

              <p className="mt-4 max-w-xl text-xl leading-snug text-foreground/92 sm:text-2xl">
                A direct, visual connection to your agent, machine, and services.
              </p>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                No more setting up yet another TODO app or email client. Pub adapts to the task.
              </p>

              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                <span>Adaptive</span>
                <span>Private peer-to-peer</span>
                <span>Built for you</span>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Button
                  size="lg"
                  className="h-12 px-8 text-base"
                  asChild
                  onClick={() => trackCtaClicked({ cta: "sign_in", location: "hero" })}
                >
                  <Link to="/login">
                    Sign in
                    <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <a href="#how-it-works" className="transition-colors hover:text-foreground">
                    See how it works
                  </a>
                  <a
                    href="https://github.com/xmanatee/pub"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
                  >
                    <Github className="h-4 w-4" aria-hidden="true" />
                    GitHub
                  </a>
                </div>
              </div>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-col gap-4 lg:items-end">
              <div className="w-full rounded-[1.75rem] border border-border/60 bg-background/72 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
                <TerminalPreview className="shadow-2xl shadow-primary/10">
                  <div className="space-y-2 p-4 font-mono text-sm leading-relaxed">
                    <div className="text-white/45"># install pub once</div>
                    <div className="text-primary">
                      <span className="text-primary/70">$</span> curl -fsSL pub.blue/install.sh |
                      bash
                    </div>
                    <div className="text-emerald-400">
                      Installed. Your agent runs the rest on the host machine.
                    </div>
                  </div>
                </TerminalPreview>
              </div>

              <div className="w-full rounded-[1.75rem] border border-border/60 bg-background/80 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.10)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4 rounded-full border border-border/70 bg-background/88 px-2 py-2 shadow-sm">
                  <div className="min-w-0 px-2">
                    <p className="truncate text-sm font-medium text-foreground">Connect to Pub</p>
                    <p className="truncate text-xs text-muted-foreground">
                      Private session with your agent
                    </p>
                  </div>
                  <Button
                    asChild
                    className="h-10 shrink-0 rounded-full px-4 text-xs font-medium"
                    onClick={() =>
                      trackCtaClicked({ cta: "sign_in", location: "hero_control_bar" })
                    }
                  >
                    <Link to="/login">Sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
