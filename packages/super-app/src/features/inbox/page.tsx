/**
 * Cross-service attention queue. Pulls unread mail, today's events, active
 * urgent/high tasks, and analyzing-state tasks into a single triage view.
 * Items are clickable; clicking navigates to the owning service.
 */
import { useNavigate } from "@tanstack/react-router";
import {
  Calendar as CalendarIcon,
  CheckSquare,
  Github,
  Inbox as InboxIcon,
  Loader2,
  Mail as MailIcon,
  SlidersHorizontal,
} from "lucide-react";
import * as React from "react";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { fmtTime } from "~/core/fmt";
import { useTryToast } from "~/core/hooks/use-toast";
import { invoke, useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { Switch } from "~/core/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "~/core/ui/tabs";
import { calendarApi } from "~/features/calendar/client";
import { mailApi } from "~/features/mail/client";
import { tasksApi } from "~/features/tasks/client";
import * as deadlineCmd from "./commands";

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
  const [mode, setMode] = React.useState<"attention" | "deadlines">("attention");

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
        const text = await runAI(prompts.briefMe, {
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
        description={
          mode === "attention" ? "What needs your attention" : "Deadlines across sources"
        }
        onRefresh={reload}
        actions={
          <>
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList>
                <TabsTrigger value="attention">Attention</TabsTrigger>
                <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button size="sm" onClick={generateDigest} disabled={briefing || mode !== "attention"}>
              {briefing ? <Loader2 className="size-3.5 animate-spin" /> : null} Brief me
            </Button>
          </>
        }
      />
      {mode === "deadlines" ? <DeadlineUniverse /> : null}
      {mode === "deadlines" ? null : (
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
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </div>
                      ) : null}
                    </div>
                    {item.badge ? <Badge variant="muted">{item.badge}</Badge> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function ServiceIcon({ serviceId }: { serviceId: string }) {
  const className = "size-4 text-muted-foreground";
  if (serviceId === "mail") return <MailIcon className={className} />;
  if (serviceId === "calendar") return <CalendarIcon className={className} />;
  if (serviceId === "github") return <Github className={className} />;
  return <CheckSquare className={className} />;
}

interface Deadline {
  id: string;
  title: string;
  due: number;
  source: "calendar" | "github" | "taskwarrior" | "email";
  url?: string;
}

function DeadlineUniverse() {
  const [sources, setSources] = React.useState<Record<Deadline["source"], boolean>>({
    calendar: true,
    github: true,
    taskwarrior: true,
    email: true,
  });
  const [urgency, setUrgency] = React.useState<Record<string, boolean>>({
    overdue: true,
    week: true,
    month: true,
    later: true,
  });
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const [snoozed, setSnoozed] = React.useState<Record<string, number>>({});
  const [selected, setSelected] = React.useState<Deadline | null>(null);

  const calendar = useAsync(() => {
    const now = new Date();
    const later = new Date(now);
    later.setMonth(later.getMonth() + 3);
    return calendarApi.list(now.toISOString(), later.toISOString(), 50).then((r) => r.events);
  }, []);
  const github = useAsync(
    async () => deadlineCmd.parseGitHubMilestones(await invoke(deadlineCmd.listGitHubMilestones)),
    [],
  );
  const taskwarrior = useAsync(
    async () => deadlineCmd.parseTaskwarriorTasks(await invoke(deadlineCmd.listTaskwarriorTasks)),
    [],
  );
  const email = useAsync(
    async () => deadlineCmd.parseFlaggedMailResult(await invoke(deadlineCmd.listFlaggedEmails)),
    [],
  );

  const deadlines = React.useMemo(() => {
    const out: Deadline[] = [];
    if (calendar.state.status === "loaded") {
      for (const e of calendar.state.value) {
        const due = new Date(e.start).getTime();
        if (Number.isFinite(due))
          out.push({
            id: `calendar:${e.id}`,
            title: e.summary,
            due,
            source: "calendar",
            url: e.link ?? undefined,
          });
      }
    }
    if (github.state.status === "loaded") {
      for (const m of github.state.value) {
        if (!m.due_on) continue;
        const due = new Date(m.due_on).getTime();
        if (Number.isFinite(due))
          out.push({
            id: `github:${m.id}`,
            title: m.title,
            due,
            source: "github",
            url: m.html_url,
          });
      }
    }
    if (taskwarrior.state.status === "loaded") {
      for (const t of taskwarrior.state.value) {
        if (!t.due || t.status === "deleted" || t.status === "completed") continue;
        const due = parseTaskwarriorDate(t.due);
        if (Number.isFinite(due))
          out.push({
            id: `taskwarrior:${t.uuid}`,
            title: t.description,
            due,
            source: "taskwarrior",
          });
      }
    }
    if (email.state.status === "loaded") {
      for (const m of email.state.value.messages) {
        const due = new Date(m.date).getTime();
        if (Number.isFinite(due))
          out.push({ id: `email:${m.id}`, title: m.subject, due, source: "email" });
      }
    }
    return out
      .map((d) => ({ ...d, due: snoozed[d.id] ?? d.due }))
      .filter((d) => !dismissed.has(d.id) && sources[d.source] && urgency[urgencyBucket(d.due)])
      .sort((a, b) => a.due - b.due);
  }, [
    calendar.state,
    dismissed,
    email.state,
    github.state,
    snoozed,
    sources,
    taskwarrior.state,
    urgency,
  ]);

  const anyLoading =
    calendar.state.status === "loading" ||
    github.state.status === "loading" ||
    taskwarrior.state.status === "loading" ||
    email.state.status === "loading";

  return (
    <div className="grid flex-1 min-h-0 layout-inbox divide-x">
      <aside className="space-y-5 overflow-auto bg-sidebar/40 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="size-4" /> Filters
        </div>
        <FilterGroup
          title="Sources"
          values={sources}
          labels={{ calendar: "Calendar", github: "GitHub", taskwarrior: "Tasks", email: "Email" }}
          onChange={setSources}
        />
        <FilterGroup
          title="Urgency"
          values={urgency}
          labels={{ overdue: "Overdue", week: "This week", month: "This month", later: "Later" }}
          onChange={setUrgency}
        />
      </aside>
      <div className="relative min-w-0 overflow-hidden">
        {anyLoading ? <Skeleton className="m-6 h-40" /> : null}
        <ScrollArea className="h-full">
          <div className="flex min-h-full items-center gap-6 px-8 py-10">
            {deadlines.length === 0 && !anyLoading ? (
              <Card className="mx-auto">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No matching deadlines.
                </CardContent>
              </Card>
            ) : (
              deadlines.map((deadline) => (
                <button
                  key={deadline.id}
                  type="button"
                  onClick={() => setSelected(deadline)}
                  className={`deadline-planet ${urgencyBucket(deadline.due)} shrink-0`}
                >
                  <ServiceIcon
                    serviceId={
                      deadline.source === "github"
                        ? "github"
                        : deadline.source === "taskwarrior"
                          ? "tasks"
                          : deadline.source === "email"
                            ? "mail"
                            : "calendar"
                    }
                  />
                  <span>{deadline.title}</span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
        {selected ? (
          <div className="absolute right-0 top-0 flex h-full w-80 flex-col border-l bg-background p-4 shadow-xl">
            <button
              type="button"
              className="self-end text-sm text-muted-foreground"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
            <div className="mt-4 text-lg font-semibold">{selected.title}</div>
            <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
              {selected.source}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Due" value={new Date(selected.due).toLocaleString()} />
              <Row label="Urgency" value={urgencyBucket(selected.due)} />
            </div>
            <div className="mt-6 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSnoozed((prev) => ({
                    ...prev,
                    [selected.id]: selected.due + 7 * 24 * 60 * 60 * 1000,
                  }));
                  setSelected(null);
                }}
              >
                Snooze 1 week
              </Button>
              {selected.url ? (
                <Button asChild variant="outline" className="w-full">
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    Open source
                  </a>
                </Button>
              ) : null}
              <Button
                variant="outline"
                className="w-full text-destructive"
                onClick={() => {
                  setDismissed((prev) => new Set([...prev, selected.id]));
                  setSelected(null);
                }}
              >
                Archive from view
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterGroup<T extends string>({
  title,
  values,
  labels,
  onChange,
}: {
  title: string;
  values: Record<T, boolean>;
  labels: Record<T, string>;
  onChange: (next: Record<T, boolean>) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {(Object.keys(values) as T[]).map((key) => (
        <div key={key} className="flex items-center justify-between gap-3 text-sm">
          <span>{labels[key]}</span>
          <Switch
            checked={values[key]}
            onCheckedChange={(checked) => onChange({ ...values, [key]: checked })}
          />
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function urgencyBucket(ts: number): "overdue" | "week" | "month" | "later" {
  const days = Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "overdue";
  if (days <= 7) return "week";
  if (days <= 31) return "month";
  return "later";
}

function parseTaskwarriorDate(raw: string): number {
  if (/^\d{8}T\d{6}Z?$/.test(raw)) {
    const year = raw.slice(0, 4);
    const month = raw.slice(4, 6);
    const day = raw.slice(6, 8);
    const hour = raw.slice(9, 11);
    const min = raw.slice(11, 13);
    const sec = raw.slice(13, 15);
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).getTime();
  }
  return new Date(raw).getTime();
}
