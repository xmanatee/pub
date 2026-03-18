import { getConvexSiteUrl } from "~/lib/convex-url";

export function buildServePreviewUrl(slug: string): string {
  return `${getConvexSiteUrl()}/serve/${slug}?preview=1`;
}

interface PubPreviewIframeProps {
  slug: string;
  title: string;
}

export function PubPreviewIframe({ slug, title }: PubPreviewIframeProps) {
  return (
    <div className="relative h-full w-full">
      <iframe
        src={buildServePreviewUrl(slug)}
        sandbox="allow-scripts"
        loading="lazy"
        tabIndex={-1}
        title={title}
        className="h-full w-full border-none"
      />
      <div className="absolute inset-0" aria-hidden="true" />
    </div>
  );
}
