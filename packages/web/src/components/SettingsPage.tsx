import { useState, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, X, Plus, Cookie, Info } from "lucide-react";
import { useConfig } from "../hooks/useConfig";
import { TauriTitleBar } from "./TauriTitleBar";
import { MainTitleBar } from "./MainTitleBar";
import { AppFooter } from "./AppFooter";
import { VersionInfo } from "./VersionInfo";
import { UpdateBanner } from "./UpdateBanner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Switch } from "./ui/switch";
import type { ApiBreakpointRule, BreakpointStage, SsePatternRule } from "../types";

interface Props {
  onBack: () => void;
}

type SettingsTab = "streams" | "intercept" | "server";

const STAGE_OPTIONS: { value: BreakpointStage; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "request", label: "Request" },
  { value: "response", label: "Response" },
];

export function SettingsPage({ onBack }: Props) {
  const { config, loading, error, saveConfig } = useConfig();

  const [activeTab, setActiveTab] = useState<SettingsTab>("streams");
  const [patterns, setPatterns] = useState<SsePatternRule[] | null>(null);
  const [apiRules, setApiRules] = useState<ApiBreakpointRule[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise local patterns from fetched config (once)
  const effectivePatterns = patterns ?? config?.sse_patterns ?? [];
  const effectiveApiRules = apiRules ?? config?.api_breakpoint_patterns ?? [];

  // --- Stream pattern handlers ---
  const handlePatternChange = useCallback(
    (idx: number, value: string) => {
      setPatterns((prev) => {
        const base = prev ?? config?.sse_patterns ?? [];
        const next = [...base];
        next[idx] = { ...next[idx], pattern: value };
        return next;
      });
    },
    [config],
  );

  const handlePatternBorrowToggle = useCallback(
    (idx: number, borrow: boolean) => {
      setPatterns((prev) => {
        const base = prev ?? config?.sse_patterns ?? [];
        const next = [...base];
        next[idx] = { ...next[idx], borrow_cookies: borrow };
        return next;
      });
    },
    [config],
  );

  const handleAddPattern = useCallback(() => {
    setPatterns((prev) => {
      const base = prev ?? config?.sse_patterns ?? [];
      return [...base, { pattern: "*/sse*", borrow_cookies: true }];
    });
  }, [config]);

  const handleRemovePattern = useCallback(
    (idx: number) => {
      setPatterns((prev) => {
        const base = prev ?? config?.sse_patterns ?? [];
        return base.filter((_, i) => i !== idx);
      });
    },
    [config],
  );

  // --- Intercept rule handlers ---
  const handleApiRulePatternChange = useCallback(
    (idx: number, value: string) => {
      setApiRules((prev) => {
        const base = prev ?? config?.api_breakpoint_patterns ?? [];
        const next = [...base];
        next[idx] = { ...next[idx], pattern: value };
        return next;
      });
    },
    [config],
  );

  const handleApiRuleStageChange = useCallback(
    (idx: number, stage: BreakpointStage) => {
      setApiRules((prev) => {
        const base = prev ?? config?.api_breakpoint_patterns ?? [];
        const next = [...base];
        next[idx] = { ...next[idx], stage };
        return next;
      });
    },
    [config],
  );

  const handleApiRuleToggle = useCallback(
    (idx: number, enabled: boolean) => {
      setApiRules((prev) => {
        const base = prev ?? config?.api_breakpoint_patterns ?? [];
        const next = [...base];
        next[idx] = { ...next[idx], enabled };
        return next;
      });
    },
    [config],
  );

  const handleAddApiRule = useCallback(() => {
    setApiRules((prev) => {
      const base = prev ?? config?.api_breakpoint_patterns ?? [];
      return [...base, { pattern: "*/api/*", stage: "both" as BreakpointStage, enabled: true }];
    });
  }, [config]);

  const handleRemoveApiRule = useCallback(
    (idx: number) => {
      setApiRules((prev) => {
        const base = prev ?? config?.api_breakpoint_patterns ?? [];
        return base.filter((_, i) => i !== idx);
      });
    },
    [config],
  );

  const handleSave = useCallback(async () => {
    if (!config) return;
    const trimmedSse = effectivePatterns
      .map((r) => ({ ...r, pattern: r.pattern.trim() }))
      .filter((r) => r.pattern.length > 0);
    if (trimmedSse.length === 0) {
      setSaveError("At least one stream pattern is required.");
      setSaveStatus("error");
      return;
    }
    const trimmedApi = effectiveApiRules
      .map((r) => ({ ...r, pattern: r.pattern.trim() }))
      .filter((r) => r.pattern.length > 0);
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveConfig({
        ...config,
        sse_patterns: trimmedSse,
        api_breakpoint_patterns: trimmedApi,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaveStatus("error");
    }
  }, [config, effectivePatterns, effectiveApiRules, saveConfig]);

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: "streams", label: "Streams" },
    { id: "intercept", label: "Intercept" },
    { id: "server", label: "Server" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <TauriTitleBar>
        {isTauri() ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <MainTitleBar proxyAddress={config?.proxy_address ?? null} />
            </div>
          </div>
        ) : (
          <MainTitleBar proxyAddress={config?.proxy_address ?? null} />
        )}
      </TauriTitleBar>

      {/* Settings header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-panel shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          title="Back to inspector"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </Button>
        <span className="text-foreground font-semibold text-base tracking-tight">Settings</span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center h-10 border-b border-border bg-panel shrink-0 px-6 gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={[
              "px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors relative",
              activeTab === t.id
                ? "text-accent"
                : "text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            {t.label}
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {loading && <p className="text-muted-foreground text-sm">Loading config…</p>}

        {error && (
          <div className="rounded px-3 py-2 bg-danger/10 border border-danger/30 text-danger text-sm">
            Failed to load config: {error}
          </div>
        )}

        {config && (
          <>
            {/* ─── Streams tab ─── */}
            {activeTab === "streams" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                    Stream Patterns
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    URL patterns to intercept as real-time streams. Matching requests are relayed
                    through Orthrus for event-level debugging. Use{" "}
                    <code className="text-accent bg-background px-1 rounded">*</code> as wildcard.
                  </p>
                </div>

                {/* Pattern cards */}
                <div className="space-y-3">
                  {effectivePatterns.map((rule, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border bg-panel overflow-hidden"
                    >
                      {/* Row 1: pattern input + remove */}
                      <div className="flex items-center gap-2 px-3 py-2">
                        <span className="text-muted-foreground text-xs font-medium w-16 shrink-0">
                          Pattern
                        </span>
                        <Input
                          type="text"
                          value={rule.pattern}
                          onChange={(e) => handlePatternChange(idx, e.target.value)}
                          placeholder="*/sse*"
                          className="flex-1"
                          spellCheck={false}
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRemovePattern(idx)}
                          disabled={effectivePatterns.length <= 1}
                          className="hover:text-danger hover:bg-danger/10"
                          title="Remove pattern"
                        >
                          <X size={14} />
                        </Button>
                      </div>

                      {/* Row 2: borrow cookies toggle */}
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background">
                        <Cookie
                          size={14}
                          className={rule.borrow_cookies ? "text-accent" : "text-dim"}
                        />
                        <span
                          className={`text-xs ${rule.borrow_cookies ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          Enrich cookies
                        </span>
                        <Switch
                          size="sm"
                          checked={rule.borrow_cookies}
                          onCheckedChange={(checked) =>
                            handlePatternBorrowToggle(idx, checked)
                          }
                          title={
                            rule.borrow_cookies
                              ? "Cookie enrichment enabled — click to disable"
                              : "Cookie enrichment disabled — click to enable"
                          }
                        />
                        <span
                          className={`text-xs ml-auto ${rule.borrow_cookies ? "text-success" : "text-dim"}`}
                        >
                          {rule.borrow_cookies ? "On" : "Off"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  variant="accent"
                  size="xs"
                  onClick={handleAddPattern}
                >
                  <Plus size={14} />
                  Add pattern
                </Button>

                {/* Info callout */}
                <div className="flex gap-2 rounded-lg border border-border bg-background px-3 py-2.5">
                  <Info size={14} className="text-accent shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Enrich cookies</strong> captures auth
                    cookies from normal browser traffic and injects them into this stream&apos;s
                    upstream requests. Useful when the SSE endpoint only receives thin tracking
                    cookies and needs full auth to avoid 401 errors.
                  </div>
                </div>

                {/* Save */}
                <SaveSection status={saveStatus} error={saveError} onSave={handleSave} />
              </div>
            )}

            {/* ─── Intercept tab ─── */}
            {activeTab === "intercept" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                    Intercept Rules
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    URL patterns for HTTP breakpoints. Matching requests are paused so you can
                    inspect and modify them before forwarding. Set the{" "}
                    <strong>stage</strong> to control whether the request, the response, or both
                    are intercepted.
                  </p>
                </div>

                <div className="space-y-2">
                  {effectiveApiRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-2 ${!rule.enabled ? "opacity-50" : ""}`}
                    >
                      <Switch
                        size="sm"
                        checked={rule.enabled}
                        onCheckedChange={(checked) => handleApiRuleToggle(idx, checked)}
                        title={rule.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                      />
                      <Input
                        type="text"
                        value={rule.pattern}
                        onChange={(e) => handleApiRulePatternChange(idx, e.target.value)}
                        placeholder="*/api/*"
                        className="flex-1"
                        spellCheck={false}
                      />
                      <NativeSelect
                        value={rule.stage}
                        onChange={(e) =>
                          handleApiRuleStageChange(idx, e.target.value as BreakpointStage)
                        }
                      >
                        {STAGE_OPTIONS.map((opt) => (
                          <NativeSelectOption key={opt.value} value={opt.value}>
                            {opt.label}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveApiRule(idx)}
                        className="hover:text-danger hover:bg-danger/10"
                        title="Remove rule"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="accent"
                  size="xs"
                  onClick={handleAddApiRule}
                >
                  <Plus size={14} />
                  Add rule
                </Button>

                {effectiveApiRules.length === 0 && (
                  <p className="text-dim text-xs">
                    No rules — all HTTP traffic will be observed but not intercepted.
                  </p>
                )}

                {/* Save */}
                <SaveSection status={saveStatus} error={saveError} onSave={handleSave} />
              </div>
            )}

            {/* ─── Server tab ─── */}
            {activeTab === "server" && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                    Server
                  </h2>
                  <p className="text-muted-foreground text-sm mt-1">
                    Relay server connection details. To change host/port, edit{" "}
                    <code className="text-foreground">config.json</code> and restart.
                  </p>
                </div>

                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  <InfoRow label="Relay Host" value={config.relay_host} />
                  <InfoRow label="Relay Port" value={String(config.relay_port)} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AppFooter>
        <VersionInfo />
        {isTauri() && (
          <span className="ml-auto">
            <UpdateBanner />
          </span>
        )}
      </AppFooter>
    </div>
  );
}

function SaveSection({
  status,
  error: saveError,
  onSave,
}: {
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
  onSave: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button onClick={onSave} disabled={status === "saving"}>
        {status === "saving" ? "Saving…" : "Save"}
      </Button>

      {status === "saved" && (
        <span className="text-success text-sm">
          Saved — mitmproxy will pick up changes on the next request.
        </span>
      )}
      {status === "error" && saveError && (
        <span className="text-danger text-sm">{saveError}</span>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center px-3 py-2 bg-panel">
      <span className="w-28 text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="text-foreground text-sm font-mono">{value}</span>
    </div>
  );
}
