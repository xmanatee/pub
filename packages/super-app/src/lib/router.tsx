import * as React from "react";

export type RouteId = "briefing" | "files" | "reader" | "tracker" | "telegram";

const DEFAULT_ROUTE: RouteId = "briefing";
const VALID: ReadonlySet<string> = new Set(["briefing", "files", "reader", "tracker", "telegram"]);

function readHash(): RouteId {
  const id = window.location.hash.replace(/^#\/?/, "").split("/")[0];
  return VALID.has(id) ? (id as RouteId) : DEFAULT_ROUTE;
}

interface RouterContextValue {
  route: RouteId;
  navigate: (id: RouteId) => void;
}

const RouterContext = React.createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = React.useState<RouteId>(() =>
    typeof window === "undefined" ? DEFAULT_ROUTE : readHash(),
  );

  React.useEffect(() => {
    const handler = () => setRoute(readHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = React.useCallback((id: RouteId) => {
    window.location.hash = `#/${id}`;
  }, []);

  return <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = React.useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used inside RouterProvider");
  return ctx;
}
