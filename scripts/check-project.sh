#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-project.sh — Verify project-specific preconditions for an ISV analysis.
#
# Usage:  ./scripts/check-project.sh <client-name>
#         pnpm run check:project unicef
#
# Reads data/<client-name>/project-config.json and validates that all
# referenced data files, repositories, and settings are in order.
# ---------------------------------------------------------------------------
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS=0
WARN=0
FAIL=0

pass()  { PASS=$((PASS + 1)); printf "  ✅  %s\n" "$1"; }
warn()  { WARN=$((WARN + 1)); printf "  ⚠️   %s\n" "$1"; }
fail()  { FAIL=$((FAIL + 1)); printf "  ❌  %s\n" "$1"; }
info()  { printf "  ℹ️   %s\n" "$1"; }

heading() { printf "\n── %s ──\n" "$1"; }

# jq-like field accessor using Node.js (no jq dependency)
json_field() {
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    const val = '$1'.split('.').reduce((o, k) => o?.[k], data);
    if (Array.isArray(val)) { val.forEach(v => console.log(typeof v === 'object' ? JSON.stringify(v) : v)); }
    else if (val !== undefined && val !== null) { console.log(val); }
  " 2>/dev/null
}

json_array_length() {
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    const val = '$1'.split('.').reduce((o, k) => o?.[k], data);
    console.log(Array.isArray(val) ? val.length : 0);
  " 2>/dev/null
}

json_array_item() {
  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    const arr = '$1'.split('.').reduce((o, k) => o?.[k], data);
    const item = arr?.[$2];
    if (item !== undefined) console.log(typeof item === 'object' ? JSON.stringify(item) : item);
  " 2>/dev/null
}

