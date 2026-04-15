import { Calendar, Cloud, Mail, Newspaper } from "lucide-react";
import * as React from "react";
import type { CalendarEvent, GmailMessage, HnStory, WeatherResult } from "~/commands/results";
import { PageHeader } from "~/components/shell/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SkeletonList } from "~/components/ui/skeleton-list";
import { type CommandState, useCommand } from "~/lib/pub";

function PanelShell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <div className="text-muted-foreground">{icon}</div>
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="space-y-2 px-5 pb-5">{children}</div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function render<T>(state: CommandState<T>, ok: (data: T) => React.ReactNode, rows = 3) {
  if (state.status === "loading" || state.status === "idle") {
    return <SkeletonList count={rows} itemClassName="h-10" />;
  }
  if (state.status === "error") {
    return <p className="text-xs text-destructive">{state.error}</p>;
  }
  return <>{ok(state.value)}</>;
}

export function BriefingPage() {
  const weather = useCommand<WeatherResult>("weather.current");
  const events = useCommand<{ events: CalendarEvent[] }>("calendar.today");
  const gmail = useCommand<{ messages: GmailMessage[] }>("gmail.unread");
  const hn = useCommand<{ stories: HnStory[] }>("news.hn");

  const refresh = React.useCallback(() => {
    weather.reload();
    events.reload();
    gmail.reload();
    hn.reload();
  }, [weather.reload, events.reload, gmail.reload, hn.reload]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Briefing" description={today} onRefresh={refresh} />
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-auto p-6 lg:grid-cols-2 xl:grid-cols-4">
        <PanelShell icon={<Cloud className="size-4" />} title="Weather">
          {render(weather, (w) => (
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
          {render(events, (r) =>
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
          {render(gmail, (r) =>
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
          {render(hn, (r) =>
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
      </div>
    </div>
  );
}
