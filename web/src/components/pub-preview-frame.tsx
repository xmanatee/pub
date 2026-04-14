import type { ReactNode } from "react";

export function PubPreviewFrame({ children }: { children: ReactNode }) {
  return <div className="aspect-[1200/430] overflow-hidden">{children}</div>;
}