# ---------------------------------------------------------------------------
# Argument check
# ---------------------------------------------------------------------------
if [ $# -lt 1 ]; then
  echo "Usage: $0 <client-name>"
  echo ""
  echo "Example: $0 unicef"
  echo ""
  echo "The client name must match a folder in data/<client-name>/"
  echo "containing a project-config.json file."
  exit 2
fi

CLIENT="$1"
DATA_DIR="data/${CLIENT}"
CONFIG_FILE="${DATA_DIR}/project-config.json"

printf "\n🔍 Checking project: %s\n" "$CLIENT"

# ---------------------------------------------------------------------------
# 1. Project config
# ---------------------------------------------------------------------------
heading "Project configuration"

if [ ! -d "$DATA_DIR" ]; then
  fail "Data directory not found: ${DATA_DIR}/"
  printf "\n── Summary ──\n"
  printf "  0 passed, 0 warnings, 1 failed\n\n"
  printf "Create %s/ with a project-config.json to continue.\n" "$DATA_DIR"
  exit 1
fi

if [ ! -f "$CONFIG_FILE" ]; then
  fail "Config file not found: ${CONFIG_FILE}"
  printf "\n── Summary ──\n"
  printf "  0 passed, 0 warnings, 1 failed\n\n"
  printf "Create %s with project settings to continue.\n" "$CONFIG_FILE"
  exit 1
fi

# Validate JSON syntax
if node -e "JSON.parse(require('fs').readFileSync('${CONFIG_FILE}', 'utf-8'))" 2>/dev/null; then
  pass "project-config.json is valid JSON"
else
  fail "project-config.json has invalid JSON syntax"
  printf "\n── Summary ──\n"
  printf "  0 passed, 0 warnings, 1 failed\n\n"
  exit 1
fi

# Check required top-level sections
for section in project jira git timeTracking llm pipeline; do
  val=$(json_field "$section")
  if [ -n "$val" ]; then
    pass "Section \"${section}\" present"
  else
    fail "Section \"${section}\" missing in config"
  fi
done

# Project name
PROJECT_NAME=$(json_field "project.name")
if [ -n "$PROJECT_NAME" ]; then
  pass "Project name: ${PROJECT_NAME}"
else
  warn "project.name not set"
fi

# ---------------------------------------------------------------------------
# 2. Ticket prefix
# ---------------------------------------------------------------------------
heading "Ticket prefix"

TICKET_PREFIX=$(json_field "project.ticketPrefix")
if [ -n "$TICKET_PREFIX" ]; then
  if [[ "$TICKET_PREFIX" =~ ^[A-Z]+$ ]]; then
    pass "Ticket prefix: ${TICKET_PREFIX} (valid uppercase)"
  else
    fail "Ticket prefix \"${TICKET_PREFIX}\" must be uppercase letters only"
  fi
else
  fail "project.ticketPrefix not set"
fi

# Consistency check: Jira and time-tracking must use the same prefix
JIRA_PREFIX=$(json_field "jira.ticketPrefix")
TT_PREFIX=$(json_field "timeTracking.ticketPrefix")

if [ "$TICKET_PREFIX" = "$JIRA_PREFIX" ] && [ "$TICKET_PREFIX" = "$TT_PREFIX" ]; then
  pass "Ticket prefix consistent across project / jira / timeTracking"
else
  fail "Ticket prefix mismatch: project=${TICKET_PREFIX}, jira=${JIRA_PREFIX}, timeTracking=${TT_PREFIX}"
fi

# ---------------------------------------------------------------------------
# 3. Jira / Ticket data
# ---------------------------------------------------------------------------
heading "Jira ticket data"

JIRA_FORMAT=$(json_field "jira.rawFormat")
if [ "$JIRA_FORMAT" = "jira-xml" ]; then
  pass "Jira format: jira-xml"
  TICKET_DIR="${DATA_DIR}/tickets"
  if [ -d "$TICKET_DIR" ]; then
    XML_COUNT=$(find "$TICKET_DIR" -maxdepth 1 -name "*.xml" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$XML_COUNT" -gt 0 ]; then
      pass "Found ${XML_COUNT} XML file(s) in ${TICKET_DIR}/"
      # Quick sanity: check if files are non-empty and contain ticket data
      for xml_file in "$TICKET_DIR"/*.xml; do
        SIZE=$(wc -c < "$xml_file" | tr -d ' ')
        if [ "$SIZE" -gt 100 ]; then
          # Check for ticket prefix in the file
          if grep -q "$TICKET_PREFIX" "$xml_file" 2>/dev/null; then
            pass "$(basename "$xml_file"): contains ${TICKET_PREFIX} tickets (${SIZE} bytes)"
          else
            warn "$(basename "$xml_file"): no ${TICKET_PREFIX} tickets found (${SIZE} bytes)"
          fi
        else
          warn "$(basename "$xml_file"): file seems too small (${SIZE} bytes)"
        fi
      done
    else
      fail "No .xml files in ${TICKET_DIR}/ — export Jira tickets as XML"
    fi
  else
    fail "Tickets directory not found: ${TICKET_DIR}/"
  fi
else
  warn "Unknown Jira format: ${JIRA_FORMAT}"
fi

# ---------------------------------------------------------------------------
# 4. Time tracking data
# ---------------------------------------------------------------------------
heading "Time tracking data"

TT_FORMAT=$(json_field "timeTracking.rawFormat")
if [ "$TT_FORMAT" = "teamleader-excel" ]; then
  pass "Time tracking format: teamleader-excel"
  TT_DIR="${DATA_DIR}/time-tracking"
  if [ -d "$TT_DIR" ]; then
    XLSX_COUNT=$(find "$TT_DIR" -maxdepth 1 -name "*.xlsx" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$XLSX_COUNT" -gt 0 ]; then
      pass "Found ${XLSX_COUNT} .xlsx file(s) in ${TT_DIR}/"
      for xlsx_file in "$TT_DIR"/*.xlsx; do
        SIZE=$(wc -c < "$xlsx_file" | tr -d ' ')
        if [ "$SIZE" -gt 1000 ]; then
          pass "$(basename "$xlsx_file"): ${SIZE} bytes"
        else
          warn "$(basename "$xlsx_file"): file seems too small (${SIZE} bytes)"
        fi
      done
    else
      fail "No .xlsx files in ${TT_DIR}/ — export time entries from Teamleader"
    fi
  else
    fail "Time tracking directory not found: ${TT_DIR}/"
  fi
else
  warn "Unknown time tracking format: ${TT_FORMAT}"
fi

# ---------------------------------------------------------------------------
# 5. Git repositories
# ---------------------------------------------------------------------------
heading "Git repositories"

REPO_COUNT=$(json_array_length "git.repositories")
if [ "$REPO_COUNT" -gt 0 ]; then
  pass "${REPO_COUNT} repository/ies configured"
else
  fail "No repositories configured in git.repositories"
fi

for (( i=0; i<REPO_COUNT; i++ )); do
  REPO_JSON=$(json_array_item "git.repositories" "$i")
  REPO_ID=$(echo "$REPO_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log(d.repositoryId||'')" 2>/dev/null)
  REPO_URL=$(echo "$REPO_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log(d.url||'')" 2>/dev/null)
  REPO_LOCAL=$(echo "$REPO_JSON" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf-8')); console.log(d.localPath||'')" 2>/dev/null)

  if [ -z "$REPO_ID" ]; then
    fail "Repository at index ${i}: missing repositoryId"
    continue
  fi

  if [ -n "$REPO_URL" ]; then
    # SSH URL — try to verify with git ls-remote (timeout 10s)
    if [[ "$REPO_URL" == git@* ]]; then
      HOST=$(echo "$REPO_URL" | sed 's/git@\([^:]*\):.*/\1/')
      if ssh -o ConnectTimeout=5 -o BatchMode=yes -T "git@${HOST}" 2>&1 | grep -qi "welcome\|successfully\|authenticated\|gitlab" 2>/dev/null; then
        pass "${REPO_ID}: SSH host ${HOST} reachable"
      else
        # Try git ls-remote directly (more reliable for GitLab)
        if timeout 10 git ls-remote --exit-code "$REPO_URL" HEAD &>/dev/null; then
          pass "${REPO_ID}: ${REPO_URL} accessible"
        else
          warn "${REPO_ID}: cannot verify access to ${REPO_URL} (SSH may require VPN or key setup)"
        fi
      fi
    elif [[ "$REPO_URL" == http* ]]; then
      if timeout 10 git ls-remote --exit-code "$REPO_URL" HEAD &>/dev/null; then
        pass "${REPO_ID}: ${REPO_URL} accessible"
      else
        warn "${REPO_ID}: cannot reach ${REPO_URL}"
      fi
    fi
  elif [ -n "$REPO_LOCAL" ]; then
    if [ -d "$REPO_LOCAL" ]; then
      if [ -d "${REPO_LOCAL}/.git" ] || git -C "$REPO_LOCAL" rev-parse --git-dir &>/dev/null; then
        pass "${REPO_ID}: local path ${REPO_LOCAL} is a valid git repo"
      else
        fail "${REPO_ID}: ${REPO_LOCAL} exists but is not a git repository"
      fi
    else
      fail "${REPO_ID}: local path ${REPO_LOCAL} does not exist"
    fi
  else
    fail "${REPO_ID}: neither url nor localPath specified"
  fi
done

# ---------------------------------------------------------------------------
# 6. LLM configuration
# ---------------------------------------------------------------------------
heading "LLM configuration"

LLM_PROVIDER=$(json_field "llm.provider")
case "$LLM_PROVIDER" in
  github-copilot-cli)
    pass "LLM provider: github-copilot-cli"
    ;;
  "")
    fail "llm.provider not set"
    ;;
  *)
    warn "Unknown LLM provider: ${LLM_PROVIDER}"
    ;;
