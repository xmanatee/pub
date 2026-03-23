/**
 * Single source of truth for iframe sandbox tokens and Permissions Policy features.
 *
 * Rendering contexts that consume this policy:
 *   1. Cross-origin sandbox iframe (canvas-panel, SW mode) — full tokens + allow-same-origin
 *   2. SrcDoc iframe (canvas-panel, no SW) — full tokens WITHOUT allow-same-origin
 *   3. CSP sandbox directive (convex /serve/:slug) — full tokens + allow-same-origin
 *
 * Convex cannot import from shared/ at runtime, so convex/http/shared.ts duplicates the
 * CSP and Permissions-Policy strings. Tests verify they stay in sync.
 */

const BASE_SANDBOX_TOKENS = [
  "allow-scripts",
  "allow-forms",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
  "allow-pointer-lock",
  "allow-orientation-lock",
  "allow-top-navigation-by-user-activation",
] as const;

const PERMISSIONS_POLICY_FEATURES = [
  "camera",
  "microphone",
  "display-capture",
  "geolocation",
  "fullscreen",
  "autoplay",
  "clipboard-read",
  "clipboard-write",
  "accelerometer",
  "gyroscope",
  "magnetometer",
  "midi",
  "gamepad",
  "screen-wake-lock",
  "web-share",
] as const;

/** Tokens that must NEVER appear in any sandbox policy. */
export const DENIED_SANDBOX_TOKENS = [
  "allow-top-navigation", // script-driven parent navigation without user gesture
  "allow-storage-access-by-user-activation", // third-party cookie access, not needed
] as const;

/**
 * Sandbox attribute for cross-origin iframes (SW mode) and CSP.
 * Includes allow-same-origin — safe because the iframe is on a separate origin.
 */
export const CROSS_ORIGIN_SANDBOX_ATTR = `allow-same-origin ${BASE_SANDBOX_TOKENS.join(" ")}`;

/** Sandbox attribute for srcDoc iframes. No allow-same-origin — would share the parent's origin. */
export const SRCDOC_SANDBOX_ATTR = BASE_SANDBOX_TOKENS.join(" ");

/** iframe `allow` attribute — semicolon-separated Permissions Policy features. */
export const IFRAME_ALLOW_ATTR = PERMISSIONS_POLICY_FEATURES.join("; ");
