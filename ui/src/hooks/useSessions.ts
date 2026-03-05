import { useState, useCallback, useEffect } from "react";
import type {
  SessionState,
  SessionInfo,
  PendingEvent,
  HistoryEntry,
  ServerMsg,
  ClientCmd,
  SSEEvent,
} from "../types";
import { useWebSocket } from "./useWebSocket";

export function useSessions() {
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load existing sessions on mount
  useEffect(() => {
    fetch("/sessions")
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
          next[msg.session_id] = {
            ...s,
            info: { ...s.info, status: "completed" },
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
      }

      return next;
    });
  }, []);

  const { send } = useWebSocket(handleMessage);

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

  return {
    sessions,
    selectedId,
    setSelectedId,
    forward,
    edit,
    drop,
    inject,
    delay,
    forwardAll,
    saveSession,
  };
}
