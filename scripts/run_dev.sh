#!/usr/bin/env bash
set -e

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"

kill_stale
LAN_IP=$(detect_lan_ip)

start_relay
start_mitmproxy "$@"

echo "[run_dev] Starting Vite dev server"
(cd "$ORTHRUS_ROOT/packages/web" && bunx --bun vite) &
register_child $!

echo ""
echo "  Relay:      http://${LAN_IP}:${RELAY_PORT}"
echo "  Proxy:      ${LAN_IP}:${PROXY_PORT}  (set as WiFi proxy on device)"
echo "  UI (dev):   http://${LAN_IP}:5173     (Vite HMR)"
echo ""

wait
