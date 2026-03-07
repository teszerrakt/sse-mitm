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

interface Props {
  onBack: () => void;
}

export function SettingsPage({ onBack }: Props) {
  const { config, loading, error, saveConfig } = useConfig();

  const [patterns, setPatterns] = useState<string[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Initialise local patterns from fetched config (once)
  const effectivePatterns = patterns ?? config?.sse_patterns ?? [];

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

  const handleSave = useCallback(async () => {
    if (!config) return;
    const trimmed = effectivePatterns.map((p) => p.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      setSaveError("At least one pattern is required.");
      setSaveStatus("error");
      return;
    }
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveConfig({ ...config, sse_patterns: trimmed });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      setSaveStatus("error");
    }
  }, [config, effectivePatterns, saveConfig]);

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
            {/* Intercept Patterns */}
            <section>
              <div className="mb-3">
                <h2 className="text-foreground text-sm font-semibold uppercase tracking-widest">
                  Intercept Patterns
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Glob patterns matched against the full request URL. Use{" "}
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
