import { Link } from "@tanstack/react-router";
import { ArrowLeft, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "~/components/ui/button";

interface PubSourceViewProps {
  slug: string;
  title?: string;
  content?: string;
}

export function PubSourceView({ slug, title, content }: PubSourceViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [content]);

  return (
    <div className="flex-1 flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Back" asChild>
          <Link to="/p/$slug" params={{ slug }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <span className="text-sm font-medium truncate">{title || slug}</span>
        <span className="text-xs text-muted-foreground">source</span>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => void handleCopy()}
          disabled={!content}
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {content ? (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap break-all font-mono">
            {content}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">No content</p>
        )}
      </div>
    </div>
  );
}
