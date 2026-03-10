import * as React from "react";
import { cn } from "~/lib/utils";

export function TerminalPreview({
  children,
  className,
  headerRight,
}: {
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-navy text-white overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
          <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
        </div>
        {headerRight ?? <span className="ml-2 text-xs text-white/40 font-mono">terminal</span>}
      </div>
      {children}
    </div>
  );
}
