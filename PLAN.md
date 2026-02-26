# Pub.blue Improvement Plan

## Overview

This plan covers 13 changes to be implemented in a single pass. Changes are ordered by dependency — later items may depend on earlier ones.

---

## 1. Fix Landing Page Copy

**Files:** `src/routes/index.tsx`

- Line 62: `"HTML, Markdown, CSS, or JS"` → `"HTML, Markdown, or text"`
- Line 127: `"HTML pages, CSS stylesheets, JavaScript files, Markdown documents, or plain text."` → `"HTML pages, Markdown documents, or plain text. Served with proper MIME types."`

---

## 2. Gate `/debug/auth` to Dev Only

**Files:** `src/routes/debug.auth.tsx`

- Add `beforeLoad` that throws `redirect({ to: "/" })` when `!import.meta.env.DEV`

---

## 3. Clean Up Legacy API Key Code

**Files:** `convex/schema.ts`, `convex/apiKeys.ts`, `convex/apiKeys.test.ts`

- Remove `key: v.optional(v.string())` from schema
- Remove `.index("by_key", ["key"])` from schema
- Remove `migrateLegacyKeys` internal mutation
- Simplify `list` keyPreview fallback: remove `k.key` reference, just use `"pub_****...****"`
- Update tests: remove `key` field from test objects

---

## 4. Default Visibility = Private + Publication Limits

**Files:** `convex/publications.ts`, `convex/http.ts`, `convex/utils.ts`, `convex/publications.test.ts`

### Default visibility
- Already defaults to `false` in `http.ts` line 180: `isPublic: body.isPublic ?? false` ✓
- Already defaults to `false` in CLI: `isPublic: opts.public ?? false` ✓
- No changes needed for default — already private

### Publication limits
- Add constants to `convex/utils.ts`:
  - `MAX_PUBLIC_PUBS = 20`
  - `MAX_PRIVATE_PUBS = 100`
- Add `countByUserInternal` internal query to `convex/publications.ts`:
  - Returns `{ publicCount, privateCount, total }` for a user
- Enforce in `createPublication` internal mutation:
  - Check counts before insert; throw `"Public publication limit reached (20)"` or `"Private publication limit reached (100)"`
- Enforce in `toggleVisibility` mutation:
  - When toggling private→public, check public count
- Enforce in HTTP POST handler — the mutation will throw, `executeAction` catches it
- Add tests for limit constants

---

## 5. Slug Rename

**Files:** `convex/http.ts`, `convex/publications.ts`, `cli/src/index.ts`, `cli/src/lib/api.ts`

### Backend
- Accept `slug` field in PATCH body in `http.ts`
- Validate new slug format + uniqueness
- Add `slug` to `updatePublication` internal mutation args
- If slug changes, patch it on the document

### CLI
- Add `--slug <newSlug>` option to `update` command
- Pass `slug` in API client `update()` body

### API Client
- Add `newSlug` to update request body (sent as `slug` to API)

---

## 6. Expiring Publications

**Files:** `convex/schema.ts`, `convex/publications.ts`, `convex/http.ts`, `convex/utils.ts`, `cli/src/index.ts`, `cli/src/lib/api.ts`, `src/routes/dashboard.tsx`

### Schema
- Add `expiresAt: v.optional(v.number())` to `publications` table

### Backend
- Add `expire` internal mutation: deletes publication by ID (check it still exists)
- In `createPublication`: if `expiresAt` is provided, `ctx.scheduler.runAt(expiresAt, internal.publications.expire, { id })`
- Store the scheduled function ID? Not strictly necessary — if the pub is manually deleted before expiry, the scheduled fn will just find nothing to delete.

### HTTP API
- Accept `expiresIn` in POST body (string: `"1h"`, `"24h"`, `"7d"`, or number of seconds)
- Parse to `expiresAt = Date.now() + parsedMs`
- Validate max expiry: 30 days
- Return `expiresAt` in responses when set

### CLI
- Add `--expires <duration>` to `create` command (e.g., `1h`, `24h`, `7d`)

### Dashboard
- Show expiry badge next to publications that have `expiresAt`
- Format as relative time ("expires in 2h")

