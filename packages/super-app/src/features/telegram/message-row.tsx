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
import * as prompts from "~/core/ai/prompts";
import { runAI } from "~/core/ai/runner";
import { cn } from "~/core/cn";
import { fmtTime } from "~/core/fmt";
import { useConfirm } from "~/core/hooks/use-confirm";
import { useTryToast } from "~/core/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/core/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "~/core/ui/popover";
import { telegram } from "./client";
import type { TelegramMessage } from "./commands";

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
  const tryToast = useTryToast();
  const confirm = useConfirm();
  const [preview, setPreview] = React.useState<{
    dataUrl: string;
    mime: string | null;
    filename: string;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);

  const onDelete = async () => {
    if (!(await confirm({ title: "Delete message?", danger: true }))) return;
    await tryToast(async () => {
      await telegram.delete(dialogId, [m.id]);
      onChanged();
    });
  };

  const onReact = (emoticon: string) => {
    const chosen = m.reactions.find((r) => r.emoticon === emoticon)?.chosen;
    void tryToast(async () => {
      await telegram.react(dialogId, m.id, chosen ? null : emoticon);
      onChanged();
    });
  };

  const onPin = () =>
    tryToast(async () => {
      await (m.pinned ? telegram.unpin(dialogId, m.id) : telegram.pin(dialogId, m.id));
      onChanged();
    });

  const onCopy = () => navigator.clipboard.writeText(m.text);

  const onDownload = () =>
    tryToast(async () => {
      const { dataUrl, mime, filename } = await telegram.downloadMedia(dialogId, m.id);
      const a = document.createElement("a");
      a.href = dataUrl;
      const ext = mime?.split("/")[1]?.split(";")[0] ?? "bin";
      a.download = `${filename}.${ext}`;
      a.click();
    });

  const onPreview = () =>
    tryToast(async () => {
      setPreviewing(true);
      try {
        setPreview(await telegram.downloadMedia(dialogId, m.id));
      } finally {
        setPreviewing(false);
      }
    });

  const onAiVerb = (verb: "explain" | "translate" | "draft" | "retone") =>
    tryToast(async () => {
      let result: string;
      if (verb === "explain") result = await runAI(prompts.explain, { text: m.text });
      else if (verb === "translate")
        result = await runAI(prompts.translate, { text: m.text, lang: "English" });
      else if (verb === "retone")
        result = await runAI(prompts.retone, { text: m.text, tone: "concise" });
      else result = await runAI(prompts.draftReply, { text: m.text, intent: "" });
      if (onAiReply) onAiReply(result);
    });

  return (
    <div
      className={cn(
        "group relative flex flex-col",
        m.out ? "items-end self-end" : "items-start self-start",
      )}
    >
      {replyTarget ? (
        <div className="telegram-message-width mb-0.5 rounded-md border border-primary/25 bg-muted/60 px-2 py-1 text-xs">
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
          <div className="mb-1 space-y-1">
            {preview ? <TelegramMediaPreview preview={preview} /> : null}
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onPreview}
                className="flex items-center gap-1 rounded-md bg-background/20 px-2 py-1 text-xs"
              >
                <Download className="size-3" /> {previewing ? "Loading" : "Preview"} {m.mediaType}
              </button>
              <button
                type="button"
                onClick={onDownload}
                className="flex items-center gap-1 rounded-md bg-background/20 px-2 py-1 text-xs"
              >
                <Download className="size-3" /> Download
              </button>
            </div>
          </div>
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
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="React" className="rounded p-1 hover:bg-accent">
              <Smile className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1">
            <div className="flex gap-0.5">
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
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => onReply(m)}
          aria-label="Reply"
          className="rounded p-1 hover:bg-accent"
        >
          <CornerUpLeft className="size-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More" className="rounded p-1 hover:bg-accent">
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => onReply(m)}>
              <CornerUpLeft className="size-3.5" /> Reply
            </DropdownMenuItem>
            {m.out ? (
              <DropdownMenuItem onSelect={() => onEdit(m)}>
                <Pencil className="size-3.5" /> Edit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onSelect={() => onForward(m)}>
              <Forward className="size-3.5" /> Forward
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPin}>
              <Pin className="size-3.5" /> {m.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAiVerb("explain")}>
              <Sparkles className="size-3.5" /> Explain
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAiVerb("translate")}>
              <Languages className="size-3.5" /> Translate
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAiVerb("draft")}>
              <Sparkles className="size-3.5" /> Draft reply
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAiVerb("retone")}>
              <Sparkles className="size-3.5" /> Retone
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCopy}>
              <Download className="size-3.5" /> Copy text
            </DropdownMenuItem>
            {m.mediaType ? (
              <DropdownMenuItem onSelect={onDownload}>
                <Download className="size-3.5" /> Download media
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem danger onSelect={onDelete}>
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function TelegramMediaPreview({
  preview,
}: {
  preview: { dataUrl: string; mime: string | null; filename: string };
}) {
  const mime = preview.mime ?? "";
  if (mime.startsWith("image/")) {
    return <img src={preview.dataUrl} alt={preview.filename} className="max-h-80 rounded-md" />;
  }
  if (mime === "video-note") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Telegram video notes don't have captions
      <video
        src={preview.dataUrl}
        controls
        className="size-48 rounded-full border-4 border-background object-cover shadow-sm"
      />
    );
  }
  if (mime.startsWith("video/")) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Telegram media may not include captions.
      <video src={preview.dataUrl} controls className="max-h-80 rounded-md" />
    );
  }
  if (mime.startsWith("audio/")) {
    // biome-ignore lint/a11y/useMediaCaption: Telegram voice/audio messages rarely include caption tracks.
    return <audio src={preview.dataUrl} controls className="w-full" />;
  }
  return null;
}
