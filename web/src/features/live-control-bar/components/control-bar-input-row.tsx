import { AudioLines, Mic, Paperclip, Send } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef } from "react";
import { CONTROL_BAR_STYLES } from "~/components/control-bar/control-bar-styles";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import type { LiveBlobState } from "~/features/live/types/live-types";

const MAX_TEXTAREA_ROWS = 5;
const TEXTAREA_LINE_HEIGHT = 20;
const TEXTAREA_PADDING_Y = 10;

const PLACEHOLDER: Partial<Record<LiveBlobState, string>> = {
  connecting: "Connecting...",
  disconnected: "Disconnected",
  offline: "Disconnected",
  "content-loading": "Loading content...",
  "command-running": "Running command...",
};

interface ControlBarInputRowProps {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  hasText: boolean;
  input: string;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus: () => void;
  onInputChange: (value: string) => void;
  onInputKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  onStartRecording: () => void;
  onStartVoiceMode: () => void;
  sendDisabled: boolean;
  blobState: LiveBlobState;
  voiceModeEnabled: boolean;
}

export function ControlBarInputRow({
  fileInputRef,
  hasText,
  input,
  onFileChange,
  onFocus,
  onInputChange,
  onInputKeyDown,
  onSend,
  onStartRecording,
  onStartVoiceMode,
  sendDisabled,
  blobState,
  voiceModeEnabled,
}: ControlBarInputRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: textareaRef is a stable ref
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = TEXTAREA_LINE_HEIGHT * MAX_TEXTAREA_ROWS + TEXTAREA_PADDING_Y;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [input]);

  return (
    <div className={`w-full ${CONTROL_BAR_STYLES.controlHeight}`}>
      <div className="flex w-full items-end gap-1.5 p-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="control"
              className={CONTROL_BAR_STYLES.actionButton}
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

        <textarea
          ref={textareaRef}
          placeholder={PLACEHOLDER[blobState] ?? "Message..."}
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          onFocus={onFocus}
          onKeyDown={onInputKeyDown}
          aria-label="Message"
          inputMode="text"
          enterKeyHint="send"
          rows={1}
          className="flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base leading-5 shadow-none outline-none placeholder:text-muted-foreground focus-visible:ring-0"
        />

        {hasText ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="default"
                size="control"
                className={CONTROL_BAR_STYLES.actionButton}
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
                  className={CONTROL_BAR_STYLES.actionButton}
                  onClick={onStartRecording}
                  disabled={sendDisabled}
                  aria-label="Record audio"
                >
                  <Mic />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Record audio</TooltipContent>
            </Tooltip>

            {voiceModeEnabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="control"
                    className={CONTROL_BAR_STYLES.actionButton}
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
