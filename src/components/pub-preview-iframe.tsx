interface PubPreviewIframeProps {
  content?: string;
  htmlSrc?: string;
  htmlSandbox?: string;
  title: string;
}

export function PubPreviewIframe({
  content,
  htmlSrc,
  htmlSandbox = "allow-scripts",
  title,
}: PubPreviewIframeProps) {
  return (
    <iframe
      src={htmlSrc}
      srcDoc={htmlSrc ? undefined : content}
      sandbox={htmlSandbox}
      loading="lazy"
      tabIndex={-1}
      title={title}
      className="h-full w-full border-none pointer-events-none"
    />
  );
}
