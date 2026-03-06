import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Pencil } from "lucide-react";
import type { SessionState } from "../types";
import { CertModal } from "./CertModal";
import { detectOS } from "../utils/detectOS";

interface Props {
  sessions: Record<string, SessionState>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  aliases: Record<string, string>;
  onSetAlias: (ip: string, alias: string) => void;
  tlsErrorIps: Set<string>;
  onClearTlsError: (ip: string) => void;
  proxyAddress: string | null;
}

interface GroupData {
  key: string;
  ip: string | null;
  displayIp: string;
  sessions: SessionState[];
}

const UNKNOWN_KEY = "__unknown__";

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

export function NetworkTab({
  sessions,
  selectedId,
  onSelect,
  aliases,
  onSetAlias,
  tlsErrorIps,
  onClearTlsError,
  proxyAddress,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState("");
  const [certModalIp, setCertModalIp] = useState<string | null>(null);

  const groups = useMemo<GroupData[]>(() => {
    const sorted = Object.values(sessions).sort(
      (a, b) => a.info.created_at - b.info.created_at,
    );
    const map = new Map<string, GroupData>();

    for (const session of sorted) {
      const ip = session.info.client_ip;
      const key = ip ?? UNKNOWN_KEY;
      if (!map.has(key)) {
        map.set(key, {
          key,
          ip,
          displayIp: ip ?? "unknown",
          sessions: [],
        });
      }
      map.get(key)?.sessions.push(session);
    }

    const list = Array.from(map.values());
    list.sort((a, b) => {
      if (a.key === UNKNOWN_KEY && b.key !== UNKNOWN_KEY) return 1;
      if (a.key !== UNKNOWN_KEY && b.key === UNKNOWN_KEY) return -1;
      return a.displayIp.localeCompare(b.displayIp);
    });

    return list;
  }, [sessions]);

  const selectedGroup = certModalIp
    ? (groups.find((g) => g.ip === certModalIp) ?? null)
    : null;
  const selectedGroupUa = selectedGroup?.sessions[0]?.info.user_agent ?? null;
  const selectedOs = detectOS(selectedGroupUa);
  const selectedLabel =
    (certModalIp ? aliases[certModalIp] : null) || selectedOs.os || "Unknown";

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEditAlias = (ip: string, fallback: string) => {
    setEditingIp(ip);
    setEditingAlias(aliases[ip] ?? fallback);
  };

  const finishEditAlias = () => {
    if (!editingIp) return;
    onSetAlias(editingIp, editingAlias);
    setEditingIp(null);
    setEditingAlias("");
  };

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-[var(--border)]">
      <div className="px-3 py-2 text-[var(--text-muted)] text-xs uppercase tracking-widest border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        SSE Sessions
      </div>

      {groups.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] text-sm px-4 text-center">
          Waiting for SSE requests...
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {groups.map((group) => {
          const first = group.sessions[0];
          const osInfo = detectOS(first?.info.user_agent);
          const groupAlias = group.ip
            ? aliases[group.ip] || osInfo.os
            : "Unknown";
          const isExpanded = !collapsed.has(group.key);
          const showTlsWarning = group.ip ? tlsErrorIps.has(group.ip) : false;

          return (
            <div key={group.key} className="border-b border-[var(--border)]">
              <button
                onClick={() => toggleGroup(group.key)}
                className="group w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown
                      size={14}
                      className="text-[var(--text-muted)] shrink-0"
                    />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="text-[var(--text-muted)] shrink-0"
                    />
                  )}
                  <osInfo.Icon
                    size={14}
                    className="text-[var(--text-muted)] shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {editingIp === group.ip && group.ip ? (
                        <input
                          autoFocus
                          value={editingAlias}
                          onChange={(e) => setEditingAlias(e.target.value)}
                          onBlur={finishEditAlias}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") finishEditAlias();
                            if (e.key === "Escape") {
                              setEditingIp(null);
                              setEditingAlias("");
                            }
                          }}
                          className="min-w-0 w-28 bg-[var(--bg)] border border-[var(--border)] rounded px-1.5 py-0.5 text-sm text-[var(--text)]"
                        />
                      ) : (
                        <>
                          <span className="text-sm text-[var(--text)] truncate">
                            {groupAlias}
                          </span>
                          {group.ip ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditAlias(group.ip as string, groupAlias);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-[var(--text-dim)] hover:text-[var(--text)] transition-opacity"
                              title="Edit alias"
                            >
                              <Pencil size={12} />
                            </button>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono truncate">
                      {group.displayIp}
                    </div>
                  </div>

                  {showTlsWarning && group.ip ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCertModalIp(group.ip);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-1.5 py-0.5 text-xs text-[var(--warning)] hover:bg-[var(--warning)]/20"
                      title="Certificate setup required"
                    >
                      <AlertTriangle size={12} />
                      Cert
                    </button>
                  ) : null}

                  <span className="text-xs text-[var(--text-muted)]">
                    {group.sessions.length}
                  </span>
                </div>
              </button>

              {isExpanded ? (
                <div>
                  {group.sessions.map((s) => {
                    const isSelected = s.info.id === selectedId;
                    const hasPending = s.info.pending_count > 0;

                    return (
                      <button
                        key={s.info.id}
                        onClick={() => onSelect(s.info.id)}
                        className={[
                          "w-full text-left pl-9 pr-3 py-2 border-t border-[var(--border)] transition-colors",
                          isSelected
                            ? "bg-[var(--bg-selected)]"
                            : "bg-transparent hover:bg-[var(--bg-hover)]",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${statusDot(s.info.status)}`}
                          />
                          <span className="text-[var(--text-muted)] text-xs uppercase">
                            {s.info.request.method}
                          </span>
                          {hasPending && (
                            <span className="ml-auto text-xs bg-[var(--accent)] text-white rounded-full px-2 py-0.5 leading-none">
                              {s.info.pending_count}
                            </span>
                          )}
                        </div>
                        <div className="text-[var(--text)] text-sm truncate font-mono">
                          {shortUrl(s.info.request.url)}
                        </div>
                        <div className="text-[var(--text-muted)] text-xs mt-0.5">
                          {s.info.event_count} events
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <CertModal
        open={Boolean(certModalIp)}
        onClose={() => setCertModalIp(null)}
        clientIp={certModalIp ?? ""}
        os={selectedOs.os}
        label={selectedLabel}
        proxyAddress={proxyAddress}
        onResolved={() => {
          if (certModalIp) onClearTlsError(certModalIp);
        }}
      />
    </div>
  );
}
