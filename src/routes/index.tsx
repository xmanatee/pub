import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Globe, Zap, Bot, ArrowRight, Terminal } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6">
      {/* Hero */}
      <section className="py-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm text-muted-foreground mb-6">
          <Zap className="h-3.5 w-3.5" />
          Instant publishing for developers and agents
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
          Publish content,
          <br />
          get a URL instantly
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
          Upload HTML, CSS, JavaScript, or Markdown files and get a shareable
          URL in seconds. Built for quick demos, previews, and AI
          agent-generated content.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" asChild>
            <Link to="/login">
              Get started
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="#how-it-works">How it works</a>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Globe className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Any static content</CardTitle>
            <CardDescription>
              HTML pages, CSS stylesheets, JavaScript files, Markdown documents,
              or plain text.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Instant URLs</CardTitle>
            <CardDescription>
              Every file gets a unique URL immediately. Share it, embed it, or
              open it in a browser.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <CardTitle>Agent-friendly</CardTitle>
            <CardDescription>
              CLI tool and API designed for AI agents. Publish from Claude Code,
              Codex, or any automation.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Step
            number={1}
            title="Sign in & get a key"
            description="Sign in with GitHub or Google and generate an API key from your dashboard."
          />
          <Step
            number={2}
            title="Install the CLI"
            description="Install the publish CLI tool or configure the skill for your AI agent."
          />
          <Step
            number={3}
            title="Publish & share"
            description="Upload files via CLI or API. Get back a URL you can share immediately."
          />
        </div>
      </section>

      {/* Code example */}
      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-8">
          Simple as one command
        </h2>
        <Card className="max-w-2xl mx-auto overflow-hidden">
          <CardHeader className="bg-zinc-950 text-zinc-100 rounded-t-xl pb-0">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <Terminal className="h-3.5 w-3.5" />
              Terminal
            </div>
          </CardHeader>
          <CardContent className="bg-zinc-950 text-zinc-100 rounded-b-xl font-mono text-sm p-6 pt-4 space-y-4">
            <div>
              <div className="text-zinc-500"># Publish a file</div>
              <div>
                <span className="text-zinc-400">$</span> publish upload
                index.html
              </div>
              <div className="text-emerald-400">
                Published: https://your-app.convex.site/serve/abc123
              </div>
            </div>
            <div>
              <div className="text-zinc-500"># Publish with a custom slug</div>
              <div>
                <span className="text-zinc-400">$</span> publish upload --slug
                my-demo report.md
              </div>
              <div className="text-emerald-400">
                Published: https://your-app.convex.site/serve/my-demo
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-3 font-bold text-sm">
        {number}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
