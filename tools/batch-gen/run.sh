#!/usr/bin/env bash
set -euo pipefail

unset CLAUDECODE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCKFILE="$SCRIPT_DIR/.run.lock"
OUTPUT_DIR="$SCRIPT_DIR/output"
PROMPTS_DIR="$SCRIPT_DIR/prompts"
STATE_FILE="$OUTPUT_DIR/state.json"
LOGS_DIR="$OUTPUT_DIR/logs"
PUBS_DIR="$OUTPUT_DIR/pubs"

R='\033[0;31m' G='\033[0;32m' Y='\033[0;33m' B='\033[0;34m'
C='\033[0;36m' DIM='\033[2m' BOLD='\033[1m' RST='\033[0m'
OK='✓' FAIL='✗' WARN='⚠'

PHASE="all"
COUNT=50
MODEL="sonnet"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase) PHASE="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --status) PHASE="status"; shift ;;
    *) echo "Usage: $0 [--phase 1|2|3|all] [--count N] [--model MODEL] [--status]"; exit 1 ;;
  esac
done

ts() { date +%H:%M:%S; }
log()      { printf "  ${DIM}%s${RST}  %b\n" "$(ts)" "$1"; }
log_ok()   { printf "  ${DIM}%s${RST}  ${G}${OK}${RST} %b\n" "$(ts)" "$1"; }
log_warn() { printf "  ${DIM}%s${RST}  ${Y}${WARN}${RST} %b\n" "$(ts)" "$1"; }
log_fail() { printf "  ${DIM}%s${RST}  ${R}${FAIL}${RST} %b\n" "$(ts)" "$1"; }

elapsed() {
  local diff=$(( $(date +%s) - $1 ))
  if   (( diff < 60 ));   then echo "${diff}s"
  elif (( diff < 3600 )); then echo "$(( diff/60 ))m $(( diff%60 ))s"
  else echo "$(( diff/3600 ))h $(( diff%3600/60 ))m"
  fi
}

progress_bar() {
  local done=$1 total=$2 w=20
  local filled=$(( total > 0 ? done * w / total : 0 ))
  local empty=$(( w - filled ))
  printf "${G}"
  for (( i=0; i<filled; i++ )); do printf '█'; done
  printf "${DIM}"
  for (( i=0; i<empty; i++ )); do printf '░'; done
  printf "${RST} %s/%s" "$done" "$total"
}

phase_header() {
  printf "\n${BOLD}${C}━━━ Phase %s ${RST}${BOLD}%s ━━━${RST}\n\n" "$1" "$2"
}

phase_done() {
  printf "\n  ${G}${OK}${RST} Phase %s complete ${DIM}(%s)${RST}\n" "$1" "$(elapsed "$2")"
}

item_progress() {
  printf "  ${DIM}%s${RST}  " "$(ts)"
  progress_bar "$1" "$2"
  printf "  ${B}%-12s${RST} %s\n" "$3" "$4"
}

read_state() {
  if [[ -f "$STATE_FILE" ]]; then cat "$STATE_FILE"
  else echo '{"ideas":[]}'; fi
}

write_state() { echo "$1" > "$STATE_FILE"; }

set_phase() {
  local state
  state=$(read_state)
  write_state "$(echo "$state" | jq --arg id "$1" --arg phase "$2" \
    '(.ideas[] | select(.id == $id)).phase = $phase')"
}

get_phase() {
  read_state | jq -r --arg id "$1" '.ideas[] | select(.id == $id) | .phase'
}

count_in_phase() {
  read_state | jq --arg p "$1" '[.ideas[] | select(.phase == $p)] | length'
}

count_past_phase() {
  read_state | jq -r --arg p "$1" \
    '[.ideas[] | select(.phase as $ph | ($p | split("|")) | index($ph))] | length'
}

total_ideas() { read_state | jq '.ideas | length'; }

ids_in_phases() {
  read_state | jq -r --arg p "$1" \
    '.ideas[] | select(.phase as $ph | ($p | split("|")) | index($ph)) | .id'
}

