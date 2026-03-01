import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { ControlBar } from "~/components/live/control-bar";
import type { LiveViewMode } from "~/components/live/types";
import { PubWordmark } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { TooltipProvider } from "~/components/ui/tooltip";

export const Route = createFileRoute("/debug/tma-ux")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: TmaUxDebugPage,
});

function Section({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="border border-border/50 rounded-lg overflow-hidden">
      <div className="bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="relative" style={{ transform: "translateZ(0)" }}>
        {children}
      </div>
    </section>
  );
}

function HeaderNonTma() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
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

function ControlBarWithClose() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  return (
    <div className="relative h-80 bg-muted/10">
      <ControlBar
        chatPreview={null}
        collapsed={false}
        sendDisabled={false}
        bridge={null}
        onClose={() => {}}
        onDismissPreview={() => {}}
        onToggleCollapsed={() => {}}
        onSendAudio={() => {}}
        onSendChat={() => {}}
        onChangeView={setViewMode}
        viewMode={viewMode}
        visualState="idle"
        voiceModeEnabled={false}
      />
    </div>
  );
}

function ControlBarIdle() {
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  return (
    <div className="relative h-48 bg-muted/10">
      <ControlBar
        chatPreview={null}
        collapsed={false}
        sendDisabled={false}
        bridge={null}
        onDismissPreview={() => {}}
        onToggleCollapsed={() => {}}
        onSendAudio={() => {}}
        onSendChat={() => {}}
        onChangeView={setViewMode}
        viewMode={viewMode}
        visualState="idle"
        voiceModeEnabled
      />
    </div>
  );
}

function TmaUxDebugPage() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <div className="mx-auto max-w-md px-4 py-8 space-y-6">
          <h1 className="text-xl font-semibold">TMA UX Debug</h1>

          <Section label="Header: non-TMA (sticky, logo + nav)" testId="header-non-tma">
            <HeaderNonTma />
          </Section>

          <Section
            label="Header: fullscreen TMA (fixed, centered logo, safe-area padding)"
            testId="header-fullscreen-tma"
          >
            <HeaderFullscreenTma />
          </Section>

          <Section label="Header: non-fullscreen TMA (hidden)" testId="header-non-fullscreen-tma">
            <HeaderNonFullscreenTma />
          </Section>

          <Section
            label="ControlBar: with Close button (expand menu to see)"
            testId="control-bar-with-close"
          >
            <ControlBarWithClose />
          </Section>

          <Section label="ControlBar: idle mode" testId="control-bar-idle">
            <ControlBarIdle />
          </Section>
        </div>
      </div>
    </TooltipProvider>
  );
}
