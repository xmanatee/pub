# Features

Each feature is a self-contained folder. Adding one (e.g. `whatsapp`) is purely
additive — no registry edits, no env vars, no plumbing outside this folder.

## Anatomy

- `commands.ts` — types + `CommandFunctionSpec`s routed through the pub daemon
  (exec / shell / agent). Also declares the feature's `Config` shape if it needs
  credentials (stored under `~/.pub-super-app/config.json` keyed by the feature
  name; read via `core/config.ts`).
- `server.ts` (optional) — TanStack Start server functions for node-side reads
  (filesystem, JSON store via `core/json-store.ts`, parsed HTML, etc.).
- `client.ts` (optional) — browser-side SDK wrappers (telegram gramjs is the
  only current example). Thin wrapper over `server.ts` where applicable.
- `page.tsx` — the feature UI. Uses `core/pub.ts` (`useAsync`, `invoke`,
  `withErrorAlert`) — never reach into another feature.

## Wiring

1. Add a route file at `src/routes/<name>.tsx` exporting
   `createFileRoute("/<name>")({ component: YourPage })`.
2. Add a `NAV` entry in `src/core/shell/sidebar.tsx`.
3. If the feature needs credentials, document the expected config shape in its
   `commands.ts` as a `Config` interface and read it via
   `getFeatureConfig({ data: { name: "<feature>" } })`.

## Rules

- No environment variables. Credentials live in `~/.pub-super-app/config.json`.
- No feature may import from another feature's folder.
- Daemon-routed shell/exec/agent commands for anything node/AI; server fns for
  filesystem and parsing; browser-only code (gramjs, WebCrypto) goes in
  `client.ts` behind `~/core/node-polyfills`.
