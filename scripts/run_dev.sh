#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export ORTHRUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RELAY_PORT="${RELAY_PORT:-29000}"
PROXY_PORT="${PROXY_PORT:-28080}"
MOCKS_DIR="${MOCKS_DIR:-$ORTHRUS_ROOT/mocks}"

# Detect the machine's LAN IP (the address other devices can reach us on)
LAN_IP=$(cd "$ORTHRUS_ROOT" && uv run python -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    print(s.getsockname()[0])
    s.close()
except Exception:
    print('localhost')
" 2>/dev/null || echo "localhost")

echo "[run_dev] Starting relay server on :${RELAY_PORT}"
(cd "$ORTHRUS_ROOT/packages/backend" && uv run python relay_server.py --port "$RELAY_PORT" --mocks-dir "$MOCKS_DIR") &
RELAY_PID=$!

sleep 1  # give relay a moment to bind

echo "[run_dev] Starting mitmproxy on :${PROXY_PORT}"
(cd "$ORTHRUS_ROOT/packages/backend" && uv run mitmdump \
  --listen-port "$PROXY_PORT" \
  --scripts "$ORTHRUS_ROOT/packages/backend/addon.py" \
  --ssl-insecure \
  "$@") &
MITM_PID=$!

echo "[run_dev] Starting Vite dev server"
(cd "$ORTHRUS_ROOT" && bun run dev:web) &
VITE_PID=$!

cleanup() {
  echo "[run_dev] Shutting down..."
  kill "$RELAY_PID" "$MITM_PID" "$VITE_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "  Relay:      http://${LAN_IP}:${RELAY_PORT}"
echo "  Proxy:      ${LAN_IP}:${PROXY_PORT}  (set as WiFi proxy on device)"
echo "  UI (dev):   http://${LAN_IP}:5173     (Vite HMR)"
echo ""

wait
