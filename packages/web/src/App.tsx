import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Settings, Trash2 } from "lucide-react";
import { useSessions } from "./hooks/useSessions";
import { useConfig } from "./hooks/useConfig";
import { useClientAliases } from "./hooks/useClientAliases";
import { NetworkTab } from "./components/NetworkTab";
import { SessionDetail } from "./components/SessionDetail";
import { SettingsPage } from "./components/SettingsPage";
import { ConfirmModal } from "./components/ConfirmModal";
import { TauriTitleBar } from "./components/TauriTitleBar";
import { MainTitleBar } from "./components/MainTitleBar";
import { AppFooter } from "./components/AppFooter";
import { VersionInfo } from "./components/VersionInfo";
import { SplashScreen } from "./components/SplashScreen";
import orthrusLogo from "./assets/orthrus.png";

type View = "inspector" | "settings";

export default function App() {
  const [view, setView] = useState<View>("inspector");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [splashDone, setSplashDone] = useState(!isTauri());
  const { config, loading: configLoading } = useConfig();
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
    clearSessions,
  } = useSessions();

  const selected = selectedId ? sessions[selectedId] : null;

  if (view === "settings") {
    return <SettingsPage onBack={() => setView("inspector")} />;
  }

  const showSplash = !splashDone && isTauri();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {showSplash && (
        <SplashScreen
          fadeOut={!configLoading}
          onComplete={() => setSplashDone(true)}
        />
      )}
      <TauriTitleBar>
        {/* In Tauri: center the title absolutely; in browser: normal left-aligned flow */}
        {isTauri() ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <MainTitleBar proxyAddress={config?.proxy_address ?? null} />
            </div>
          </div>
        ) : (
          <MainTitleBar proxyAddress={config?.proxy_address ?? null} />
        )}
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`text-[var(--text-muted)] ${isTauri() ? "text-xs" : "text-sm"}`}
          >
            {Object.keys(sessions).length} session
            {Object.keys(sessions).length !== 1 ? "s" : ""}
          </span>
          {Object.keys(sessions).length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className={`flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors ${isTauri() ? "w-6 h-6" : "w-8 h-8"}`}
              title="Clear all sessions"
            >
              <Trash2 size={isTauri() ? 13 : 16} />
            </button>
          )}
          <button
            onClick={() => setView("settings")}
            className={`flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors ${isTauri() ? "w-6 h-6" : "w-8 h-8"}`}
            title="Settings"
          >
            <Settings size={isTauri() ? 14 : 18} />
          </button>
        </div>
      </TauriTitleBar>

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
              onEdit={(idx, orig, edited) =>
                edit(selected.info.id, idx, orig, edited)
              }
              onDrop={(idx, ev) => drop(selected.info.id, idx, ev)}
              onInject={(afterIdx, ev) =>
                inject(selected.info.id, afterIdx, ev)
              }
              onDelay={(idx, ev, ms) => delay(selected.info.id, idx, ev, ms)}
              onForwardAll={() => forwardAll(selected.info.id)}
              onSave={(filename) => saveSession(selected.info.id, filename)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <img
                src={orthrusLogo}
                alt=""
                className="w-12 h-12 rounded-sm object-cover opacity-10"
              />
              <div className="flex flex-col gap-1">
                <span className="text-[var(--text-muted)] text-sm">
                  Select a session to inspect events
                </span>
                <span className="text-[var(--text-dim)] text-xs">
                  Forward, edit, drop, or inject SSE events in real time
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear sessions confirmation modal */}
      <ConfirmModal
        open={showClearConfirm}
        title="Clear All Sessions"
        message={`Are you sure you want to clear all ${Object.keys(sessions).length} session(s)? This action cannot be undone.`}
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={() => {
          clearSessions();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      <AppFooter>
        <VersionInfo />
      </AppFooter>
    </div>
  );
}
