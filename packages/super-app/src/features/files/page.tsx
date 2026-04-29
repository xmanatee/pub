import {
  ArrowDownAZ,
  ChevronRight,
  Download,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { AIActionPanel } from "~/core/ai/action-panel";
import { cn } from "~/core/cn";
import { fmtSize, fmtTime } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
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
  const [showHidden, setShowHidden] = React.useState(false);
  const [sortKey, setSortKey] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<1 | -1>(1);

  const list = useAsync(() => filesApi.list(requestedPath), [requestedPath]);
  const file = useAsync(
    () => (selected?.type === "file" ? filesApi.read(selected.path) : Promise.resolve(null)),
    [selected?.path, selected?.type],
  );

  const cwd = list.state.status === "loaded" ? list.state.value.cwd : requestedPath;

  const onOpen = (entry: FsEntry) => {
    if (entry.type === "dir") {
      setSelected(null);
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
                {sorted.map((entry) => (
                  <EntryRow
                    key={entry.path}
                    entry={entry}
                    active={selected?.path === entry.path}
                    onOpen={() => onOpen(entry)}
                    onRename={() => onRename(entry)}
                    onDelete={() => onDelete(entry)}
                  />
                ))}
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
    </div>
  );
}

function EntryRow({
  entry,
  active,
  onOpen,
  onRename,
  onDelete,
}: {
  entry: FsEntry;
  active: boolean;
  onOpen: () => void;
  onRename: () => void;
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
            {entry.type === "file" ? (
              <span className="shrink-0 text-xs text-muted-foreground">{fmtSize(entry.size)}</span>
            ) : null}
          </button>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button type="button" onClick={onRename} aria-label="Rename">
              <Pencil className="size-3.5 text-muted-foreground hover:text-foreground" />
            </button>
            <button type="button" onClick={onDelete} aria-label="Delete">
              <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpen}>Open</ContextMenuItem>
        <ContextMenuItem onSelect={onRename}>
          <Pencil className="size-3.5" /> Rename
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
