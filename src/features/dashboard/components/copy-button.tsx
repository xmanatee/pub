import { Check, Copy } from "lucide-react";
import * as React from "react";
import { Button } from "~/components/ui/button";

export function CopyButton({
  text,
  onCopy,
  label = "Copy URL",
}: {
  text: string;
  onCopy?: () => void;
  label?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          onCopy?.();
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (error) {
          console.error("Failed to copy text to clipboard", error);
        }
      }}
      aria-label={label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}