### Utils
- Add `parseDuration(str)` helper: converts `"1h"` → 3600000, `"24h"` → 86400000, `"7d"` → 604800000
- Add `MAX_EXPIRY = 30 * 24 * 60 * 60 * 1000` (30 days)

---

## 7. Pagination

**Files:** `convex/publications.ts`, `convex/http.ts`, `src/routes/dashboard.tsx`

### Dashboard (Convex reactive pagination)
- Change `listByUser` to use `.paginate()` with `paginationOptsValidator`
- Frontend: use `usePaginatedQuery` with `initialNumItems: 25`
- Add "Load more" button when `status === "CanLoadMore"`

### API (cursor-based)
- Change `listByUserInternal` to accept optional `cursor` + `limit` (default 25, max 100)
- Use `.paginate({ cursor, numItems: limit })`
- Return `{ publications, cursor, hasMore }` from the HTTP GET list endpoint
- Parse `?cursor=` and `?limit=` query params

### CLI
- `list` command: paginate through all pages by default (fetch until `hasMore` is false)

---

## 8. API Rate Limiting

**Files:** `convex/convex.config.ts` (new), `convex/http.ts`, `package.json`

### Setup
- Install `@convex-dev/rate-limiter`
- Create `convex/convex.config.ts` with rate limiter component
- Create `convex/rateLimits.ts` with rate limit definitions:
  - `createPublication`: 10 per minute (token bucket)
  - `readPublication`: 60 per minute
  - `listPublications`: 30 per minute
  - `updatePublication`: 20 per minute
  - `deletePublication`: 10 per minute
  - `serveContent`: 120 per minute (per IP)

### HTTP handlers
- Add rate limit check before each operation
- Key by API key for authenticated routes, by IP for `/serve/`
- Return 429 with `Retry-After` header when exceeded

---

## 9. Usage Analytics (View Counting)

**Files:** `convex/convex.config.ts`, `convex/schema.ts`, `convex/analytics.ts` (new), `convex/http.ts`, `convex/publications.ts`, `src/routes/dashboard.tsx`, `package.json`

### Setup
- Install `@convex-dev/sharded-counter`
- Add to `convex/convex.config.ts`

### Backend
- Create `convex/analytics.ts`:
  - `recordView` mutation: increments counter keyed by slug
  - `getViewCount` query: returns count for a slug
  - `getViewCounts` query: returns counts for multiple slugs (batch)
- In `/serve/:slug` HTTP handler: call `recordView` after successful serve
- In `getBySlug` query: optionally record view (or leave to frontend)

### Dashboard
- Show view count next to each publication in the list
- Fetch view counts via `getViewCounts` query with list of slugs

---

## 10. OG Image / Social Preview

**Files:** `convex/http.ts`, `src/routes/p.$slug.tsx`, `package.json`

### OG endpoint
- Add `GET /og/:slug` HTTP route
- Use `satori` + `@resvg/resvg-js` to generate 1200x630 PNG
- Template: pub.blue branding, publication title, content type badge, slug
- Cache: `Cache-Control: public, max-age=86400`
- Handle missing/private pubs: return a generic "pub.blue" fallback image

### HTML meta tags
- In `p.$slug.tsx`: this is an SPA route, so OG tags must be injected server-side
- Alternative: add OG meta tags in the `/serve/:slug` HTML response for markdown/HTML pubs
- For the SPA route, add a `<meta>` tag in the root `index.html` with a dynamic OG image URL that crawlers can pick up — OR use the serve endpoint for link previews
- **Practical approach**: Add OG tags to `/serve/:slug` responses and recommend sharing serve URLs for social. Add a note in the dashboard "Share this URL for social previews" next to the serve URL.

### Dependencies
- `satori`, `@resvg/resvg-js` — note: these may be too heavy for Convex runtime. **Fallback**: generate a simple SVG-based image without resvg, or use a static template with text overlay.
- **Revised approach**: Since Convex HTTP actions have limited runtime, generate a simple HTML→SVG OG card. If satori doesn't work in Convex, use a simpler approach: return an SVG directly (browsers/crawlers accept `image/svg+xml` for OG) or use a pre-built template.

---

## 11. RSS Feed Per User

**Files:** `convex/http.ts`, `convex/publications.ts`, `package.json`

