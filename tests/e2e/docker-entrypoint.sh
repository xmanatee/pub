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
MOCK_LLM_PID=""
MOCK_RELAY_PID=""
TUNNEL_RELAY_PID=""
cleanup() {
  [ -n "$VITE_PID" ] && kill "$VITE_PID" 2>/dev/null || true
  [ -n "$PROXY_PID" ] && kill "$PROXY_PID" 2>/dev/null || true
  [ -n "$MOCK_LLM_PID" ] && kill "$MOCK_LLM_PID" 2>/dev/null || true
  [ -n "$MOCK_RELAY_PID" ] && kill "$MOCK_RELAY_PID" 2>/dev/null || true
  [ -n "$TUNNEL_RELAY_PID" ] && kill "$TUNNEL_RELAY_PID" 2>/dev/null || true
}
trap cleanup EXIT

# --- Start mock LLM server (Anthropic Messages API stub) ---
echo "[e2e] Starting mock LLM server..."
node tests/e2e/mock-llm/server.mjs &
MOCK_LLM_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:4100/admin/health > /dev/null 2>&1; then
    echo "[e2e] Mock LLM server ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Mock LLM server did not start within 30s."
    exit 1
  fi
  sleep 1
done

# --- Start mock relay server (claude-channel bridge) ---
echo "[e2e] Starting mock relay server..."
export MOCK_RELAY_SOCKET="${MOCK_RELAY_SOCKET:-/tmp/pub-mock-relay.sock}"
node tests/e2e/mock-relay/server.mjs &
MOCK_RELAY_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:4101/admin/health > /dev/null 2>&1; then
    echo "[e2e] Mock relay server ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Mock relay server did not start within 30s."
    exit 1
  fi
  sleep 1
done

# --- Start tunnel relay server (tunnel proxy E2E) ---
echo "[e2e] Starting tunnel relay server..."
node tests/e2e/mock-tunnel-relay/server.mjs &
TUNNEL_RELAY_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:4103/admin/health > /dev/null 2>&1; then
    echo "[e2e] Tunnel relay server ready."
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[e2e] ERROR: Tunnel relay server did not start within 30s."
    exit 1
  fi
  sleep 1
done

# --- Set OpenClaw env vars for all child processes ---
export OPENCLAW_STATE_DIR="/home/node/.openclaw"
export OPENCLAW_WORKSPACE="/home/node/.openclaw/workspace"
export OPENCLAW_LOCAL="1"
export HOME="/home/node"

# --- Claude Code / Claude SDK env vars (point at mock LLM) ---
export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-http://localhost:4100}"
export ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-test-key-not-real}"
export DISABLE_TELEMETRY="1"
export DISABLE_AUTOUPDATER="1"
export DISABLE_ERROR_REPORTING="1"

# --- Mock command (openclaw-like bridge) ---
export MOCK_COMMAND_RULES_FILE="${MOCK_COMMAND_RULES_FILE:-/tmp/mock-command-rules.json}"
export MOCK_COMMAND_PATH="${MOCK_COMMAND_PATH:-/app/tests/e2e/mock-bridge-command/command.mjs}"

# --- Start test proxy (combines HTTP + WS ports) ---
echo "[e2e] Starting test proxy..."
node tests/e2e/helpers/test-proxy.mjs &
PROXY_PID=$!

# --- Start Vite dev server (browser connects to Convex via the local proxy) ---
echo "[e2e] Starting Vite dev server..."
cd /app/web && VITE_CONVEX_URL="http://localhost:3212" VITE_SANDBOX_ORIGIN="/__sandbox__" npx vite dev --host 0.0.0.0 --port 3000 &
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
