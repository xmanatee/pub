import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { trackPublicationViewed } from "~/lib/analytics";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/p/$slug")({
  component: FullScreenPublication,
});

function FullScreenPublication() {
  const { slug } = Route.useParams();
  const publication = useQuery(api.publications.getBySlug, { slug });
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);

  useEffect(() => {
    if (publication && !trackedAnalytics.current) {
      trackedAnalytics.current = true;
      trackPublicationViewed({
        slug: publication.slug,
        contentType: publication.contentType,
        isPublic: publication.isPublic,
      });
    }
  }, [publication]);

  useEffect(() => {
    if (!publication || !publication.isPublic || trackedViewCount.current) return;
    trackedViewCount.current = true;
    void recordPublicView({ slug: publication.slug });
  }, [publication, recordPublicView]);

  if (publication === undefined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading\u2026</div>
      </div>
    );
  }

  if (publication === null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
        <h1 className="text-xl font-bold text-foreground">Not found</h1>
        <p className="text-muted-foreground">This publication doesn't exist or is not public.</p>
        <Link to="/" className="text-primary hover:underline text-sm">
          Go to pub.blue
        </Link>
      </div>
    );
  }

  return (
    <FullScreenContent content={publication.content ?? ""} contentType={publication.contentType} />
  );
}

function FullScreenContent({ content, contentType }: { content: string; contentType: string }) {
  switch (contentType) {
    case "html":
      return <FullScreenHtml content={content} />;
    case "markdown":
      return <FullScreenMarkdown content={content} />;
    default:
      return (
        <div className="fixed inset-0 z-50 overflow-auto bg-background">
          <pre className="p-6 text-sm whitespace-pre-wrap font-mono text-foreground">{content}</pre>
        </div>
      );
  }
}

function FullScreenHtml({ content }: { content: string }) {
  const srcDoc = `<base target="_blank">${content}`;
  return (
    <iframe
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups"
      className="fixed inset-0 z-50 w-full h-full border-none"
      title="Published HTML content"
    />
  );
}

function FullScreenMarkdown({ content }: { content: string }) {
  const [html, setHtml] = useState("");

  useEffect(() => {
    let cancelled = false;

    void Promise.all([import("marked"), import("dompurify")]).then(
      ([{ marked }, { default: DOMPurify }]) => {
        void Promise.resolve(marked.parse(content)).then((unsafeHtml) => {
          if (cancelled) return;
          const safeHtml = DOMPurify.sanitize(unsafeHtml, {
            USE_PROFILES: { html: true },
          });
          setHtml(safeHtml);
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [content]);

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <div
        className="max-w-[800px] mx-auto px-8 py-12 prose prose-sm dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
