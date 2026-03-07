import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface AppFooterProps {
  children: ReactNode;
}

/**
 * Footer bar wrapper shown at the bottom of every page.
 * Composable — place content like VersionInfo inside.
 * Supports Tauri window dragging (same as TauriTitleBar).
 */
export function AppFooter({ children }: AppFooterProps) {
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("button, a, input, select, textarea, [data-no-drag]")
    ) {
      return;
    }
    if (isTauri()) {
      e.preventDefault();
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="flex items-center gap-3 px-3 py-2 border-t border-border bg-panel shrink-0 select-none"
    >
      {children}
    </div>
  );
}
