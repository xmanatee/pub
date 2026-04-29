/**
 * Cross-service attention queue. Pulls unread mail, today's events, active
 * urgent/high tasks, and analyzing-state tasks into a single triage view.
 * Items are clickable; clicking navigates to the owning service.
 */
import { useNavigate } from "@tanstack/react-router";
import {
  Calendar as CalendarIcon,
  CheckSquare,
  Inbox as InboxIcon,
  Loader2,
  Mail as MailIcon,
} from "lucide-react";
import * as React from "react";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { fmtTime } from "~/core/fmt";
import { useTryToast } from "~/core/hooks/use-toast";
import { useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { calendarApi } from "~/features/calendar/client";
import { mailApi } from "~/features/mail/client";
import { tasksApi } from "~/features/tasks/client";

interface AttentionItem {
  id: string;
  serviceId: string;
  title: string;
  subtitle?: string;
  ts?: number;
  badge?: string;
}

export function InboxPage() {
  const navigate = useNavigate();
  const tryToast = useTryToast();
  const [digest, setDigest] = React.useState<string | null>(null);
  const [briefing, setBriefing] = React.useState(false);

  const mail = useAsync(() => mailApi.list("in:inbox is:unread", 12).then((r) => r.messages), []);
  const tasks = useAsync(() => tasksApi.list().then((r) => r.entries), []);
  const events = useAsync(() => {
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    return calendarApi.list(now.toISOString(), next.toISOString(), 20).then((r) => r.events);
  }, []);

  const items: AttentionItem[] = [];
  if (mail.state.status === "loaded") {
    for (const m of mail.state.value) {
      items.push({
        id: `mail:${m.id}`,
        serviceId: "mail",
        title: m.subject,
        subtitle: m.from,
        badge: "Unread",
      });
    }
  }
  if (events.state.status === "loaded") {
    for (const e of events.state.value) {
      items.push({
        id: `cal:${e.id}`,
        serviceId: "calendar",
        title: e.summary,
        subtitle: `${fmtTime(new Date(e.start).getTime(), true)}${e.location ? ` · ${e.location}` : ""}`,
        ts: new Date(e.start).getTime(),
      });
    }
  }
  if (tasks.state.status === "loaded") {
    for (const t of tasks.state.value) {
      if (t.status === "active" && (t.priority === "urgent" || t.priority === "high")) {
        items.push({ id: `task:${t.id}`, serviceId: "tasks", title: t.title, badge: t.priority });
      }
      if (t.status === "analyzing") {
        items.push({
          id: `task:${t.id}:analyze`,
          serviceId: "tasks",
          title: t.title,
          badge: "Analyzing",
        });
      }
    }
  }

  const allLoaded =
    mail.state.status === "loaded" &&
    tasks.state.status === "loaded" &&
    events.state.status === "loaded";

  const reload = () => {
    mail.reload();
    tasks.reload();
    events.reload();
  };

  const generateDigest = async () => {
    setBriefing(true);
    setDigest(null);
    await tryToast(
      async () => {
        const text = await runAI<string>(prompts.briefMe, {
          context: items
            .slice(0, 12)
            .map((it) => `- [${it.serviceId}] ${it.title}${it.subtitle ? ` — ${it.subtitle}` : ""}`)
            .join("\n"),
        });
        setDigest(text);
      },
      { errorTitle: "Couldn't generate digest" },
    );
    setBriefing(false);
  };

  const goto = (item: AttentionItem) => {
    if (item.serviceId === "mail") navigate({ to: "/mail" });
    else if (item.serviceId === "calendar") navigate({ to: "/calendar" });
    else if (item.serviceId === "tasks") navigate({ to: "/tasks" });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Inbox"
        description="What needs your attention"
        onRefresh={reload}
        actions={
          <Button size="sm" onClick={generateDigest} disabled={briefing}>
            {briefing ? <Loader2 className="size-3.5 animate-spin" /> : null} Brief me
          </Button>
        }
      />
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-4 p-6">
          {digest ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Today</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-relaxed">{digest}</CardContent>
            </Card>
          ) : null}

          {!allLoaded ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : items.length === 0 ? (
            <Card className="text-center">
              <CardContent className="py-8 text-sm text-muted-foreground">
                <InboxIcon className="mx-auto mb-2 size-6" /> Inbox zero. Nothing waiting.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goto(item)}
                  className="flex w-full items-center gap-3 rounded-md border bg-card p-3 text-left hover:bg-accent/40"
                >
                  <ServiceIcon serviceId={item.serviceId} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    {item.subtitle ? (
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    ) : null}
                  </div>
                  {item.badge ? <Badge variant="muted">{item.badge}</Badge> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ServiceIcon({ serviceId }: { serviceId: string }) {
  const className = "size-4 text-muted-foreground";
  if (serviceId === "mail") return <MailIcon className={className} />;
  if (serviceId === "calendar") return <CalendarIcon className={className} />;
  return <CheckSquare className={className} />;
}
