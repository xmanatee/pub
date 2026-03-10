import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PubLogo } from "~/components/pub-logo";
import { Button } from "~/components/ui/button";
import { trackCtaClicked } from "~/lib/analytics";

export function CtaSection() {
  return (
    <section className="py-24 border-t border-border/50">
      <div className="px-4 sm:px-6 text-center">
        <PubLogo size={48} className="mx-auto mb-6" />
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
          Ready for adaptive interfaces?
        </h2>
        <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
          Install the CLI. Connect your agent. Let it build for you.
        </p>
        <Button
          size="lg"
          className="h-12 px-8 text-base"
          asChild
          onClick={() => trackCtaClicked({ cta: "get_started_free", location: "bottom_cta" })}
        >
          <Link to="/login">
            Get started free
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