build_prompt() {
  local template_file="$1" placeholder="$2" content_file="$3"
  awk -v placeholder="$placeholder" '
    {
      idx = index($0, placeholder)
      if (idx > 0) {
        printf "%s", substr($0, 1, idx - 1)
        while ((getline line < "'"$content_file"'") > 0) { print line }
        print substr($0, idx + length(placeholder))
      } else { print }
    }
  ' "$template_file"
}

ensure_playwright() {
  if ! (cd "$SCRIPT_DIR" && node -e "require('playwright')" 2>/dev/null); then
    log "Installing playwright..."
    (cd "$SCRIPT_DIR" && npm install 2>&1)
    (cd "$SCRIPT_DIR" && npx playwright install chromium 2>&1)
  fi
}

publish_one() {
  local id="$1"
  local meta_file="$PUBS_DIR/$id/meta.json"
  local html_file="$PUBS_DIR/$id/index.html"
  local slug title

  slug=$(jq -r .slug "$meta_file")
  title=$(jq -r .title "$meta_file")
  if [[ -z "$slug" || "$slug" == "null" ]]; then log_fail "no slug"; return 1; fi

  if pub create --slug "$slug" --title "$title" "$html_file" 2>&1; then
    log_ok "published ${slug}"
  elif pub update "$slug" --file "$html_file" 2>&1; then
    log_ok "updated ${slug} (already existed)"
  else
    log_fail "publish failed (${slug})"
    return 1
  fi
  sleep 6
}

show_status() {
  local total
  total=$(total_ideas)

  printf "\n${BOLD}  Pub Batch Generator${RST}\n"
  printf "  ${DIM}state: %s${RST}\n\n" "$STATE_FILE"

  if [[ "$total" -eq 0 ]]; then
    printf "  ${DIM}No ideas generated yet.${RST}\n\n"
    return
  fi

  local p2_done p3_done
  p2_done=$(count_past_phase "published|testing|tested|reviewing|reviewed")
  p3_done=$(count_past_phase "reviewed")

  printf "  ${BOLD}%-22s${RST}  ${G}${OK} %s ideas${RST}\n" "Phase 1 — Ideation" "$total"
  printf "  ${BOLD}%-22s${RST}  " "Phase 2 — Build+Pub"
  progress_bar "$p2_done" "$total"; echo
  printf "  ${BOLD}%-22s${RST}  " "Phase 3 — Test+Review"
  progress_bar "$p3_done" "$total"; echo

  printf "\n  ${DIM}─── breakdown ───${RST}\n"
  for p in pending designing designed implementing implemented publishing published testing tested reviewing reviewed; do
    local c
    c=$(count_in_phase "$p")
    if [[ "$c" -gt 0 ]]; then
      local color="$DIM"
      case "$p" in
        designing|implementing|testing|reviewing|publishing) color="$Y" ;;
        reviewed) color="$G" ;;
      esac
      printf "  ${color}%-14s %3s${RST}\n" "$p" "$c"
    fi
  done
  echo
}

