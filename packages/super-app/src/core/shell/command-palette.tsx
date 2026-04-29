/**
 * Cmd/Ctrl+K command palette. Lists every service in `SERVICES` so you can
 * jump anywhere with two keystrokes.
 */
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import * as React from "react";
import { useKeyboardShortcuts } from "~/core/hooks/use-keyboard-shortcuts";
import { SERVICES } from "~/core/navigation/registry";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/core/ui/dialog";
import { Input } from "~/core/ui/input";

export interface CommandEntry {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  run: () => void;
}

interface CommandContextValue {
  open: () => void;
}

const CommandContext = React.createContext<CommandContextValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false);
  const navigate = useNavigate();

  const open = React.useCallback(() => setOpen(true), []);

  const entries: CommandEntry[] = SERVICES.map((s) => ({
    id: `nav:${s.id}`,
    label: s.label,
    description: s.description,
    icon: s.icon,
    run: () => navigate({ to: s.route }),
  }));

  useKeyboardShortcuts({
    "Mod+K": () => setOpen((v) => !v),
  });

  return (
    <CommandContext.Provider value={{ open }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Command palette</DialogTitle>
            <DialogDescription>Jump to a service or run a quick action</DialogDescription>
          </DialogHeader>
          <Picker entries={entries} onPick={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </CommandContext.Provider>
  );
}

function Picker({ entries, onPick }: { entries: CommandEntry[]; onPick: () => void }) {
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.description?.toLowerCase().includes(q),
    );
  }, [entries, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset active row when query changes
  React.useEffect(() => {
    setActive(0);
  }, [query]);

  const run = (entry: CommandEntry) => {
    onPick();
    queueMicrotask(entry.run);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[active];
      if (entry) run(entry);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="relative border-b">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="h-12 rounded-none border-0 pl-9 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="max-h-72 overflow-auto p-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No matches</p>
        ) : (
          filtered.map((entry, idx) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => run(entry)}
                onMouseEnter={() => setActive(idx)}
                className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm ${
                  active === idx ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
                <div className="min-w-0 flex-1">
                  <div className="truncate">{entry.label}</div>
                  {entry.description ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {entry.description}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function useCommandPalette(): CommandContextValue {
  const ctx = React.useContext(CommandContext);
  if (!ctx) throw new Error("useCommandPalette must be used within <CommandPaletteProvider>");
  return ctx;
}
