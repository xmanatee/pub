import { Sparkles } from "lucide-react";
import * as React from "react";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { PanelShell } from "./panel-shell";

type AgentPanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; text: string }
  | { status: "error"; error: string };

export function AgentPanel({
  title,
  icon,
  run,
}: {
  title: string;
  icon: React.ReactNode;
  run: () => Promise<string>;
}) {
  const [state, setState] = React.useState<AgentPanelState>({ status: "idle" });

  const trigger = () => {
    setState({ status: "loading" });
    run()
      .then((text) => setState({ status: "loaded", text }))
      .catch((err) =>
        setState({ status: "error", error: err instanceof Error ? err.message : String(err) }),
      );
  };

  return (
    <PanelShell
      icon={icon}
      title={title}
      action={
        <button
          type="button"
          onClick={trigger}
          aria-label={`Generate ${title}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <Sparkles className="size-3.5" />
        </button>
      }
    >
      {state.status === "idle" ? (
        <p className="text-xs text-muted-foreground">No output yet.</p>
      ) : state.status === "loading" ? (
        <SkeletonList count={3} itemClassName="h-4" />
      ) : state.status === "error" ? (
        <p className="text-xs text-destructive">{state.error}</p>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.text}</p>
      )}
    </PanelShell>
  );
}
