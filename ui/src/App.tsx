import { useState } from "react";
import { Settings, Copy, Check } from "lucide-react";
import { useSessions } from "./hooks/useSessions";
import { useConfig } from "./hooks/useConfig";
import { useClientAliases } from "./hooks/useClientAliases";
import { NetworkTab } from "./components/NetworkTab";
import { SessionDetail } from "./components/SessionDetail";
import { SettingsPage } from "./components/SettingsPage";
import orthrusLogo from "./assets/orthrus.png";

type View = "inspector" | "settings";

export default function App() {
  const [view, setView] = useState<View>("inspector");
  const [copied, setCopied] = useState(false);
  const { config } = useConfig();
  const { aliases, setAlias } = useClientAliases();

  const {
    sessions,
    selectedId,
    tlsErrorIps,
    setSelectedId,
    clearTlsError,
    forward,
    edit,
    drop,
    inject,
    delay,
    forwardAll,
    saveSession,
  } = useSessions();

  const selected = selectedId ? sessions[selectedId] : null;

  const handleCopy = () => {
    if (config?.proxy_address) {
      navigator.clipboard.writeText(config.proxy_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (view === "settings") {
    return <SettingsPage onBack={() => setView("inspector")} />;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        <div className="flex items-center gap-2.5">
          <img src={orthrusLogo} alt="Orthrus logo" className="h-7 w-7 rounded-sm object-cover" />
          <span
            className="text-[var(--text)] text-base tracking-wide lowercase"
            style={{ fontFamily: '"Satyp", "SF Mono", monospace' }}
          >
            orthrus
          </span>
        </div>
        {/* Proxy address — click to copy */}
        <button
          onClick={handleCopy}
          title="Click to copy proxy address"
          className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors group"
        >
          <span className="font-mono">{config?.proxy_address ?? "..."}</span>
          {copied ? (
            <Check size={13} className="text-[var(--success)]" />
          ) : (
            <Copy size={13} className="opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-[var(--text-muted)]">
            {Object.keys(sessions).length} session{Object.keys(sessions).length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setView("settings")}
            className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Main layout: left panel + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: session list */}
        <div className="w-80 shrink-0 overflow-hidden flex flex-col">
          <NetworkTab
            sessions={sessions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            aliases={aliases}
            onSetAlias={setAlias}
            tlsErrorIps={tlsErrorIps}
            onClearTlsError={clearTlsError}
            proxyAddress={config?.proxy_address ?? null}
          />
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
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
              Select a session to inspect events
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