esac

# ---------------------------------------------------------------------------
# 7. Pipeline configuration
# ---------------------------------------------------------------------------
heading "Pipeline configuration"

D3_FLOOR=$(json_field "pipeline.d3QualityFloor")
case "$D3_FLOOR" in
  1) pass "D3 Quality Floor: 1 (standard DoD)" ;;
  2) pass "D3 Quality Floor: 2 (elevated requirements)" ;;
  3) pass "D3 Quality Floor: 3 (regulatory / compliance)" ;;
  "") warn "pipeline.d3QualityFloor not set (defaults to 1)" ;;
  *)  fail "pipeline.d3QualityFloor=${D3_FLOOR} — must be 1, 2, or 3" ;;
esac

# ---------------------------------------------------------------------------
# 8. Data folder consistency
# ---------------------------------------------------------------------------
heading "Data folder consistency"

DATA_FOLDER=$(json_field "project.dataFolderName")
JIRA_FOLDER=$(json_field "jira.dataFolderName")
GIT_FOLDER=$(json_field "git.dataFolderName")
TT_FOLDER=$(json_field "timeTracking.dataFolderName")

if [ "$DATA_FOLDER" = "$CLIENT" ] && [ "$JIRA_FOLDER" = "$CLIENT" ] && [ "$GIT_FOLDER" = "$CLIENT" ] && [ "$TT_FOLDER" = "$CLIENT" ]; then
  pass "All dataFolderName values match client name \"${CLIENT}\""
elif [ "$DATA_FOLDER" = "$JIRA_FOLDER" ] && [ "$DATA_FOLDER" = "$GIT_FOLDER" ] && [ "$DATA_FOLDER" = "$TT_FOLDER" ]; then
  warn "dataFolderName is \"${DATA_FOLDER}\" across all sections, but client arg is \"${CLIENT}\""
else
  fail "Inconsistent dataFolderName: project=${DATA_FOLDER}, jira=${JIRA_FOLDER}, git=${GIT_FOLDER}, timeTracking=${TT_FOLDER}"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n── Summary (%s) ──\n" "$CLIENT"
printf "  %d passed, %d warnings, %d failed\n\n" "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  printf "Fix the failures above before running the ISV analysis.\n"
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  printf "Project ready with warnings — some checks could not be verified.\n"
  exit 0
fi

printf "All checks passed — project \"%s\" is ready for analysis! 🚀\n" "$CLIENT"
exit 0
