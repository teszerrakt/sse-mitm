#!/usr/bin/env bash
# Bump the Orthrus version across all packages.
#
# Usage:
#   ./scripts/bump_version.sh <new-version>
#   ./scripts/bump_version.sh 0.4.0
#
# Updates:
#   - packages/web/package.json
#   - packages/desktop/package.json
#   - packages/desktop/src-tauri/Cargo.toml
#   - packages/desktop/src-tauri/tauri.conf.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ $# -ne 1 ]; then
  echo "Usage: $0 <new-version>"
  echo "Example: $0 0.4.0"
  exit 1
fi

NEW_VERSION="$1"

# Validate semver format (basic check: X.Y.Z)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: Version must be in semver format (e.g. 0.4.0), got: $NEW_VERSION"
  exit 1
fi

# Files to update
FILES=(
  "packages/web/package.json"
  "packages/desktop/package.json"
  "packages/desktop/src-tauri/tauri.conf.json"
  "packages/desktop/src-tauri/Cargo.toml"
)

echo "Bumping Orthrus to v${NEW_VERSION}"
echo ""

for file in "${FILES[@]}"; do
  filepath="$ROOT/$file"
  if [ ! -f "$filepath" ]; then
    echo "  SKIP  $file (not found)"
    continue
  fi

  case "$file" in
    *.json)
      # JSON files: match "version": "X.Y.Z" and replace the version value
      old_version=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"' "$filepath" | head -1 | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*')
      if [ -z "$old_version" ]; then
        echo "  SKIP  $file (no version field found)"
        continue
      fi
      # Use sed to replace only the first "version" match
      sed -i '' "s/\"version\": \"${old_version}\"/\"version\": \"${NEW_VERSION}\"/" "$filepath"
      echo "  OK    $file  ($old_version → $NEW_VERSION)"
      ;;
    *.toml)
      # TOML files: match version = "X.Y.Z" at the top level
      old_version=$(grep -o '^version[[:space:]]*=[[:space:]]*"[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*"' "$filepath" | head -1 | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*')
      if [ -z "$old_version" ]; then
        echo "  SKIP  $file (no version field found)"
        continue
      fi
      sed -i '' "s/^version = \"${old_version}\"/version = \"${NEW_VERSION}\"/" "$filepath"
      echo "  OK    $file  ($old_version → $NEW_VERSION)"
      ;;
  esac
done

echo ""
echo "Done. Run 'git diff' to review changes."
