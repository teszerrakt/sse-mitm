import { useMemo, useState } from "react";
import { Shield, CheckCircle, Loader2 } from "lucide-react";
import type { CertStatus } from "../types";
import type { DetectedOS } from "../utils/detectOS";
import { apiFetch } from "../utils/api";
import { useCertStatus } from "../hooks/useCertStatus";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  const { certStatus: status, reloadCertStatus } = useCertStatus();
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const installCert = async () => {
    setInstalling(true);
    setInstallError(null);
    try {
      const res = await apiFetch("/cert/install", { method: "POST" });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        status?: CertStatus;
      };
      if (!res.ok || !body.ok) {
        setInstallError(body.error ?? "Failed to install certificate");
      }
      // Reload shared status so NetworkTab badge updates too
      await reloadCertStatus();
      if (body.status?.installed) {
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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Certificate Setup</DialogTitle>
          <DialogDescription>
            {label} ({clientIp})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {showMac ? (
            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium text-foreground">macOS setup</div>
              <p className="mt-1 text-muted-foreground">
                Install and trust the mitmproxy CA certificate in your login keychain.
                This allows the proxy to inspect HTTPS traffic.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {status?.installed ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success">
                    <CheckCircle size={14} />
                    Certificate installed and trusted
                  </span>
                ) : status?.auto_install_supported ? (
                  <Button
                    variant="warning-solid"
                    onClick={installCert}
                    disabled={installing}
                  >
                    {installing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Shield size={14} />
                    )}
                    {installing ? "Installing..." : "Install & Trust"}
                  </Button>
                ) : null}
              </div>
              {installError ? (
                <div className="mt-2 text-danger">{installError}</div>
              ) : null}
            </div>
          ) : null}

          {showIOS ? (
            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium text-foreground">iOS setup</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Set WiFi proxy to {proxyAddress ?? "<proxy-ip>:28080"}.</li>
                <li>Open Safari and visit `http://mitm.it`.</li>
                <li>Download and install the profile.</li>
                <li>Enable full trust in Certificate Trust Settings.</li>
              </ol>
            </div>
          ) : null}

          {showAndroid ? (
            <div className="rounded border border-border bg-background p-3">
              <div className="font-medium text-foreground">Android setup</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Set WiFi proxy to {proxyAddress ?? "<proxy-ip>:28080"}.</li>
                <li>Open browser and visit `http://mitm.it`.</li>
                <li>Download the Android certificate (`.cer`).</li>
                <li>Install from Settings &gt; Security &gt; Install from storage.</li>
              </ol>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
