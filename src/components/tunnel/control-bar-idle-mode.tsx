import { AudioLines, MessageSquare, Mic, Paperclip, Send } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useCallback, useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { ExtendedOptions } from "./extended-options";
import type { TunnelViewMode } from "./types";

const MAX_TEXTAREA_ROWS = 5;
const TEXTAREA_LINE_HEIGHT = 20;
const TEXTAREA_PADDING_Y = 10;

interface ControlBarIdleModeProps {
  actionButtonClass: string;
  chatPreview: string | null;
  controlHeightClass: string;
  controlRowClass: string;
  disabled: boolean;
  expanded: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasText: boolean;
  input: string;
  longPressHandlers: React.HTMLAttributes<HTMLDivElement>;
  onCloseExpanded: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPreviewClick: () => void;
  onSend: () => void;
  onStartVoiceMode: () => void;
  onViewSelect: (mode: TunnelViewMode) => void;
  voiceModeEnabled: boolean;
  pointerHandlers: React.HTMLAttributes<HTMLButtonElement>;
  shellContentClassName: string;
  viewMode: TunnelViewMode;
}

export function ControlBarIdleMode({
  actionButtonClass,
  chatPreview,
  controlHeightClass,
  controlRowClass,
  disabled,
  expanded,
  fileInputRef,
  hasText,
  input,
  longPressHandlers,
  onCloseExpanded,
  onFileChange,
  onInputChange,
  onInputKeyDown,
  onPreviewClick,
  onSend,
  onStartVoiceMode,
  onViewSelect,
  pointerHandlers,
  shellContentClassName,
  viewMode,
  voiceModeEnabled,
}: ControlBarIdleModeProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_ROWS + TEXTAREA_PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: input triggers resize when text changes
  useEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  const showPreview = !expanded && chatPreview !== null;
  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-10 bg-black/20 transition-opacity duration-300",
          expanded ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseExpanded}
        aria-label="Close control bar menu"
        disabled={!expanded}
        tabIndex={expanded ? 0 : -1}
      />

      <div
        className={cn("relative z-20 min-h-12 overflow-hidden", shellContentClassName)}
        {...longPressHandlers}
      >
        <div
          className={cn(
            "overflow-hidden transition-all duration-300",
            expanded ? "max-h-40 opacity-100" : "pointer-events-none max-h-0 opacity-0",
          )}
          aria-hidden={!expanded}
        >
          <ExtendedOptions viewMode={viewMode} onSelect={onViewSelect} />
          <Separator />
        </div>

        <div
          className={cn(
            "overflow-hidden transition-all duration-300",
            showPreview ? "max-h-14 opacity-100" : "pointer-events-none max-h-0 opacity-0",
          )}
          aria-hidden={!showPreview}
        >
          <button
            type="button"
            className="w-full overflow-hidden"
            onClick={onPreviewClick}
            aria-label="Open chat"
            tabIndex={showPreview ? 0 : -1}
          >
            <div className="flex items-center gap-2 px-4 py-2.5">
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-left">
                <div className="text-xs leading-none text-muted-foreground">Agent message</div>
                <div className="truncate text-sm leading-tight text-foreground">{chatPreview}</div>
              </div>
            </div>
            <Separator />
          </button>
        </div>

        <div className={cn(controlRowClass, controlHeightClass)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="control"
                className={actionButtonClass}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Attach file"
              >
                <Paperclip />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

          <textarea
            ref={textareaRef}
            placeholder={disabled ? "Connecting..." : "Message..."}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
            aria-label="Message"
            inputMode="text"
            enterKeyHint="send"
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base leading-5 shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
          />

          {hasText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="control"
                  className={actionButtonClass}
                  onClick={onSend}
                  disabled={disabled}
                  aria-label="Send message"
                >
                  <Send />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send</TooltipContent>
            </Tooltip>
          ) : (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="control"
                    className={cn(actionButtonClass, "touch-none long-press-ignore")}
                    disabled={disabled}
                    aria-label="Hold to record audio"
                    {...pointerHandlers}
                  >
                    <Mic />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hold to record</TooltipContent>
              </Tooltip>

              {voiceModeEnabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="control"
                      className={actionButtonClass}
                      onClick={onStartVoiceMode}
                      disabled={disabled}
                      aria-label="Voice mode"
                    >
                      <AudioLines />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Voice mode</TooltipContent>
                </Tooltip>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}
