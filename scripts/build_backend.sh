#!/usr/bin/env bash
set -euo pipefail

# Build the Orthrus backend into a standalone binary using PyInstaller.
# Output goes to packages/desktop/binaries/ with the Tauri target-triple suffix.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$REPO_ROOT/packages/backend"
OUTPUT_DIR="$REPO_ROOT/packages/desktop/binaries"

# Detect target triple
TARGET_TRIPLE="$(rustc --print host-tuple 2>/dev/null || echo "aarch64-apple-darwin")"

echo "==> Building orthrus-backend for $TARGET_TRIPLE"
echo "    Backend dir: $BACKEND_DIR"
echo "    Output dir:  $OUTPUT_DIR"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Add pyinstaller as a dev dependency if not already installed
cd "$BACKEND_DIR"
uv add --dev pyinstaller 2>/dev/null || true

# Run PyInstaller
echo "==> Running PyInstaller..."
uv run pyinstaller --clean --noconfirm orthrus.spec

# Move and rename binary with target triple suffix
BUILT_BINARY="$BACKEND_DIR/dist/orthrus-backend"
TARGET_BINARY="$OUTPUT_DIR/orthrus-backend-$TARGET_TRIPLE"

if [ ! -f "$BUILT_BINARY" ]; then
    echo "ERROR: PyInstaller build failed — $BUILT_BINARY not found"
    exit 1
fi

cp "$BUILT_BINARY" "$TARGET_BINARY"
chmod +x "$TARGET_BINARY"

echo "==> Built: $TARGET_BINARY"
echo "    Size: $(du -h "$TARGET_BINARY" | cut -f1)"
echo "==> Done!"
