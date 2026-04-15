import { ChevronRight, File, FilePlus2, Folder, FolderPlus, Home, Trash2 } from "lucide-react";
import * as React from "react";
import type { FsEntry, FsListResult, FsReadResult } from "~/commands/results";
import { EmptyState } from "~/components/shell/empty-state";
import { ErrorState } from "~/components/shell/error-state";
import { PageHeader } from "~/components/shell/page-header";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { SkeletonList } from "~/components/ui/skeleton-list";
import { cn } from "~/lib/cn";
import { fmtSize } from "~/lib/fmt";
import { tryInvoke, useCommand } from "~/lib/pub";

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
  onDelete,
}: {
  entry: FsEntry;
  active: boolean;
  onOpen: () => void;
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
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete ${entry.name}?`)) onDelete();
        }}
        className="opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Delete"
      >
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

function FileViewer({ result }: { result: FsReadResult }) {
  if (result.encoding === "base64") {
    if (result.mime.startsWith("image/")) {
      return (
        <img
          src={`data:${result.mime};base64,${result.content}`}
          alt={result.path}
          className="max-w-full rounded-md"
        />
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
  const [path, setPath] = React.useState<string>(() => "~");
  const [selected, setSelected] = React.useState<FsEntry | null>(null);
  const [showHidden, setShowHidden] = React.useState(false);
  const list = useCommand<FsListResult>("fs.list", { path }, [path]);
  const file = useCommand<FsReadResult>(
    selected?.type === "file" ? "fs.read" : null,
    selected ? { path: selected.path } : {},
    [selected?.path],
  );

  const onOpen = (entry: FsEntry) => {
    if (entry.type === "dir") {
      setSelected(null);
      setPath(entry.path);
    } else {
      setSelected(entry);
    }
  };

  const onDelete = async (entry: FsEntry) => {
    if (!(await tryInvoke("fs.rm", { path: entry.path }))) return;
    if (selected?.path === entry.path) setSelected(null);
    list.reload();
  };

  const onMkdir = async () => {
    const name = prompt("Folder name");
    if (!name) return;
    if (await tryInvoke("fs.mkdir", { path: `${path}/${name}` })) list.reload();
  };

  const onCreateFile = async () => {
    const name = prompt("File name");
    if (!name) return;
    if (await tryInvoke("fs.write", { path: `${path}/${name}`, content: "" })) list.reload();
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
        <Crumbs path={path} onNavigate={setPath} />
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
          {list.status === "error" ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : list.status === "loading" || list.status === "idle" ? (
            <SkeletonList count={8} itemClassName="h-7" className="space-y-1 p-3" />
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-0.5 p-2">
                {list.value.parent ? (
                  <button
                    type="button"
                    onClick={() => setPath(list.value.parent!)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/60"
                  >
                    <Folder className="size-4" /> ..
                  </button>
                ) : null}
                {list.value.entries
                  .filter((e) => showHidden || !e.hidden)
                  .map((entry) => (
                    <EntryRow
                      key={entry.path}
                      entry={entry}
                      active={selected?.path === entry.path}
                      onOpen={() => onOpen(entry)}
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
          ) : file.status === "error" ? (
            <ErrorState error={file.error} onRetry={file.reload} />
          ) : file.status === "loading" || file.status === "idle" ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-3 p-4">
                <div>
                  <div className="text-sm font-medium">{selected.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtSize(file.value.size)} · {file.value.mime}
                  </div>
                </div>
                <FileViewer result={file.value} />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
