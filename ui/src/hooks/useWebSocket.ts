import { useEffect, useRef, useCallback } from "react";
import type { ServerMsg, ClientCmd } from "../types";

type MessageHandler = (msg: ServerMsg) => void;

export function useWebSocket(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg: ServerMsg = JSON.parse(e.data);
        onMessageRef.current(msg);
      } catch {
        console.error("Failed to parse WS message", e.data);
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      // Reconnect after 2s
      reconnectTimerRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
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
