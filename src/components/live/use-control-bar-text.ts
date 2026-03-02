import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";

interface UseControlBarTextOptions {
  onSendChat: (text: string) => void;
  initialInput?: string;
}

export function useControlBarText({ onSendChat, initialInput = "" }: UseControlBarTextOptions) {
  const [input, setInput] = useState(initialInput);
  const hasText = input.trim().length > 0;

  const handleSend = useCallback(() => {
    if (!hasText) return;
    onSendChat(input.trim());
    setInput("");
  }, [input, hasText, onSendChat]);

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
