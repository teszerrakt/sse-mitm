import { useState } from "react";
import type { SSEEvent } from "../types";

interface Props {
  afterIndex: number;
  onConfirm: (event: SSEEvent) => void;
  onClose: () => void;
}

const BLANK: SSEEvent = { event: "message", data: "{}", id: null, retry: null };

export function InjectModal({ afterIndex, onConfirm, onClose }: Props) {
  const [eventType, setEventType] = useState(BLANK.event);
  const [data, setData] = useState(BLANK.data);
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setError(null);
    onConfirm({
      event: eventType,
      data,
      id: id.length > 0 ? id : null,
      retry: null,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg w-[540px] max-w-[95vw] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <span className="text-[var(--inject)] text-[12px] font-semibold">
              Inject Synthetic Event
            </span>
            <span className="text-[var(--text-muted)] text-[10px] ml-2">
              after index {afterIndex}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-[18px] leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
              event type
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[12px] font-mono focus:outline-none focus:border-[var(--inject)]"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
              id (optional)
            </span>
            <input
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[12px] font-mono focus:outline-none focus:border-[var(--inject)]"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="(none)"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
              data
            </span>
            <textarea
              className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[11px] font-mono focus:outline-none focus:border-[var(--inject)] resize-none h-32"
              value={data}
              onChange={(e) => setData(e.target.value)}
              spellCheck={false}
            />
          </label>

          {error && <div className="text-[var(--danger)] text-[11px]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-3 py-1.5 text-[11px] text-white bg-[var(--inject)] hover:opacity-90 rounded"
          >
            Inject
          </button>
        </div>
      </div>
    </div>
  );
}
