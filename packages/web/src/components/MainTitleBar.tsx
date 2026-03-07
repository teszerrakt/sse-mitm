import { useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Copy, Check, Loader2 } from "lucide-react";
import orthrusLogo from "../assets/orthrus.png";

interface MainTitleBarProps {
  proxyAddress: string | null;
}

/**
 * Left-side title bar content: logo + "ORTHRUS | Listening on ip:port".
 * Shows a spinner while the backend is starting up.
 * Composable — place inside TauriTitleBar alongside other elements.
 */
export function MainTitleBar({ proxyAddress }: MainTitleBarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (proxyAddress) {
      navigator.clipboard.writeText(proxyAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <>
      {/* Logo — hidden in Tauri to save space beside traffic lights */}
      {!isTauri() && (
        <div className="flex items-center gap-2.5">
          <img
            src={orthrusLogo}
            alt="Orthrus logo"
            className="h-7 w-7 rounded-sm object-cover"
          />
        </div>
      )}
      {/* App title + listening address or loading spinner */}
      <div className="flex items-center gap-1.5" data-tauri-drag-region>
        <span
          data-tauri-drag-region
          className="text-[var(--text)] tracking-wide uppercase font-semibold text-base"
          style={{ fontFamily: '"Satyp", "SF Mono", monospace' }}
        >
          orthrus
        </span>
        <span data-tauri-drag-region className="text-[var(--text-muted)] text-sm">|</span>
        {proxyAddress ? (
          <>
            <span data-tauri-drag-region className="text-[var(--text-muted)] text-sm">
              Listening on
            </span>
            <button
              onClick={handleCopy}
              title="Click to copy proxy address"
              className="flex items-center gap-1 text-[var(--text)] hover:text-[var(--accent)] transition-colors group font-semibold text-sm"
            >
              <span className="font-mono">{proxyAddress}</span>
              {copied ? (
                <Check size={13} className="text-[var(--success)]" />
              ) : (
                <Copy
                  size={13}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              )}
            </button>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[var(--text-muted)] text-sm">
            <Loader2 size={13} className="animate-spin" />
            Starting…
          </span>
        )}
      </div>
    </>
  );
}
