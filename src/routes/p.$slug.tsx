import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import * as React from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/p/$slug")({
  component: FullScreenPublication,
});

function FullScreenPublication() {
  const { slug } = Route.useParams();
  const publication = useQuery(api.publications.getBySlug, { slug });

  if (publication === undefined) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (publication === null) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white gap-4">
        <h1 className="text-xl font-bold text-gray-900">Not found</h1>
        <p className="text-gray-500">This publication doesn't exist or is not public.</p>
        <Link to="/" className="text-blue-600 hover:underline text-sm">
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
        <div className="fixed inset-0 z-[9999] overflow-auto bg-white">
          <pre className="p-6 text-sm whitespace-pre-wrap font-mono text-gray-900">{content}</pre>
        </div>
      );
  }
}

function FullScreenHtml({ content }: { content: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();
      }
    }
  }, [content]);

  return (
    <iframe
      ref={iframeRef}
      sandbox="allow-scripts"
      className="fixed inset-0 z-[9999] w-full h-full border-none"
      title="Published HTML content"
    />
  );
}

function FullScreenMarkdown({ content }: { content: string }) {
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
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
    <div className="fixed inset-0 z-[9999] overflow-auto bg-white">
      <div
        className="max-w-[800px] mx-auto px-8 py-12 prose prose-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
