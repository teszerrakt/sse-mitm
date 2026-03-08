#!/usr/bin/env bash
# Shared helpers for Orthrus startup scripts.
# Source this file — do NOT execute it directly.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ORTHRUS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RELAY_PORT="${RELAY_PORT:-29000}"
PROXY_PORT="${PROXY_PORT:-28080}"
MOCKS_DIR="${MOCKS_DIR:-$ORTHRUS_ROOT/mocks}"

# ── Kill stale processes from a previous run ──────────────────────────────────

kill_stale() {
  local stale_pids
  # relay_server.py on RELAY_PORT
  stale_pids=$(lsof -ti:"$RELAY_PORT" 2>/dev/null || true)
  if [ -n "$stale_pids" ]; then
    echo "[orthrus] Killing stale processes on :${RELAY_PORT}..."
    echo "$stale_pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
  # mitmdump on PROXY_PORT
  stale_pids=$(lsof -ti:"$PROXY_PORT" 2>/dev/null || true)
  if [ -n "$stale_pids" ]; then
    echo "[orthrus] Killing stale processes on :${PROXY_PORT}..."
    echo "$stale_pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

# ── Detect LAN IP ─────────────────────────────────────────────────────────────

detect_lan_ip() {
  cd "$ORTHRUS_ROOT" && uv run python -c "
import socket
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.connect(('8.8.8.8', 80))
    print(s.getsockname()[0])
    s.close()
except Exception:
    print('localhost')
" 2>/dev/null || echo "localhost"
}

# ── Start backend processes ───────────────────────────────────────────────────

# PIDs stored here so cleanup() can reference them
_RELAY_PID=""
_MITM_PID=""
_CHILD_PIDS=()  # additional children (vite, tauri, etc.)

start_relay() {
  echo "[orthrus] Starting relay server on :${RELAY_PORT}"
  (cd "$ORTHRUS_ROOT/packages/backend" && exec uv run python relay_server.py \
    --port "$RELAY_PORT" --mocks-dir "$MOCKS_DIR") &
  _RELAY_PID=$!
  sleep 1  # give relay a moment to bind
}

start_mitmproxy() {
  echo "[orthrus] Starting mitmproxy on :${PROXY_PORT}"
  (cd "$ORTHRUS_ROOT/packages/backend" && exec uv run mitmdump \
    --listen-port "$PROXY_PORT" \
    --scripts "$ORTHRUS_ROOT/packages/backend/addon.py" \
    --ssl-insecure \
    "$@") &
  _MITM_PID=$!
}

# Register an extra child PID (vite, tauri, etc.)
register_child() {
  _CHILD_PIDS+=("$1")
}

# ── Cleanup ───────────────────────────────────────────────────────────────────

_cleanup_called=0

cleanup() {
  # Guard against being called twice (EXIT + signal)
  if [ "$_cleanup_called" -eq 1 ]; then return; fi
  _cleanup_called=1

  echo "[orthrus] Shutting down..."

  # Kill extra children first (vite, tauri)
  for pid in "${_CHILD_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done

  # Kill relay and mitmproxy — send TERM to their process groups
  for pid in $_RELAY_PID $_MITM_PID; do
    if [ -n "$pid" ]; then
      # Kill the process group (negative PID) to catch all children
      kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    fi
  done

  # Final sweep: make sure the ports are free
  local leftover
  leftover=$(lsof -ti:"$RELAY_PORT" 2>/dev/null || true)
  [ -n "$leftover" ] && echo "$leftover" | xargs kill -9 2>/dev/null || true
  leftover=$(lsof -ti:"$PROXY_PORT" 2>/dev/null || true)
  [ -n "$leftover" ] && echo "$leftover" | xargs kill -9 2>/dev/null || true
}

trap cleanup EXIT INT TERM
