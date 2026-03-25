import { Check, Circle, Key, Play, Terminal } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { BatchSection } from "~/devtools/components/batch-section";

interface Step {
  label: string;
  done: boolean;
  active: boolean;
}

function StepIndicator({ number, label, done, active }: Step & { number: number }) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
      ) : active ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary">
          <span className="text-xs font-semibold text-primary">{number}</span>
        </div>
      ) : (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border">
          <Circle className="h-3 w-3 text-muted-foreground/50" />
        </div>
      )}
      <span
        className={`text-sm ${done ? "text-muted-foreground line-through" : active ? "font-medium" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-navy px-4 py-2.5">
      <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <code className="text-sm font-mono text-white truncate flex-1">{command}</code>
    </div>
  );
}

function OnboardingState1NewUser() {
  const steps: Step[] = [
    { label: "Generate an API key", done: false, active: true },
    { label: "Install the Pub CLI", done: false, active: false },
    { label: "Configure your key", done: false, active: false },
    { label: "Detect your local agent", done: false, active: false },
    { label: "Start your agent", done: false, active: false },
    { label: "Go live", done: false, active: false },
  ];

  return (
    <Card className="border-border/50">
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Get started with Pub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your agent to create live, adaptive interfaces.
          </p>
        </div>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <StepIndicator key={step.label} number={i + 1} {...step} />
          ))}
        </div>
        <div className="rounded-lg border border-border/50 p-4 space-y-3">
          <p className="text-sm font-medium">Step 1: Generate an API key</p>
          <p className="text-sm text-muted-foreground">
            Your agent needs an API key to connect to Pub.
          </p>
          <Button size="sm">
            <Key className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Generate API key
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingState2KeyGenerated() {
  const steps: Step[] = [
    { label: "Generate an API key", done: true, active: false },
    { label: "Install the Pub CLI", done: false, active: true },
    { label: "Configure your key", done: false, active: true },
    { label: "Detect your local agent", done: false, active: true },
    { label: "Start your agent", done: false, active: true },
    { label: "Go live", done: false, active: false },
  ];

  return (
    <Card className="border-border/50">
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Get started with Pub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your agent to create live, adaptive interfaces.
          </p>
        </div>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <StepIndicator key={step.label} number={i + 1} {...step} />
          ))}
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-3">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              API key created! Copy it now — you won't see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-sm bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 rounded flex-1 break-all font-mono">
                pub_abc123def456ghi789
              </code>
            </div>
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-medium">Step 2: Install the CLI</p>
            <CommandBlock command="curl -fsSL pub.blue/install.sh | bash" />
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-medium">Step 3: Configure your key</p>
            <CommandBlock command="pub config --set apiKey=pub_abc123def456ghi789" />
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-medium">Step 4: Detect your local agent</p>
            <CommandBlock command="pub config --auto" />
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-medium">Step 5: Start your agent</p>
            <CommandBlock command="pub start --agent-name my-agent" />
          </div>
          <div className="rounded-lg border border-border/50 p-4 space-y-3">
            <p className="text-sm font-medium">Step 6: Go live</p>
            <p className="text-sm text-muted-foreground">
              Once your agent is online, you'll see a play button to start a live session.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingState3AgentOnline() {
  const steps: Step[] = [
    { label: "Generate an API key", done: true, active: false },
    { label: "Install the Pub CLI", done: true, active: false },
    { label: "Configure your key", done: true, active: false },
    { label: "Detect your local agent", done: true, active: false },
    { label: "Start your agent", done: true, active: false },
    { label: "Go live", done: false, active: true },
  ];

  return (
    <Card className="border-border/50">
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Get started with Pub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Set up your agent to create live, adaptive interfaces.
          </p>
        </div>
        <div className="space-y-4">
          {steps.map((step, i) => (
            <StepIndicator key={step.label} number={i + 1} {...step} />
          ))}
        </div>
        <div className="rounded-lg border border-border/50 p-4 space-y-3">
          <p className="text-sm font-medium">Step 6: Go live</p>
          <p className="text-sm text-muted-foreground">
            Your agent is online! Use the <Play className="inline h-3.5 w-3.5" aria-hidden="true" />{" "}
            button to start a live session.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingState4EmptyPubs() {
  return (
    <Card className="border-border/50 border-dashed">
      <CardContent className="flex flex-col items-center py-16">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Terminal className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
        <p className="font-medium mb-1">No pubs yet</p>
        <p className="text-sm text-muted-foreground mb-6">
          Start a live session and your agent will create pubs automatically.
        </p>
      </CardContent>
    </Card>
  );
}

export function OnboardingDebugPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Onboarding Debug</h1>

        <BatchSection
          title="Onboarding States"
          testId="batch-onboarding-states"
          items={[
            { label: "new-user", content: <OnboardingState1NewUser /> },
            { label: "key-generated", content: <OnboardingState2KeyGenerated /> },
            { label: "agent-online", content: <OnboardingState3AgentOnline /> },
            { label: "empty-pubs", content: <OnboardingState4EmptyPubs /> },
          ]}
        />
      </div>
    </div>
  );
}
