import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../utils/api";
import type {
  SessionState,
  SessionInfo,
  PendingEvent,
  HistoryEntry,
  ServerMsg,
  ClientCmd,
  SSEEvent,
} from "../types";
import { useSharedWebSocket } from "./useWebSocket";

export function useSessions() {
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tlsErrorIps, setTlsErrorIps] = useState<Set<string>>(new Set());

  // Load existing sessions on mount
  useEffect(() => {
    apiFetch("/sessions")
      .then((r) => r.json())
      .then((infos: SessionInfo[]) => {
        setSessions((prev) => {
          const next = { ...prev };
          for (const info of infos) {
            if (!next[info.id]) {
              next[info.id] = { info, pending: [], history: [] };
            }
          }
          return next;
        });
      })
      .catch(() => {
        /* server may not be up yet */
      });
  }, []);

  const handleMessage = useCallback((msg: ServerMsg) => {
    if (msg.type === "tls_error") {
      setTlsErrorIps((prev) => {
        const next = new Set(prev);
        next.add(msg.client_ip);
        return next;
      });
      return;
    }

    setSessions((prev) => {
      const next = { ...prev };

      switch (msg.type) {
        case "new_session": {
          next[msg.session.id] = {
            info: msg.session,
            pending: [],
            history: [],
          };
          break;
        }

        case "event": {
          const s = next[msg.session_id];
          if (!s) break;
          const newPending: PendingEvent = { index: msg.index, event: msg.event };
          next[msg.session_id] = {
            ...s,
            pending: [...s.pending, newPending],
          };
          break;
        }

        case "stream_end": {
          const s = next[msg.session_id];
          if (!s) break;
          // Don't overwrite "error" — stream_end always fires in the finally
          // block, but if an error was already reported, preserve that status.
          const finalStatus = s.info.status === "error" ? "error" : "completed";
          next[msg.session_id] = {
            ...s,
            info: { ...s.info, status: finalStatus },
          };
          break;
        }

        case "error": {
          const s = next[msg.session_id];
          if (!s) break;
          next[msg.session_id] = {
            ...s,
            info: { ...s.info, status: "error" },
          };
          break;
        }

        case "session_updated": {
          const s = next[msg.session.id];
          if (!s) break;
          next[msg.session.id] = { ...s, info: msg.session };
          break;
        }

        case "sessions_cleared": {
          return {};
        }
      }

      return next;
    });
  }, []);

  const { send } = useSharedWebSocket(handleMessage);

  // ── Actions ────────────────────────────────────────────────────────────────

  const recordHistory = (sessionId: string, entry: HistoryEntry, resolvedIndex: number) => {
    setSessions((prev) => {
      const s = prev[sessionId];
      if (!s) return prev;
      return {
        ...prev,
        [sessionId]: {
          ...s,
          history: [...s.history, entry],
          pending: s.pending.filter((p) => p.index !== resolvedIndex),
        },
      };
    });
  };

  const forward = useCallback(
    (sessionId: string, index: number, event: SSEEvent) => {
      const cmd: ClientCmd = { type: "forward", session_id: sessionId, index };
      send(cmd);
      recordHistory(
        sessionId,
        {
          index,
          timestamp: Date.now() / 1000,
          original_event: event,
          action: "forward",
          sent_event: event,
          delay_ms: 0,
        },
        index,
      );
    },
    [send],
  );

  const edit = useCallback(
    (sessionId: string, index: number, originalEvent: SSEEvent, editedEvent: SSEEvent) => {
      const cmd: ClientCmd = { type: "edit", session_id: sessionId, index, event: editedEvent };
      send(cmd);
      recordHistory(
        sessionId,
        {
          index,
          timestamp: Date.now() / 1000,
          original_event: originalEvent,
          action: "edit",
          sent_event: editedEvent,
          delay_ms: 0,
        },
        index,
      );
    },
    [send],
  );

  const drop = useCallback(
    (sessionId: string, index: number, event: SSEEvent) => {
      const cmd: ClientCmd = { type: "drop", session_id: sessionId, index };
      send(cmd);
      recordHistory(
        sessionId,
        {
          index,
          timestamp: Date.now() / 1000,
          original_event: event,
          action: "drop",
          sent_event: null,
          delay_ms: 0,
        },
        index,
      );
    },
    [send],
  );

  const inject = useCallback(
    (sessionId: string, afterIndex: number, event: SSEEvent) => {
      const cmd: ClientCmd = {
        type: "inject",
        session_id: sessionId,
        after_index: afterIndex,
        event,
      };
      send(cmd);
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        const entry: HistoryEntry = {
          index: afterIndex + 0.5, // synthetic marker
          timestamp: Date.now() / 1000,
          original_event: null,
          action: "inject",
          sent_event: event,
          delay_ms: 0,
        };
        return { ...prev, [sessionId]: { ...s, history: [...s.history, entry] } };
      });
    },
    [send],
  );

  const delay = useCallback(
    (sessionId: string, index: number, event: SSEEvent, delayMs: number) => {
      const cmd: ClientCmd = { type: "delay", session_id: sessionId, index, delay_ms: delayMs };
      send(cmd);
      recordHistory(
        sessionId,
        {
          index,
          timestamp: Date.now() / 1000,
          original_event: event,
          action: "delay",
          sent_event: event,
          delay_ms: delayMs,
        },
        index,
      );
    },
    [send],
  );

  const forwardAll = useCallback(
    (sessionId: string) => {
      const cmd: ClientCmd = { type: "forward_all", session_id: sessionId };
      send(cmd);
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        const newHistory: HistoryEntry[] = s.pending.map((p) => ({
          index: p.index,
          timestamp: Date.now() / 1000,
          original_event: p.event,
          action: "forward" as const,
          sent_event: p.event,
          delay_ms: 0,
        }));
        return {
          ...prev,
          [sessionId]: { ...s, pending: [], history: [...s.history, ...newHistory] },
        };
      });
    },
    [send],
  );

  const saveSession = useCallback(
    (sessionId: string, filename: string) => {
      const cmd: ClientCmd = { type: "save_session", session_id: sessionId, filename };
      send(cmd);
    },
    [send],
  );

  const clearTlsError = useCallback((ip: string) => {
    setTlsErrorIps((prev) => {
      if (!prev.has(ip)) return prev;
      const next = new Set(prev);
      next.delete(ip);
      return next;
    });
  }, []);

  const clearSessions = useCallback(() => {
    // Clear local state immediately for instant UI feedback
    setSessions({});
    setSelectedId(null);
    // Send via both WS (broadcasts to other clients) and REST (ensures backend clears)
    send({ type: "clear_sessions" });
    apiFetch("/sessions", { method: "DELETE" }).catch(() => {});
  }, [send]);

  const closeSession = useCallback(
    (sessionId: string) => {
      const cmd: ClientCmd = { type: "close_session", session_id: sessionId };
      send(cmd);
      // Optimistically mark session as completed; the backend will also
      // broadcast stream_end which sets status to "completed" in handleMessage
      setSessions((prev) => {
        const s = prev[sessionId];
        if (!s) return prev;
        return {
          ...prev,
          [sessionId]: { ...s, info: { ...s.info, status: "completed" } },
        };
      });
    },
    [send],
  );

  return {
    sessions,
    selectedId,
    tlsErrorIps,
    setSelectedId,
    clearTlsError,
    forward,
    edit,
    drop,
    inject,
    delay,
    forwardAll,
    saveSession,
    clearSessions,
    closeSession,
  };
}
