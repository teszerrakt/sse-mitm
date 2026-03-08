import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Globe, Search, Shield, XCircle } from "lucide-react";
import type { TrafficEntry, TrafficStatus } from "../types";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";

interface Props {
  entries: TrafficEntry[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusColor(status: TrafficStatus): string {
  switch (status) {
    case "pending_request":
    case "pending_response":
      return "bg-warning";
    case "in_flight":
      return "bg-accent";
    case "completed":
      return "bg-success";
    case "error":
      return "bg-danger";
    case "aborted":
      return "bg-dim";
  }
}

function statusLabel(status: TrafficStatus): string {
  switch (status) {
    case "pending_request":
      return "REQ PAUSED";
    case "pending_response":
      return "RES PAUSED";
    case "in_flight":
      return "IN FLIGHT";
    case "completed":
      return "DONE";
    case "error":
      return "ERROR";
    case "aborted":
      return "ABORTED";
  }
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-success";
    case "POST":
      return "text-accent";
    case "PUT":
    case "PATCH":
      return "text-warning";
    case "DELETE":
      return "text-danger";
    default:
      return "text-muted-foreground";
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname + (u.search ? u.search.slice(0, 40) : "");
    return path.length > 60 ? path.slice(0, 57) + "..." : path;
  } catch {
    return url.slice(0, 60);
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function TrafficList({ entries, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = entries;

    if (methodFilter) {
      result = result.filter(
        (e) => e.request.method.toUpperCase() === methodFilter,
      );
    }

    if (filter) {
      const lower = filter.toLowerCase();
      result = result.filter(
        (e) =>
          e.request.url.toLowerCase().includes(lower) ||
          e.request.host.toLowerCase().includes(lower) ||
          e.request.method.toLowerCase().includes(lower) ||
          (e.response?.status_code?.toString() ?? "").includes(lower),
      );
    }

    return result;
  }, [entries, filter, methodFilter]);

  const methods = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      set.add(e.request.method.toUpperCase());
    }
    return Array.from(set).sort();
  }, [entries]);

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border">

      {/* Filter bar */}
      <div className="px-2 py-1.5 border-b border-border bg-panel shrink-0 flex items-center gap-1.5">
        <Search size={12} className="text-dim shrink-0" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by URL, host, method..."
          className="h-6 text-xs border-none bg-transparent focus-visible:ring-0 px-1"
          spellCheck={false}
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="text-dim hover:text-foreground"
          >
            <XCircle size={12} />
          </button>
        )}
      </div>

      {/* Method pills */}
      {methods.length > 1 && (
        <div className="px-2 py-1 border-b border-border bg-panel shrink-0 flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setMethodFilter(null)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
              methodFilter === null
                ? "bg-accent/20 text-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-hover"
            }`}
          >
            ALL
          </button>
          {methods.map((m) => (
            <button
              key={m}
              onClick={() =>
                setMethodFilter(methodFilter === m ? null : m)
              }
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                methodFilter === m
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-hover"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground px-4 text-center">
          <Globe size={28} className="opacity-30 animate-pulse" />
          <span className="text-sm">
            {entries.length === 0
              ? "Waiting for HTTP traffic..."
              : "No matching requests"}
          </span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((entry) => {
            const isSelected = entry.id === selectedId;
            const isPaused =
              entry.status === "pending_request" ||
              entry.status === "pending_response";

            return (
              <button
                key={entry.id}
                onClick={() => onSelect(entry.id)}
                className={[
                  "w-full text-left px-3 py-2 border-b border-border transition-colors",
                  isSelected
                    ? "bg-selected"
                    : "bg-transparent hover:bg-hover",
                ].join(" ")}
              >
                {/* Row 1: method + status code + duration + status badge */}
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${statusColor(entry.status)}`}
                  />
                  <span
                    className={`text-xs font-semibold uppercase ${methodColor(entry.request.method)}`}
                  >
                    {entry.request.method}
                  </span>
                  {entry.response && (
                    <span
                      className={`text-xs font-mono ${
                        entry.response.status_code >= 400
                          ? "text-danger"
                          : entry.response.status_code >= 300
                            ? "text-warning"
                            : "text-success"
                      }`}
                    >
                      {entry.response.status_code}
                    </span>
                  )}
                  <span className="text-dim text-[10px] ml-auto">
                    {formatDuration(entry.duration_ms)}
                  </span>
                  {isPaused && (
                    <Badge variant="warning" className="text-[10px] px-1 py-0">
                      {entry.status === "pending_request" ? (
                        <ArrowUp size={8} />
                      ) : (
                        <ArrowDown size={8} />
                      )}
                      {statusLabel(entry.status)}
                    </Badge>
                  )}
                  {entry.is_intercepted && !isPaused && (
                    <Shield size={10} className="text-warning shrink-0" />
                  )}
                </div>

                {/* Row 2: URL path */}
                <div className="text-foreground text-sm truncate font-mono">
                  {shortPath(entry.request.url)}
                </div>

                {/* Row 3: host */}
                <div className="text-muted-foreground text-xs mt-0.5 truncate">
                  {hostFromUrl(entry.request.url)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
