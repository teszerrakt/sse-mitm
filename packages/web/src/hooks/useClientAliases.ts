import { useCallback, useState } from "react";

const STORAGE_KEY = "client-aliases";

type ClientAliases = Record<string, string>;

function loadAliases(): ClientAliases {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function useClientAliases() {
  const [aliases, setAliases] = useState<ClientAliases>(() => loadAliases());

  const setAlias = useCallback((ip: string, alias: string) => {
    const normalized = alias.trim();
    setAliases((prev) => {
      const next = { ...prev };
      if (normalized) {
        next[ip] = normalized;
      } else {
        delete next[ip];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { aliases, setAlias };
}
