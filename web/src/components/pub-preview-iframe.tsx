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
    <div className="relative h-full w-full">
      <iframe
        src={htmlSrc}
        srcDoc={htmlSrc ? undefined : content}
        sandbox={htmlSandbox}
        loading="lazy"
        tabIndex={-1}
        title={title}
        className="h-full w-full border-none"
      />
      <div className="absolute inset-0" aria-hidden="true" />
    </div>
  );
}
