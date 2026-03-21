export function getConvexUrl(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
  if (convexUrl) return convexUrl;

  throw new Error("Missing VITE_CONVEX_URL. Configure the web app before starting Pub.");
}
