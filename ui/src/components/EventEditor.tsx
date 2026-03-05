import { useState } from "react";
import type { SSEEvent } from "../types";

interface Props {
  event: SSEEvent;
  onConfirm: (edited: SSEEvent) => void;
  onClose: () => void;
}

export function EventEditor({ event, onConfirm, onClose }: Props) {
  const [eventType, setEventType] = useState(event.event);
  const [data, setData] = useState(event.data);
  const [id, setId] = useState(event.id ?? "");
  const [error, setError] = useState<string | null>(null);

  // Try to pretty-print JSON data
  const [prettyMode, setPrettyMode] = useState(() => {
    try {
      JSON.parse(event.data);
      return true;
    } catch {
      return false;
    }
  });

  const prettyData = (() => {
    if (!prettyMode) return data;
    try {
      return JSON.stringify(JSON.parse(data), null, 2);
    } catch {
      return data;
    }
  })();

  const handleConfirm = () => {
    let finalData = data;
    if (prettyMode) {
      try {
        // Re-stringify to compact form for wire
        finalData = JSON.stringify(JSON.parse(data));
      } catch {
        setError("Invalid JSON in data field");
        return;
      }
    }
    setError(null);
    onConfirm({
      event: eventType,
      data: finalData,
      id: id.length > 0 ? id : null,
      retry: event.retry,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-[var(--text)] text-[12px] font-semibold">Edit Event</span>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-[18px] leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Event type */}
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
              event type
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[12px] font-mono focus:outline-none focus:border-[var(--accent)]"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </label>

          {/* ID */}
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
              id (optional)
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[12px] font-mono focus:outline-none focus:border-[var(--accent)]"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="(none)"
            />
          </label>

          {/* Data */}
          <label className="flex flex-col gap-1 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
                data
              </span>
              <button
                className="text-[10px] text-[var(--accent)] hover:text-[var(--accent-hover)]"
                onClick={() => setPrettyMode((p) => !p)}
              >
                {prettyMode ? "Raw" : "Pretty"}
              </button>
            </div>
            <textarea
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[11px] font-mono focus:outline-none focus:border-[var(--accent)] resize-none h-48"
              value={prettyMode ? prettyData : data}
              onChange={(e) =>
                setData(
                  prettyMode
                    ? e.target.value // keep raw while editing pretty
                    : e.target.value,
                )
              }
              spellCheck={false}
            />
          </label>

          {error && <div className="text-[var(--danger)] text-[11px]">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-[11px] text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
          >
            Forward Edited
          </button>
        </div>
      </div>
    </div>
  );
}
