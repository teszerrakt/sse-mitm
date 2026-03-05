import { useSessions } from "./hooks/useSessions";
import { NetworkTab } from "./components/NetworkTab";
import { SessionDetail } from "./components/SessionDetail";

export default function App() {
  const {
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
  } = useSessions();

  const selected = selectedId ? sessions[selectedId] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        <span className="text-[var(--text)] font-semibold text-[13px] tracking-tight">
          SSE Inspector
        </span>
        <span className="text-[var(--text-dim)] text-[10px]">mitmproxy + relay</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-widest text-[var(--text-dim)]">
            {Object.keys(sessions).length} session{Object.keys(sessions).length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Main layout: left panel + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: session list */}
        <div className="w-72 shrink-0 overflow-hidden flex flex-col">
          <NetworkTab sessions={sessions} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* Right: session detail */}
        <div className="flex-1 overflow-hidden">
          {selected ? (
            <SessionDetail
              session={selected}
              onForward={(idx, ev) => forward(selected.info.id, idx, ev)}
              onEdit={(idx, orig, edited) => edit(selected.info.id, idx, orig, edited)}
              onDrop={(idx, ev) => drop(selected.info.id, idx, ev)}
              onInject={(afterIdx, ev) => inject(selected.info.id, afterIdx, ev)}
              onDelay={(idx, ev, ms) => delay(selected.info.id, idx, ev, ms)}
              onForwardAll={() => forwardAll(selected.info.id)}
              onSave={(filename) => saveSession(selected.info.id, filename)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)] text-[12px]">
              Select a session to inspect events
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
