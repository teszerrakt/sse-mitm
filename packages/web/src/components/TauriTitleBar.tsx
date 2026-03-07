import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useFullscreen } from "../hooks/useFullscreen";

interface TauriTitleBarProps {
  children: ReactNode;
}

/**
 * Title bar wrapper that handles macOS Overlay titlebar in Tauri.
 *
 * In Tauri: renders a 28px-high drag region with left padding (68px)
 * to clear the traffic lights. In fullscreen, padding is removed.
 *
 * In browser: renders a standard-height bar with normal padding.
 */
export function TauriTitleBar({ children }: TauriTitleBarProps) {
  const isFullscreen = useFullscreen();

  return (
    <div
      data-tauri-drag-region
      className={
        "flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-panel)] shrink-0 select-none"
      }
      style={isTauri() && !isFullscreen ? { paddingLeft: 76 } : undefined}
    >
      {children}
    </div>
  );
}
