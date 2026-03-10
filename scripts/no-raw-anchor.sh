#!/usr/bin/env bash
# Finds raw <a> tags in .tsx files that should use <Link> from @tanstack/react-router.
# Allowed: download links (<a ... download=), in-page anchors (href="#"), external links (href="http")
set -euo pipefail

SEARCH_DIR="${1:-web/src/}"
violations=$(grep -rn --include='*.tsx' '<a ' "$SEARCH_DIR" \
  | grep -v 'download=' \
  | grep -v 'href="#' \
  | grep -v 'href="http' \
  | grep -v '// no-raw-anchor-ok' \
  | grep -v '{/\* no-raw-anchor-ok' \
  || true)

if [ -n "$violations" ]; then
  echo "ERROR: Found raw <a> tags that should use <Link> from @tanstack/react-router."
  echo "For external links, use telegramOpenLink(). For downloads, add a download= attribute."
  echo "To allow a specific usage, add a '// no-raw-anchor-ok' or '{/* no-raw-anchor-ok */}' comment on the same line."
  echo ""
  echo "$violations"
  exit 1
fi
