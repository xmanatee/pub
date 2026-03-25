# PostHog Analytics Strategy

## Scope

This document is the source of truth for PostHog usage in Pub.

Rules:
- Keep this file aligned with actual code in `web/src/lib/analytics.ts`, `web/src/lib/posthog.ts`, and `web/src/router.tsx`.
- Separate implemented behavior from planned behavior.
- Prefer small, stable event taxonomy over frequent renames.

## Current Implementation

### SDK setup

- Initialization: `web/src/lib/posthog.ts`
- Provider: `PostHogProvider` in `web/src/features/app-shell/page/root-layout-page.tsx`
- SPA pageviews: captured on router navigation in `web/src/router.tsx`
- Identity:
  - `identifyUser(userId, traits?)` on auth
  - `resetIdentity()` on sign-out

### Captured events

#### Navigation

| Event | Source | Notes |
|---|---|---|
| `$pageview` | `web/src/router.tsx` | Includes `$current_url` and `path` |

#### Auth

| Event | Properties |
|---|---|
| `sign_in_started` | `provider` |
| `user_signed_in` | `provider` |
| `user_signed_out` | none |

#### Pub lifecycle

| Event | Properties |
|---|---|
| `pub_viewed` | `slug`, `isPublic` |
| `pub_deleted` | `slug` |
| `pub_visibility_toggled` | `slug`, `newVisibility` |
| `pub_link_copied` | `slug` |

#### API keys

| Event | Properties |
|---|---|
| `api_key_created` | `name` |
| `api_key_deleted` | `name` |
| `api_key_copied` | none |

#### Landing

| Event | Properties |
|---|---|
| `cta_clicked` | `cta`, `location` |

#### Reliability

| Event | Properties |
|---|---|
| `client_error` | `error_message`, `error_name`, optional context |

Notes:
- Mutation failures are currently sent to Sentry via React Query mutation cache, not captured as a dedicated PostHog event.
- Session recording is enabled via `import "posthog-js/dist/recorder"`.

## Naming and Schema Rules

- Event names use `snake_case`.
- Do not remove or rename existing event names without a migration plan.
- Additive changes are preferred: add new properties, avoid changing meaning of existing properties.
- Never include secrets, raw API keys, OAuth tokens, or message payloads.

## Person Identity Rules

- Use Convex user ID as the PostHog identity key.
- Call `identifyUser` only after authenticated user data is available.
- Always call `resetIdentity` on sign-out.

## Minimal Dashboard Set

Create and maintain these dashboards in PostHog:

1. Acquisition
- `$pageview` on `/`
- `cta_clicked` by `cta`
- `sign_in_started` by `provider`
- `user_signed_in`

2. Activation
- `user_signed_in` -> `pub_viewed`
- `api_key_created`
- `$pageview` by path (`/pubs`, `/agents`, `/settings`)

3. Content and sharing
- `pub_viewed` by `isPublic`
- `pub_visibility_toggled`
- `pub_link_copied`

4. Reliability
- `client_error` trend
- Top `error_name` values

## Planned Additions (Not Yet Implemented)

These are valid next steps, but are not currently emitted everywhere:

- `pub_created` (with `source`: web/cli/api)
- `pub_updated`
- `pub_raw_viewed`
- Dedicated `mutation_error` PostHog event
- Live-session analytics (`live_started`, `live_connected`, `live_ended`)

## Update Checklist

When changing analytics code:

1. Update this file in the same PR.
2. Verify event names and properties are documented exactly.
3. Run:
```bash
pnpm lint
pnpm test
```
4. Confirm no sensitive fields are captured.

