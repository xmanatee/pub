#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Each local run owns its containers and volumes, including concurrent runs.
compose=(docker compose --project-name "pub-e2e-$$" -f tests/e2e/docker-compose.yml)
cleanup() {
  local result=$?
  trap - EXIT
  "${compose[@]}" down --volumes --remove-orphans || {
    if [ "$result" -eq 0 ]; then result=1; fi
  }
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${compose[@]}" run --build --rm \
  -e "E2E_SUITE=${E2E_SUITE:-fullstack}" -e UPDATE_SNAPSHOTS test-runner
