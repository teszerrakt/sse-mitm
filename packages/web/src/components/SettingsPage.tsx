import { useState, useCallback } from "react";
import { ArrowLeft, X, Plus } from "lucide-react";
import { useConfig } from "../hooks/useConfig";

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
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          title="Back to inspector"
        >
          <ArrowLeft size={16} />
          <span className="text-sm">Back</span>
        </button>
        <span className="text-[var(--text)] font-semibold text-base tracking-tight">Settings</span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {loading && <p className="text-[var(--text-muted)] text-sm">Loading config…</p>}

        {error && (
          <div className="rounded px-3 py-2 bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] text-sm">
            Failed to load config: {error}
          </div>
        )}

        {config && (
          <>
            {/* Intercept Patterns */}
            <section>
              <div className="mb-3">
                <h2 className="text-[var(--text)] text-sm font-semibold uppercase tracking-widest">
                  Intercept Patterns
                </h2>
                <p className="text-[var(--text-muted)] text-sm mt-1">
                  Glob patterns matched against the full request URL. Use{" "}
                  <code className="text-[var(--accent)] bg-[var(--bg)] px-1 rounded">*</code> as
                  wildcard.
                </p>
              </div>

              <div className="space-y-2">
                {effectivePatterns.map((pattern, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={pattern}
                      onChange={(e) => handlePatternChange(idx, e.target.value)}
                      placeholder="*/sse*"
                      className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] text-sm font-mono placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)] transition-colors"
                      spellCheck={false}
                    />
                    <button
                      onClick={() => handleRemovePattern(idx)}
                      disabled={effectivePatterns.length <= 1}
                      className="w-8 h-8 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      title="Remove pattern"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddPattern}
                className="mt-3 flex items-center gap-2 text-[var(--accent)] hover:text-[var(--accent-hover)] text-sm transition-colors"
              >
                <Plus size={14} />
                Add pattern
              </button>
            </section>

            {/* Server Info */}
            <section>
              <h2 className="text-[var(--text)] text-sm font-semibold uppercase tracking-widest mb-3">
                Server Info
              </h2>
              <div className="rounded border border-[var(--border)] divide-y divide-[var(--border)] overflow-hidden">
                <InfoRow label="Relay Host" value={config.relay_host} />
                <InfoRow label="Relay Port" value={String(config.relay_port)} />
              </div>
              <p className="text-[var(--text-muted)] text-sm mt-2">
                To change host/port, edit <code className="text-[var(--text)]">config.json</code>{" "}
                and restart.
              </p>
            </section>

            {/* Save */}
            <section className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saveStatus === "saving"}
                className="px-4 py-2 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveStatus === "saving" ? "Saving…" : "Save"}
              </button>

              {saveStatus === "saved" && (
                <span className="text-[var(--success)] text-sm">
                  Saved — mitmproxy will pick up changes on the next request.
                </span>
              )}
              {saveStatus === "error" && saveError && (
                <span className="text-[var(--danger)] text-sm">{saveError}</span>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center px-3 py-2 bg-[var(--bg-panel)]">
      <span className="w-28 text-[var(--text-muted)] text-sm shrink-0">{label}</span>
      <span className="text-[var(--text)] text-sm font-mono">{value}</span>
    </div>
  );
}
