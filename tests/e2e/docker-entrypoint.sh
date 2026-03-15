#!/usr/bin/env bash
set -euo pipefail

# --- Read admin key from shared volume ---
echo "[e2e] Waiting for admin key..."
for i in $(seq 1 60); do
  if [ -s /shared/admin-key ]; then
    break
  fi
  sleep 1
done
if [ ! -s /shared/admin-key ]; then
  echo "[e2e] ERROR: Admin key not found after 60s"
  exit 1
fi
ADMIN_KEY=$(tr -d '[:space:]' < /shared/admin-key)
export ADMIN_KEY
echo "[e2e] Admin key loaded."

# --- Background process cleanup ---
VITE_PID=""
PROXY_PID=""
cleanup() {
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- Start test proxy (combines HTTP + WS ports) ---
echo "[e2e] Starting test proxy..."
npx tsx tests/e2e/helpers/test-proxy.ts &
PROXY_PID=$!

# --- Start Vite dev server (browser connects to Convex via the local proxy) ---
echo "[e2e] Starting Vite dev server..."
cd /app/web && VITE_CONVEX_URL="http://localhost:3212" npx vite dev --host 0.0.0.0 --port 3000 &
VITE_PID=$!
cd /app

# --- Wait for Vite ---
for i in $(seq 1 60); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo "[e2e] Vite dev server ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "[e2e] ERROR: Vite dev server did not start within 120s."
    exit 1
  fi
  sleep 2
done

# --- Run Playwright tests ---
echo "[e2e] Running Playwright tests..."
exec npx playwright test --config tests/e2e/playwright.config.ts "$@"
