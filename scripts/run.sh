#!/usr/bin/env bash
set -e

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

kill_stale

# ── Build UI if needed (hash-based skip) ──────────────────────────────────────

UI_HASH_FILE="$ORTHRUS_ROOT/packages/web/dist/.build_hash"
CURRENT_HASH=$(find "$ORTHRUS_ROOT/packages/web/src" "$ORTHRUS_ROOT/packages/web/index.html" \
  "$ORTHRUS_ROOT/packages/web/package.json" "$ORTHRUS_ROOT/packages/web/bun.lock" \
  "$ORTHRUS_ROOT/packages/web/vite.config.ts" "$ORTHRUS_ROOT/packages/web"/tsconfig*.json \
  -type f 2>/dev/null | sort | xargs cat | shasum -a 256 | cut -d' ' -f1)

if [ -f "$UI_HASH_FILE" ] && [ "$(cat "$UI_HASH_FILE")" = "$CURRENT_HASH" ]; then
  echo "[run.sh] UI build is up to date, skipping build"
else
  echo "[run.sh] Building UI..."
  (cd "$ORTHRUS_ROOT" && bun run build:web)
  mkdir -p "$ORTHRUS_ROOT/packages/web/dist"
  printf '%s\n' "$CURRENT_HASH" > "$UI_HASH_FILE"
fi

# ── Start ─────────────────────────────────────────────────────────────────────

LAN_IP=$(detect_lan_ip)

start_relay
start_mitmproxy "$@"

echo ""
echo "  Relay:    http://${LAN_IP}:${RELAY_PORT}"
echo "  Proxy:    ${LAN_IP}:${PROXY_PORT}  (set as WiFi proxy on device)"
echo "  UI:       http://${LAN_IP}:${RELAY_PORT}"
echo ""

wait
