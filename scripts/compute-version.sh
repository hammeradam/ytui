#!/usr/bin/env bash
# scripts/compute-version.sh
#
# Reads conventional commits since the last semver tag and writes the next
# version + changelog to $GITHUB_OUTPUT (or prints them when run locally).
#
# Outputs (written to $GITHUB_OUTPUT if set, otherwise printed):
#   release_needed   true | false
#   next_version     e.g. 1.2.3
#   changelog        multiline "## What's changed\n- ..."
#
# Usage (local):
#   bash scripts/compute-version.sh

set -euo pipefail

# ── Helpers ──────────────────────────────────────────────────────────────────

emit() {
  local key="$1" value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "${key}=${value}" >> "$GITHUB_OUTPUT"
  else
    echo "OUTPUT: ${key}=${value}"
  fi
}

emit_multiline() {
  local key="$1" value="$2"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "${key}<<MULTILINE_EOF"
      echo "$value"
      echo "MULTILINE_EOF"
    } >> "$GITHUB_OUTPUT"
  else
    echo "OUTPUT: ${key}<<"
    echo "$value"
  fi
}

# ── Determine base version and commit range ──────────────────────────────────

LAST_TAG=$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -1)

if [ -z "$LAST_TAG" ]; then
  BASE=$(node -p "require('./package.json').version")
  RANGE="HEAD"
  echo "No previous tag — base version from package.json: $BASE"
else
  BASE="${LAST_TAG#v}"
  RANGE="${LAST_TAG}..HEAD"
  echo "Last tag: $LAST_TAG  →  base: $BASE"
fi

# ── Collect commits in range ─────────────────────────────────────────────────

COMMITS=$(git log "$RANGE" --format="%s" 2>/dev/null || git log --format="%s")

if [ -z "$COMMITS" ]; then
  echo "No commits since last tag — skipping release."
  emit "release_needed" "false"
  exit 0
fi

# ── Determine bump level from conventional commit prefixes ───────────────────

MAJOR=0; MINOR=0; PATCH=0

while IFS= read -r msg; do
  if echo "$msg" | grep -qE '^[a-z]+(\([^)]+\))?!:' || \
     echo "$msg" | grep -qiE 'BREAKING[[:space:]]CHANGE'; then
    MAJOR=1
  elif echo "$msg" | grep -qE '^feat(\([^)]+\))?:'; then
    MINOR=1
  elif echo "$msg" | grep -qE '^(fix|perf)(\([^)]+\))?:'; then
    PATCH=1
  fi
done <<< "$COMMITS"

if [ "$MAJOR" -eq 0 ] && [ "$MINOR" -eq 0 ] && [ "$PATCH" -eq 0 ]; then
  echo "No releasable commits — skipping."
  emit "release_needed" "false"
  exit 0
fi

# ── Compute next version ─────────────────────────────────────────────────────

IFS='.' read -r VMAJ VMIN VPAT <<< "$BASE"
if   [ "$MAJOR" -eq 1 ]; then VMAJ=$((VMAJ+1)); VMIN=0; VPAT=0
elif [ "$MINOR" -eq 1 ]; then VMIN=$((VMIN+1)); VPAT=0
else                           VPAT=$((VPAT+1))
fi

NEXT="${VMAJ}.${VMIN}.${VPAT}"
echo "Next version: $NEXT"

# ── Emit outputs ─────────────────────────────────────────────────────────────

emit "release_needed" "true"
emit "next_version"   "$NEXT"

CHANGELOG=$(printf "## What's changed\n\n"; git log "$RANGE" --format="- %s (%h)" 2>/dev/null || git log --format="- %s (%h)")
emit_multiline "changelog" "$CHANGELOG"
