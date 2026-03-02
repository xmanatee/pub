# Pub

Publish static content (HTML, Markdown, text) with shareable URLs at [pub.blue](https://pub.blue).

## Features

- Publish HTML, Markdown, and plain text with a unique URL
- Web dashboard with pub management, view counts, and expiry badges
- Public explore feed for discovering published content
- CLI tool ([`pubblue`](https://www.npmjs.com/package/pubblue)) for publishing from the terminal
- Claude Code skill for AI-assisted publishing
- API key authentication for programmatic access
- Expiring pubs (1h, 24h, 7d, etc.)
- RSS feeds per user
- Open Graph preview images
- Telegram account linking

## Quick Start

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- A [Convex](https://convex.dev) account

### Setup

```bash
# Install dependencies
pnpm install

# Initialize Convex (creates a new project)
npx convex dev --once --configure=new

# Copy env example and fill in your Convex URL
cp .env.local.example .env.local

# Set OAuth secrets in Convex (optional, for login)
npx convex env set AUTH_GITHUB_ID <your-github-oauth-id>
npx convex env set AUTH_GITHUB_SECRET <your-github-oauth-secret>
npx convex env set AUTH_GOOGLE_ID <your-google-oauth-id>
npx convex env set AUTH_GOOGLE_SECRET <your-google-oauth-secret>

# Start dev server
pnpm dev
```

### CLI

```bash
# Install globally
pnpm add -g pubblue

# Or use directly
pnpm dlx pubblue

# Configure with your API key (generate one from the dashboard)
pubblue configure

# Publish a file
pubblue create my-page.html --public

# Publish with expiry
pubblue create notes.md --expires 24h
```

## Development

```bash
pnpm dev          # Start web + Convex backend
pnpm lint         # Biome check + TypeScript
pnpm test         # Run tests
pnpm build        # Production build
pnpm check        # All of the above
```

## Tech Stack

- **Frontend**: React 19, TanStack Router, Tailwind v4, Radix UI
- **Backend**: [Convex](https://convex.dev) (database, serverless functions, file serving)
- **Auth**: GitHub & Google OAuth via `@convex-dev/auth`
- **CLI**: Commander.js, published as [`pubblue`](https://www.npmjs.com/package/pubblue)
- **Observability**: Sentry (errors), PostHog (analytics)

## Project Structure

```
src/           Frontend (TanStack Router file-based routes)
convex/        Backend (Convex schema, functions, HTTP routes)
cli/           CLI tool (pubblue)
skills/        Claude Code skill
```

See [AGENTS.md](AGENTS.md) for detailed architecture documentation.

## License

[MIT](LICENSE)
