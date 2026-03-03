import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BatchSection } from "~/components/debug/batch-section";
import { ControlBarGoLiveMode } from "~/components/live/control-bar-go-live-mode";

export const Route = createFileRoute("/debug/pub-page")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: "/" });
    }
  },
  component: PubPageDebug,
});

function TextContent({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <pre className="p-6 text-sm whitespace-pre-wrap font-mono text-foreground">{text}</pre>
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">{text}</div>
    </div>
  );
}

function PubPageDebug() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
        <h1 className="text-xl font-semibold">Pub Page Debug</h1>

        <BatchSection
          title="Pub Page States"
          testId="batch-pub-page-states"
          cellHeight={200}
          items={[
            {
              label: "content-only",
              content: <TextContent text="Hello, world!" />,
            },
            {
              label: "content-with-go-live",
              content: (
                <>
                  <TextContent text="Hello, world!" />
                  <ControlBarGoLiveMode slug="debug-test" onGoLive={() => {}} />
                </>
              ),
            },
            {
              label: "not-found",
              content: (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
                  <h1 className="text-xl font-bold text-foreground">Not found</h1>
                  <p className="text-muted-foreground">
                    This pub doesn't exist or is not accessible.
                  </p>
                  <Link to="/" className="text-primary hover:underline text-sm">
                    Go to pub.blue
                  </Link>
                </div>
              ),
            },
            {
              label: "no-content",
              content: (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-4">
                  <h1 className="text-xl font-bold text-foreground">No content</h1>
                  <p className="text-muted-foreground">This pub has no static content.</p>
                  <Link to="/" className="text-primary hover:underline text-sm">
                    Go to pub.blue
                  </Link>
                </div>
              ),
            },
            {
              label: "loading",
              content: <StatusScreen text="Loading..." />,
            },
          ]}
        />
      </div>
    </div>
  );
}
