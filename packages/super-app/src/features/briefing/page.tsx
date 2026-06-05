import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Calendar,
  CheckSquare,
  Cloud,
  Mail,
  MessageSquare,
  Newspaper,
  Quote,
  Sparkles,
  StickyNote,
} from "lucide-react";
import * as React from "react";
import * as aiPrompts from "~/core/ai/prompts";
import { formatAIError, runAI } from "~/core/ai/runner";
import type { ServiceAction } from "~/core/navigation/registry";
import { useDispatchTarget } from "~/core/navigation/use-target-navigation";
import { type AsyncState, invoke, useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { Badge } from "~/core/ui/badge";
import { Button } from "~/core/ui/button";
import { SkeletonList } from "~/core/ui/skeleton-list";
import * as cmd from "./commands";

type AgentState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "loaded"; label: string; text: string }
  | { status: "error"; label: string; error: string };

function render<T>(state: AsyncState<T>, ok: (data: T) => React.ReactNode, rows = 3) {
  if (state.status === "loading") return <SkeletonList count={rows} itemClassName="h-11" />;
  if (state.status === "error") return <p className="text-sm text-destructive">{state.error}</p>;
  return <>{ok(state.value)}</>;
}

function useLiveClock(): string | null {
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    now?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) ?? null
  );
}

