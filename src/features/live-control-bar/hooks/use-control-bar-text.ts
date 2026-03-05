import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

interface UseControlBarTextOptions {
  disabled: boolean;
  onSendChat: (text: string) => void;
  initialInput?: string;
}

export function useControlBarText({
  disabled,
  onSendChat,
  initialInput = "",
}: UseControlBarTextOptions) {
  const [input, setInput] = useState(initialInput);
  const hasText = input.trim().length > 0;

  const handleSend = useCallback(() => {
    if (disabled || !hasText) return;
    onSendChat(input.trim());
    setInput("");
  }, [disabled, input, hasText, onSendChat]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return { input, setInput, hasText, handleSend, handleKeyDown };
}
