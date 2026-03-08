import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { AppConfig } from "../types";
import { apiFetch } from "../utils/api";

interface ConfigContextValue {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  saveConfig: (updated: AppConfig) => Promise<void>;
  reload: () => void;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 15;
    const retryDelay = 2000;

    setLoading(true);
    setError(null);

    const tryFetch = () => {
      if (cancelled) return;
      attempt++;

      apiFetch("/config")
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
          if (cancelled) return;
          if (attempt < maxAttempts) {
            // Backend might still be starting — retry
            setTimeout(tryFetch, retryDelay);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load config");
            setLoading(false);
          }
        });
    };

    tryFetch();

    return () => {
      cancelled = true;
    };
  }, [revision]);

  const saveConfig = useCallback(async (updated: AppConfig): Promise<void> => {
    const res = await apiFetch("/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    // Read body exactly once — avoids consuming the stream twice.
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = body as { error?: string };
      throw new Error(err.error ?? `Server returned ${res.status}`);
    }
    setConfig(body as AppConfig);
  }, []);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  return (
    <ConfigContext.Provider value={{ config, loading, error, saveConfig, reload }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within <ConfigProvider>");
  return ctx;
}
