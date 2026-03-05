#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-setup.sh — Verify that all local prerequisites are installed.
#
# Usage:  ./scripts/check-setup.sh
#         pnpm run check:setup
# ---------------------------------------------------------------------------
set -euo pipefail

PASS=0
WARN=0
FAIL=0

pass()  { PASS=$((PASS + 1)); printf "  ✅  %s\n" "$1"; }
warn()  { WARN=$((WARN + 1)); printf "  ⚠️   %s\n" "$1"; }
fail()  { FAIL=$((FAIL + 1)); printf "  ❌  %s\n" "$1"; }

heading() { printf "\n── %s ──\n" "$1"; }

# ---------------------------------------------------------------------------
# 1. Core toolchain
# ---------------------------------------------------------------------------
heading "Core toolchain"

# Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v)
  NODE_MAJOR=${NODE_VERSION#v}
  NODE_MAJOR=${NODE_MAJOR%%.*}
  if [ "$NODE_MAJOR" -ge 24 ] 2>/dev/null; then
    pass "Node.js ${NODE_VERSION}"
  else
    warn "Node.js ${NODE_VERSION} (>= v24 recommended, see engines in package.json)"
  fi
else
  fail "Node.js not found — install via nvm or https://nodejs.org"
fi

# corepack / pnpm
if command -v pnpm &>/dev/null; then
  pass "pnpm $(pnpm --version)"
else
  fail "pnpm not found — run: corepack enable"
fi

# TypeScript (local)
if npx tsc --version &>/dev/null; then
  pass "TypeScript $(npx tsc --version)"
else
  fail "TypeScript not found — run: pnpm install"
fi

# Git
if command -v git &>/dev/null; then
  pass "Git $(git --version | awk '{print $3}')"
else
  fail "Git not found — install via https://git-scm.com or: brew install git"
fi

# node:sqlite (built-in with Node 24+)
if node -e "require('node:sqlite')" &>/dev/null 2>&1; then
  pass "node:sqlite available (built-in)"
else
  fail "node:sqlite not available — requires Node.js 24+ (used by calibration pipeline)"
fi

# ---------------------------------------------------------------------------
# 2. GitHub Copilot CLI (LLM adapter)
# ---------------------------------------------------------------------------
heading "GitHub Copilot CLI"

# gh CLI
if command -v gh &>/dev/null; then
  pass "GitHub CLI $(gh --version | head -1 | awk '{print $3}')"
else
  fail "GitHub CLI (gh) not found — install via: brew install gh"
fi

# gh auth
if command -v gh &>/dev/null; then
  if gh auth status &>/dev/null; then
    pass "gh auth: authenticated"
  else
    fail "gh auth: not authenticated — run: gh auth login"
  fi
fi

# copilot extension
if command -v gh &>/dev/null; then
  if gh copilot --version &>/dev/null 2>&1; then
    pass "gh copilot extension installed"
  else
    fail "gh copilot extension not found — run: gh extension install github/gh-copilot"
  fi
fi

# ---------------------------------------------------------------------------
# 3. Static analysis tools
# ---------------------------------------------------------------------------
heading "Static analysis tools"

# scc
if command -v scc &>/dev/null; then
  pass "scc $(scc --version 2>&1 | head -1 | awk '{print $3}')"
else
  fail "scc not found — install via: brew install scc"
fi

# jscpd
if command -v jscpd &>/dev/null; then
  pass "jscpd $(jscpd --version 2>&1)"
else
  fail "jscpd not found — install via: npm install -g jscpd"
fi

# knip
if command -v knip &>/dev/null; then
  pass "knip $(knip --version 2>&1)"
else
  fail "knip not found — install via: npm install -g knip"
fi

# ---------------------------------------------------------------------------
# 4. Workspace state
# ---------------------------------------------------------------------------
heading "Workspace"

if [ -d "node_modules" ]; then
  pass "node_modules present"
else
  fail "node_modules missing — run: pnpm install"
fi

if [ -d "data" ]; then
  pass "data/ directory present"
else
  warn "data/ directory missing — will be created on first pipeline run"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf "\n── Summary ──\n"
printf "  %d passed, %d warnings, %d failed\n\n" "$PASS" "$WARN" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  printf "Fix the failures above before running the ISV Engine.\n"
  exit 1
fi

if [ "$WARN" -gt 0 ]; then
  printf "Setup OK with warnings — some features may not work as expected.\n"
  exit 0
fi

printf "All checks passed — ready to go! 🚀\n"
exit 0
