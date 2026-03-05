import { useState } from "react";
import type { PendingEvent, HistoryEntry, SSEEvent } from "../types";
import { EventEditor } from "./EventEditor";
import { InjectModal } from "./InjectModal";

interface Props {
  pending: PendingEvent[];
  history: HistoryEntry[];
  onForward: (index: number, event: SSEEvent) => void;
  onEdit: (index: number, original: SSEEvent, edited: SSEEvent) => void;
  onDrop: (index: number, event: SSEEvent) => void;
  onInject: (afterIndex: number, event: SSEEvent) => void;
  onDelay: (index: number, event: SSEEvent, delayMs: number) => void;
}

type Modal =
  | { kind: "edit"; index: number; event: SSEEvent }
  | { kind: "inject"; afterIndex: number }
  | { kind: "delay"; index: number; event: SSEEvent }
  | null;

function ActionLabel({ action }: { action: string }) {
  const styles: Record<string, string> = {
    forward: "text-[var(--success)]",
    edit: "text-[var(--accent)]",
    drop: "text-[var(--danger)]",
    inject: "text-[var(--inject)]",
    delay: "text-[var(--warning)]",
  };
  return (
    <span
      className={`text-[9px] uppercase font-semibold ${styles[action] ?? "text-[var(--text-muted)]"}`}
    >
      {action}
    </span>
  );
}

function prettyData(data: string): string {
  try {
    return JSON.stringify(JSON.parse(data), null, 2);
  } catch {
    return data;
  }
}

export function EventRow({
  pending,
  history,
  onForward,
  onEdit,
  onDrop,
  onInject,
  onDelay,
}: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [delayMs, setDelayMs] = useState(500);
  const [expandedHistIdx, setExpandedHistIdx] = useState<number | null>(null);
  const [expandedPendIdx, setExpandedPendIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-0 text-[11px]">
      {/* History entries */}
      {history.map((h, i) => (
        <div key={`h-${i}`} className="border-b border-[var(--border)]">
          <button
            className="w-full text-left flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--bg-hover)] transition-colors"
            onClick={() => setExpandedHistIdx(expandedHistIdx === i ? null : i)}
          >
            <span className="text-[var(--text-dim)] text-[10px] w-6 text-right shrink-0">
              #{h.index}
            </span>
            <ActionLabel action={h.action} />
            <span className="text-[var(--text-muted)] font-mono">
              {h.original_event?.event ?? "—"}
            </span>
            {h.delay_ms > 0 && (
              <span className="text-[var(--warning)] text-[9px]">+{h.delay_ms}ms</span>
            )}
            <span className="ml-auto text-[var(--text-dim)] text-[9px]">
              {new Date(h.timestamp * 1000).toLocaleTimeString()}
            </span>
            <span className="text-[var(--text-dim)] text-[9px]">
              {expandedHistIdx === i ? "▲" : "▼"}
            </span>
          </button>
          {expandedHistIdx === i && (
            <div className="px-3 pb-2">
              {h.sent_event && (
                <pre className="text-[10px] text-[var(--text)] bg-[var(--bg)] rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap break-all">
                  {prettyData(h.sent_event.data)}
                </pre>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Pending events (breakpoint held) */}
      {pending.map((p, i) => (
        <div key={`p-${i}`} className="border-b border-[var(--border)] bg-[var(--bg-hover)]">
          {/* Summary row */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className="text-[var(--text-dim)] text-[10px] w-6 text-right shrink-0">
              #{p.index}
            </span>
            <span className="text-[var(--warning)] text-[9px] uppercase font-semibold">
              pending
            </span>
            <span className="text-[var(--text)] font-mono">{p.event.event}</span>
            <button
              className="ml-1 text-[9px] text-[var(--text-dim)] hover:text-[var(--text)]"
              onClick={() => setExpandedPendIdx(expandedPendIdx === i ? null : i)}
            >
              {expandedPendIdx === i ? "▲" : "▼"}
            </button>
            {/* Action buttons */}
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onForward(p.index, p.event)}
                className="px-2 py-0.5 text-[10px] text-[var(--success)] border border-[var(--success)]/40 rounded hover:bg-[var(--success)]/10 transition-colors"
              >
                Forward
              </button>
              <button
                onClick={() => setModal({ kind: "edit", index: p.index, event: p.event })}
                className="px-2 py-0.5 text-[10px] text-[var(--accent)] border border-[var(--accent)]/40 rounded hover:bg-[var(--accent)]/10 transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDrop(p.index, p.event)}
                className="px-2 py-0.5 text-[10px] text-[var(--danger)] border border-[var(--danger)]/40 rounded hover:bg-[var(--danger)]/10 transition-colors"
              >
                Drop
              </button>
              <button
                onClick={() => setModal({ kind: "delay", index: p.index, event: p.event })}
                className="px-2 py-0.5 text-[10px] text-[var(--warning)] border border-[var(--warning)]/40 rounded hover:bg-[var(--warning)]/10 transition-colors"
              >
                Delay
              </button>
              <button
                onClick={() => setModal({ kind: "inject", afterIndex: p.index })}
                className="px-2 py-0.5 text-[10px] text-[var(--inject)] border border-[var(--inject)]/40 rounded hover:bg-[var(--inject)]/10 transition-colors"
              >
                Inject
              </button>
            </div>
          </div>

          {/* Expanded data */}
          {expandedPendIdx === i && (
            <div className="px-3 pb-2">
              <pre className="text-[10px] text-[var(--text)] bg-[var(--bg)] rounded p-2 overflow-x-auto font-mono whitespace-pre-wrap break-all">
                {prettyData(p.event.data)}
              </pre>
            </div>
          )}
        </div>
      ))}

      {/* Modals */}
      {modal?.kind === "edit" && (
        <EventEditor
          event={modal.event}
          onConfirm={(edited) => {
            onEdit(modal.index, modal.event, edited);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "inject" && (
        <InjectModal
          afterIndex={modal.afterIndex}
          onConfirm={(event) => {
            onInject(modal.afterIndex, event);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "delay" && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-[var(--bg-panel)] border border-[var(--border)] rounded-lg w-80 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <span className="text-[var(--warning)] text-[12px] font-semibold">
                Delay Event #{modal.index}
              </span>
              <button
                onClick={() => setModal(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] text-[18px] leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-wider">
                  delay (ms)
                </span>
                <input
                  type="number"
                  min={1}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-[var(--text)] text-[12px] font-mono focus:outline-none focus:border-[var(--warning)] w-full"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--border)]">
              <button
                onClick={() => setModal(null)}
                className="px-3 py-1.5 text-[11px] text-[var(--text-muted)] border border-[var(--border)] rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelay(modal.index, modal.event, delayMs);
                  setModal(null);
                }}
                className="px-3 py-1.5 text-[11px] text-white bg-[var(--warning)] hover:opacity-90 rounded"
              >
                Delay + Forward
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