run_phase1() {
  local t_start; t_start=$(date +%s)
  phase_header 1 "Ideation"

  log "Launching Claude to generate ${BOLD}${COUNT}${RST} ideas..."

  local count_file; count_file=$(mktemp)
  printf '%s' "$COUNT" > "$count_file"
  local prompt
  prompt=$(build_prompt "$PROMPTS_DIR/ideation.md" "{{IDEA_COUNT}}" "$count_file")
  rm -f "$count_file"

  (cd "$OUTPUT_DIR" && claude -p "$prompt" \
    --model "$MODEL" --dangerously-skip-permissions \
    > "$LOGS_DIR/phase1-ideation.log" 2>&1) || true

  local ideas='[]'
  for idea_file in "$PUBS_DIR"/*/idea.md; do
    [[ -f "$idea_file" ]] || continue
    local dir_name
    dir_name=$(basename "$(dirname "$idea_file")")
    ideas=$(echo "$ideas" | jq --arg id "$dir_name" '. + [{"id": $id, "phase": "pending"}]')
  done
  write_state "$(echo "{}" | jq --argjson ideas "$ideas" '{ideas: $ideas}')"

  local count; count=$(echo "$ideas" | jq 'length')
  log_ok "${BOLD}${count}${RST} ideas generated"
  phase_done 1 "$t_start"
}

run_phase2() {
  local t_start; t_start=$(date +%s)
  phase_header 2 "Build + Publish"

  local ids; ids=$(ids_in_phases "pending|designing|designed|implementing|implemented|publishing")
  local total done_count=0
  total=$(echo "$ids" | grep -c . || true)

  if [[ "$total" -eq 0 ]]; then log "Nothing to do"; return; fi
  log "Processing ${BOLD}${total}${RST} ideas"

  for id in $ids; do
    done_count=$((done_count + 1))
    local phase; phase=$(get_phase "$id")

    if [[ "$phase" == "pending" || "$phase" == "designing" ]]; then
      local t_item; t_item=$(date +%s)
      item_progress "$done_count" "$total" "designing" "$id"

      local idea_file="$PUBS_DIR/$id/idea.md"
      if [[ ! -f "$idea_file" ]]; then log_fail "idea.md missing"; continue; fi

      set_phase "$id" "designing"
      (cd "$PUBS_DIR/$id" && claude -p \
        "$(build_prompt "$PROMPTS_DIR/design.md" "{{IDEA_CONTENT}}" "$idea_file")" \
        --model "$MODEL" --dangerously-skip-permissions \
        > "$LOGS_DIR/phase2-design-$id.log" 2>&1) || true

      if [[ -f "$PUBS_DIR/$id/design.md" ]]; then
        set_phase "$id" "designed"; phase="designed"
        log_ok "design ${DIM}$(elapsed "$t_item")${RST}"
      else
        log_fail "design.md not created"; continue
      fi
    fi

    if [[ "$phase" == "designed" || "$phase" == "implementing" ]]; then
      local t_item; t_item=$(date +%s)
      item_progress "$done_count" "$total" "implementing" "$id"

      local design_file="$PUBS_DIR/$id/design.md"
      if [[ ! -f "$design_file" ]]; then log_fail "design.md missing"; continue; fi

      set_phase "$id" "implementing"
      (cd "$PUBS_DIR/$id" && claude -p \
        "$(build_prompt "$PROMPTS_DIR/implement.md" "{{DESIGN_CONTENT}}" "$design_file")" \
        --model "$MODEL" --dangerously-skip-permissions \
        > "$LOGS_DIR/phase2-impl-$id.log" 2>&1) || true

      if [[ -f "$PUBS_DIR/$id/index.html" && -f "$PUBS_DIR/$id/meta.json" ]]; then
        set_phase "$id" "implemented"; phase="implemented"
        log_ok "implement ${DIM}$(elapsed "$t_item")${RST}"
      else
        log_fail "index.html or meta.json not created"; continue
      fi
    fi

    if [[ "$phase" == "implemented" || "$phase" == "publishing" ]]; then
      item_progress "$done_count" "$total" "publishing" "$id"
      set_phase "$id" "publishing"
      if publish_one "$id"; then
        set_phase "$id" "published"
      else
        set_phase "$id" "implemented"
      fi
    fi
  done

  phase_done 2 "$t_start"
}

run_phase3() {
  local t_start; t_start=$(date +%s)
  phase_header 3 "Test + Review"
  ensure_playwright

  local ids; ids=$(ids_in_phases "published|testing|tested|reviewing")
  local total done_count=0
  total=$(echo "$ids" | grep -c . || true)

  if [[ "$total" -eq 0 ]]; then log "Nothing to do"; return; fi
  log "Processing ${BOLD}${total}${RST} ideas"

  local mock_prompt; mock_prompt=$(cat "$PROMPTS_DIR/mock-gen.md")
  local review_prompt; review_prompt=$(cat "$PROMPTS_DIR/review.md")

  for id in $ids; do
    done_count=$((done_count + 1))
    local phase; phase=$(get_phase "$id")

    if [[ "$phase" == "published" || "$phase" == "testing" ]]; then
      local t_item; t_item=$(date +%s)
      item_progress "$done_count" "$total" "testing" "$id"

      if [[ ! -f "$PUBS_DIR/$id/index.html" ]]; then log_fail "index.html missing"; continue; fi

      set_phase "$id" "testing"

      log "  ${DIM}generating mocks...${RST}"
      (cd "$PUBS_DIR/$id" && claude -p "$mock_prompt" \
        --model "$MODEL" --dangerously-skip-permissions \
        > "$LOGS_DIR/phase3-mock-$id.log" 2>&1) || true

      log "  ${DIM}browser test...${RST}"
      local test_exit=0
      node "$SCRIPT_DIR/test-runner.mjs" "$PUBS_DIR/$id" \
        > "$LOGS_DIR/phase3-test-$id.log" 2>&1 || test_exit=$?

      set_phase "$id" "tested"; phase="tested"

      if [[ "$test_exit" -eq 0 ]]; then
        log_ok "test pass ${DIM}$(elapsed "$t_item")${RST}"
      else
        local errors
        errors=$(jq '.errors' "$PUBS_DIR/$id/test-report.json" 2>/dev/null || echo 0)
        log_warn "test: ${R}${errors} error(s)${RST} ${DIM}$(elapsed "$t_item")${RST}"
      fi
    fi

    if [[ "$phase" == "tested" || "$phase" == "reviewing" ]]; then
      local t_item; t_item=$(date +%s)
      item_progress "$done_count" "$total" "reviewing" "$id"

      if [[ ! -f "$PUBS_DIR/$id/index.html" || ! -f "$PUBS_DIR/$id/design.md" ]]; then
        log_fail "missing files"; set_phase "$id" "reviewed"; continue
      fi

      set_phase "$id" "reviewing"

      local hash_before
      hash_before=$(md5 -q "$PUBS_DIR/$id/index.html" 2>/dev/null \
        || md5sum "$PUBS_DIR/$id/index.html" | cut -d' ' -f1)

      (cd "$PUBS_DIR/$id" && claude -p "$review_prompt" \
        --model "$MODEL" --dangerously-skip-permissions \
        > "$LOGS_DIR/phase3-review-$id.log" 2>&1) || true

      local hash_after
      hash_after=$(md5 -q "$PUBS_DIR/$id/index.html" 2>/dev/null \
        || md5sum "$PUBS_DIR/$id/index.html" | cut -d' ' -f1)

      if [[ "$hash_before" != "$hash_after" ]]; then
        local slug
        slug=$(jq -r .slug "$PUBS_DIR/$id/meta.json")
        if pub update "$slug" --file "$PUBS_DIR/$id/index.html" 2>&1; then
          log_ok "reviewed + updated ${DIM}$(elapsed "$t_item")${RST}"
        else
          log_warn "reviewed but update failed ${DIM}$(elapsed "$t_item")${RST}"
        fi
        sleep 6
      else
        log_ok "reviewed (no changes) ${DIM}$(elapsed "$t_item")${RST}"
      fi

      set_phase "$id" "reviewed"
    fi
  done

  phase_done 3 "$t_start"
}

# --- Main ---

mkdir -p "$LOGS_DIR" "$PUBS_DIR"

if [[ "$PHASE" == "status" ]]; then show_status; exit 0; fi

if [[ -f "$LOCKFILE" ]]; then
  pid=$(cat "$LOCKFILE")
  if kill -0 "$pid" 2>/dev/null; then
    printf "${R}${FAIL}${RST} Already running (pid %s). Use --status to check progress.\n" "$pid"
    exit 1
  fi
  rm -f "$LOCKFILE"
fi
echo $$ > "$LOCKFILE"
trap 'rm -f "$LOCKFILE"' EXIT

PIPELINE_START=$(date +%s)

case "$PHASE" in
  1) run_phase1 ;;
  2) run_phase2 ;;
  3) run_phase3 ;;
  all)
    run_phase1
    run_phase2
    run_phase3
    ;;
  *) echo "Invalid phase: $PHASE (use 1, 2, 3, all, or --status)"; exit 1 ;;
esac

echo
show_status
printf "  ${DIM}total time: %s${RST}\n\n" "$(elapsed "$PIPELINE_START")"
