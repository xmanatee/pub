import { Calendar, Cloud, Mail, Newspaper, Quote, Sparkles } from "lucide-react";
import * as React from "react";
import { type AsyncState, invoke, useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/core/ui/card";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import type { CalendarEvent, GmailMessage, HnStory, WeatherResult } from "./commands";
import * as cmd from "./commands";

function PanelShell({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <div className="text-muted-foreground">{icon}</div>
        <CardTitle className="flex-1 text-sm font-medium">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 px-5 pb-5">{children}</div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function render<T>(state: AsyncState<T>, ok: (data: T) => React.ReactNode, rows = 3) {
  if (state.status === "loading") return <SkeletonList count={rows} itemClassName="h-10" />;
  if (state.status === "error") return <p className="text-xs text-destructive">{state.error}</p>;
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

function AgentPanel({
  title,
  icon,
  run,
}: {
  title: string;
  icon: React.ReactNode;
  run: () => Promise<string>;
}) {
  type State =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "loaded"; text: string }
    | { status: "error"; error: string };
  const [state, setState] = React.useState<State>({ status: "idle" });

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
        <p className="text-xs text-muted-foreground">Tap ✨ to generate.</p>
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

export function BriefingPage() {
  const weather = useAsync(() => invoke<WeatherResult>(cmd.weatherCurrent), []);
  const events = useAsync(() => invoke<{ events: CalendarEvent[] }>(cmd.calendarToday), []);
  const gmail = useAsync(() => invoke<{ messages: GmailMessage[] }>(cmd.gmailUnread), []);
  const hn = useAsync(() => invoke<{ stories: HnStory[] }>(cmd.newsHn), []);
  const clock = useLiveClock();

  const refresh = React.useCallback(() => {
    weather.reload();
    events.reload();
    gmail.reload();
    hn.reload();
  }, [weather.reload, events.reload, gmail.reload, hn.reload]);

  const [today, setToday] = React.useState<string | null>(null);
  React.useEffect(() => {
    setToday(
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  const brief = async () => {
    const cal = events.state.status === "loaded" ? events.state.value.events : [];
    const w = weather.state.status === "loaded" ? weather.state.value : null;
    const gm = gmail.state.status === "loaded" ? gmail.state.value.messages : [];
    const context = [
      `Weather: ${w ? `${Math.round(w.temperatureC)}°C, ${w.description}` : "unknown"}`,
      `Calendar today (${cal.length}):`,
      ...cal.slice(0, 8).map((e) => `  ${e.summary} — ${e.start}`),
      `Unread emails (${gm.length}):`,
      ...gm.slice(0, 5).map((m) => `  from ${m.from}: ${m.subject}`),
    ].join("\n");
    return invoke<string>(cmd.briefMe, { context });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Briefing"
        description={today && clock ? `${today} · ${clock}` : undefined}
        onRefresh={refresh}
      />
      <div className="grid flex-1 min-h-0 auto-rows-min grid-cols-1 gap-4 overflow-auto p-6 lg:grid-cols-2 xl:grid-cols-4">
        <PanelShell icon={<Cloud className="size-4" />} title="Weather">
          {render(weather.state, (w) => (
            <div className="space-y-2">
              <div className="text-3xl font-semibold">{Math.round(w.temperatureC)}°C</div>
              <CardDescription>{w.description}</CardDescription>
              <div className="text-xs text-muted-foreground">
                Feels like {Math.round(w.feelsLikeC)}° · Humidity {w.humidity}% · Wind{" "}
                {Math.round(w.windKph)} kph
              </div>
              <div className="grid grid-cols-3 gap-2 pt-3">
                {w.forecast.slice(0, 3).map((d) => (
                  <div key={d.date} className="rounded-md bg-muted px-2 py-2 text-center">
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <div className="text-sm font-medium">
                      {Math.round(d.maxC)}° / {Math.round(d.minC)}°
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </PanelShell>

        <PanelShell icon={<Calendar className="size-4" />} title="Today">
          {render(events.state, (r) =>
            r.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events scheduled.</p>
            ) : (
              r.events.map((e) => (
                <div key={e.id} className="rounded-md border bg-card p-2.5">
                  <div className="text-sm font-medium">{e.summary}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.start).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {new Date(e.end).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
              ))
            ),
          )}
        </PanelShell>

        <PanelShell icon={<Mail className="size-4" />} title="Inbox">
          {render(gmail.state, (r) =>
            r.messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">Inbox zero.</p>
            ) : (
              r.messages.slice(0, 12).map((m) => (
                <div key={m.id} className="rounded-md border bg-card p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="truncate text-sm font-medium">{m.from}</div>
                    <div className="shrink-0 text-[10px] text-muted-foreground">{m.date}</div>
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">{m.subject}</div>
                </div>
              ))
            ),
          )}
        </PanelShell>

        <PanelShell icon={<Newspaper className="size-4" />} title="Top Stories">
          {render(hn.state, (r) =>
            r.stories.slice(0, 8).map((s, i) => (
              <a
                key={s.id}
                href={s.url ?? `https://news.ycombinator.com/item?id=${s.id}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md p-2 transition-colors hover:bg-accent/60"
              >
                <div className="flex items-baseline gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="text-sm font-medium leading-snug">{s.title}</span>
                </div>
                <div className="pl-5 text-[11px] text-muted-foreground">
                  {s.score} pts · {s.comments} comments · {s.by}
                </div>
              </a>
            )),
          )}
        </PanelShell>

        <AgentPanel title="Brief me" icon={<Sparkles className="size-4" />} run={brief} />
        <AgentPanel
          title="Joke"
          icon={<Sparkles className="size-4" />}
          run={() => invoke<string>(cmd.joke)}
        />
        <AgentPanel
          title="Quote"
          icon={<Quote className="size-4" />}
          run={() => invoke<string>(cmd.quote)}
        />
      </div>
    </div>
  );
}
