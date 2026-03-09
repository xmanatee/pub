import { AudioLines, Mic, Paperclip, Send } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";
import "./control-bar-state.css";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";
import type { LiveVisualState } from "~/features/live/types/live-types";
import { controlBarStyleFromTone } from "./control-bar-theme";

const MAX_TEXTAREA_ROWS = 5;
const TEXTAREA_LINE_HEIGHT = 20;
const TEXTAREA_PADDING_Y = 10;

interface ControlBarInputRowProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasText: boolean;
  input: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStartVoiceMode: () => void;
  onEditingChange: (editing: boolean) => void;
  pointerHandlers: React.HTMLAttributes<HTMLButtonElement>;
  sendDisabled: boolean;
  visualState: LiveVisualState;
  voiceModeEnabled: boolean;
}

/**
 * Just the interactive row part of the idle mode.
 * Used as center content in the new architecture.
 * Visual container is provided by ControlBarPrimitive.
 */
export function ControlBarInputRow({
  fileInputRef,
  hasText,
  input,
  onFileChange,
  onInputChange,
  onInputKeyDown,
  onSend,
  onStartVoiceMode,
  onEditingChange,
  pointerHandlers,
  sendDisabled,
  visualState,
  voiceModeEnabled,
}: ControlBarInputRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    onEditingChange(editing);
  }, [editing, onEditingChange]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textareaRef is a stable ref
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_ROWS + TEXTAREA_PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input, editing]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const placeholder = visualState === "connecting" ? "Connecting..." : "Message...";
  const cbStyle = controlBarStyleFromTone(VISUAL_THEME[visualState], visualState);

  return (
    <div
      className={cn("w-full cb-state-border", CB.controlHeight)}
      style={{ WebkitTouchCallout: "none", ...cbStyle }}
    >
      <div className={CB.controlRow}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="control"
              className={CB.actionButton}
              onClick={() => fileInputRef.current?.click()}
              disabled={sendDisabled}
              aria-label="Attach file"
            >
              <Paperclip />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attach file</TooltipContent>
        </Tooltip>
        <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} />

        {editing ? (
          <textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onInputKeyDown}
            onBlur={() => setEditing(false)}
            aria-label="Message"
            inputMode="text"
            enterKeyHint="send"
            rows={1}
            className="flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base leading-5 shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0"
          />
        ) : (
          <button
            type="button"
            aria-label="Message"
            onClick={() => setEditing(true)}
            className="flex-1 cursor-text truncate px-2 py-2.5 text-left text-base leading-5"
          >
            {input ? (
              <span>{input}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </button>
        )}

        {hasText ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="control"
                className={CB.actionButton}
                onClick={onSend}
                disabled={sendDisabled}
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
                  className={cn(CB.actionButton, "touch-none")}
                  disabled={sendDisabled}
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
                    className={CB.actionButton}
                    onClick={onStartVoiceMode}
                    disabled={sendDisabled}
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
  );
}
