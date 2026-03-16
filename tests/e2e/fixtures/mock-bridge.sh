#!/usr/bin/env bash
# Mock bridge for E2E testing.
# Receives messages as $1 (openclaw-like protocol).
# Responds via `pub write` using the daemon's IPC socket.
#
# Canvas responses can be configured by placing HTML files in
# $PUB_CONFIG_DIR/bridge-canvas-response.html — when present,
# "update canvas" uses that file instead of the default HTML.
set -euo pipefail

# The daemon sets PUB_DAEMON_MODE=1 in its env, which child processes inherit.
# We must unset it so `$PUB write` runs the CLI, not the daemon entry point.
unset PUB_DAEMON_MODE

PUB="${PUB_CLI_BIN:-pub}"
MSG="$1"

# Respond to connectivity probe (preflight pong check)
if echo "$MSG" | grep -q 'pub write "pong"'; then
  "$PUB" write "pong"
  exit 0
fi

# Respond to chat messages
if echo "$MSG" | grep -q "User message:"; then
  USER_TEXT=$(echo "$MSG" | sed -n '/User message:/{n;p;}' | head -1)
  if [ -n "$USER_TEXT" ]; then
    case "$USER_TEXT" in
      "update canvas")
        CANVAS_FILE="${PUB_CONFIG_DIR:-}/bridge-canvas-response.html"
        if [ -f "$CANVAS_FILE" ]; then
          "$PUB" write -c canvas -f "$CANVAS_FILE"
        else
          TMPHTML=$(mktemp /tmp/pub-canvas-XXXXXX.html)
          echo '<html><body><h1 id="status">canvas-updated</h1></body></html>' > "$TMPHTML"
          "$PUB" write -c canvas -f "$TMPHTML"
          rm -f "$TMPHTML"
        fi
        "$PUB" write "canvas updated"
        ;;
      *)
        "$PUB" write "echo: $USER_TEXT"
        ;;
    esac
  fi
  exit 0
fi

# Session briefing or unrecognized — acknowledge silently
# Optional delay to simulate slow agent startup (e.g. MOCK_BRIDGE_BRIEFING_DELAY=10)
if [ -n "${MOCK_BRIDGE_BRIEFING_DELAY:-}" ]; then
  sleep "$MOCK_BRIDGE_BRIEFING_DELAY"
fi
exit 0
