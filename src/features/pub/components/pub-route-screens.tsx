import { Link } from "@tanstack/react-router";

export function StatusScreen({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function NotFoundScreen() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This pub doesn&apos;t exist or is not accessible.
      </p>
      <Link to="/" className="text-sm text-primary hover:underline">
        Go to pub.blue
      </Link>
    </div>
  );
}

export function NoContentScreen() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold">No content</h1>
      <p className="text-sm text-muted-foreground">This pub has no static content yet.</p>
    </div>
  );
}
