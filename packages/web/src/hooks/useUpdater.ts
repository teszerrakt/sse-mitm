import { useState, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";

type UpdateStatus =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "available"; version: string; body: string | undefined }
  | { phase: "downloading"; downloaded: number; total: number | undefined }
  | { phase: "ready" }
  | { phase: "up-to-date" }
  | { phase: "error"; message: string };

/**
 * Tauri auto-updater hook.
 * Only functional inside the Tauri shell — returns a no-op in the browser.
 */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ phase: "idle" });

  const checkForUpdate = useCallback(async () => {
    if (!isTauri()) return;
    setStatus({ phase: "checking" });

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        setStatus({ phase: "up-to-date" });
        // Auto-dismiss after a few seconds
        setTimeout(() => setStatus({ phase: "idle" }), 4000);
        return;
      }

      setStatus({
        phase: "available",
        version: update.version,
        body: update.body ?? undefined,
      });
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : "Update check failed",
      });
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    if (!isTauri()) return;
    setStatus({ phase: "downloading", downloaded: 0, total: undefined });

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");

      const update = await check();
      if (!update) {
        setStatus({ phase: "up-to-date" });
        return;
      }

      let downloaded = 0;
      let contentLength: number | undefined;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? undefined;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            setStatus({ phase: "downloading", downloaded, total: contentLength });
            break;
          case "Finished":
            break;
        }
      });

      setStatus({ phase: "ready" });

      // Give a moment for the user to see the "ready" state, then relaunch
      setTimeout(() => relaunch(), 1500);
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : "Download failed",
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus({ phase: "idle" });
  }, []);

  return { status, checkForUpdate, downloadAndInstall, dismiss };
}