### Backend
- Install `feed` package
- Add `listPublicByUser` internal query: returns public pubs for a given userId, ordered desc, limited to 50
- Add `GET /rss/:userId` HTTP route:
  - Fetch public publications for the user
  - Generate RSS 2.0 feed using `feed` library
  - Return `application/rss+xml` with `Cache-Control: public, max-age=300`
- The URL uses userId (not username since there are no usernames yet)

### Dashboard
- Show RSS feed URL in Account tab: `https://silent-guanaco-514.convex.site/rss/{userId}`

---

## 12. Public Discovery Feed

**Files:** `convex/publications.ts`, `convex/schema.ts`, `src/routes/explore.tsx` (new)

### Schema
- Add index `by_public` on publications: `["isPublic", "createdAt"]` — enables querying all public pubs ordered by date

### Backend
- Add `listPublic` query with pagination:
  - Queries publications where `isPublic === true`, ordered desc
  - Uses `.paginate()` for cursor-based pagination
  - Returns mapped publications (no content, just metadata)

### Frontend
- New route `/explore`
- Lists public publications from all users
- Shows title/slug, content type, date
- "Load more" pagination
- Link to `/p/:slug` to view
- Add "Explore" link to header nav

---

## 13. Free Tier Limits + Paid Plan (Scaffolding Only)

This is a large feature. For now, implement the **limit enforcement infrastructure** without Stripe:

### Schema
- Add `plan: v.optional(v.union(v.literal("free"), v.literal("pro")))` to the `users` table?
- **Problem**: We use `authTables` which defines the users table. We can't add fields to it via schema directly.
- **Alternative**: Create a `userProfiles` table: `{ userId, plan, ... }`
- **Simplest approach for now**: Use the publication limits from item 4 as the "free tier" limits. The limits are enforced globally. When a paid plan is added later, the limit check can read the user's plan. No additional schema changes needed now.

**Decision**: Skip the paid plan schema for now. The limits in item 4 ARE the free tier. Add a comment noting that these will become plan-dependent later.

---

## Implementation Order

1. Fix landing page copy (independent)
2. Gate debug auth (independent)
3. Clean up legacy API keys (independent)
4. Default visibility + limits (schema change, backend)
5. Slug rename (backend + CLI)
6. Expiring pubs (schema change, backend, CLI, dashboard)
7. Pagination (backend, frontend, CLI)
8. Rate limiting (new dependency, backend)
9. View counting (new dependency, backend, frontend)
10. OG images (backend)
11. RSS feed (new dependency, backend)
12. Public discovery feed (schema, backend, frontend)
13. Free tier scaffolding (already done via item 4)

Items 1-3 are independent quick wins.
Items 4-7 modify existing code.
Items 8-12 add new capabilities.
Item 13 is addressed by item 4's limits.

---

## Files Modified (Summary)

| File | Changes |
|---|---|
| `convex/schema.ts` | Add expiresAt, by_public index, remove legacy key field/index |
| `convex/utils.ts` | Add limits, parseDuration, MAX_EXPIRY |
| `convex/publications.ts` | Limits, pagination, expire, listPublic, countByUser, slug update |
| `convex/http.ts` | Slug rename, expiry, pagination, rate limiting, OG, RSS, view tracking |
| `convex/apiKeys.ts` | Remove migrateLegacyKeys, simplify list |
| `convex/analytics.ts` | New — view counting |
| `convex/rateLimits.ts` | New — rate limit definitions |
| `convex/convex.config.ts` | New — component registration |
| `convex/apiKeys.test.ts` | Remove legacy key references |
| `convex/publications.test.ts` | Add limit tests, pagination tests |
| `src/routes/index.tsx` | Fix copy |
| `src/routes/debug.auth.tsx` | Add dev gate |
| `src/routes/dashboard.tsx` | Pagination, expiry badge, view counts, RSS link |
| `src/routes/explore.tsx` | New — public discovery feed |
| `src/routes/__root.tsx` | Add Explore nav link |
| `src/routes/p.$slug.tsx` | OG meta (if feasible) |
| `cli/src/index.ts` | Slug rename, expiry flag |
| `cli/src/lib/api.ts` | Slug rename, expiry, pagination support |
| `package.json` | New deps: rate-limiter, sharded-counter, feed |
