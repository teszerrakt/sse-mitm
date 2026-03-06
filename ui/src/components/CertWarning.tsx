import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, Shield } from "lucide-react";
import type { CertStatus, TlsErrorMsg } from "../types";

const DISMISS_KEY = "tls-cert-warning-dismissed";

interface CertWarningProps {
  latestTlsError: TlsErrorMsg | null;
}

export function CertWarning({ latestTlsError }: CertWarningProps) {
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return;
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      setDismissedAt(parsed);
    }
  }, []);

  const reloadStatus = async () => {
    try {
      const res = await fetch("/cert/status");
      const next = (await res.json()) as CertStatus;
      setStatus(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reloadStatus();
  }, []);

  useEffect(() => {
    if (!latestTlsError) return;
    if (dismissedAt && latestTlsError.timestamp > dismissedAt) {
      localStorage.removeItem(DISMISS_KEY);
      setDismissedAt(null);
    }
  }, [latestTlsError, dismissedAt]);

  const showWarning = useMemo(() => {
    if (loading) return false;
    if (status?.installed) return false;
    if (!latestTlsError) return false;
    if (dismissedAt && latestTlsError.timestamp <= dismissedAt) return false;
    return true;
  }, [loading, status?.installed, latestTlsError, dismissedAt]);

  const dismiss = () => {
    const ts = Date.now() / 1000;
    localStorage.setItem(DISMISS_KEY, String(ts));
    setDismissedAt(ts);
  };

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
      } else if (body.status) {
        setStatus(body.status);
      }
      await reloadStatus();
    } catch {
      setInstallError("Failed to install certificate");
    } finally {
      setInstalling(false);
    }
  };

  if (!showWarning || !latestTlsError) {
    return null;
  }

  return (
    <div className="mx-4 mt-3 mb-2 rounded border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 text-[var(--warning)] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--text)]">TLS handshake failed</div>
          <div className="mt-1 text-sm text-[var(--text-muted)]">
            Client <span className="font-mono text-[var(--text)]">{latestTlsError.client_ip}</span>
            {latestTlsError.sni ? (
              <>
                {" "}could not trust mitmproxy certificate for{" "}
                <span className="font-mono text-[var(--text)]">{latestTlsError.sni}</span>
              </>
            ) : (
              " could not trust mitmproxy certificate."
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {status?.auto_install_supported ? (
              <button
                onClick={installCert}
                disabled={installing}
                className="inline-flex items-center gap-1.5 rounded bg-[var(--warning)] px-3 py-1.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-60"
              >
                <Shield size={14} />
                {installing ? "Installing..." : "Install & Trust (macOS)"}
              </button>
            ) : null}

            <a
              href="/cert"
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-panel)] px-3 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--bg-hover)]"
            >
              <Download size={14} />
              Download cert
            </a>

            <button
              onClick={dismiss}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              Dismiss
            </button>
          </div>

          {installError ? (
            <div className="mt-2 text-sm text-[var(--danger)]">{installError}</div>
          ) : null}

          <div className="mt-3 space-y-2 text-sm">
            <button
              onClick={() => setIosOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[var(--text)] hover:text-[var(--warning)]"
            >
              <ChevronDown size={14} className={iosOpen ? "rotate-180" : ""} />
              iOS setup
            </button>
            {iosOpen ? (
              <ol className="list-decimal pl-5 text-[var(--text-muted)] space-y-0.5">
                <li>Set WiFi proxy to the shown proxy address.</li>
                <li>Open Safari and visit `http://mitm.it`.</li>
                <li>Download and install the profile.</li>
                <li>Enable full trust in Certificate Trust Settings.</li>
              </ol>
            ) : null}

            <button
              onClick={() => setAndroidOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[var(--text)] hover:text-[var(--warning)]"
            >
              <ChevronDown size={14} className={androidOpen ? "rotate-180" : ""} />
              Android setup
            </button>
            {androidOpen ? (
              <ol className="list-decimal pl-5 text-[var(--text-muted)] space-y-0.5">
                <li>Set WiFi proxy to the shown proxy address.</li>
                <li>Open browser and visit `http://mitm.it`.</li>
                <li>Download the Android certificate (`.cer`).</li>
                <li>Install from Settings &gt; Security &gt; Install from storage.</li>
              </ol>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CertTrustedBadge() {
  const [status, setStatus] = useState<CertStatus | null>(null);

  useEffect(() => {
    fetch("/cert/status")
      .then((r) => r.json())
      .then((next: CertStatus) => setStatus(next))
      .catch(() => undefined);
  }, []);

  if (!status?.installed) {
    return null;
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded border border-[var(--success)]/40 bg-[var(--success)]/10 px-2 py-1 text-xs text-[var(--success)]">
      <CheckCircle2 size={12} />
      Cert trusted
    </div>
  );
}
