import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Sidebar } from "~/core/shell/sidebar";
import "~/index.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "App" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-hidden">
              <Outlet />
            </main>
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
