import { useMemo } from "react";

interface PubPreviewIframeProps {
  contentPreview: string;
  htmlSrc?: string;
  htmlSandbox?: string;
  title: string;
}

function wrapSrcdoc(content: string): string {
  return `<meta name="color-scheme" content="light"><style>body{margin:0;padding:12px;font-family:system-ui,sans-serif;font-size:11px;line-height:1.5;overflow:hidden;color:#1a1a1a;background:#fff}img{max-width:100%;height:auto}</style>${content}`;
}

export function PubPreviewIframe({
  contentPreview,
  htmlSrc,
  htmlSandbox = "allow-scripts",
  title,
}: PubPreviewIframeProps) {
  const srcdoc = useMemo(
    () => (htmlSrc ? undefined : wrapSrcdoc(contentPreview)),
    [htmlSrc, contentPreview],
  );

  return (
    <iframe
      src={htmlSrc}
      srcDoc={srcdoc}
      sandbox={htmlSandbox}
      loading="lazy"
      tabIndex={-1}
      title={title}
      className="h-full w-full border-none pointer-events-none"
    />
  );
}
