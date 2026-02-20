# PostHog Analytics Strategy — Pub

> Comprehensive product analytics plan for the Pub content-publishing platform.
> This document covers every PostHog primitive, maps them to Pub's product surface,
> and defines the dashboards needed for data-driven decision making.

---

## Table of Contents

1. [Events (Signals)](#1-events-signals)
2. [Properties & Super Properties](#2-properties--super-properties)
3. [Persons & Identification](#3-persons--identification)
4. [Groups](#4-groups)
5. [Session Recording](#5-session-recording)
6. [Feature Flags](#6-feature-flags)
7. [Experiments (A/B Tests)](#7-experiments-ab-tests)
8. [Surveys](#8-surveys)
9. [Actions](#9-actions)
10. [Cohorts](#10-cohorts)
11. [Insights (Charts)](#11-insights-charts)
12. [Funnels](#12-funnels)
13. [Retention](#13-retention)
14. [Paths](#14-paths)
15. [Lifecycle](#15-lifecycle)
16. [Dashboards](#16-dashboards)

---

## 1. Events (Signals)

Events are the atomic unit of PostHog analytics. Each event represents a discrete user
action captured via `posthog.capture()`. Below is the complete event taxonomy for Pub.

### 1.1 Autocaptured Events (enabled by default)

| Event | Description |
|---|---|
| `$pageview` | Automatic page view on every route change (also manually fired on SPA navigation) |
| `$pageleave` | User navigates away from a page |
| `$autocapture` | Clicks, form submissions, and input changes on DOM elements |
| `$rageclick` | Repeated clicks on the same element (frustration signal) |

### 1.2 Custom Events — Authentication

| Event | Properties | When Fired |
|---|---|---|
| `sign_in_started` | `provider: "github" \| "google"` | User clicks a sign-in button |
| `user_signed_in` | `provider: string` | Authentication completes successfully |
| `user_signed_out` | — | User clicks sign out |

### 1.3 Custom Events — Publications

| Event | Properties | When Fired |
|---|---|---|
| `publication_viewed` | `slug`, `contentType`, `isPublic`, `isOwner` | Publication page loads with data |
| `publication_created` | `slug`, `contentType`, `isPublic`, `source` | New publication created (via API/CLI) |
| `publication_deleted` | `slug`, `contentType` | User deletes a publication from dashboard |
| `publication_visibility_toggled` | `slug`, `newVisibility: "public" \| "private"` | User toggles pub visibility |
| `publication_link_copied` | `slug` | User copies a publication URL |
| `publication_raw_viewed` | `slug` | User clicks "Raw" to view raw content |

### 1.4 Custom Events — API Keys

| Event | Properties | When Fired |
|---|---|---|
| `api_key_created` | `name` | User creates a new API key |
| `api_key_deleted` | `name` | User deletes an API key |
| `api_key_copied` | — | User copies a newly created API key |

### 1.5 Custom Events — Dashboard

| Event | Properties | When Fired |
|---|---|---|
| `dashboard_tab_changed` | `tab: "publications" \| "keys"` | User switches dashboard tab |

### 1.6 Custom Events — Landing Page

| Event | Properties | When Fired |
|---|---|---|
| `cta_clicked` | `cta`, `location` | User clicks any CTA button |

### 1.7 Custom Events — Errors

| Event | Properties | When Fired |
|---|---|---|
| `client_error` | `error_message`, `error_name` | Unhandled client error caught by error boundary |
| `mutation_error` | `mutation`, `error_message` | Convex mutation fails |

---

## 2. Properties & Super Properties

### 2.1 Event Properties

Every custom event includes contextual properties defined in `src/lib/analytics.ts`.
PostHog also automatically captures:

- `$current_url` — full URL
- `$pathname` — route path
- `$browser` — browser name and version
- `$device_type` — desktop / mobile / tablet
- `$os` — operating system
- `$referrer` / `$referring_domain` — traffic source
- `$screen_height` / `$screen_width` — viewport size

### 2.2 Super Properties (set once, sent with every event)

Register these after authentication via `posthog.register()`:

| Property | Value | Purpose |
|---|---|---|
| `app_version` | Build version string | Track feature adoption by release |
| `environment` | `"development"` / `"production"` | Filter dev noise from prod analytics |

### 2.3 Person Properties (set via `posthog.identify()`)

| Property | Source | Purpose |
|---|---|---|
| `user_id` | Convex user ID | Unique identifier |
| `auth_provider` | OAuth provider used at signup | Understand auth preference |
| `created_at` | First sign-in timestamp | Cohort analysis by signup date |
| `publication_count` | Updated periodically | Segment by usage level |
| `has_api_key` | Boolean | Track API adoption |

---

## 3. Persons & Identification

### Strategy

- **Anonymous users**: PostHog auto-assigns a `distinct_id` via cookie/localStorage.
  Landing page behavior is tracked anonymously.
- **Identified users**: On successful sign-in, call `posthog.identify(convexUserId)`.
  PostHog merges anonymous events with the identified person (aliasing).
- **Sign out**: Call `posthog.reset()` to clear the identity. Subsequent events are
  attributed to a new anonymous user.

### Implementation

```typescript
// On sign-in success
identifyUser(userId, { auth_provider: "github" });

// On sign-out
resetIdentity();
```

---

## 4. Groups

Groups allow analyzing behavior at the organization/team level. While Pub is currently
single-user, groups provide future extensibility.

### Recommended Groups

| Group Type | Group Key | Use Case |
|---|---|---|
| `organization` | Organization ID (future) | Team analytics when multi-tenant support lands |
| `project` | API key name/prefix | Group publications by deployment context |

### When to Implement

Defer until multi-user / team features are built. The PostHog group analytics
infrastructure is ready — simply call `posthog.group('organization', orgId)` when
the feature ships.

---

## 5. Session Recording

Session recordings capture user sessions as replayable videos, essential for
debugging UX issues and understanding user behavior.

### Configuration

| Setting | Value | Rationale |
|---|---|---|
| `recordCrossOriginIframes` | `false` | Publication iframes contain user HTML — don't record |
| Sample rate | 100% (startup phase) | Capture all sessions while user count is low |
| Minimum duration | 1 second | Filter out bot hits |
| Console log capture | Enabled | Debug errors alongside visual replays |
| Network request capture | Enabled | See API call timing |

### Key Filters for Session Replay

- **Error sessions**: Filter by `client_error` or `mutation_error` events
- **Rage clicks**: Filter by `$rageclick` event — UX frustration signal
- **Drop-off sessions**: Sessions that hit the landing page but never sign in
- **Dashboard confusion**: Sessions with multiple rapid `dashboard_tab_changed` events

---

## 6. Feature Flags

Feature flags enable progressive rollouts and targeted feature delivery.

### Recommended Flags

| Flag Key | Type | Use Case |
|---|---|---|
| `enable-markdown-preview` | Boolean | Toggle enhanced Markdown rendering |
| `enable-custom-domains` | Boolean | Gate custom domain feature (future) |
| `enable-collaboration` | Boolean | Gate multi-user collaboration (future) |
| `max-publication-size` | Multivariate | Test different max content sizes (512KB, 1MB, 5MB) |
| `dashboard-layout` | Multivariate | Test different dashboard layouts |
| `show-usage-stats` | Boolean | Show API usage statistics to users |

### Integration Pattern

```typescript
import { useFeatureFlagEnabled } from 'posthog-js/react';

function Dashboard() {
  const showStats = useFeatureFlagEnabled('show-usage-stats');
  // Conditionally render usage stats panel
}
```

---

## 7. Experiments (A/B Tests)

Experiments build on feature flags to run statistically rigorous A/B tests.

### Recommended Experiments

| Experiment | Hypothesis | Metric | Variants |
|---|---|---|---|
| **CTA Copy Test** | "Publish now" converts better than "Start publishing" | `sign_in_started` rate | Control: "Start publishing", Test: "Publish now" |
| **Social Proof** | Showing usage count increases signups | `user_signed_in` rate | Control: no count, Test: "Join 500+ developers" |
| **Onboarding Flow** | Guided setup increases first publication rate | `publication_created` within 24h | Control: dashboard only, Test: step-by-step wizard |
| **Default Visibility** | Public-by-default increases sharing | `publication_link_copied` rate | Control: public default, Test: private default |

---

## 8. Surveys

PostHog surveys collect qualitative feedback at the right moment.

### Recommended Surveys

| Survey | Trigger | Type | Questions |
|---|---|---|---|
| **NPS** | After 7th day of usage | Rating (0-10) | "How likely are you to recommend Pub?" |
| **First Pub Feedback** | After `publication_created` (first time) | Open text | "What did you just publish? What's your use case?" |
| **Churn Risk** | User hasn't visited in 14 days (via cohort) | Multiple choice | "What's preventing you from using Pub?" |
| **Feature Request** | Dashboard, monthly | Open text | "What feature would make Pub more useful?" |
| **API Experience** | After 5th `api_key_created` event... wait: after 5th API call via CLI | Rating (1-5) | "How easy was it to integrate Pub into your workflow?" |

---

## 9. Actions

Actions are named combinations of events/conditions used as building blocks for
insights, funnels, and cohorts.

### Defined Actions

| Action Name | Definition | Purpose |
|---|---|---|
| **Signed Up** | `user_signed_in` (first time for a person) | Top-of-funnel metric |
| **Published Content** | `publication_created` | Core activation metric |
| **Shared Publication** | `publication_link_copied` OR `publication_visibility_toggled` where `newVisibility = public` | Virality signal |
| **Used API** | `api_key_created` | Developer adoption |
| **Engaged Session** | Session with ≥ 3 distinct events | Quality session metric |
| **Error Encountered** | `client_error` OR `mutation_error` | Reliability tracking |
| **Landing Page Conversion** | `cta_clicked` on landing page | Marketing effectiveness |

---

## 10. Cohorts

Cohorts are reusable user segments for filtering insights and targeting features.

### Defined Cohorts

| Cohort | Criteria | Use |
|---|---|---|
| **New Users (7d)** | First seen within last 7 days | Monitor onboarding success |
| **Power Users** | ≥ 10 `publication_created` events in last 30 days | Feature feedback, beta access |
| **API Users** | Has `api_key_created` event | Developer-specific analytics |
| **Dormant Users** | No events in last 30 days, but active in prior 30 | Churn prevention targeting |
| **Error-Affected** | Has `client_error` or `mutation_error` in last 7 days | Proactive support outreach |
| **Landing Visitors** | Visited `/` but never `user_signed_in` | Conversion optimization |
| **GitHub Auth** | `sign_in_started` with `provider = github` | Auth provider analysis |
| **Google Auth** | `sign_in_started` with `provider = google` | Auth provider analysis |

---

## 11. Insights (Charts)

Insights are individual visualizations. Below are the key metrics to track.

### 11.1 Trends

| Insight | Event | Breakdown | Chart Type |
|---|---|---|---|
| Daily Active Users | Any event (unique persons) | — | Line |
| Publications Created / Day | `publication_created` | `contentType` | Stacked bar |
| Auth Provider Split | `sign_in_started` | `provider` | Pie |
| Content Type Distribution | `publication_viewed` | `contentType` | Pie |
| CTA Click Rate | `cta_clicked` | `location` | Bar |
| Error Rate | `client_error` + `mutation_error` | `error_name` | Line |
| API Key Adoption | `api_key_created` | — | Line |
| Page Views by Route | `$pageview` | `path` | Bar |

### 11.2 Key Metrics (Numbers)

| Metric | Calculation |
|---|---|
| Total Publications | Count of `publication_created` (all time) |
| WAU | Unique persons with any event in last 7 days |
| MAU | Unique persons with any event in last 30 days |
| Signup Rate | `user_signed_in` / `$pageview` on `/login` |
| Activation Rate | Users with `publication_created` / `user_signed_in` |
| API Adoption Rate | Users with `api_key_created` / `user_signed_in` |
| Error Rate | (`client_error` + `mutation_error`) / total events |

---

## 12. Funnels

Funnels show conversion through a sequence of steps.

### 12.1 Signup Funnel

```
Landing ($pageview on /)
  → CTA Clicked (cta_clicked)
    → Login Page ($pageview on /login)
      → Sign-In Started (sign_in_started)
        → Signed In (user_signed_in)
```

**Breakdown**: by `provider`, by `$device_type`, by `$referring_domain`

### 12.2 Activation Funnel

```
Signed In (user_signed_in)
  → Dashboard Visited ($pageview on /dashboard)
    → API Key Created (api_key_created)
      → First Publication (publication_created)
```

**Conversion window**: 7 days

### 12.3 Content Sharing Funnel

```
Publication Created (publication_created)
  → Made Public (publication_visibility_toggled where newVisibility = public)
    → Link Copied (publication_link_copied)
      → External View (publication_viewed where isOwner = false)
```

### 12.4 API Key Usage Funnel

```
Dashboard Tab Changed to Keys (dashboard_tab_changed where tab = keys)
  → API Key Created (api_key_created)
    → API Key Copied (api_key_copied)
      → Publication Created via API (publication_created where source = api)
```

---

## 13. Retention

### 13.1 Weekly Retention

- **Metric**: Return visit to `/dashboard` in subsequent weeks
- **Cohort**: Users who signed up each week
- **Target**: 40%+ Week 1 retention, 25%+ Week 4 retention

### 13.2 Feature Retention

- **Publishing retention**: Users who published in Week N and also published in Week N+1
- **API retention**: Users who used the API in Week N and also in Week N+1

### 13.3 Unbounded Retention

- Track "ever came back" rate — % of signups who return at any point after Day 1
- Useful for a tool like Pub where usage may be sporadic (project-based)

---

## 14. Paths

User path analysis shows the actual navigation patterns.

### Key Path Analyses

| Start Point | End Point | Question |
|---|---|---|
| `/` (landing) | `user_signed_in` | What paths lead to signup? |
| `/dashboard` | `publication_created` | What do users do before publishing? |
| Any error event | Next event | What do users do after encountering an error? |
| `/login` | Drop-off | Where do users abandon the login flow? |

### Recommended Filters

- **New users only**: First-time visitors in the last 30 days
- **By device type**: Mobile vs desktop path differences
- **By referrer**: Paths from organic search vs direct vs referral

---

## 15. Lifecycle

PostHog Lifecycle analysis categorizes users into:

- **New**: First event this period
- **Returning**: Active this period and last period
- **Resurrecting**: Active this period, inactive last period
- **Dormant**: Inactive this period, active last period

### Configuration

- **Period**: Weekly
- **Event**: Any event (or specifically `$pageview`)
- **Use**: Monitor the balance of new vs returning users. A healthy product has
  growing "Returning" while "Dormant" stays flat or shrinks relative to total.

---

## 16. Dashboards

### 16.1 Executive Overview

> High-level product health at a glance.

| Widget | Type | Content |
|---|---|---|
| DAU / WAU / MAU | Number + trend sparkline | Unique users |
| Signups this week | Number | `user_signed_in` count |
| Publications this week | Number | `publication_created` count |
| Signup Funnel | Funnel | Landing → CTA → Login → Sign In |
| Activation Rate | Number | Users who published / users who signed up (7d) |
| Error Rate | Line chart | `client_error` + `mutation_error` over time |
| Lifecycle | Stacked bar | New / Returning / Resurrecting / Dormant |
| Top Referrers | Table | `$referring_domain` by signups |

### 16.2 Acquisition & Conversion

> Landing page performance and signup conversion.

| Widget | Type | Content |
|---|---|---|
| Landing Page Views | Line | `$pageview` where path = `/` |
| CTA Click Distribution | Bar | `cta_clicked` breakdown by `cta` name |
| Signup Funnel | Funnel | Full 5-step funnel |
| Conversion by Device | Funnel | Signup funnel broken down by `$device_type` |
| Conversion by Referrer | Funnel | Signup funnel broken down by `$referring_domain` |
| Auth Provider Preference | Pie | `sign_in_started` by `provider` |
| Landing → Signup Time | Distribution | Time from first pageview to `user_signed_in` |

### 16.3 Activation & Engagement

> Understanding what users do after signing up.

| Widget | Type | Content |
|---|---|---|
| Activation Funnel | Funnel | Signup → Dashboard → API Key → First Publish |
| Time to First Publish | Distribution | Time from signup to first `publication_created` |
| Publications per User | Histogram | Distribution of publication count per user |
| Content Type Breakdown | Pie | `publication_created` by `contentType` |
| API Key Adoption | Line | `api_key_created` trend |
| Dashboard Tab Usage | Bar | `dashboard_tab_changed` by `tab` |
| Feature Usage | Bar | Count of each custom event type |

### 16.4 Content & Sharing

> How content flows through the platform.

| Widget | Type | Content |
|---|---|---|
| Publications Created | Line | `publication_created` daily trend |
| Public vs Private | Stacked area | `publication_created` by `isPublic` |
| Visibility Toggles | Line | `publication_visibility_toggled` trend |
| Sharing Funnel | Funnel | Created → Made Public → Link Copied → External View |
| Most Viewed Slugs | Table | `publication_viewed` by `slug` (top 20) |
| Content Views by Type | Bar | `publication_viewed` by `contentType` |
| Raw Content Access | Line | `publication_raw_viewed` trend |

### 16.5 Retention & Lifecycle

> Long-term user health.

| Widget | Type | Content |
|---|---|---|
| Weekly Retention | Retention matrix | Return visits by signup cohort |
| Publishing Retention | Retention matrix | Published again by first-publish cohort |
| Lifecycle | Stacked bar | New / Returning / Resurrecting / Dormant |
| Churn Risk | Cohort size | "Dormant Users" cohort count over time |
| Unbounded Retention | Line | % of signups who ever return |
| Session Duration | Distribution | Average session length trend |
| Sessions per User | Line | Mean sessions per user per week |

### 16.6 Reliability & Errors

> Technical health from the user's perspective.

| Widget | Type | Content |
|---|---|---|
| Error Rate | Line | (`client_error` + `mutation_error`) / total events |
| Errors by Type | Bar | `client_error` breakdown by `error_name` |
| Mutation Errors | Table | `mutation_error` by `mutation` name (top 10) |
| Error-Affected Users | Number | Unique persons with error events (7d) |
| Rage Clicks | Line | `$rageclick` trend |
| Session Replays with Errors | Link | Filter session recordings by error events |
| Error Impact on Retention | Comparison | Retention of error-affected vs non-affected users |

### 16.7 API & Developer Experience

> Health of the API / CLI publishing pipeline.

| Widget | Type | Content |
|---|---|---|
| API Key Creation | Line | `api_key_created` trend |
| API-Published Content | Line | `publication_created` where `source = api` or `source = cli` |
| API Usage Funnel | Funnel | Key Created → Key Copied → First API Publish |
| API vs Dashboard Publishes | Stacked bar | `publication_created` by `source` |
| API Key Lifecycle | Table | Keys created vs deleted over time |

---

## Implementation Checklist

- [x] PostHog JS SDK installed (`posthog-js`)
- [x] Provider wrapper in root component (`PostHogProvider`)
- [x] `posthog.init()` with correct API key and host
- [x] Auto-capture enabled (pageviews, clicks, form submissions)
- [x] SPA page view tracking on route change
- [x] Custom event tracking in `src/lib/analytics.ts`
- [x] All authentication events instrumented
- [x] All publication lifecycle events instrumented
- [x] All API key events instrumented
- [x] All CTA click events instrumented
- [x] Dashboard interaction events instrumented
- [x] Error events captured (dual-reporting to PostHog + Sentry)
- [x] Session recording configured
- [ ] `posthog.identify()` called on authentication (requires Convex user ID access)
- [ ] Feature flags configured in PostHog dashboard
- [ ] Cohorts created in PostHog dashboard
- [ ] Dashboards created in PostHog dashboard
- [ ] Surveys configured and targeted
- [ ] A/B experiments designed and launched
