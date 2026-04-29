/**
 * Cross-feature action panel. Drop into any detail view; the panel renders
 * AI verbs (Summarize / Translate / Explain / Draft / Retone) plus the
 * currently-relevant cross-feature actions (Draft email / Create event /
 * Create task / Create note / Draft telegram) ranked by signal scoring.
 *
 * The panel is the canonical contextual-AI surface — features must NOT
 * roll their own AI menus.
 */
import {
  CalendarPlus,
  CheckSquare,
  Languages,
  Mail,
  MessageSquare,
  Reply,
  Sparkles,
  StickyNote,
  Wand2,
} from "lucide-react";
import * as React from "react";
import { useToast } from "~/core/hooks/use-toast";
import { type CrossFeatureContext, SERVICES, type ServiceAction } from "~/core/navigation/registry";
import { useDispatchTarget } from "~/core/navigation/use-target-navigation";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { Separator } from "~/core/ui/separator";
import { Textarea } from "~/core/ui/textarea";
import * as prompts from "./prompts";
import { runAI } from "./runner";
import { rankActions } from "./signal-scoring";

export interface ActionPanelProps {
  /** Stable id of the source item (for back-links). */
  sourceServiceId: string;
  sourceItemId?: string;
  /** Free-form text the AI verbs operate on. Also feeds signal scoring. */
  text: string;
  /** Additional structured fields the destination may consume. */
  fields?: Record<string, string>;
  /** Restrict the dispatched cross-feature actions (default: every action accepted by another service). */
  allow?: ServiceAction[];
  className?: string;
  /** When true, the panel renders inline (no Card chrome) — for sidebar use. */
  embedded?: boolean;
}

const ALL_ACTIONS: ServiceAction[] = [
  "draft-email",
  "create-event",
  "create-task",
  "create-note",
  "draft-telegram",
];

const ACTION_META: Record<
  ServiceAction,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "draft-email": { label: "Draft email", icon: Mail },
  "create-event": { label: "Create event", icon: CalendarPlus },
  "create-task": { label: "Create task", icon: CheckSquare },
  "create-note": { label: "Save note", icon: StickyNote },
  "draft-telegram": { label: "Draft message", icon: MessageSquare },
};

export function AIActionPanel({
  sourceServiceId,
  sourceItemId,
  text,
  fields,
  allow,
  className,
  embedded,
}: ActionPanelProps) {
  const { push } = useToast();
  const dispatch = useDispatchTarget();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [output, setOutput] = React.useState<string | null>(null);
  const [question, setQuestion] = React.useState("");

  const runVerb = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setOutput(null);
    try {
      const result = await fn();
      setOutput(result);
    } catch (err) {
      push({
        title: "AI request failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const candidates = (allow ?? ALL_ACTIONS).filter((action) => {
    return SERVICES.some((s) => s.accepts?.includes(action));
  });
  const ranked = rankActions(text, sourceServiceId, candidates);

  const dispatchAction = (action: ServiceAction) => {
    const context: CrossFeatureContext = {
      sourceServiceId,
      sourceItemId,
      excerpt: text,
      fields,
    };
    dispatch(action, context);
  };

  const verbsRow = (
    <div className="grid grid-cols-2 gap-1.5">
      <Button
        variant="outline"
        size="sm"
        className="justify-start"
        disabled={busy !== null || !text.trim()}
        onClick={() => runVerb("summarize", () => runAI<string>(prompts.summarize, { text }))}
      >
        <Sparkles className="size-3.5" /> Summarize
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="justify-start"
        disabled={busy !== null || !text.trim()}
        onClick={() => runVerb("explain", () => runAI<string>(prompts.explain, { text }))}
      >
        <Wand2 className="size-3.5" /> Explain
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="justify-start"
        disabled={busy !== null || !text.trim()}
        onClick={() =>
          runVerb("translate", () => runAI<string>(prompts.translate, { text, lang: "English" }))
        }
      >
        <Languages className="size-3.5" /> Translate
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="justify-start"
        disabled={busy !== null || !text.trim()}
        onClick={() =>
          runVerb("retone", () =>
            runAI<string>(prompts.retone, { text, tone: "friendly and concise" }),
          )
        }
      >
        <Reply className="size-3.5" /> Retone
      </Button>
    </div>
  );

  const askRow = (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!question.trim()) return;
        const q = question.trim();
        setQuestion("");
        void runVerb("qa", () =>
          runAI<string>(prompts.qaDocument, { document: text, question: q }),
        );
      }}
    >
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask anything about this…"
        rows={1}
        className="min-h-9 resize-none"
      />
      <Button type="submit" size="sm" disabled={busy !== null || !question.trim()}>
        Ask
      </Button>
    </form>
  );

  const actionsRow = ranked.length > 0 && (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Send to
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ranked.map(({ action, surface }) => {
          const meta = ACTION_META[action];
          const Icon = meta.icon;
          return (
            <Button
              key={action}
              variant={surface ? "default" : "outline"}
              size="sm"
              onClick={() => dispatchAction(action)}
            >
              <Icon className="size-3.5" /> {meta.label}
            </Button>
          );
        })}
      </div>
    </div>
  );

  const outputRow = output !== null && (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI</div>
      <div className="rounded-md border bg-muted/40 p-2 text-sm whitespace-pre-wrap">{output}</div>
    </div>
  );

  const body = (
    <div className="space-y-3">
      {verbsRow}
      {askRow}
      {outputRow}
      {actionsRow}
    </div>
  );

  if (embedded) {
    return <div className={className}>{body}</div>;
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Sparkles className="size-4 text-primary" /> AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <Separator />
        {body}
      </CardContent>
    </Card>
  );
}
