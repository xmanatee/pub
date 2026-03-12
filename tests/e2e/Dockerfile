# Stage 1: Base with dependencies
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

# Stage 2: Frontend dev server
FROM base AS frontend
COPY . .
# Generate Convex types (offline codegen)
RUN pnpm convex codegen --admin-key "test-admin-key" --url "http://convex-backend:3210" 2>/dev/null || true
EXPOSE 3000
CMD ["pnpm", "dev:web"]

# Stage 3: Test runner
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS test-runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm playwright install chromium
CMD ["pnpm", "playwright", "test", "--config", "tests/e2e/playwright.config.ts"]
