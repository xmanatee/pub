import { createFileRoute, redirect } from "@tanstack/react-router";
import { BatchSection } from "~/components/debug/batch-section";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";

export const Route = createFileRoute("/debug/header")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: HeaderDebugPage,
});

function HeaderNonTma() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <PubWordmark iconSize={22} className="text-foreground" />
        <nav className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="pointer-coarse:h-11">
            Sign in
          </Button>
          <Button size="sm" className="pointer-coarse:h-11">
            Get started
          </Button>
        </nav>
      </div>
    </header>
  );
}

function HeaderFullscreenTma() {
  return (
    <div
      style={
        {
          "--device-safe-top": "54px",
          "--content-safe-top": "40px",
        } as React.CSSProperties
      }
    >
      <header
        className="fixed inset-x-0 top-0 z-50"
        style={{ paddingTop: "var(--device-safe-top)", position: "relative" }}
      >
        <div
          className="flex items-center justify-center px-16"
          style={{ height: "var(--content-safe-top)" }}
        >
          <PubWordmark iconSize={22} className="text-foreground" />
        </div>
      </header>
    </div>
  );
}

function HeaderNonFullscreenTma() {
  return (
    <div className="flex items-center justify-center h-14 text-sm text-muted-foreground">
      Header hidden (non-fullscreen TMA)
    </div>
  );
}

function HeaderDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Header Debug</h1>

        <BatchSection
          title="TMA State"
          testId="batch-header-tma-state"
          items={[
            {
              label: "non-tma",
              content: <HeaderNonTma />,
            },
            {
              label: "fullscreen-tma",
              content: <HeaderFullscreenTma />,
            },
            {
              label: "non-fullscreen-tma",
              content: <HeaderNonFullscreenTma />,
            },
          ]}
        />
      </div>
    </div>
  );
}
