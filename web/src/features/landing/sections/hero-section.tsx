import { useEffect, useState } from "react";
import { Blob } from "~/components/blob/blob";
import { cn } from "~/lib/utils";

const HERO_BLOB_TONE = {
  coreScale: 1.12,
  energy: 0.78,
  glow: 0.62,
  hueA: 186,
  hueB: 211,
  hueC: 169,
  saturation: 0.96,
  speedMs: 7600,
};

const EXAMPLE_REQUESTS = [
  "Build me a morning dashboard",
  "Visualize my todos like a tree",
  "Sort my emails like Tinder",
  "Pull email, notes, and tasks into one interface",
  "Make me a one-off dashboard for this launch",
  "Combine my calendar and tasks into one day view",
  "Show me everything relevant to this project",
  "Turn my backlog into something I can actually scan",
] as const;

const HERO_BLOB_FADE = {
  background:
    "radial-gradient(circle at top, color-mix(in oklab, var(--background) 0%, transparent) 0%, color-mix(in oklab, var(--background) 2%, transparent) 18%, color-mix(in oklab, var(--background) 12%, transparent) 42%, color-mix(in oklab, var(--background) 42%, transparent) 68%, color-mix(in oklab, var(--background) 82%, transparent) 86%, color-mix(in oklab, var(--background) 98%, transparent) 100%)",
};

function ExamplePromptCarousel() {
  const loopStartIndex = EXAMPLE_REQUESTS.length;
  const [activeIndex, setActiveIndex] = useState<number>(loopStartIndex);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const repeatedRequests = Array.from({ length: 3 }, (_, cycle) =>
    EXAMPLE_REQUESTS.map((request) => ({
      id: `${cycle}-${request}`,
      text: request,
    })),
  ).flat();
  const visibleIndex = activeIndex % EXAMPLE_REQUESTS.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => current + 1);
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeIndex < EXAMPLE_REQUESTS.length * 2) return;

    const timer = window.setTimeout(() => {
      setTransitionEnabled(false);
      setActiveIndex(loopStartIndex);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setTransitionEnabled(true);
        });
      });
    }, 720);

    return () => window.clearTimeout(timer);
  }, [activeIndex]);

  const itemHeight = 76;
  const itemGap = 10;
  const trackOffset = activeIndex * (itemHeight + itemGap);

  return (
    <div
      className="w-full rounded-3xl border border-border/60 bg-background/95 p-4"
      style={{ boxShadow: "0 18px 36px rgba(15, 23, 42, 0.10)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Try Requests Like
        </p>
        <div className="flex items-center gap-1.5">
          {EXAMPLE_REQUESTS.map((request, index) => (
            <span
              key={request}
              className={cn(
                "h-1.5 rounded-full bg-primary/25 transition-all duration-500",
                index === visibleIndex ? "w-5 bg-primary/80" : "w-1.5",
              )}
            />
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-muted/20 p-2" style={{ height: 332 }}>
        <div
          className={cn(
            "flex flex-col gap-2.5 ease-out",
            transitionEnabled ? "transition-transform duration-700" : null,
          )}
          style={{ transform: `translateY(${120 - trackOffset}px)` }}
        >
          {repeatedRequests.map((request, index) => {
            const distance = Math.abs(index - activeIndex);
            const faded = distance > 1;

            return (
              <div
                key={request.id}
                className={cn(
                  "flex items-center rounded-3xl border bg-background px-5 transition-all duration-700 ease-out",
                  index === activeIndex
                    ? "border-primary/20 opacity-100"
                    : "border-border/60 opacity-65",
                  faded ? "opacity-35" : null,
                )}
                style={{ height: itemHeight }}
              >
                <p className="text-base font-medium leading-snug text-foreground sm:text-lg">
                  {request.text}
                </p>
              </div>
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: 56,
            background: "linear-gradient(to bottom, var(--background), transparent)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: 56,
            background: "linear-gradient(to top, var(--background), transparent)",
          }}
        />
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="relative bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0" style={{ height: "34rem" }}>
          <Blob tone={HERO_BLOB_TONE} dimmed={false} className="h-full w-full opacity-100" />
        </div>
        <div className="absolute inset-0" style={HERO_BLOB_FADE} />
      </div>

      <div className="relative z-10 px-4 sm:px-6">
        <div
          className="flex items-center py-12 sm:py-14"
          style={{ minHeight: "calc(100vh - 3.5rem)" }}
        >
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="text-left">
              <p className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground sm:text-sm">
                Software that adapts to you
              </p>

              <h1
                className="max-w-2xl text-balance text-5xl font-bold leading-tight tracking-tight sm:text-6xl"
                style={{ fontSize: "clamp(3rem, 7vw, 4.15rem)" }}
              >
                One app to rule them all.
              </h1>

              <p className="mt-4 max-w-xl text-xl leading-snug text-foreground/92 sm:text-2xl">
                Your agent doesn&apos;t just assist. It shapes the experience.
              </p>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                The old model was one-size-fits-all software. Pub gives you software with a point of
                view: yours.
              </p>
            </div>

            <div className="mx-auto w-full max-w-md px-2 lg:px-0 lg:justify-self-end">
              <ExamplePromptCarousel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
