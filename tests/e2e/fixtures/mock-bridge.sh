#!/usr/bin/env bash
# Mock bridge for E2E testing.
# Receives messages as $1 (openclaw-like protocol).
# Responds via `pub write` using the daemon's IPC socket.
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
  # Extract user text: next non-empty line after "User message:"
  USER_TEXT=$(echo "$MSG" | sed -n '/User message:/{n;p;}' | head -1)
  if [ -n "$USER_TEXT" ]; then
    "$PUB" write "echo: $USER_TEXT"
  fi
  exit 0
fi

# Session briefing or unrecognized — acknowledge silently
exit 0
