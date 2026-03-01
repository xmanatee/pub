import { AudioLines, MessageSquare, Mic, Paperclip, Send } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { ExtendedOptions } from "./extended-options";
import type { TunnelViewMode } from "./types";

interface ControlBarIdleModeProps {
  actionButtonClass: string;
  actionIconClass: string;
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
  onInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
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
  actionIconClass,
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
  const showPreview = !expanded && chatPreview !== null;
  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-20 bg-black/20 transition-opacity duration-300",
          expanded ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseExpanded}
        aria-label="Close control bar menu"
        disabled={!expanded}
        tabIndex={expanded ? 0 : -1}
      />

      <div className={shellContentClassName} {...longPressHandlers}>
        <div
          className={cn(
            "overflow-hidden transition-all duration-300",
            expanded ? "max-h-36 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <ExtendedOptions viewMode={viewMode} onSelect={onViewSelect} />
          <Separator />
        </div>

        <button
          type="button"
          className={cn(
            "w-full overflow-hidden transition-all duration-300",
            showPreview ? "max-h-12 opacity-100" : "max-h-0 opacity-0",
          )}
          onClick={onPreviewClick}
          aria-label="Open chat"
        >
          <div className="flex items-center gap-2 px-4 py-2">
            <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate text-sm text-foreground">{chatPreview}</span>
          </div>
          <Separator />
        </button>

        <div className={cn(controlRowClass, controlHeightClass)}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={actionButtonClass}
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Attach file"
              >
                <Paperclip className={actionIconClass} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
          <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

          <Input
            placeholder={disabled ? "Connecting..." : "Message..."}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
            aria-label="Message"
            inputMode="text"
            enterKeyHint="send"
            className="h-14 flex-1 border-0 bg-transparent px-2 text-base shadow-none focus-visible:ring-0"
          />

          {hasText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  className={actionButtonClass}
                  onClick={onSend}
                  disabled={disabled}
                  aria-label="Send message"
                >
                  <Send className={actionIconClass} />
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
                    size="icon"
                    className={cn(actionButtonClass, "touch-none long-press-ignore")}
                    disabled={disabled}
                    aria-label="Hold to record audio"
                    {...pointerHandlers}
                  >
                    <Mic className={actionIconClass} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hold to record</TooltipContent>
              </Tooltip>

              {voiceModeEnabled ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className={actionButtonClass}
                      onClick={onStartVoiceMode}
                      disabled={disabled}
                      aria-label="Voice mode"
                    >
                      <AudioLines className={actionIconClass} />
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
