import {
  CornerUpLeft,
  Download,
  Forward,
  Languages,
  MoreHorizontal,
  Pencil,
  Pin,
  Smile,
  Sparkles,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { cn } from "~/core/cn";
import { fmtTime } from "~/core/fmt";
import { invoke, withErrorAlert } from "~/core/pub";
import type { CommandFunctionSpec } from "~/core/types";
import { telegram } from "./client";
import type { TelegramMessage } from "./commands";
import * as cmd from "./commands";

const QUICK_REACTIONS = ["👍", "❤️", "🔥", "😂", "🎉", "🙏"];

export interface MessageRowProps {
  message: TelegramMessage;
  dialogId: string;
  replyTarget: TelegramMessage | null;
  onReply: (m: TelegramMessage) => void;
  onEdit: (m: TelegramMessage) => void;
  onForward: (m: TelegramMessage) => void;
  onChanged: () => void;
  onAiReply?: (reply: string) => void;
}

export function MessageRow({
  message: m,
  dialogId,
  replyTarget,
  onReply,
  onEdit,
  onForward,
  onChanged,
  onAiReply,
}: MessageRowProps) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [reactOpen, setReactOpen] = React.useState(false);

  const onDelete = () => {
    if (!confirm("Delete message?")) return;
    withErrorAlert(async () => {
      await telegram.delete(dialogId, [m.id]);
      onChanged();
    });
  };

  const onReact = (emoticon: string) => {
    const chosen = m.reactions.find((r) => r.emoticon === emoticon)?.chosen;
    withErrorAlert(async () => {
      await telegram.react(dialogId, m.id, chosen ? null : emoticon);
      setReactOpen(false);
      onChanged();
    });
  };

  const onPin = () =>
    withErrorAlert(async () => {
      await (m.pinned ? telegram.unpin(dialogId, m.id) : telegram.pin(dialogId, m.id));
      onChanged();
    });

  const onCopy = () => navigator.clipboard.writeText(m.text);

  const onDownload = () =>
    withErrorAlert(async () => {
      const { dataUrl, mime, filename } = await telegram.downloadMedia(dialogId, m.id);
      const a = document.createElement("a");
      a.href = dataUrl;
      const ext = mime?.split("/")[1]?.split(";")[0] ?? "bin";
      a.download = `${filename}.${ext}`;
      a.click();
    });

  const onAi = (spec: CommandFunctionSpec, args: Record<string, unknown>) => {
    setMenuOpen(false);
    withErrorAlert(async () => {
      const text = await invoke<string>(spec, args);
      if (onAiReply) onAiReply(text);
      else alert(text);
    });
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col",
        m.out ? "items-end self-end" : "items-start self-start",
      )}
    >
      {replyTarget ? (
        <div className="telegram-message-width mb-0.5 rounded-md border-l-2 border-primary/60 bg-muted/50 px-2 py-1 text-xs">
          <div className="truncate opacity-70">↩ {replyTarget.from ?? "reply"}</div>
          <div className="truncate opacity-80">{replyTarget.text || replyTarget.mediaType}</div>
        </div>
      ) : null}
      <div
        className={cn(
          "telegram-message-width rounded-2xl px-3 py-2 text-sm",
          m.out ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {m.from && !m.out ? (
          <div className="mb-0.5 text-xs font-medium opacity-70">{m.from}</div>
        ) : null}
        {m.mediaType ? (
          <button
            type="button"
            onClick={onDownload}
            className="mb-1 flex items-center gap-1 rounded-md bg-background/20 px-2 py-1 text-xs"
          >
            <Download className="size-3" /> Download {m.mediaType}
          </button>
        ) : null}
        {m.text ? <div className="whitespace-pre-wrap break-words">{m.text}</div> : null}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-xs opacity-60">
          {m.pinned ? <Pin className="size-3" /> : null}
          {m.editDate ? <span>edited</span> : null}
          <span>{fmtTime(m.date * 1000, true)}</span>
        </div>
      </div>
      {m.reactions.length > 0 ? (
        <div className="mt-0.5 flex gap-0.5">
          {m.reactions.map((r) => (
            <button
              key={r.emoticon}
              type="button"
              onClick={() => onReact(r.emoticon)}
              className={cn(
                "rounded-full border bg-background px-1.5 py-0.5 text-xs",
                r.chosen && "border-primary bg-primary/10",
              )}
            >
              {r.emoticon} {r.count}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "absolute top-0 flex items-center gap-0.5 rounded-md border bg-popover px-1 py-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100",
          m.out ? "-left-28" : "-right-28",
        )}
      >
        <IconButton
          onClick={() => setReactOpen((v) => !v)}
          label="React"
          icon={<Smile className="size-3.5" />}
        />
        <IconButton
          onClick={() => onReply(m)}
          label="Reply"
          icon={<CornerUpLeft className="size-3.5" />}
        />
        <IconButton
          onClick={() => setMenuOpen((v) => !v)}
          label="More"
          icon={<MoreHorizontal className="size-3.5" />}
        />
      </div>
      {reactOpen ? (
        <div
          className={cn(
            "absolute top-6 z-10 flex gap-0.5 rounded-md border bg-popover p-1 shadow-sm",
            m.out ? "right-0" : "left-0",
          )}
        >
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onReact(e)}
              className="rounded p-1 text-base hover:bg-accent"
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}
      {menuOpen ? (
        <div
          className={cn(
            "absolute top-6 z-10 min-w-44 rounded-md border bg-popover p-1 shadow-sm",
            m.out ? "right-0" : "left-0",
          )}
        >
          <MenuItem
            icon={<CornerUpLeft className="size-3.5" />}
            label="Reply"
            onClick={() => {
              onReply(m);
              setMenuOpen(false);
            }}
          />
          {m.out ? (
            <MenuItem
              icon={<Pencil className="size-3.5" />}
              label="Edit"
              onClick={() => {
                onEdit(m);
                setMenuOpen(false);
              }}
            />
          ) : null}
          <MenuItem
            icon={<Forward className="size-3.5" />}
            label="Forward"
            onClick={() => {
              onForward(m);
              setMenuOpen(false);
            }}
          />
          <MenuItem
            icon={<Pin className="size-3.5" />}
            label={m.pinned ? "Unpin" : "Pin"}
            onClick={() => {
              onPin();
              setMenuOpen(false);
            }}
          />
          <MenuItem
            icon={<Sparkles className="size-3.5" />}
            label="Explain"
            onClick={() => onAi(cmd.aiExplain, { text: m.text })}
          />
          <MenuItem
            icon={<Languages className="size-3.5" />}
            label="Translate"
            onClick={() => onAi(cmd.aiTranslate, { text: m.text, lang: "English" })}
          />
          <MenuItem
            icon={<Sparkles className="size-3.5" />}
            label="Draft reply"
            onClick={() => onAi(cmd.aiDraft, { text: m.text })}
          />
          <MenuItem
            icon={<Download className="size-3.5" />}
            label="Copy text"
            onClick={() => {
              onCopy();
              setMenuOpen(false);
            }}
          />
          {m.mediaType ? (
            <MenuItem
              icon={<Download className="size-3.5" />}
              label="Download media"
              onClick={() => {
                onDownload();
                setMenuOpen(false);
              }}
            />
          ) : null}
          <MenuItem
            icon={<Trash2 className="size-3.5" />}
            label="Delete"
            danger
            onClick={() => {
              onDelete();
              setMenuOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded p-1 hover:bg-accent"
    >
      {icon}
    </button>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
        danger && "text-destructive",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
