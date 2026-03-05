import { buildHtmlSrcdoc, buildTextSrcdoc } from "~/lib/pub-preview";

interface PubPreviewIframeProps {
  contentPreview: string;
  contentType?: string;
  htmlSrc?: string;
  htmlSandbox?: string;
  title: string;
}

export function PubPreviewIframe({
  contentPreview,
  contentType,
  htmlSrc,
  htmlSandbox = "allow-scripts",
  title,
}: PubPreviewIframeProps) {
  if (contentType === "html" && htmlSrc) {
    return (
      <iframe
        src={htmlSrc}
        sandbox={htmlSandbox}
        loading="lazy"
        tabIndex={-1}
        title={title}
        className="h-full w-full border-none pointer-events-none"
      />
    );
  }

  if (contentType === "html") {
    return (
      <iframe
        srcDoc={buildHtmlSrcdoc(contentPreview)}
        sandbox=""
        loading="lazy"
        tabIndex={-1}
        title={title}
        className="h-full w-full border-none pointer-events-none"
      />
    );
  }

  return (
    <iframe
      srcDoc={buildTextSrcdoc(contentPreview, contentType ?? "text")}
      sandbox=""
      loading="lazy"
      tabIndex={-1}
      title={title}
      className="h-full w-full border-none pointer-events-none"
    />
  );
}
