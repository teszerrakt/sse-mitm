import { Download, RefreshCw, X, Check } from "lucide-react";
import { useUpdater } from "../hooks/useUpdater";
import { Button } from "./ui/button";

/**
 * Compact update banner shown in the app footer (Tauri only).
 * Provides check → download → relaunch flow inline.
 */
export function UpdateBanner() {
  const { status, checkForUpdate, downloadAndInstall, dismiss } = useUpdater();

  if (status.phase === "idle") {
    return (
      <Button
        variant="ghost"
        size="xs"
        onClick={checkForUpdate}
        className="text-dim hover:text-muted-foreground"
        title="Check for updates"
        data-no-drag
      >
        <RefreshCw size={11} />
        <span>Check for updates</span>
      </Button>
    );
  }

  if (status.phase === "checking") {
    return (
      <span className="text-xs text-muted-foreground animate-pulse">
        Checking for updates…
      </span>
    );
  }

  if (status.phase === "up-to-date") {
    return (
      <span className="text-xs text-success flex items-center gap-1">
        <Check size={11} />
        Up to date
      </span>
    );
  }

  if (status.phase === "available") {
    return (
      <span className="flex items-center gap-2">
        <span className="text-xs text-accent">
          v{status.version} available
        </span>
        <Button
          variant="accent"
          size="xs"
          onClick={downloadAndInstall}
          data-no-drag
        >
          <Download size={11} />
          Update
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={dismiss}
          className="text-dim hover:text-muted-foreground"
          title="Dismiss"
          data-no-drag
        >
          <X size={11} />
        </Button>
      </span>
    );
  }

  if (status.phase === "downloading") {
    const pct = status.total
      ? Math.round((status.downloaded / status.total) * 100)
      : null;
    return (
      <span className="text-xs text-muted-foreground animate-pulse">
        Downloading{pct !== null ? ` ${pct}%` : "…"}
      </span>
    );
  }

  if (status.phase === "ready") {
    return (
      <span className="text-xs text-success animate-pulse">
        Restarting…
      </span>
    );
  }

  // error
  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-danger truncate max-w-48" title={status.message}>
        Update failed
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={dismiss}
        className="text-dim hover:text-muted-foreground"
        title="Dismiss"
        data-no-drag
      >
        <X size={11} />
      </Button>
    </span>
  );
}
