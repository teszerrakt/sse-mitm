#!/usr/bin/env bash
set -e

MISSING=0

echo "Checking prerequisites..."
echo ""

# --- Check uv ---
if command -v uv &>/dev/null; then
  echo "  ✓ uv $(uv --version 2>/dev/null)"
else
  echo "  ✗ uv not found"
  echo "    https://docs.astral.sh/uv/getting-started/installation/"
  MISSING=1
fi

# --- Check bun ---
if command -v bun &>/dev/null; then
  echo "  ✓ bun $(bun --version 2>/dev/null)"
else
  echo "  ✗ bun not found"
  echo "    https://bun.sh/docs/installation"
  MISSING=1
fi

echo ""

if [ "$MISSING" -ne 0 ]; then
  echo "Please install the missing prerequisites above, then re-run this script."
  exit 1
fi

# --- Ensure project Python version via uv ---
echo "[install] Ensuring Python from .python-version via uv..."
uv python install
PY_VERSION=$(uv run python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "  ✓ Python $PY_VERSION"

# --- Install Python dependencies (mitmproxy, aiohttp, pydantic, etc.) ---
echo "[install] Installing Python dependencies..."
uv sync

echo ""

# --- Install Node modules ---
echo "[install] Installing Node modules..."
cd ui && bun install

echo ""
echo "[install] Done."
echo ""
echo "  Build UI:  cd ui && bun run build && cd .."
echo "  Run:       ./run.sh        (production)"
echo "  Run:       ./run_dev.sh    (development, Vite HMR)"
