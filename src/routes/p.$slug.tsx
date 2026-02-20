import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { ExternalLink, Lock, Globe, FileText } from "lucide-react";

export const Route = createFileRoute("/p/$slug")({
  component: PublicationPage,
});

function PublicationPage() {
  const { slug } = Route.useParams();
  const publication = useQuery(api.publications.getBySlug, { slug });

  if (publication === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (publication === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-2">
        <FileText className="h-12 w-12 text-muted-foreground/50" />
        <h1 className="text-xl font-bold">Not found</h1>
        <p className="text-muted-foreground">
          This publication doesn't exist or is not public.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-lg font-semibold">
            {publication.title || publication.filename}
          </h1>
          <Badge variant="secondary">{publication.contentType}</Badge>
          {publication.isPublic ? (
            <Badge
              variant="outline"
              className="gap-1 text-emerald-600 border-emerald-200"
            >
              <Globe className="h-3 w-3" /> public
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1 text-amber-600 border-amber-200"
            >
              <Lock className="h-3 w-3" /> private
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(publication.createdAt).toLocaleDateString()}
          </span>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`${(import.meta as any).env.VITE_CONVEX_SITE_URL}/serve/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            Raw
          </a>
        </Button>
      </div>

      <ContentRenderer
        content={publication.content}
        contentType={publication.contentType}
      />
    </div>
  );
}

function ContentRenderer({
  content,
  contentType,
}: {
  content: string;
  contentType: string;
}) {
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
        <Card>
          <CardContent className="p-6">
            <pre className="overflow-auto text-sm whitespace-pre-wrap font-mono">
              {content}
            </pre>
          </CardContent>
        </Card>
      );
  }
}

function HtmlRenderer({ content }: { content: string }) {
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
    <Card className="overflow-hidden">
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts allow-same-origin"
        className="w-full min-h-[600px] bg-white"
        title="Published HTML content"
      />
    </Card>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const [html, setHtml] = React.useState("");

  React.useEffect(() => {
    import("marked").then(({ marked }) => {
      const result = marked(content);
      if (typeof result === "string") {
        setHtml(result);
      } else {
        result.then(setHtml);
      }
    });
  }, [content]);

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className="prose prose-sm max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </CardContent>
    </Card>
  );
}

function CodeRenderer({
  content,
  language,
}: {
  content: string;
  language: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-zinc-950 py-2 px-4">
        <Badge variant="secondary" className="w-fit text-xs">
          {language}
        </Badge>
      </CardHeader>
      <CardContent className="bg-zinc-950 text-zinc-100 p-6 pt-0">
        <pre className="overflow-auto text-sm">
          <code>{content}</code>
        </pre>
      </CardContent>
    </Card>
  );
}
