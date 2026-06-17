import { Check, Copy } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";
import { toError } from "~/lib/utils";

export function CopyButton({
  text,
  onCopy,
  onCopyError,
  label = "Copy URL",
}: {
  text: string;
  onCopy?: () => void;
  onCopyError?: (error: Error) => void;
  label?: string;
}) {
  const [status, setStatus] = React.useState<"idle" | "copied" | "failed">("idle");
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showStatus = React.useCallback((nextStatus: "copied" | "failed") => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    setStatus(nextStatus);
    resetTimerRef.current = setTimeout(() => {
      setStatus("idle");
      resetTimerRef.current = null;
    }, 1500);
  }, []);

  React.useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          onCopy?.();
          showStatus("copied");
        } catch (error) {
          onCopyError?.(toError(error, "Could not copy to clipboard."));
          showStatus("failed");
        }
      }}
      aria-label={status === "failed" ? `${label} failed` : label}
      title={status === "failed" ? "Copy failed" : label}
    >
      {status === "copied" ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy
          className={`h-3.5 w-3.5 ${status === "failed" ? "text-destructive" : ""}`}
          aria-hidden="true"
        />
      )}
    </Button>
  );
}
