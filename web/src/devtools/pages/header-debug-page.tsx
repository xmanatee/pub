import { Settings } from "lucide-react";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { BatchSection } from "~/devtools/components/batch-section";

function HeaderNonTma() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <PubWordmark iconSize={22} className="text-foreground" />
        <nav className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            GitHub
          </span>
          <Button size="sm" className="pointer-coarse:h-11">
            Sign in
          </Button>
        </nav>
      </div>
    </header>
  );
}

function HeaderAuthenticated() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
        <PubWordmark iconSize={22} className="text-foreground" />
        <nav aria-label="Main navigation" className="flex items-center gap-0.5 sm:gap-1">
          <span className="text-sm font-medium text-foreground px-2 py-1 rounded-md">Pubs</span>
          <span className="text-sm text-muted-foreground px-2 py-1 rounded-md">
            Agents
            <span className="ml-1.5 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-primary/15 px-1.5 text-xs font-semibold text-primary">
              2
            </span>
          </span>
          <span className="text-sm text-muted-foreground px-2 py-1 rounded-md">Explore</span>
          <span className="text-sm text-muted-foreground px-2 py-1 rounded-md">
            <Settings className="h-4 w-4" aria-hidden="true" />
          </span>
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

export function HeaderDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Header Debug</h1>

        <BatchSection
          title="TMA State"
          testId="batch-header-tma-state"
          items={[
            {
              label: "non-tma-guest",
              content: <HeaderNonTma />,
            },
            {
              label: "non-tma-authenticated",
              content: <HeaderAuthenticated />,
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
