/**
 * Centralized, strict accessors for backend environment variables.
 *
 * Every URL env var goes through here — no raw `process.env` access elsewhere.
 * Missing values throw immediately instead of producing silently broken URLs.
 */

export function getSiteUrl(): string {
  const url = process.env.CONVEX_SITE_URL;
  if (!url) throw new Error("CONVEX_SITE_URL is not set");
  return url;
}

export function getPublicUrl(): string {
  const url = process.env.PUB_PUBLIC_URL;
  if (!url) throw new Error("PUB_PUBLIC_URL is not set");
  return url;
}