function useGreeting(): string | null {
  const [hour, setHour] = React.useState<number | null>(null);
  React.useEffect(() => setHour(new Date().getHours()), []);
  if (hour === null) return null;
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function BriefingPage() {
  const dispatch = useDispatchTarget();
  const weather = useAsync(
    async () => cmd.parseWeatherResult(await invoke(cmd.weatherCurrent)),
    [],
  );
  const events = useAsync(
    async () => cmd.parseCalendarTodayResult(await invoke(cmd.calendarToday)),
    [],
  );
  const gmail = useAsync(async () => cmd.parseGmailUnreadResult(await invoke(cmd.gmailUnread)), []);
  const hn = useAsync(async () => cmd.parseNewsHnResult(await invoke(cmd.newsHn)), []);
  const clock = useLiveClock();
  const greeting = useGreeting();
  const [today, setToday] = React.useState<string | null>(null);
  const [selectedMailId, setSelectedMailId] = React.useState<string | null>(null);
  const [agent, setAgent] = React.useState<AgentState>({ status: "idle" });

  React.useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  const messages = React.useMemo(
    () => (gmail.state.status === "loaded" ? gmail.state.value.messages : []),
    [gmail.state],
  );

  React.useEffect(() => {
    if (messages.length === 0) {
      setSelectedMailId(null);
      return;
    }
    setSelectedMailId((current) =>
      current && messages.some((message) => message.id === current) ? current : messages[0].id,
    );
  }, [messages]);

  const selectedMail = messages.find((message) => message.id === selectedMailId) ?? null;

  const refresh = React.useCallback(() => {
    weather.reload();
    events.reload();
    gmail.reload();
    hn.reload();
  }, [weather.reload, events.reload, gmail.reload, hn.reload]);

  const brief = async () => {
    const cal = events.state.status === "loaded" ? events.state.value.events : [];
    const w = weather.state.status === "loaded" ? weather.state.value : null;
    const gm = gmail.state.status === "loaded" ? gmail.state.value.messages : [];
    const context = [
      `Weather: ${w ? `${Math.round(w.temperatureC)}°C, ${w.description}` : "unknown"}`,
      `Calendar today (${cal.length}):`,
      ...cal.slice(0, 8).map((e) => `  ${e.summary} — ${e.start}`),
      `Unread emails (${gm.length}):`,
      ...gm.slice(0, 5).map((m) => `  from ${m.from}: ${m.subject} — ${m.snippet}`),
    ].join("\n");
    return runAI(aiPrompts.briefMe, { context });
  };

  const runAgent = (label: string, fn: () => Promise<string>) => {
    setAgent({ status: "loading", label });
    fn()
      .then((text) => setAgent({ status: "loaded", label, text }))
      .catch((err) =>
        setAgent({
          status: "error",
          label,
          error: formatAIError(err),
        }),
      );
  };

  const routeMail = (action: ServiceAction) => {
    if (!selectedMail) return;
    dispatch(action, {
      sourceServiceId: "briefing",
      sourceItemId: selectedMail.id,
      excerpt: [
        `From: ${selectedMail.from}`,
        `Subject: ${selectedMail.subject}`,
        "",
        selectedMail.snippet,
      ].join("\n"),
      fields: {
        to: emailAddressFromHeader(selectedMail.from),
        attendees: emailAddressFromHeader(selectedMail.from),
        subject: selectedMail.subject,
        title: selectedMail.subject,
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Command Center"
        description={[
          greeting,
          today,
          clock,
          messages.length > 0 ? `${messages.length} unread` : "Inbox clear",
        ]
          .filter(Boolean)
          .join(" · ")}
        onRefresh={refresh}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/inbox">
              Unified Inbox <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      />

      <div className="grid flex-1 min-h-0 gap-4 overflow-auto p-4 briefing-command-layout md:p-5">
        <section className="briefing-surface">
          <SurfaceHeader
            eyebrow="Now"
            title="Signal"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/mail">Open Mail</Link>
              </Button>
            }
          />
          <div className="grid gap-3">
            <WeatherCard state={weather.state} />
            <TodayCard state={events.state} />
          </div>
          <div className="mt-4 space-y-2">
            <SectionLabel icon={<Mail className="size-4" />} label="Unread mail" />
            {render(
              gmail.state,
              (r) =>
                r.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing unread in Gmail.</p>
                ) : (
                  <div className="max-h-80 space-y-1.5 overflow-auto pr-1">
                    {r.messages.slice(0, 8).map((message) => (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setSelectedMailId(message.id)}
                        className={`briefing-row ${
                          message.id === selectedMailId ? "briefing-row-active" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {message.subject}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {message.from}
                          </span>
                        </span>
                        <span className="shrink-0 text-tiny text-muted-foreground">
                          {message.date}
                        </span>
                      </button>
                    ))}
                  </div>
                ),
              5,
            )}
          </div>
        </section>

        <section className="briefing-surface flex min-h-0 flex-col">
          <SurfaceHeader
            eyebrow="Read"
            title="Mail pane"
            action={
              selectedMail ? (
                <Button asChild size="sm">
                  <Link to="/mail">
                    Full Thread <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null
            }
          />
          <MailPreview message={selectedMail} onRoute={routeMail} />
        </section>

        <aside className="grid min-h-0 gap-4 briefing-side-rail">
          <section className="briefing-surface">
            <SurfaceHeader eyebrow="Agent" title="Local synthesis" />
            <div className="grid grid-cols-3 gap-2">
              <AgentButton
                label="Brief"
                active={agent.status === "loading" && agent.label === "Brief"}
                onClick={() => runAgent("Brief", brief)}
              />
              <AgentButton
                label="Joke"
                active={agent.status === "loading" && agent.label === "Joke"}
                onClick={() => runAgent("Joke", () => runAI(aiPrompts.joke, {}))}
              />
              <AgentButton
                label="Quote"
                active={agent.status === "loading" && agent.label === "Quote"}
                onClick={() => runAgent("Quote", () => runAI(aiPrompts.quote, {}))}
              />
            </div>
            <AgentOutput state={agent} />
          </section>

          <section className="briefing-surface min-h-0">
            <SurfaceHeader eyebrow="Context" title="Outside feed" />
            <div className="space-y-4 overflow-auto">
              <div className="space-y-2">
                <SectionLabel icon={<Newspaper className="size-4" />} label="Top stories" />
                {render(
                  hn.state,
                  (r) => (
                    <div className="space-y-1">
                      {r.stories.slice(0, 6).map((story, index) => (
                        <a
                          key={story.id}
                          href={story.url ?? `https://news.ycombinator.com/item?id=${story.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                        >
                          <span className="line-clamp-2 text-sm font-medium leading-snug">
                            {index + 1}. {story.title}
                          </span>
                          <span className="mt-1 block text-tiny text-muted-foreground">
                            {story.score} pts · {story.comments} comments · {story.by}
                          </span>
                        </a>
                      ))}
                    </div>
                  ),
                  4,
                )}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SurfaceHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-tiny font-semibold uppercase text-muted-foreground">{eyebrow}</div>
        <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
      {icon}
      {label}
    </div>
  );
}

function WeatherCard({ state }: { state: AsyncState<cmd.WeatherResult> }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-background/60 p-4">
      <SectionLabel icon={<Cloud className="size-4" />} label="Weather" />
      {render(state, (weather) => (
        <div className="mt-3">
          <div className="flex items-end gap-3">
            <div className="text-4xl font-semibold tabular-nums">
              {Math.round(weather.temperatureC)}°C
            </div>
            <div className="pb-1 text-sm text-muted-foreground">{weather.description}</div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Feels {Math.round(weather.feelsLikeC)}° · Humidity {weather.humidity}% · Wind{" "}
            {Math.round(weather.windKph)} kph
          </div>
          <div className="mt-3 flex max-w-full gap-1.5 overflow-x-auto">
            {weather.hourly.slice(0, 6).map((hour) => (
              <div
                key={hour.time}
                className="min-w-16 rounded-md bg-muted px-2 py-1.5 text-center text-xs"
              >
                <div className="text-muted-foreground">{formatWeatherHour(hour.time)}</div>
                <div className="font-medium tabular-nums">{Math.round(hour.temperatureC)}°</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TodayCard({ state }: { state: AsyncState<cmd.CalendarTodayResult> }) {
  return (
    <div className="rounded-lg border bg-background/60 p-4">
      <SectionLabel icon={<Calendar className="size-4" />} label="Calendar" />
      {render(state, (result) =>
        result.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No events scheduled today.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {result.events.slice(0, 4).map((event) => (
              <div key={event.id} className="rounded-md bg-muted px-3 py-2">
                <div className="truncate text-sm font-medium">{event.summary}</div>
                <div className="text-xs text-muted-foreground">
                  {formatTimeRange(event.start, event.end)}
                  {event.location ? ` · ${event.location}` : ""}
                </div>
              </div>
            ))}
          </div>
        ),
      )}
    </div>
  );
}

function MailPreview({
  message,
  onRoute,
}: {
  message: cmd.GmailMessage | null;
  onRoute: (action: ServiceAction) => void;
}) {
  if (!message) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center rounded-lg border bg-background/60 p-8 text-center">
        <Mail className="mb-3 size-6 text-muted-foreground" />
        <h3 className="text-base font-semibold">No email selected</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Select an unread message from the signal list or open Mail for the full inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {message.labels.slice(0, 5).map((label) => (
            <Badge key={label} variant={label === "IMPORTANT" ? "warning" : "muted"}>
              {label}
            </Badge>
          ))}
        </div>
        <h3 className="text-2xl font-semibold leading-tight">{message.subject}</h3>
        <p className="mt-2 break-words text-sm text-muted-foreground">
          {message.from} · {message.date}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background/60 p-5">
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
          {message.snippet || "Open the full thread to read this message."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <Button variant="outline" onClick={() => onRoute("draft-email")}>
          <Mail className="size-3.5" /> Reply
        </Button>
        <Button variant="outline" onClick={() => onRoute("create-event")}>
          <Calendar className="size-3.5" /> Event
        </Button>
        <Button variant="outline" onClick={() => onRoute("create-task")}>
          <CheckSquare className="size-3.5" /> Task
        </Button>
        <Button variant="outline" onClick={() => onRoute("create-note")}>
          <StickyNote className="size-3.5" /> Note
        </Button>
        <Button variant="outline" onClick={() => onRoute("draft-telegram")}>
          <MessageSquare className="size-3.5" /> Message
        </Button>
      </div>
    </div>
  );
}

function emailAddressFromHeader(header: string): string {
  return header.match(/<([^>]+)>/)?.[1] ?? header;
}

function AgentButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick} disabled={active}>
      {label === "Quote" ? <Quote className="size-3.5" /> : <Sparkles className="size-3.5" />}
      {label}
    </Button>
  );
}

function AgentOutput({ state }: { state: AgentState }) {
  if (state.status === "idle") {
    return (
      <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
        Ask the local agent for a day brief, a joke, or a quote.
      </p>
    );
  }
  if (state.status === "loading") {
    return <SkeletonList count={3} itemClassName="h-4" className="mt-3" />;
  }
  if (state.status === "error") {
    return (
      <p className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  return (
    <p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-relaxed">
      {state.text}
    </p>
  );
}

function formatWeatherHour(raw: string): string {
  const padded = raw.padStart(4, "0");
  const hour = Number(padded.slice(0, 2));
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

function formatTimeRange(start: string, end: string): string {
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${new Date(start).toLocaleTimeString([], options)} – ${new Date(end).toLocaleTimeString([], options)}`;
}
