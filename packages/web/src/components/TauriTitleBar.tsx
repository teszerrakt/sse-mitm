import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useMaximizeToggle } from "../hooks/useMaximizeToggle";

interface TauriTitleBarProps {
  children: ReactNode;
}

const IS_TAURI = isTauri();

/**
 * Title bar wrapper that handles macOS Overlay titlebar in Tauri.
 *
 * Uses a native DOM mousedown listener (not React synthetic events) for
 * reliable drag + double-click handling in Tauri v2 WebKit. This matches
 * the pattern from the official Tauri docs: e.detail === 2 to detect
 * double-click, otherwise starts dragging.
 *
 * Double-click uses manual maximize/unmaximize tracking instead of
 * toggleMaximize(), which is unreliable on macOS overlay title bars
 * due to stale is_maximized() return values (tauri-apps/tauri#5812).
 *
 * In Tauri: renders a drag region with relative positioning so children
 * can use absolute centering for the title/address.
 *
 * In browser: renders a standard-height bar with normal padding.
 */
export function TauriTitleBar({ children }: TauriTitleBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const toggleMaximize = useMaximizeToggle();

  useEffect(() => {
    if (!IS_TAURI) return;
    const el = ref.current;
    if (!el) return;

    const appWindow = getCurrentWindow();

    const isInteractive = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.closest("button, a, input, select, textarea, [data-no-drag]");

    const handler = (e: MouseEvent) => {
      if (e.buttons !== 1) return;
      if (isInteractive(e.target)) return;

      if (e.detail === 2) {
        toggleMaximize();
      } else {
        appWindow.startDragging();
      }
    };

    el.addEventListener("mousedown", handler);
    return () => el.removeEventListener("mousedown", handler);
  }, [toggleMaximize]);

  return (
    <div
      ref={ref}
      className="relative flex items-center justify-between px-4 h-10 border-b border-border bg-panel shrink-0 select-none"
    >
      {children}
    </div>
  );
}
