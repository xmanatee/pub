interface PubPreviewIframeProps {
  contentPreview: string;
  htmlSrc?: string;
  htmlSandbox?: string;
  title: string;
}

export function PubPreviewIframe({
  contentPreview,
  htmlSrc,
  htmlSandbox = "allow-scripts",
  title,
}: PubPreviewIframeProps) {
  return (
    <iframe
      src={htmlSrc}
      srcDoc={htmlSrc ? undefined : contentPreview}
      sandbox={htmlSandbox}
      loading="lazy"
      tabIndex={-1}
      title={title}
      className="h-full w-full border-none pointer-events-none"
    />
  );
}
