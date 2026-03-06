import { useEffect, useMemo, useState } from "react";
import { Download, Shield, X } from "lucide-react";
import type { CertStatus } from "../types";
import type { DetectedOS } from "../utils/detectOS";

interface CertModalProps {
  open: boolean;
  onClose: () => void;
  clientIp: string;
  os: DetectedOS;
  label: string;
  proxyAddress: string | null;
  onResolved: () => void;
}

export function CertModal({
  open,
  onClose,
  clientIp,
  os,
  label,
  proxyAddress,
  onResolved,
}: CertModalProps) {
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const reloadStatus = async (): Promise<CertStatus> => {
    const res = await fetch("/cert/status");
    const body = (await res.json()) as CertStatus;
    setStatus(body);
    return body;
  };

  useEffect(() => {
    if (!open) return;
    void reloadStatus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const installCert = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await fetch("/cert/install", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        status?: CertStatus;
      };
      if (!res.ok || !body.ok) {
        setInstallError(body.error ?? "Failed to install certificate");
      } else {
        setStatus(body.status ?? null);
      }
      const nextStatus = body.status ?? (await reloadStatus());
      if (nextStatus?.installed) {
        onResolved();
      }
    } catch {
      setInstallError("Failed to install certificate");
    } finally {
      setInstalling(false);
    }
  };

  const showMac = useMemo(() => os === "macOS" || os === "Unknown", [os]);
  const showIOS = useMemo(() => os === "iOS" || os === "Unknown", [os]);
  const showAndroid = useMemo(() => os === "Android" || os === "Unknown", [os]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded border border-[var(--border)] bg-[var(--bg-panel)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold text-[var(--text)]">Certificate Setup</div>
            <div className="text-xs text-[var(--text-muted)]">
              {label} ({clientIp})
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 text-sm">
          {showMac ? (
            <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="font-medium text-[var(--text)]">macOS setup</div>
              <p className="mt-1 text-[var(--text-muted)]">
                Install and trust the mitmproxy certificate in your login keychain (no admin
                privileges required).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {status?.auto_install_supported ? (
                  <button
                    onClick={installCert}
                    disabled={installing}
                    className="inline-flex items-center gap-1.5 rounded bg-[var(--warning)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-60"
                  >
                    <Shield size={14} />
                    {installing ? "Installing..." : "Install & Trust"}
                  </button>
                ) : null}
                <a
                  href="/cert"
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)]"
                >
                  <Download size={14} />
                  Download cert
                </a>
              </div>
              {installError ? <div className="mt-2 text-[var(--danger)]">{installError}</div> : null}
            </div>
          ) : null}

          {showIOS ? (
            <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="font-medium text-[var(--text)]">iOS setup</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
                <li>Set WiFi proxy to {proxyAddress ?? "<proxy-ip>:28080"}.</li>
                <li>Open Safari and visit `http://mitm.it`.</li>
                <li>Download and install the profile.</li>
                <li>Enable full trust in Certificate Trust Settings.</li>
              </ol>
            </div>
          ) : null}

          {showAndroid ? (
            <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="font-medium text-[var(--text)]">Android setup</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
                <li>Set WiFi proxy to {proxyAddress ?? "<proxy-ip>:28080"}.</li>
                <li>Open browser and visit `http://mitm.it`.</li>
                <li>Download the Android certificate (`.cer`).</li>
                <li>Install from Settings &gt; Security &gt; Install from storage.</li>
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
