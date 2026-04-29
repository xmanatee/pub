import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { ConfirmRoot } from "~/core/hooks/use-confirm";
import { PromptRoot } from "~/core/hooks/use-prompt";
import { ToastRoot } from "~/core/hooks/use-toast";
import { TargetNavigationProvider } from "~/core/navigation/use-target-navigation";
import { CommandPaletteProvider } from "~/core/shell/command-palette";
import { Sidebar } from "~/core/shell/sidebar";
import { ThemeProvider } from "~/core/shell/theme";
import "~/index.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: "Super-App" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <ThemeProvider>
            <ToastRoot>
              <ConfirmRoot>
                <PromptRoot>
                  <TargetNavigationProvider>
                    <CommandPaletteProvider>
                      <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
                        <Sidebar />
                        <main className="flex-1 min-w-0 overflow-hidden">
                          <Outlet />
                        </main>
                      </div>
                    </CommandPaletteProvider>
                  </TargetNavigationProvider>
                </PromptRoot>
              </ConfirmRoot>
            </ToastRoot>
          </ThemeProvider>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
