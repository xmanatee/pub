# Stage 1: Build CLI binary and generate Convex types
FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install -g bun

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY cli/package.json ./cli/
RUN pnpm install --frozen-lockfile

COPY . .

# Generate Convex types (offline, placeholder URL — may partially fail, that's OK)
RUN npx convex codegen --admin-key "build-placeholder" --url "http://placeholder:3210" 2>/dev/null || true

# Copy the correct binary for the target architecture
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ]; then \
      export PUB_CLI_BUILD_TARGETS="linux-arm64"; \
    else \
      export PUB_CLI_BUILD_TARGETS="linux-x64"; \
    fi && \
    cd cli && bun run build-binary.ts

RUN if [ "$TARGETARCH" = "arm64" ]; then \
      cp cli/dist-bin/pub-linux-arm64 cli/dist-bin/pub-target; \
    else \
      cp cli/dist-bin/pub-linux-x64 cli/dist-bin/pub-target; \
    fi

# Stage 1b: Pull OpenClaw from its official Docker image (pinned 2026-03-23)
FROM ghcr.io/openclaw/openclaw@sha256:b86307b257ff42a81353b0d6b3963ccd09bbd9eb1916077d1833a967763c5bc7 AS openclaw-source

# Stage 2: Test runner (Vite + proxy + CLI + OpenClaw + mock LLM + Playwright — all in one)
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS test-runner
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY cli/package.json ./cli/
RUN pnpm install --frozen-lockfile

COPY . .

# Copy generated Convex types from builder
COPY --from=builder /app/convex/_generated ./convex/_generated

# Copy prebuilt CLI binary
COPY --from=builder /app/cli/dist-bin/pub-target /usr/local/bin/pub
RUN chmod +x /usr/local/bin/pub

# Copy OpenClaw from its official image
COPY --from=openclaw-source /app /opt/openclaw
# Create a wrapper script so `openclaw` is on PATH
RUN printf '#!/bin/sh\nexec node /opt/openclaw/dist/index.js "$@"\n' > /usr/local/bin/openclaw && \
    chmod +x /usr/local/bin/openclaw

# Set up OpenClaw config (mock LLM provider, headless tool execution)
COPY tests/e2e/openclaw-config/openclaw.json /home/node/.openclaw/openclaw.json
COPY tests/e2e/openclaw-config/workspace/ /home/node/.openclaw/workspace/
COPY tests/e2e/openclaw-config/agents/ /home/node/.openclaw/agents/

# Install Playwright browser
RUN npx playwright install chromium

# Entrypoint starts mock LLM, Vite, proxy, reads admin key, then runs Playwright
COPY tests/e2e/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
