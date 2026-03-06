import { useState, useEffect, useCallback } from "react";
import type { AppConfig } from "../types";

interface UseConfigResult {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  saveConfig: (updated: AppConfig) => Promise<void>;
  reload: () => void;
}

export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/config")
      .then((res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        return res.json() as Promise<AppConfig>;
      })
      .then((data) => {
        if (!cancelled) {
          setConfig(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load config");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [revision]);

  const saveConfig = useCallback(async (updated: AppConfig): Promise<void> => {
    const res = await fetch("/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Server returned ${res.status}`);
    }
    const saved = (await res.json()) as AppConfig;
    setConfig(saved);
  }, []);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  return { config, loading, error, saveConfig, reload };
}
