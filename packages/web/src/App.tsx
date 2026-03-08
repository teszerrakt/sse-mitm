import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useHotkey } from "@tanstack/react-hotkeys";
import { EditorView } from "@codemirror/view";
import { openSearchPanel } from "@codemirror/search";
import { Settings, Trash2 } from "lucide-react";
import { useSessions } from "./hooks/useSessions";
import { useTraffic } from "./hooks/useTraffic";
import { useConfig } from "./hooks/useConfig";
import { useClientAliases } from "./hooks/useClientAliases";
import { NetworkTab } from "./components/NetworkTab";
import { SessionDetail } from "./components/SessionDetail";
import { TrafficList } from "./components/TrafficList";
import { TrafficDetail } from "./components/TrafficDetail";
import { SettingsPage } from "./components/SettingsPage";
import { ConfirmModal } from "./components/ConfirmModal";
import { TauriTitleBar } from "./components/TauriTitleBar";
import { MainTitleBar } from "./components/MainTitleBar";
import { AppFooter } from "./components/AppFooter";
import { VersionInfo } from "./components/VersionInfo";
import { SplashScreen } from "./components/SplashScreen";
import { Button } from "./components/ui/button";
import boredOrthrus from "./assets/bored-orthrus.webp";

type View = "inspector" | "settings";
type Tab = "sse" | "traffic";

export default function App() {
  const [view, setView] = useState<View>("inspector");
  const [tab, setTab] = useState<Tab>("sse");
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
    closeSession,
  } = useSessions();

  const {
    entries: trafficEntries,
    selectedTrafficId,
    selectedEntry: selectedTraffic,
    setSelectedTrafficId,
    resumeRequest,
    resumeResponse,
    abortRequest,
    clearTraffic,
  } = useTraffic();

  const selected = selectedId ? sessions[selectedId] : null;

  // Global Cmd/Ctrl+F: open CodeMirror search panel in the nearest editor.
  // In Tauri/WebKit the read-only editor may not have keyboard focus even after
  // clicking, so we walk up from the active element to find a .cm-editor and
  // dispatch the search command to its EditorView.
  useHotkey("Mod+F", () => {
    const active = document.activeElement;
    if (!active) return;
    // Walk up from the focused element to find the enclosing CodeMirror editor
    const editorEl = active.closest(".cm-editor");
    if (!editorEl) return;
    const view = EditorView.findFromDOM(editorEl as HTMLElement);
    if (view) openSearchPanel(view);
  });

  if (view === "settings") {
    return <SettingsPage onBack={() => setView("inspector")} />;
  }

  const showSplash = !splashDone && isTauri();

  // Counts for tab badges
  const sessionCount = Object.keys(sessions).length;
  const trafficCount = trafficEntries.length;
  const interceptedCount = trafficEntries.filter(
    (e) =>
      e.status === "pending_request" || e.status === "pending_response",
  ).length;

  const handleClear = () => {
    if (tab === "sse") {
      clearSessions();
    } else {
      clearTraffic();
    }
    setShowClearConfirm(false);
  };

  const clearLabel =
    tab === "sse"
      ? `Clear all ${sessionCount} session(s)?`
      : `Clear all ${trafficCount} traffic entries?`;

  const clearTitle =
    tab === "sse" ? "Clear All Sessions" : "Clear All Traffic";

  const itemCount = tab === "sse" ? sessionCount : trafficCount;

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
            className={`text-muted-foreground ${isTauri() ? "text-xs" : "text-sm"}`}
          >
            {itemCount} {tab === "sse" ? "session" : "request"}
            {itemCount !== 1 ? "s" : ""}
          </span>
          {itemCount > 0 && (
            <Button
              variant="ghost"
              size={isTauri() ? "icon-xs" : "icon-sm"}
              onClick={() => setShowClearConfirm(true)}
              className="hover:text-danger hover:bg-hover"
              title={clearTitle}
            >
              <Trash2 size={isTauri() ? 13 : 16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size={isTauri() ? "icon-xs" : "icon-sm"}
            onClick={() => setView("settings")}
            className="hover:bg-hover"
            title="Settings"
          >
            <Settings size={isTauri() ? 14 : 18} />
          </Button>
        </div>
      </TauriTitleBar>

      {/* Main layout: left panel + right panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: session/traffic list with tabs */}
        <div className="w-80 shrink-0 overflow-hidden flex flex-col">
          {/* Tab switcher */}
          <div className="flex border-b border-border bg-panel shrink-0">
            <button
              onClick={() => setTab("sse")}
              className={[
                "flex-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors relative",
                tab === "sse"
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              SSE
              {sessionCount > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {sessionCount}
                </span>
              )}
              {tab === "sse" && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
              )}
            </button>
            <button
              onClick={() => setTab("traffic")}
              className={[
                "flex-1 px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors relative",
                tab === "traffic"
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              HTTP
              {trafficCount > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {trafficCount}
                </span>
              )}
              {interceptedCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-warning text-[10px] text-white font-semibold">
                  {interceptedCount}
                </span>
              )}
              {tab === "traffic" && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
              )}
            </button>
          </div>

          {/* Tab content */}
          {tab === "sse" ? (
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
          ) : (
            <TrafficList
              entries={trafficEntries}
              selectedId={selectedTrafficId}
              onSelect={setSelectedTrafficId}
            />
          )}
        </div>

        {/* Right: detail panel */}
        <div className="flex-1 overflow-hidden">
          {tab === "sse" && selected ? (
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
              onClose={() => closeSession(selected.info.id)}
            />
          ) : tab === "traffic" && selectedTraffic ? (
            <TrafficDetail
              entry={selectedTraffic}
              onResumeRequest={resumeRequest}
              onResumeResponse={resumeResponse}
              onAbort={abortRequest}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <img src={boredOrthrus} alt="" className="w-56 opacity-50" />
              <div className="flex flex-col gap-1">
                <span className="text-muted-foreground text-sm">
                  {tab === "sse"
                    ? "Select a session to inspect events"
                    : "Select a request to inspect details"}
                </span>
                <span className="text-dim text-xs">
                  {tab === "sse"
                    ? "Forward, edit, drop, or inject SSE events in real time"
                    : "View HTTP request/response details, edit intercepted requests"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Clear confirmation modal */}
      <ConfirmModal
        open={showClearConfirm}
        title={clearTitle}
        message={`${clearLabel} This action cannot be undone.`}
        confirmLabel="Clear All"
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />

      <AppFooter>
        <VersionInfo />
      </AppFooter>
    </div>
  );
}
