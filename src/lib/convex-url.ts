export function getConvexSiteUrl(): string {
  return import.meta.env.VITE_CONVEX_URL
    ? import.meta.env.VITE_CONVEX_URL.replace(".cloud", ".site")
    : "";
}
