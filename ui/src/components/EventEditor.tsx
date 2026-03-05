import { useState } from "react";
import type { SSEEvent } from "../types";
import { CodeBlock } from "./CodeBlock";

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

  const handleConfirm = () => {
    // Always send minified JSON if data is valid JSON, else send as-is
    let finalData = data;
    try {
      finalData = JSON.stringify(JSON.parse(data));
    } catch {
      // not JSON — send raw
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
          <span className="text-[var(--text)] text-sm font-semibold">Edit Event</span>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-lg leading-none"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Event type */}
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              event type
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </label>

          {/* ID */}
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">
              id (optional)
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--accent)]"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="(none)"
            />
          </label>

          {/* Data */}
          <div className="flex flex-col gap-1 flex-1">
            <span className="text-[var(--text-muted)] text-xs uppercase tracking-wider">data</span>
            <div className="rounded overflow-hidden border border-[var(--border)]">
              <CodeBlock
                value={data}
                readOnly={false}
                onChange={(val) => {
                  setData(val);
                  setError(null);
                }}
                height="220px"
                lineNumbers
              />
            </div>
          </div>

          {error && <div className="text-[var(--danger)] text-sm">{error}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-sm text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded transition-colors"
          >
            Forward Edited
          </button>
        </div>
      </div>
    </div>
  );
}
