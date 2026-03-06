import { useEffect, useRef, useCallback } from "react";
import type { ServerMsg, ClientCmd } from "../types";
import { apiWsUrl } from "../utils/api";

type MessageHandler = (msg: ServerMsg) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    // Guard against StrictMode double-mount: if already connecting/open, skip
    if (connectingRef.current) return;
    const existing = wsRef.current;
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return;
    }

    connectingRef.current = true;
    const ws = new WebSocket(apiWsUrl("/ws"));
    wsRef.current = ws;

    ws.onopen = () => {
      connectingRef.current = false;
    };

    ws.onmessage = (e) => {
      try {
        const msg: ServerMsg = JSON.parse(e.data);
        onMessageRef.current(msg);
      } catch {
        console.error("Failed to parse WS message", e.data);
      }
    };

    ws.onclose = () => {
      connectingRef.current = false;
      if (!mountedRef.current) return;
      // Reconnect after 2s
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      connectingRef.current = false;
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      connectingRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((cmd: ClientCmd) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
    } else {
      console.warn("WS not open, dropping command", cmd);
    }
  }, []);

  return { send };
}
