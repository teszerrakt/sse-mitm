#!/usr/bin/env bash
set -e

RELAY_PORT="${RELAY_PORT:-9000}"
PROXY_PORT="${PROXY_PORT:-8080}"
MOCKS_DIR="${MOCKS_DIR:-./mocks}"

echo "[run.sh] Starting relay server on :${RELAY_PORT}"
uv run python relay_server.py --port "$RELAY_PORT" --mocks-dir "$MOCKS_DIR" &
RELAY_PID=$!

sleep 1  # give relay a moment to bind

echo "[run.sh] Starting mitmproxy on :${PROXY_PORT}"
uv run mitmdump \
  --listen-port "$PROXY_PORT" \
  --scripts addon.py \
  --ssl-insecure \
  "$@" &
MITM_PID=$!

cleanup() {
  echo "[run.sh] Shutting down..."
  kill "$RELAY_PID" "$MITM_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "  Relay:    http://localhost:${RELAY_PORT}"
echo "  Proxy:    http://localhost:${PROXY_PORT}  (set as WiFi proxy on device)"
echo "  UI:       http://localhost:${RELAY_PORT}"
echo ""

wait
