import { useState } from "react";
import type { SessionState, SSEEvent } from "../types";
import { EventRow } from "./EventRow";
import { RequestPreview } from "./RequestPreview";
import { AutoForwardToggle } from "./AutoForwardToggle";

interface Props {
  session: SessionState;
  onForward: (index: number, event: SSEEvent) => void;
  onEdit: (index: number, original: SSEEvent, edited: SSEEvent) => void;
  onDrop: (index: number, event: SSEEvent) => void;
  onInject: (afterIndex: number, event: SSEEvent) => void;
  onDelay: (index: number, event: SSEEvent, delayMs: number) => void;
  onForwardAll: () => void;
  onSave: (filename: string) => void;
}

function statusBadge(status: string) {
  if (status === "active")
    return (
      <span className="text-[10px] text-[var(--success)] border border-[var(--success)]/40 rounded px-1.5 py-0.5">
        ACTIVE
      </span>
    );
  if (status === "completed")
    return (
      <span className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] rounded px-1.5 py-0.5">
        DONE
      </span>
    );
  return (
    <span className="text-[10px] text-[var(--danger)] border border-[var(--danger)]/40 rounded px-1.5 py-0.5">
      ERROR
    </span>
  );
}

export function SessionDetail({
  session,
  onForward,
  onEdit,
  onDrop,
  onInject,
  onDelay,
  onForwardAll,
  onSave,
}: Props) {
  const [autoForward, setAutoForward] = useState(false);
  const [saveFilename, setSaveFilename] = useState("");
  const [showSave, setShowSave] = useState(false);

  const handleAutoForwardChange = (v: boolean) => {
    setAutoForward(v);
    if (v) {
      // Forward all currently pending
      onForwardAll();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0 flex-wrap">
        {statusBadge(session.info.status)}
        <span className="text-[var(--text-muted)] text-[10px]">
          {session.info.event_count} events
        </span>
        {session.info.pending_count > 0 && (
          <span className="text-[var(--warning)] text-[10px]">
            {session.info.pending_count} pending
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <AutoForwardToggle autoForward={autoForward} onChange={handleAutoForwardChange} />

          {session.info.pending_count > 0 && !autoForward && (
            <button
              onClick={onForwardAll}
              className="px-2 py-1 text-[10px] text-[var(--success)] border border-[var(--success)]/40 rounded hover:bg-[var(--success)]/10 transition-colors"
            >
              Forward All
            </button>
          )}

          <button
            onClick={() => setShowSave((v) => !v)}
            className="px-2 py-1 text-[10px] text-[var(--text-muted)] border border-[var(--border)] rounded hover:text-[var(--text)] transition-colors"
          >
            Save Mock
          </button>
        </div>
      </div>

      {/* Save mock inline form */}
      {showSave && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-hover)] shrink-0">
          <span className="text-[10px] text-[var(--text-muted)]">filename:</span>
          <input
            className="bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-0.5 text-[11px] font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] flex-1"
            value={saveFilename}
            onChange={(e) => setSaveFilename(e.target.value)}
            placeholder="session_name.json"
          />
          <button
            onClick={() => {
              if (saveFilename) {
                onSave(saveFilename.endsWith(".json") ? saveFilename : saveFilename + ".json");
                setShowSave(false);
                setSaveFilename("");
              }
            }}
            className="px-2 py-0.5 text-[10px] text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] rounded"
          >
            Save
          </button>
          <button
            onClick={() => setShowSave(false)}
            className="text-[10px] text-[var(--text-muted)]"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Request info */}
      <RequestPreview request={session.info.request} />

      {/* Events */}
      <div className="flex-1 overflow-y-auto">
        {session.pending.length === 0 && session.history.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[11px]">
            No events yet
          </div>
        ) : (
          <EventRow
            pending={session.pending}
            history={session.history}
            onForward={onForward}
            onEdit={onEdit}
            onDrop={onDrop}
            onInject={onInject}
            onDelay={onDelay}
          />
        )}
      </div>
    </div>
  );
}
