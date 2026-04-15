import {
  ChevronRight,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  Home,
  Pencil,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { fmtSize } from "~/core/fmt";
import { invoke, useAsync, withErrorAlert } from "~/core/pub";
import { EmptyState } from "~/core/shell/empty-state";
import { ErrorState } from "~/core/shell/error-state";
import { PageHeader } from "~/core/shell/page-header";
import { Button } from "~/core/ui/button";
import { ScrollArea } from "~/core/ui/scroll-area";
import { Skeleton } from "~/core/ui/skeleton";
import { SkeletonList } from "~/core/ui/skeleton-list";
import { files } from "./client";
import type { FsEntry, FsReadResult } from "./commands";
import * as cmd from "./commands";

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
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
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
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete ${entry.name}?`)) onDelete();
          }}
          aria-label="Delete"
        >
          <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
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
      return <iframe src={dataUrl} title={result.path} className="h-[70vh] w-full rounded-md" />;
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
  // User-typed path or entry.path (may start as "~"); server canonicalizes to absolute in cwd.
  const [requestedPath, setPath] = React.useState("~");
  const [selected, setSelected] = React.useState<FsEntry | null>(null);
  const [showHidden, setShowHidden] = React.useState(false);

  const list = useAsync(() => files.list(requestedPath), [requestedPath]);
  const file = useAsync(
    () => (selected?.type === "file" ? files.read(selected.path) : Promise.resolve(null)),
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

  const afterWrite = (deleted?: FsEntry) => {
    if (deleted && selected?.path === deleted.path) setSelected(null);
    list.reload();
  };

  const onDelete = async (entry: FsEntry) => {
    if (await withErrorAlert(() => invoke(cmd.rm, { path: entry.path }))) afterWrite(entry);
  };

  const onRename = async (entry: FsEntry) => {
    const next = prompt("Rename to", entry.name);
    if (!next || next === entry.name) return;
    const toPath = `${cwd}/${next}`;
    if (await withErrorAlert(() => invoke(cmd.rename, { from: entry.path, to: toPath }))) {
      afterWrite(entry);
    }
  };

  const onMkdir = async () => {
    const name = prompt("Folder name");
    if (!name) return;
    if (await withErrorAlert(() => invoke(cmd.mkdir, { path: `${cwd}/${name}` }))) list.reload();
  };

  const onCreateFile = async () => {
    const name = prompt("File name");
    if (!name) return;
    if (await withErrorAlert(() => invoke(cmd.touch, { path: `${cwd}/${name}` }))) list.reload();
  };

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
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
      </div>
      <div className="grid flex-1 min-h-0 grid-cols-[minmax(280px,2fr)_3fr] divide-x">
        <div className="flex min-h-0 flex-col">
          {list.state.status === "loading" ? (
            <SkeletonList count={8} itemClassName="h-7" className="space-y-1 p-3" />
          ) : list.state.status === "error" ? (
            <ErrorState error={list.state.error} onRetry={list.reload} />
          ) : (
            <ScrollArea className="h-full">
              {(() => {
                const { parent, entries } = list.state.value;
                return (
                  <div className="space-y-0.5 p-2">
                    {parent ? (
                      <button
                        type="button"
                        onClick={() => setPath(parent)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60"
                      >
                        <Folder className="size-4" /> ..
                      </button>
                    ) : null}
                    {entries
                      .filter((e) => showHidden || !e.hidden)
                      .map((entry) => (
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
                );
              })()}
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
                    {fmtSize(file.state.value.size)} · {file.state.value.mime}
                  </div>
                </div>
                <FileViewer result={file.state.value} />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
