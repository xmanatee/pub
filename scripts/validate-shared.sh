#!/usr/bin/env bash
# Validates that every non-test file in shared/ is imported by 2+ top-level
# consumers (web, cli, convex). Files only imported by other shared/ files
# (internal utilities) are exempt.
set -euo pipefail

SHARED_DIR="shared"
EXIT_CODE=0

for file in "$SHARED_DIR"/*.ts; do
  [[ "$file" == *.test.ts ]] && continue

  name=$(basename "$file" .ts)
  consumers=()

  # web — uses @shared/<name> alias
  if grep -rq --include='*.ts' --include='*.tsx' "from \"@shared/$name\"" web/src/ 2>/dev/null; then
    consumers+=(web)
  fi

  # cli — uses relative paths (e.g. ../../../../shared/<name>)
  if grep -rq --include='*.ts' "from \".*shared/$name\"" cli/src/ 2>/dev/null; then
    consumers+=(cli)
  fi

  # convex — uses relative paths (e.g. ../shared/<name>)
  if grep -rq --include='*.ts' "from \".*shared/$name\"" convex/ 2>/dev/null; then
    consumers+=(convex)
  fi

  # Exempt internal utilities imported by other shared/ source files
  internal=0
  while IFS= read -r importer; do
    [[ "$importer" == "$file" ]] && continue
    [[ "$importer" == *.test.ts ]] && continue
    internal=1
    break
  done < <(grep -rl --include='*.ts' "from \"\\./$name\"" "$SHARED_DIR/" 2>/dev/null || true)

  if [ "${#consumers[@]}" -ge 2 ] || [ "$internal" -gt 0 ]; then
    continue
  fi

  if [ "${#consumers[@]}" -eq 0 ]; then
    echo "FAIL: $file — not imported by any consumer"
  else
    echo "FAIL: $file — only used by ${consumers[0]} (should live there instead)"
  fi
  EXIT_CODE=1
done

if [ "$EXIT_CODE" -eq 0 ]; then
  echo "OK: All shared/ files are properly shared between 2+ consumers."
fi

exit $EXIT_CODE
