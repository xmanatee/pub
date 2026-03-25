import { api } from "@backend/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Check, Circle, Key, Play, Terminal } from "lucide-react";
import * as React from "react";
import { CopyButton } from "~/components/copy-button";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { trackApiKeyCopied, trackApiKeyCreated } from "~/lib/analytics";

const INSTALL_COMMAND = "curl -fsSL pub.blue/install.sh | bash";

interface Step {
  label: string;
  done: boolean;
  active: boolean;
}

export function OnboardingGuide() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useMutation(api.apiKeys.create);
  const agentOnline = useQuery(api.presence.isCurrentUserAgentOnline);

  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [generating, setGenerating] = React.useState(false);

  const hasKey = (keys?.length ?? 0) > 0 || generatedKey !== null;

  async function handleGenerateKey() {
    setGenerating(true);
    try {
      const result = await createKey({ name: "my-agent" });
      trackApiKeyCreated({ name: "my-agent" });
      setGeneratedKey(result.key);
    } finally {
      setGenerating(false);
    }
  }

  const isAgentOnline = agentOnline === true;

  const steps: Step[] = [
    { label: "Generate an API key", done: hasKey, active: !hasKey },
    { label: "Install the Pub CLI", done: isAgentOnline, active: hasKey && !isAgentOnline },
    { label: "Configure your key", done: isAgentOnline, active: hasKey && !isAgentOnline },
    {
      label: "Detect your local agent",
      done: isAgentOnline,
      active: hasKey && !isAgentOnline,
    },
    { label: "Start your agent", done: isAgentOnline, active: hasKey && !isAgentOnline },
    { label: "Go live", done: false, active: isAgentOnline },
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
          {!hasKey && (
            <div className="rounded-lg border border-border/50 p-4 space-y-3">
              <p className="text-sm font-medium">Step 1: Generate an API key</p>
              <p className="text-sm text-muted-foreground">
                Your agent needs an API key to connect to Pub.
              </p>
              <Button size="sm" disabled={generating} onClick={handleGenerateKey}>
                <Key className="h-4 w-4 mr-1.5" aria-hidden="true" />
                {generating ? "Generating..." : "Generate API key"}
              </Button>
            </div>
          )}

          {generatedKey && (
            <div className="rounded-lg border border-emerald-600/20 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-3">
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                API key created! Copy it now — you won't see it again.
              </p>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-emerald-100 dark:bg-emerald-900/50 px-3 py-1.5 rounded flex-1 break-all font-mono">
                  {generatedKey}
                </code>
                <CopyButton
                  text={generatedKey}
                  label="Copy API key"
                  onCopy={() => trackApiKeyCopied()}
                />
              </div>
            </div>
          )}

          {hasKey && (
            <div className="rounded-lg border border-border/50 p-4 space-y-3">
              <p className="text-sm font-medium">Step 2: Install the CLI</p>
              <CommandBlock command={INSTALL_COMMAND} />
            </div>
          )}

          {generatedKey && (
            <div className="rounded-lg border border-border/50 p-4 space-y-3">
              <p className="text-sm font-medium">Step 3: Configure your key</p>
              <CommandBlock command={`pub config --set apiKey=${generatedKey}`} />
            </div>
          )}

          {hasKey && !generatedKey && (
            <div className="rounded-lg border border-border/50 p-4 space-y-3">
              <p className="text-sm font-medium">Step 3: Configure your key</p>
              <p className="text-sm text-muted-foreground">
                Set your API key (from the Agents page):
              </p>
              <CommandBlock command="pub config --set apiKey=YOUR_API_KEY" />
            </div>
          )}

          {hasKey && (
            <>
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
                {isAgentOnline ? (
                  <p className="text-sm text-muted-foreground">
                    Your agent is online! Use the{" "}
                    <Play className="inline h-3.5 w-3.5" aria-hidden="true" /> button to start a
                    live session.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Once your agent is online, you'll see a play button to start a live session.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
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
      <CopyButton text={command} label="Copy command" />
    </div>
  );
}
