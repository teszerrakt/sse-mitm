import type { SessionState } from "../types";

interface Props {
  sessions: Record<string, SessionState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusDot(status: string) {
  if (status === "active") return "bg-[var(--success)]";
  if (status === "completed") return "bg-[var(--text-dim)]";
  return "bg-[var(--danger)]";
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ? u.search.slice(0, 30) : "");
  } catch {
    return url.slice(0, 50);
  }
}

export function NetworkTab({ sessions, selectedId, onSelect }: Props) {
  const list = Object.values(sessions).sort((a, b) => a.info.created_at - b.info.created_at);

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-[var(--border)]">
      {/* Header */}
      <div className="px-3 py-2 text-[var(--text-muted)] text-[11px] uppercase tracking-widest border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        SSE Sessions
      </div>

      {list.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-dim)] text-[11px] px-4 text-center">
          Waiting for SSE requests...
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {list.map((s) => {
          const isSelected = s.info.id === selectedId;
          const hasPending = s.info.pending_count > 0;

          return (
            <button
              key={s.info.id}
              onClick={() => onSelect(s.info.id)}
              className={[
                "w-full text-left px-3 py-2 border-b border-[var(--border)] transition-colors",
                isSelected
                  ? "bg-[var(--bg-selected)]"
                  : "bg-transparent hover:bg-[var(--bg-hover)]",
              ].join(" ")}
            >
              {/* Top row: status dot + method + pending badge */}
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(s.info.status)}`} />
                <span className="text-[var(--text-muted)] text-[10px] uppercase">
                  {s.info.request.method}
                </span>
                {hasPending && (
                  <span className="ml-auto text-[9px] bg-[var(--accent)] text-white rounded-full px-1.5 py-0.5 leading-none">
                    {s.info.pending_count}
                  </span>
                )}
              </div>
              {/* URL */}
              <div className="text-[var(--text)] text-[11px] truncate font-mono">
                {shortUrl(s.info.request.url)}
              </div>
              {/* Stats */}
              <div className="text-[var(--text-dim)] text-[10px] mt-0.5">
                {s.info.event_count} events
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
