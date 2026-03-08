import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../utils/api";
import type {
  TrafficEntry,
  ServerMsg,
  ClientCmd,
  RequestModification,
  ResponseModification,
} from "../types";
import { useSharedWebSocket } from "./useWebSocket";

export function useTraffic() {
  const [entries, setEntries] = useState<TrafficEntry[]>([]);
  const [selectedTrafficId, setSelectedTrafficId] = useState<string | null>(null);

  // Load existing traffic entries on mount
  useEffect(() => {
    apiFetch("/traffic")
      .then((r) => r.json())
      .then((data: TrafficEntry[]) => {
        setEntries(data);
      })
      .catch(() => {
        /* server may not be up yet */
      });
  }, []);

  const handleMessage = useCallback((msg: ServerMsg) => {
    switch (msg.type) {
      case "new_traffic": {
        setEntries((prev) => [...prev, msg.entry]);
        break;
      }
      case "traffic_updated": {
        setEntries((prev) =>
          prev.map((e) => (e.id === msg.entry.id ? msg.entry : e)),
        );
        break;
      }
      case "traffic_cleared": {
        setEntries([]);
        setSelectedTrafficId(null);
        break;
      }
      // Ignore non-traffic messages — they're handled by useSessions
      default:
        break;
    }
  }, []);

  const { send } = useSharedWebSocket(handleMessage);

  // ── Actions ────────────────────────────────────────────────────────────────

  const resumeRequest = useCallback(
    (trafficId: string, modifications?: RequestModification | null) => {
      const cmd: ClientCmd = {
        type: "resume_request",
        traffic_id: trafficId,
        modifications: modifications ?? undefined,
      };
      send(cmd);
    },
    [send],
  );

  const resumeResponse = useCallback(
    (trafficId: string, modifications?: ResponseModification | null) => {
      const cmd: ClientCmd = {
        type: "resume_response",
        traffic_id: trafficId,
        modifications: modifications ?? undefined,
      };
      send(cmd);
    },
    [send],
  );

  const abortRequest = useCallback(
    (trafficId: string) => {
      const cmd: ClientCmd = { type: "abort_request", traffic_id: trafficId };
      send(cmd);
    },
    [send],
  );

  const clearTraffic = useCallback(() => {
    // Clear local state immediately for instant UI feedback
    setEntries([]);
    setSelectedTrafficId(null);
    // Send via both WS (broadcasts to other clients) and REST (ensures backend clears)
    send({ type: "clear_traffic" });
    apiFetch("/traffic", { method: "DELETE" }).catch(() => {});
  }, [send]);

  const selectedEntry = selectedTrafficId
    ? entries.find((e) => e.id === selectedTrafficId) ?? null
    : null;

  return {
    entries,
    selectedTrafficId,
    selectedEntry,
    setSelectedTrafficId,
    resumeRequest,
    resumeResponse,
    abortRequest,
    clearTraffic,
  };
}
