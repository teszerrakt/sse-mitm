import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from "react";
import type { ServerMsg, ClientCmd } from "../types";
import { apiWsUrl } from "../utils/api";

type MessageHandler = (msg: ServerMsg) => void;

interface WebSocketContextValue {
  send: (cmd: ClientCmd) => void;
  subscribe: (handler: MessageHandler) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

/**
 * Provides a single shared WebSocket connection to the backend.
 * All hooks that need WS messages subscribe via `useSharedWebSocket()`.
 */
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
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
        for (const handler of handlersRef.current) {
          handler(msg);
        }
      } catch {
        console.error("Failed to parse WS message", e.data);
      }
    };

    ws.onclose = () => {
      connectingRef.current = false;
      if (!mountedRef.current) return;
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

  const subscribe = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const value = useRef({ send, subscribe }).current;

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

/**
 * Subscribe to incoming WebSocket messages and get a `send` function.
 * Must be used inside a `<WebSocketProvider>`.
 */
export function useSharedWebSocket(onMessage: MessageHandler) {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useSharedWebSocket must be used inside <WebSocketProvider>");

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const handler: MessageHandler = (msg) => onMessageRef.current(msg);
    return ctx.subscribe(handler);
  }, [ctx]);

  return { send: ctx.send };
}
