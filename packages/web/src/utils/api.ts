import { isTauri } from "@tauri-apps/api/core";

const BACKEND_ORIGIN = "http://localhost:29000";
const WS_ORIGIN = "ws://localhost:29000";

/**
 * Fetch wrapper that routes requests to the backend relay server.
 *
 * In Tauri mode the frontend is served from `tauri://localhost`, so relative
 * paths like `/config` would resolve to `tauri://localhost/config` (which
 * doesn't exist). This wrapper prepends `http://localhost:29000` when running
 * inside Tauri, and keeps paths relative in the browser (where Vite proxies
 * them to the relay server).
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = isTauri() ? BACKEND_ORIGIN : "";
  return fetch(`${base}${path}`, init);
}

/**
 * Build a full WebSocket URL for the given path.
 *
 * Tauri → `ws://localhost:29000/ws`
 * Browser → uses the current page host (Vite proxies to relay server).
 */
export function apiWsUrl(path: string): string {
  if (isTauri()) {
    return `${WS_ORIGIN}${path}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${path}`;
}
