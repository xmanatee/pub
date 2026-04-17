import type { ReactNode } from "react";

export function PubPreviewFrame({ children }: { children: ReactNode }) {
  return <div className="pub-preview-frame overflow-hidden">{children}</div>;
}
