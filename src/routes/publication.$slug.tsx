import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { Download, FileText } from "lucide-react";
import * as React from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { VisibilityBadge } from "~/components/visibility-badge";
import { trackPublicationRawViewed, trackPublicationViewed } from "~/lib/analytics";
import { api } from "../../convex/_generated/api";

const RAW_MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  markdown: "text/markdown",
  text: "text/plain",
};

export const Route = createFileRoute("/publication/$slug")({
  component: PublicationPage,
});

function PublicationPage() {
  const { slug } = Route.useParams();
  const publication = useQuery(api.publications.getBySlug, { slug });
  const { isAuthenticated } = useConvexAuth();
  const tracked = React.useRef(false);

  React.useEffect(() => {
    if (publication && !tracked.current) {
      tracked.current = true;
      trackPublicationViewed({
        slug: publication.slug,
        contentType: publication.contentType,
        isPublic: publication.isPublic,
        isOwner: isAuthenticated,
      });
    }
  }, [publication, isAuthenticated]);

  if (publication === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (publication === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
        <div className="rounded-full bg-muted p-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">Not found</h1>
        <p className="text-muted-foreground">This publication doesn't exist or is not public.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold">{publication.title || publication.filename}</h1>
          <Badge variant="secondary">{publication.contentType}</Badge>
          <VisibilityBadge isPublic={publication.isPublic} />
          <span className="text-xs text-muted-foreground">
            {new Date(publication.createdAt).toLocaleDateString()}
          </span>
        </div>
        <RawButton
          content={publication.content ?? ""}
          contentType={publication.contentType}
          slug={slug}
        />
      </div>

      <ContentRenderer content={publication.content ?? ""} contentType={publication.contentType} />
    </div>
  );
}

function RawButton({
  content,
  contentType,
  slug,
}: {
  content: string;
  contentType: string;
  slug: string;
}) {
  const blobUrl = React.useMemo(() => {
    const mimeType = RAW_MIME_TYPES[contentType] || "text/plain";
    const blob = new Blob([content], { type: mimeType });
    return URL.createObjectURL(blob);
  }, [content, contentType]);

  React.useEffect(() => {
    return () => URL.revokeObjectURL(blobUrl);
  }, [blobUrl]);

  return (
    <Button variant="outline" size="sm" asChild onClick={() => trackPublicationRawViewed({ slug })}>
      <a href={blobUrl} target="_blank" rel="noopener noreferrer">
        <Download className="h-3.5 w-3.5 mr-1" />
        Raw
      </a>
    </Button>
  );
}

function ContentRenderer({ content, contentType }: { content: string; contentType: string }) {
  switch (contentType) {
    case "html":
      return <HtmlRenderer content={content} />;
    case "markdown":
      return <MarkdownRenderer content={content} />;
    case "css":
    case "js":
      return <CodeRenderer content={content} language={contentType} />;
    default:
      return (
        <Card className="border-border/50">
          <CardContent className="p-6">
            <pre className="overflow-auto text-sm whitespace-pre-wrap font-mono">{content}</pre>
          </CardContent>
        </Card>
      );
  }
}

function HtmlRenderer({ content }: { content: string }) {
  return (
    <Card className="overflow-hidden border-border/50">
      <iframe
        srcDoc={content}
        sandbox="allow-scripts"
        className="w-full min-h-[600px] bg-white"
        title="Published HTML content"
      />
    </Card>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
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
    <Card className="border-border/50">
      <CardContent className="p-6">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </CardContent>
    </Card>
  );
}

function CodeRenderer({ content, language }: { content: string; language: string }) {
  return (
    <Card className="overflow-hidden border-border/50">
      <CardHeader className="bg-navy py-2 px-4">
        <Badge variant="secondary" className="w-fit text-xs">
          {language}
        </Badge>
      </CardHeader>
      <CardContent className="bg-navy text-white/90 p-6 pt-0">
        <pre className="overflow-auto text-sm">
          <code>{content}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
