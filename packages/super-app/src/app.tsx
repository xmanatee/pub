import { Sidebar } from "~/components/shell/sidebar";
import { BriefingPage } from "~/features/briefing/page";
import { FilesPage } from "~/features/files/page";
import { ReaderPage } from "~/features/reader/page";
import { TelegramPage } from "~/features/telegram/page";
import { TrackerPage } from "~/features/tracker/page";
import { type RouteId, RouterProvider, useRouter } from "~/lib/router";

const PAGES: Record<RouteId, React.ComponentType> = {
  briefing: BriefingPage,
  files: FilesPage,
  reader: ReaderPage,
  tracker: TrackerPage,
  telegram: TelegramPage,
};

function CurrentPage() {
  const { route } = useRouter();
  const Page = PAGES[route];
  return <Page />;
}

export function App() {
  return (
    <RouterProvider>
      <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden">
          <CurrentPage />
        </main>
      </div>
    </RouterProvider>
  );
}
