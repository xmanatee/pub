#!/usr/bin/env bash
set -euo pipefail

# Full-stack E2E tests — hybrid local mode.
# Starts Convex backend in Docker, test proxy, Vite dev server locally,
# then runs Playwright which handles deploy + seeding via global-setup.ts.

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/tests/e2e/docker-compose.yml"
CONVEX_URL="http://localhost:3210"
CONVEX_SITE_URL="http://localhost:3211"
PROXY_URL="http://localhost:3212"
VITE_PID=""
PROXY_PID=""

cleanup() {
  echo "[e2e] Cleaning up..."
  if [ -n "$VITE_PID" ] && kill -0 "$VITE_PID" 2>/dev/null; then
    kill "$VITE_PID" 2>/dev/null || true
    wait "$VITE_PID" 2>/dev/null || true
  fi
  if [ -n "$PROXY_PID" ] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
  rm -f /tmp/pub-e2e-state.json
  pkill -f 'pub-daemon|pub.*start.*--agent-name' 2>/dev/null || true
  rm -f /tmp/pub-agent-*.sock 2>/dev/null || true
  rm -rf /tmp/pub-e2e-config-* 2>/dev/null || true
  echo "[e2e] Done."
}
trap cleanup EXIT

# 1. Start Convex backend in Docker
echo "[e2e] Starting Convex backend..."
docker compose -f "$COMPOSE_FILE" up -d convex-backend

# 2. Wait for backend
echo "[e2e] Waiting for Convex backend..."
for i in $(seq 1 30); do
  if curl -sf "$CONVEX_URL/version" > /dev/null 2>&1; then
    echo "[e2e] Convex backend ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Convex backend did not start."
    exit 1
  fi
  sleep 2
done

# 3. Generate admin key
echo "[e2e] Generating admin key..."
CONTAINER_ID=$(docker ps -qf 'ancestor=ghcr.io/get-convex/convex-backend:latest')
ADMIN_KEY=$(docker exec "$CONTAINER_ID" ./generate_admin_key.sh)

# 4. Start test proxy (combines HTTP actions + WebSocket on one port)
echo "[e2e] Starting test proxy..."
npx tsx "$SCRIPT_DIR/tests/e2e/helpers/test-proxy.ts" &
PROXY_PID=$!
sleep 1
echo "[e2e] Test proxy ready (pid=$PROXY_PID)."

# 5. Start Vite dev server
echo "[e2e] Starting Vite dev server..."
cd "$SCRIPT_DIR"
VITE_CONVEX_URL="$CONVEX_URL" pnpm dev:web &
VITE_PID=$!

for i in $(seq 1 30); do
  if curl -sf "http://localhost:3000" > /dev/null 2>&1; then
    echo "[e2e] Vite dev server ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Vite dev server did not start."
    exit 1
  fi
  sleep 2
done

# 6. Run Playwright (global-setup.ts handles deploy, env vars, CLI build, seeding)
echo "[e2e] Running Playwright tests..."
CONVEX_URL="$CONVEX_URL" \
CONVEX_SITE_URL="$CONVEX_SITE_URL" \
CONVEX_PROXY_URL="$PROXY_URL" \
ADMIN_KEY="$ADMIN_KEY" \
BASE_URL="http://localhost:3000" \
IS_TEST=true \
npx playwright test --config tests/e2e/playwright.config.ts "$@"
