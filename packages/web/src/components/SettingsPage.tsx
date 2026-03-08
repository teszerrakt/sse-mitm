import { useState, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { ArrowLeft, X, Plus } from "lucide-react";
import { useConfig } from "../hooks/useConfig";
import { TauriTitleBar } from "./TauriTitleBar";
import { MainTitleBar } from "./MainTitleBar";
import { AppFooter } from "./AppFooter";
import { VersionInfo } from "./VersionInfo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import { Switch } from "./ui/switch";
import type { ApiBreakpointRule, BreakpointStage } from "../types";

interface Props {
  onBack: () => void;
}

const STAGE_OPTIONS: { value: BreakpointStage; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "request", label: "Request" },
  { value: "response", label: "Response" },
];

export function SettingsPage({ onBack }: Props) {
  const { config, loading, error, saveConfig } = useConfig();

  const [patterns, setPatterns] = useState<string[] | null>(null);
  const [apiRules, setApiRules] = useState<ApiBreakpointRule[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise local patterns from fetched config (once)
  const effectivePatterns = patterns ?? config?.sse_patterns ?? [];
  const effectiveApiRules = apiRules ?? config?.api_breakpoint_patterns ?? [];

  const handlePatternChange = useCallback(
    (idx: number, value: string) => {
      setPatterns((prev) => {
        const base = prev ?? config?.sse_patterns ?? [];
        const next = [...base];
        next[idx] = value;
        return next;
      });
    },
    [config],
  );

  const handleAddPattern = useCallback(() => {
    setPatterns((prev) => {
      const base = prev ?? config?.sse_patterns ?? [];
      return [...base, "*/sse*"];
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
    const trimmedSse = effectivePatterns.map((p) => p.trim()).filter(Boolean);
    if (trimmedSse.length === 0) {
      setSaveError("At least one SSE pattern is required.");
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

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {loading && <p className="text-muted-foreground text-sm">Loading config…</p>}

        {error && (
          <div className="rounded px-3 py-2 bg-danger/10 border border-danger/30 text-danger text-sm">
            Failed to load config: {error}
          </div>
        )}

        {config && (
          <>
            {/* SSE Intercept Patterns */}
            <section>
              <div className="mb-3">
                <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                  SSE Intercept Patterns
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Glob patterns for SSE stream interception. Matching requests are
                  relayed through the breakpoint debugger. Use{" "}
                  <code className="text-accent bg-background px-1 rounded">*</code> as
                  wildcard.
                </p>
              </div>

              <div className="space-y-2">
                {effectivePatterns.map((pattern, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={pattern}
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
                ))}
              </div>

              <Button
                variant="accent"
                size="xs"
                onClick={handleAddPattern}
                className="mt-3"
              >
                <Plus size={14} />
                Add pattern
              </Button>
            </section>

            {/* API Breakpoint Patterns */}
            <section>
              <div className="mb-3">
                <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                  API Breakpoint Patterns
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Glob patterns for HTTP request/response breakpoints. Matching
                  requests are paused so you can inspect and modify them before
                  forwarding. Set the <strong>stage</strong> to control whether
                  the request, the response, or both are intercepted.
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
                      size="sm"
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
                      title="Remove pattern"
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
                className="mt-3"
              >
                <Plus size={14} />
                Add pattern
              </Button>

              {effectiveApiRules.length === 0 && (
                <p className="text-dim text-xs mt-2">
                  No patterns — all HTTP traffic will be observed but not intercepted.
                </p>
              )}
            </section>

            {/* Server Info */}
            <section>
              <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest mb-3">
                Server Info
              </h2>
              <div className="rounded border border-border divide-y divide-border overflow-hidden">
                <InfoRow label="Relay Host" value={config.relay_host} />
                <InfoRow label="Relay Port" value={String(config.relay_port)} />
              </div>
              <p className="text-muted-foreground text-sm mt-2">
                To change host/port, edit <code className="text-foreground">config.json</code>{" "}
                and restart.
              </p>
            </section>

            {/* Save */}
            <section className="flex items-center gap-3">
              <Button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
              >
                {saveStatus === "saving" ? "Saving…" : "Save"}
              </Button>

              {saveStatus === "saved" && (
                <span className="text-success text-sm">
                  Saved — mitmproxy will pick up changes on the next request.
                </span>
              )}
              {saveStatus === "error" && saveError && (
                <span className="text-danger text-sm">{saveError}</span>
              )}
            </section>
          </>
        )}
      </div>

      <AppFooter>
        <VersionInfo />
      </AppFooter>
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
