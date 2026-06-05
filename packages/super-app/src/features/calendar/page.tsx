import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  MapPin,
  Trash2,
  Users,
} from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useTryToast } from "~/core/hooks/use-toast";
import { useIncomingTarget } from "~/core/navigation/use-target-navigation";
import { type AsyncState, useAsync } from "~/core/pub";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/core/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "~/core/ui/dialog";
import { Input } from "~/core/ui/input";
import { ScrollArea } from "~/core/ui/scroll-area";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { Tabs, TabsList, TabsTrigger } from "~/core/ui/tabs";
import { Textarea } from "~/core/ui/textarea";
import { parseComposeEventDraft } from "./ai-results";
import { calendarApi, type EventInput } from "./client";
import type { CalendarEvent, CalendarFreeBusyResult } from "./commands";

type ViewKind = "day" | "week" | "month" | "fluid";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

function rangeFor(view: ViewKind, anchor: Date): { from: Date; to: Date } {
  if (view === "day") {
    const from = startOfDay(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (view === "fluid") {
    const from = startOfDay(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }
  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }
  const from = startOfMonth(anchor);
  const to = new Date(from);
  to.setMonth(to.getMonth() + 1);
  return { from, to };
}

function formatRangeLabel(view: ViewKind, from: Date): string {
  if (view === "day")
    return from.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  if (view === "fluid")
    return `Fluid day · ${from.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`;
  if (view === "week")
    return `Week of ${from.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  return from.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function useRangeLabel(view: ViewKind, from: Date): string | null {
  const [label, setLabel] = React.useState<string | null>(null);
  React.useEffect(() => {
    setLabel(formatRangeLabel(view, from));
  }, [view, from]);
  return label;
}

function shift(view: ViewKind, anchor: Date, dir: 1 | -1): Date {
  const next = new Date(anchor);
  if (view === "day" || view === "fluid") next.setDate(next.getDate() + dir);
  else if (view === "week") next.setDate(next.getDate() + 7 * dir);
  else next.setMonth(next.getMonth() + dir);
  return next;
}

export function CalendarPage() {
  const confirm = useConfirm();
  const tryToast = useTryToast();
  const [view, setView] = React.useState<ViewKind>("week");
  const [anchor, setAnchor] = React.useState<Date>(() => new Date());
  const [editing, setEditing] = React.useState<(EventInput & { id: string | null }) | null>(null);
  const [showAvailability, setShowAvailability] = React.useState(false);

  const range = rangeFor(view, anchor);
  const label = useRangeLabel(view, range.from);
  const { state, reload } = useAsync(
    () => calendarApi.list(range.from.toISOString(), range.to.toISOString()).then((r) => r.events),
    [range.from.getTime(), range.to.getTime()],
  );
  const availability = useAsync(
    () => calendarApi.freeBusy(range.from.toISOString(), range.to.toISOString()),
    [range.from.getTime(), range.to.getTime()],
  );

  const incoming = useIncomingTarget("calendar");
  React.useEffect(() => {
    if (!incoming.target) return;
    const ctx = incoming.target.context;
    void runAI(prompts.composeEvent, { context: ctx.excerpt }, parseComposeEventDraft)
      .then((draft) =>
        setEditing({
          id: null,
          summary: draft.summary,
          start: draft.startDate,
          end: draft.endDate,
          description: draft.description,
          location: draft.location,
          attendees: ctx.fields?.attendees ?? ctx.fields?.to ?? "",
        }),
      )
      .catch((err) => tryToast(() => Promise.reject(err), { errorTitle: "Couldn't draft event" }));
    incoming.consume();
  }, [incoming, tryToast]);

  const onDelete = async (event: CalendarEvent) => {
    if (!(await confirm({ title: `Delete "${event.summary}"?`, danger: true }))) return;
    await tryToast(() => calendarApi.delete(event.id), { successTitle: "Deleted" });
    reload();
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Calendar"
        description={label ?? undefined}
        onRefresh={reload}
        actions={
          <>
            <Button
              variant={showAvailability ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAvailability((value) => !value)}
            >
              <Clock className="size-3.5" /> Availability
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setEditing({
                  id: null,
                  summary: "",
                  start: new Date().toISOString(),
                  end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                  description: "",
                  location: "",
                  attendees: "",
                })
              }
            >
              <CalendarPlus className="size-3.5" /> New event
            </Button>
          </>
        }
      />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-6 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAnchor(shift(view, anchor, -1))}
            aria-label="Previous"
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAnchor(shift(view, anchor, 1))}
            aria-label="Next"
          >
            <ChevronRight />
          </Button>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as ViewKind)}>
          <TabsList>
            <TabsTrigger value="day">Day</TabsTrigger>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="fluid">Fluid</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex-1 min-h-0">
        {showAvailability ? <AvailabilityPanel state={availability.state} /> : null}
        {state.status === "loading" ? (
          <SkeletonList count={6} itemClassName="h-12" className="space-y-2 p-6" />
        ) : state.status === "error" ? (
          <p className="p-6 text-sm text-destructive">{state.error}</p>
        ) : view === "fluid" ? (
          <FluidCalendar events={state.value} />
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-2 p-6">
              {state.value.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events in this range.</p>
              ) : (
                groupByDay(state.value).map(({ day, events }) => (
                  <DaySection
                    key={day}
                    day={day}
                    events={events}
                    onEdit={(event) =>
                      setEditing({
                        id: event.id,
                        summary: event.summary,
                        start: event.start,
                        end: event.end,
                        description: event.description ?? "",
                        location: event.location ?? "",
                        attendees: event.attendees.join(","),
                      })
                    }
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </div>
      {editing ? (
        <EventEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            const fn = editing.id
              ? calendarApi.update(editing.id, input)
              : calendarApi.create(input);
            await tryToast(() => fn, { successTitle: "Saved" });
            setEditing(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function FluidCalendar({ events }: { events: CalendarEvent[] }) {
  const [active, setActive] = React.useState<CalendarEvent | null>(null);
  const grouped = React.useMemo(() => {
    const buckets = {
      work: [] as CalendarEvent[],
      personal: [] as CalendarEvent[],
      team: [] as CalendarEvent[],
    };
    for (const event of events) buckets[eventCategory(event)].push(event);
    return buckets;
  }, [events]);
  const totalHours = Math.max(
    1,
    events.reduce((sum, event) => sum + eventDurationHours(event), 0),
  );
  const layers = (Object.keys(grouped) as Array<keyof typeof grouped>).map((key) => ({
    key,
    events: grouped[key],
    pct: Math.max(
      6,
      (grouped[key].reduce((sum, event) => sum + eventDurationHours(event), 0) / totalHours) * 100,
    ),
  }));
  return (
    <div className="grid h-full grid-cols-1 gap-6 overflow-auto p-6 lg:layout-calendar">
      <div className="calendar-vessel">
        <div className="calendar-liquid-stack">
          {layers.map((layer) => (
            <button
              key={layer.key}
              type="button"
              className={`calendar-liquid ${layer.key}`}
              style={{ height: `${layer.pct}%` }}
              onMouseEnter={() => setActive(layer.events[0] ?? null)}
            >
              <span>{layer.key}</span>
            </button>
          ))}
        </div>
        <div className="calendar-glass" />
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(grouped) as Array<keyof typeof grouped>).map((key) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize">{key}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{grouped[key].length}</div>
                <div className="text-xs text-muted-foreground">
                  {grouped[key]
                    .reduce((sum, event) => sum + eventDurationHours(event), 0)
                    .toFixed(1)}
                  h
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {events.length > 0 ? (
          <div className="space-y-2">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                onMouseEnter={() => setActive(event)}
                onClick={() => setActive(event)}
                className="flex w-full items-center justify-between gap-3 rounded-md border bg-card p-3 text-left hover:bg-accent/40"
              >
                <span className="truncate text-sm font-medium">{event.summary}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(event.start).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No events today.</p>
        )}
        {active ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{active.summary}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <div>
                {new Date(active.start).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" - "}
                {new Date(active.end).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {active.location ? <div>{active.location}</div> : null}
              {active.description ? <div className="line-clamp-3">{active.description}</div> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function eventCategory(event: CalendarEvent): "work" | "personal" | "team" {
  const text = `${event.summary} ${event.description ?? ""}`.toLowerCase();
  if (/standup|team|sync|review|planning|1:1|meeting/.test(text)) return "team";
  if (/gym|doctor|family|lunch|personal|home/.test(text)) return "personal";
  return "work";
}

function eventDurationHours(event: CalendarEvent): number {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0.5;
  return Math.min(8, Math.max(0.25, (end - start) / 3_600_000));
}

function groupByDay(events: CalendarEvent[]): { day: string; events: CalendarEvent[] }[] {
  const buckets = new Map<string, CalendarEvent[]>();
  for (const e of events.slice().sort((a, b) => a.start.localeCompare(b.start))) {
    const key = e.start.slice(0, 10);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(e);
    else buckets.set(key, [e]);
  }
  return Array.from(buckets.entries()).map(([day, list]) => ({ day, events: list }));
}

function DaySection({
  day,
  events,
  onEdit,
  onDelete,
}: {
  day: string;
  events: CalendarEvent[];
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {new Date(day).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}
      </div>
      {events.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          onEdit={() => onEdit(event)}
          onDelete={() => onDelete(event)}
        />
      ))}
    </div>
  );
}

function EventRow({
  event,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-md border bg-card p-3">
      <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <button type="button" onClick={onEdit} className="text-left text-sm font-medium">
          {event.summary}
        </button>
        {event.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{event.description}</p>
        ) : null}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" /> {event.location}
            </span>
          ) : null}
          {event.attendees.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" /> {event.attendees.length}
            </span>
          ) : null}
        </div>
        <AIActionPanel
          embedded
          sourceServiceId="calendar"
          sourceItemId={event.id}
          text={`${event.summary}\n${event.description ?? ""}\n${event.start}–${event.end}\n${event.location ?? ""}`}
          allow={["draft-email", "create-task", "create-note"]}
          className="pt-2"
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete"
        className="opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

function EventEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: EventInput & { id: string | null };
  onCancel: () => void;
  onSave: (input: EventInput) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState<EventInput>({
    summary: initial.summary,
    start: initial.start,
    end: initial.end,
    description: initial.description ?? "",
    location: initial.location ?? "",
    attendees: initial.attendees ?? "",
  });
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial.id ? "Edit event" : "New event"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Input
            placeholder="Summary"
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <DateTimeField
              label="Start"
              value={draft.start}
              onChange={(v) => setDraft({ ...draft, start: v })}
            />
            <DateTimeField
              label="End"
              value={draft.end}
              onChange={(v) => setDraft({ ...draft, end: v })}
            />
          </div>
          <Input
            placeholder="Location"
            value={draft.location ?? ""}
            onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          />
          <Input
            placeholder="Attendees, comma-separated emails"
            value={draft.attendees ?? ""}
            onChange={(e) => setDraft({ ...draft, attendees: e.target.value })}
          />
          <Textarea
            rows={4}
            placeholder="Description"
            value={draft.description ?? ""}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !draft.summary.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityPanel({ state }: { state: AsyncState<CalendarFreeBusyResult> }) {
  return (
    <div className="border-b bg-muted/25 px-6 py-3">
      {state.status === "loading" ? (
        <SkeletonList count={2} itemClassName="h-8" />
      ) : state.status === "error" ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : state.value.calendars.length === 0 ? (
        <p className="text-sm text-muted-foreground">No calendar availability returned.</p>
      ) : (
        <div className="space-y-2">
          {state.value.calendars.map((calendar) => (
            <div
              key={calendar.id}
              className="flex flex-col gap-2 rounded-md border bg-card p-3 text-sm md:flex-row md:items-start"
            >
              <div className="min-w-36 font-medium">{calendar.id}</div>
              <div className="min-w-0 flex-1">
                {calendar.errors.length > 0 ? (
                  <div className="text-destructive">{calendar.errors.join(", ")}</div>
                ) : calendar.busy.length === 0 ? (
                  <div className="text-muted-foreground">Free across this range.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {calendar.busy.map((slot) => (
                      <span
                        key={`${slot.start}:${slot.end}`}
                        className="rounded-md bg-muted px-2 py-1 text-xs tabular-nums text-muted-foreground"
                      >
                        {formatAvailabilitySlot(slot.start, slot.end)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatAvailabilitySlot(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${startDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  // Convert ISO string to native datetime-local value (no timezone suffix).
  const local = React.useMemo(() => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, [value]);

  return (
    <label className="space-y-1 text-xs">
      <span className="block text-muted-foreground">{label}</span>
      <input
        type="datetime-local"
        value={local}
        onChange={(e) => {
          const next = new Date(e.target.value);
          if (Number.isNaN(next.getTime())) return;
          onChange(next.toISOString());
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </label>
  );
}
