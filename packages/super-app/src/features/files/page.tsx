import {
  ArrowDownAZ,
  ChevronRight,
  Copy,
  Download,
  Eye,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Grid2X2,
  Home,
  List,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import { cn } from "~/core/cn";
import { fmtSize, fmtTime } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
import { usePersistentState } from "~/core/hooks/use-persistent-state";
import { usePrompt } from "~/core/hooks/use-prompt";
import { useTryToast } from "~/core/hooks/use-toast";
import { invoke, useAsync } from "~/core/pub";
import { EmptyState } from "~/core/shell/empty-state";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/core/ui/context-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/core/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/core/ui/dropdown-menu";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { Switch } from "~/core/ui/switch";
import { filesApi } from "./client";
import type { FsEntry, FsReadResult } from "./commands";
import * as cmd from "./commands";

type SortKey = "name" | "size" | "mtime";
type FileViewMode = "list" | "grid" | "living";

function sortEntries(entries: FsEntry[], key: SortKey, dir: 1 | -1): FsEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    if (key === "name") return a.name.localeCompare(b.name) * dir;
    if (key === "size") return (a.size - b.size) * dir;
    return (a.mtime - b.mtime) * dir;
  });
}

function Crumbs({ path, onNavigate }: { path: string; onNavigate: (p: string) => void }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-0.5 text-xs">
      <Button variant="ghost" size="sm" onClick={() => onNavigate("/")}>
        <Home className="size-3" />
      </Button>
      {parts.map((part, i) => {
        const sub = `/${parts.slice(0, i + 1).join("/")}`;
        return (
          <React.Fragment key={sub}>
            <ChevronRight className="size-3 text-muted-foreground" />
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onNavigate(sub)}>
              {part}
            </Button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function FileViewer({ result }: { result: FsReadResult }) {
  if (result.encoding === "base64") {
    const dataUrl = `data:${result.mime};base64,${result.content}`;
    if (result.mime.startsWith("image/")) {
      return <img src={dataUrl} alt={result.path} className="max-w-full rounded-md" />;
    }
    if (result.mime.startsWith("video/")) {
      // biome-ignore lint/a11y/useMediaCaption: user-provided video
      return <video src={dataUrl} controls className="w-full rounded-md" />;
    }
    if (result.mime.startsWith("audio/")) {
      // biome-ignore lint/a11y/useMediaCaption: user-provided audio
      return <audio src={dataUrl} controls className="w-full" />;
    }
    if (result.mime === "application/pdf") {
      return (
        <iframe src={dataUrl} title={result.path} className="file-pdf-frame w-full rounded-md" />
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        Binary file ({fmtSize(result.size)}) — preview not available.
      </p>
    );
  }
  return (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs leading-relaxed">
      {result.content}
      {result.truncated ? "\n\n… (truncated)" : ""}
    </pre>
  );
}

export function FilesPage() {
  const confirm = useConfirm();
  const promptUser = usePrompt();
  const tryToast = useTryToast();

  const [requestedPath, setPath] = React.useState("~");
  const [selected, setSelected] = React.useState<FsEntry | null>(null);
  const [quickLook, setQuickLook] = React.useState(false);
  const [showHidden, setShowHidden] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<1 | -1>(1);
  const [viewMode, setViewMode] = usePersistentState<FileViewMode>(
    "pub-super-app:files:view",
    "list",
    (raw) => (raw === "grid" || raw === "living" ? raw : "list"),
    (value) => value,
  );

  const list = useAsync(() => filesApi.list(requestedPath), [requestedPath]);
  const file = useAsync(
    () => (selected?.type === "file" ? filesApi.read(selected.path) : Promise.resolve(null)),
    [selected?.path, selected?.type],
  );

  const cwd = list.state.status === "loaded" ? list.state.value.cwd : requestedPath;

  const onOpen = (entry: FsEntry) => {
    if (entry.type === "dir") {
      setSelected(null);
      setQuickLook(false);
      setPath(entry.path);
    } else {
      setSelected(entry);
    }
  };

  const afterMutation = (deleted?: FsEntry) => {
    if (deleted && selected?.path === deleted.path) setSelected(null);
    list.reload();
  };

  const onDelete = async (entry: FsEntry) => {
    const ok = await confirm({
      title: `Delete ${entry.name}?`,
      description: entry.path,
      danger: true,
    });
    if (!ok) return;
    if (
      await tryToast(() => invoke(cmd.rm, { path: entry.path }), { errorTitle: "Delete failed" })
    ) {
      afterMutation(entry);
    }
  };

  const onRename = async (entry: FsEntry) => {
    const next = await promptUser({
      title: "Rename",
      initial: entry.name,
      placeholder: "new name",
    });
    if (!next || next === entry.name) return;
    const toPath = `${cwd}/${next}`;
    if (
      await tryToast(() => invoke(cmd.rename, { from: entry.path, to: toPath }), {
        errorTitle: "Rename failed",
      })
    ) {
      afterMutation(entry);
    }
  };

  const onCopy = async (entry: FsEntry) => {
    const next = await promptUser({
      title: "Copy to",
      initial: `${entry.path} copy`,
      placeholder: "destination path",
    });
    if (!next || next === entry.path) return;
    if (
      await tryToast(() => invoke(cmd.copy, { from: entry.path, to: next }), {
        errorTitle: "Copy failed",
      })
    ) {
      list.reload();
    }
  };

  const onMkdir = async () => {
    const name = await promptUser({ title: "New folder", placeholder: "folder name" });
    if (!name) return;
    if (
      await tryToast(() => invoke(cmd.mkdir, { path: `${cwd}/${name}` }), {
        errorTitle: "Create folder failed",
      })
    ) {
      list.reload();
    }
  };

  const onCreateFile = async () => {
    const name = await promptUser({ title: "New file", placeholder: "file name" });
    if (!name) return;
    if (
      await tryToast(() => invoke(cmd.touch, { path: `${cwd}/${name}` }), {
        errorTitle: "Create file failed",
      })
    ) {
      list.reload();
    }
  };

  const sorted = React.useMemo(() => {
    if (list.state.status !== "loaded") return [];
    const filtered = list.state.value.entries.filter((e) => showHidden || !e.hidden);
    return sortEntries(filtered, sortKey, sortDir);
  }, [list.state, showHidden, sortKey, sortDir]);

  const fileText =
    file.state.status === "loaded" && file.state.value && file.state.value.encoding === "utf8"
      ? file.state.value.content
      : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Files"
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={onMkdir} aria-label="New folder">
              <FolderPlus />
            </Button>
            <Button variant="ghost" size="icon" onClick={onCreateFile} aria-label="New file">
              <FilePlus2 />
            </Button>
          </>
        }
        onRefresh={list.reload}
      />
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-6 py-2">
        <Crumbs path={cwd} onNavigate={setPath} />
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("list")}
            aria-label="List view"
          >
            <List />
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("grid")}
            aria-label="Grid view"
          >
            <Grid2X2 />
          </Button>
          <Button
            variant={viewMode === "living" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setViewMode("living")}
            aria-label="Living view"
          >
            <Sparkles />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowDownAZ className="size-3.5" /> Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sortKey}
                onValueChange={(v) => setSortKey(v as SortKey)}
              >
                <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="size">Size</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="mtime">Modified</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={String(sortDir)}
                onValueChange={(v) => setSortDir(v === "1" ? 1 : -1)}
              >
                <DropdownMenuRadioItem value="1">Ascending</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="-1">Descending</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Switch checked={showHidden} onCheckedChange={setShowHidden} aria-label="Show hidden" />
            Hidden
          </div>
        </div>
      </div>
      <div className="files-layout grid flex-1 min-h-0 divide-x">
        <div className="flex min-h-0 flex-col">
          {list.state.status === "loading" ? (
            <SkeletonList count={8} itemClassName="h-7" className="space-y-1 p-3" />
          ) : list.state.status === "error" ? (
            <ErrorState error={list.state.error} onRetry={list.reload} />
          ) : sorted.length === 0 ? (
            <EmptyState title="Empty folder" />
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-0.5 p-2">
                {list.state.value.parent ? (
                  <button
                    type="button"
                    onClick={() =>
                      list.state.status === "loaded" && setPath(list.state.value.parent ?? "/")
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60"
                  >
                    <Folder className="size-4" /> ..
                  </button>
                ) : null}
                {viewMode === "living" ? (
                  <LivingFilesView entries={sorted} onOpen={onOpen} />
                ) : viewMode === "list" ? (
                  sorted.map((entry) => (
                    <EntryRow
                      key={entry.path}
                      entry={entry}
                      active={selected?.path === entry.path}
                      onOpen={() => onOpen(entry)}
                      onQuickLook={() => {
                        setSelected(entry);
                        setQuickLook(entry.type === "file");
                      }}
                      onRename={() => onRename(entry)}
                      onCopy={() => onCopy(entry)}
                      onDelete={() => onDelete(entry)}
                    />
                  ))
                ) : (
                  <div className="grid grid-files-auto gap-2">
                    {sorted.map((entry) => (
                      <EntryTile
                        key={entry.path}
                        entry={entry}
                        active={selected?.path === entry.path}
                        onOpen={() => onOpen(entry)}
                        onQuickLook={() => {
                          setSelected(entry);
                          setQuickLook(entry.type === "file");
                        }}
                        onRename={() => onRename(entry)}
                        onCopy={() => onCopy(entry)}
                        onDelete={() => onDelete(entry)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="min-h-0">
          {!selected ? (
            <EmptyState
              icon={<File className="size-6" />}
              title="Select a file"
              description="Open a file from the list to preview its contents."
            />
          ) : file.state.status === "loading" ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : file.state.status === "error" ? (
            <ErrorState error={file.state.error} onRetry={file.reload} />
          ) : !file.state.value ? null : (
            <ScrollArea className="h-full">
              <div className="space-y-3 p-4">
                <div>
                  <div className="text-sm font-medium">{selected.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtSize(file.state.value.size)} · {file.state.value.mime} ·{" "}
                    {fmtTime(selected.mtime, true)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setQuickLook(true)}>
                    <Eye className="size-3.5" /> Quick look
                  </Button>
                  <DownloadButton result={file.state.value} />
                </div>
                <FileViewer result={file.state.value} />
                {fileText ? (
                  <AIActionPanel
                    sourceServiceId="files"
                    sourceItemId={selected.path}
                    text={fileText.slice(0, 4000)}
                    fields={{ title: selected.name }}
                    allow={["create-note", "create-task"]}
                  />
                ) : null}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
      <QuickLook
        open={quickLook}
        onOpenChange={setQuickLook}
        entries={sorted.filter((e) => e.type === "file")}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

function LivingFilesView({
  entries,
  onOpen,
}: {
  entries: FsEntry[];
  onOpen: (entry: FsEntry) => void;
}) {
  const dirs = entries.filter((e) => e.type === "dir");
  const files = entries.filter((e) => e.type === "file");
  return (
    <div className="living-files-scene">
      <div className="living-horizon" />
      {dirs.map((entry, i) => (
        <button
          key={entry.path}
          type="button"
          onClick={() => onOpen(entry)}
          className="living-tree"
          style={{
            left: `${8 + (i / Math.max(1, dirs.length)) * 84}%`,
            height: `${72 + Math.min(90, entry.size / 60)}px`,
          }}
          title={`${entry.name} · folder`}
        >
          <span>{entry.name}</span>
        </button>
      ))}
      {files.map((entry, i) => {
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        const color = extColor(ext);
        return (
          <button
            key={entry.path}
            type="button"
            onClick={() => onOpen(entry)}
            className="living-file"
            style={{
              left: `${6 + ((i * 17) % 88)}%`,
              top: `${18 + ((i * 23) % 62)}%`,
              color,
              animationDelay: `${(i % 7) * 0.17}s`,
            }}
            title={`${entry.name} · ${fmtSize(entry.size)} · ${ext || "file"}`}
          >
            <span />
            <b>{entry.name}</b>
          </button>
        );
      })}
    </div>
  );
}

function extColor(ext: string): string {
  if (["ts", "tsx", "js", "jsx"].includes(ext)) return "#3b82f6";
  if (["md", "txt"].includes(ext)) return "#22c55e";
  if (["json", "yml", "yaml", "toml"].includes(ext)) return "#f59e0b";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "#ec4899";
  if (["mp4", "mov", "webm", "mp3", "wav", "m4a"].includes(ext)) return "#8b5cf6";
  if (["sh", "py", "go", "rs"].includes(ext)) return "#14b8a6";
  return "#94a3b8";
}

function EntryRow({
  entry,
  active,
  onOpen,
  onQuickLook,
  onRename,
  onCopy,
  onDelete,
}: {
  entry: FsEntry;
  active: boolean;
  onOpen: () => void;
  onQuickLook: () => void;
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const Icon = entry.type === "dir" ? Folder : File;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            active ? "bg-accent" : "hover:bg-accent/60",
          )}
        >
          <button
            type="button"
            onClick={onOpen}
            onDoubleClick={onOpen}
            className="flex flex-1 items-center gap-2 truncate text-left"
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                entry.type === "dir" ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span className={cn("truncate", entry.hidden && "text-muted-foreground")}>
              {entry.name}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground opacity-50 font-mono">
              {entry.perms}
            </span>
            {entry.type === "file" ? (
              <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(entry.size)}</span>
            ) : null}
          </button>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={onRename} aria-label="Rename">
              <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            {entry.type === "file" ? (
              <button type="button" onClick={onQuickLook} aria-label="Quick look">
                <Eye className="size-3.5 text-muted-foreground hover:text-foreground" />
              </button>
            ) : null}
            <button type="button" onClick={onDelete} aria-label="Delete">
              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        {entry.type === "file" ? (
          <ContextMenuItem onSelect={onQuickLook}>
            <Eye className="size-3.5" /> Quick look
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="size-3.5" /> Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={onCopy}>
          <Copy className="size-3.5" /> Copy
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => navigator.clipboard.writeText(entry.path)}>
          <Download className="size-3.5" /> Copy path
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem danger onSelect={onDelete}>
          <Trash2 className="size-3.5" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function EntryTile({
  entry,
  active,
  onOpen,
  onQuickLook,
  onRename,
  onCopy,
  onDelete,
}: {
  entry: FsEntry;
  active: boolean;
  onOpen: () => void;
  onQuickLook: () => void;
  onRename: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  const Icon = entry.type === "dir" ? Folder : File;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          onDoubleClick={entry.type === "file" ? onQuickLook : onOpen}
          className={cn(
            "group flex min-h-32 flex-col gap-2 rounded-md border p-2 text-left hover:bg-accent/50",
            active && "border-primary bg-accent",
          )}
        >
          <div className="flex h-20 items-center justify-center overflow-hidden rounded bg-muted/50">
            <FileThumb entry={entry} fallback={<Icon className="size-8 text-muted-foreground" />} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{entry.name}</div>
            <div className="text-xs text-muted-foreground">
              {entry.type === "file" ? fmtSize(entry.size) : "Folder"}
            </div>
          </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        {entry.type === "file" ? (
          <ContextMenuItem onSelect={onQuickLook}>Quick look</ContextMenuItem>
        ) : null}
        <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
        <ContextMenuItem onSelect={onCopy}>Copy</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem danger onSelect={onDelete}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FileThumb({ entry, fallback }: { entry: FsEntry; fallback: React.ReactNode }) {
  const canPreview = entry.type === "file" && entry.size < 2 * 1024 * 1024;
  const preview = useAsync(
    () => (canPreview ? filesApi.read(entry.path) : Promise.resolve(null)),
    [entry.path, canPreview],
  );
  if (!canPreview || preview.state.status !== "loaded" || !preview.state.value)
    return <>{fallback}</>;
  const result = preview.state.value;
  if (result.encoding === "base64" && result.mime.startsWith("image/")) {
    return (
      <img
        src={`data:${result.mime};base64,${result.content}`}
        alt={entry.name}
        className="h-full w-full object-cover"
      />
    );
  }
  if (result.mime === "application/pdf") return <File className="size-8 text-destructive" />;
  return <>{fallback}</>;
}

function DownloadButton({ result }: { result: FsReadResult }) {
  if (result.truncated) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        const href =
          result.encoding === "base64"
            ? `data:${result.mime};base64,${result.content}`
            : `data:${result.mime};charset=utf-8,${encodeURIComponent(result.content)}`;
        const a = document.createElement("a");
        a.href = href;
        a.download = result.name;
        a.click();
      }}
    >
      <Download className="size-3.5" /> Download
    </Button>
  );
}

function QuickLook({
  open,
  onOpenChange,
  entries,
  selected,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: FsEntry[];
  selected: FsEntry | null;
  onSelect: (entry: FsEntry | null) => void;
}) {
  const file = useAsync(
    () =>
      open && selected?.type === "file" ? filesApi.read(selected.path) : Promise.resolve(null),
    [open, selected?.path, selected?.type],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
      if (!selected) return;
      const idx = entries.findIndex((entry) => entry.path === selected.path);
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onSelect(entries[Math.min(entries.length - 1, idx + 1)] ?? selected);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onSelect(entries[Math.max(0, idx - 1)] ?? selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entries, onOpenChange, onSelect, open, selected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{selected?.name ?? "Quick look"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-75vh overflow-auto">
          {file.state.status === "loading" ? (
            <Skeleton className="h-96 w-full" />
          ) : file.state.status === "error" ? (
            <ErrorState error={file.state.error} />
          ) : file.state.value ? (
            <FileViewer result={file.state.value} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
