import { api } from "@backend/_generated/api";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, FileText } from "lucide-react";
import { PubPreviewIframe } from "~/components/pub-preview-iframe";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

const EXAMPLE_SLUGS = ["4d-labyrinth", "arena-fps", "solar-system"] as const;

export function HowItWorksSection() {
  const labyrinthPub = useQuery(api.pubs.getBySlug, { slug: EXAMPLE_SLUGS[0] });
  const arenaPub = useQuery(api.pubs.getBySlug, { slug: EXAMPLE_SLUGS[1] });
  const solarSystemPub = useQuery(api.pubs.getBySlug, { slug: EXAMPLE_SLUGS[2] });
  const examplePubs = [labyrinthPub, arenaPub, solarSystemPub];
  const pubs = examplePubs.filter((pub) => pub !== undefined && pub !== null);
  const isLoading =
    labyrinthPub === undefined || arenaPub === undefined || solarSystemPub === undefined;

  return (
    <section
      id="how-it-works"
      className="fade-edges-narrow border-y border-border/50 bg-muted/50 py-24"
    >
      <div className="px-4 sm:px-6">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tighter sm:text-4xl">
            Examples that make it click
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            Real pubs. Open one and see how familiar jobs can take on better shapes.
          </p>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Loading public pubs…
          </div>
        ) : null}

        {!isLoading && pubs.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-background/70">
            <CardContent className="flex flex-col items-center py-16">
              <div className="mb-4 rounded-full bg-muted p-4">
                <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="font-medium">Example pubs are unavailable</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The hand-picked landing examples could not be loaded.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {pubs.length > 0 ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {pubs.map((pub) => (
                <Link
                  key={pub.slug}
                  to="/p/$slug"
                  params={{ slug: pub.slug }}
                  className="group overflow-hidden rounded-2xl border border-border/50 bg-background/85 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
                >
                  <div
                    className="relative overflow-hidden bg-white"
                    style={{ aspectRatio: "1200 / 630" }}
                  >
                    {pub.previewHtml ? (
                      <PubPreviewIframe
                        previewHtml={pub.previewHtml}
                        title={pub.title || pub.slug}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted/30">
                        <FileText
                          className="h-10 w-10 text-muted-foreground/40"
                          aria-hidden="true"
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-medium transition-colors group-hover:text-primary">
                        {pub.title || pub.slug}
                      </p>
                      <span className="shrink-0 rounded-full bg-primary/8 px-2 py-1 text-xs font-medium text-primary">
                        Public pub
                      </span>
                    </div>
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {pub.description || "A better shape for a familiar workflow."}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="flex justify-center">
              <Button variant="outline" asChild className="rounded-full px-5">
                <Link to="/explore">
                  Explore all
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
