import { useState } from "react";
import type { SessionState, SSEEvent } from "../types";
import { EventRow } from "./EventRow";
import { RequestPreview } from "./RequestPreview";
import { AutoForwardToggle } from "./AutoForwardToggle";
import { ConfirmModal } from "./ConfirmModal";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { X } from "lucide-react";

interface Props {
  session: SessionState;
  onForward: (index: number, event: SSEEvent) => void;
  onEdit: (index: number, original: SSEEvent, edited: SSEEvent) => void;
  onDrop: (index: number, event: SSEEvent) => void;
  onInject: (afterIndex: number, event: SSEEvent) => void;
  onDelay: (index: number, event: SSEEvent, delayMs: number) => void;
  onForwardAll: () => void;
  onSave: (filename: string) => void;
  onClose: () => void;
}

function statusBadge(status: string, hasError: boolean, onShowError?: () => void) {
  if (status === "active")
    return <Badge variant="success">ACTIVE</Badge>;
  if (status === "completed")
    return <Badge variant="outline">DONE</Badge>;
  return (
    <Badge
      variant="danger"
      className={hasError ? "cursor-pointer hover:bg-danger/20" : ""}
      onClick={hasError ? onShowError : undefined}
    >
      ERROR
    </Badge>
  );
}

export function SessionDetail({
  session,
  onForward,
  onEdit,
  onDrop,
  onInject,
  onDelay,
  onForwardAll,
  onSave,
  onClose,
}: Props) {
  const [autoForward, setAutoForward] = useState(false);
  const [saveFilename, setSaveFilename] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showError, setShowError] = useState(false);

  const isActive = session.info.status === "active";

  const handleAutoForwardChange = (v: boolean) => {
    setAutoForward(v);
    if (v) {
      onForwardAll();
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border bg-panel shrink-0 flex-wrap">
        {statusBadge(
          session.info.status,
          Boolean(session.info.error_message),
          () => setShowError(true),
        )}
        <span className="text-muted-foreground text-xs">{session.info.event_count} events</span>
        {session.info.pending_count > 0 && (
          <span className="text-warning text-xs">
            {session.info.pending_count} pending
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <AutoForwardToggle autoForward={autoForward} onChange={handleAutoForwardChange} />

          {session.info.pending_count > 0 && !autoForward && (
            <Button variant="success" size="xs" onClick={onForwardAll}>
              Forward All
            </Button>
          )}

          <Button variant="outline" size="xs" onClick={() => setShowSave((v) => !v)}>
            Save Mock
          </Button>

          {isActive && (
            <Button
              variant="danger"
              size="xs"
              onClick={() => setShowCloseConfirm(true)}
              title="Force close this connection"
            >
              <X size={12} className="mr-1" />
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Save mock inline form */}
      {showSave && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-hover shrink-0">
          <span className="text-xs text-muted-foreground">filename:</span>
          <Input
            className="h-7 flex-1"
            value={saveFilename}
            onChange={(e) => setSaveFilename(e.target.value)}
            placeholder="session_name.json"
          />
          <Button
            variant="default"
            size="xs"
            onClick={() => {
              if (saveFilename) {
                onSave(saveFilename.endsWith(".json") ? saveFilename : saveFilename + ".json");
                setShowSave(false);
                setSaveFilename("");
              }
            }}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowSave(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Request section label */}
      <div className="px-3 py-1.5 border-b border-border bg-panel shrink-0">
        <span className="text-xs text-dim uppercase tracking-wider font-medium">
          Request
        </span>
      </div>

      {/* Request info */}
      <RequestPreview request={session.info.request} />

      {/* Response section label */}
      <div className="px-3 py-1.5 border-b border-border bg-panel shrink-0">
        <span className="text-xs text-dim uppercase tracking-wider font-medium">
          Response Events
        </span>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto">
        {session.pending.length === 0 && session.history.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No events yet
          </div>
        ) : (
          <EventRow
            pending={session.pending}
            history={session.history}
            onForward={onForward}
            onEdit={onEdit}
            onDrop={onDrop}
            onInject={onInject}
            onDelay={onDelay}
          />
        )}
      </div>

      {/* Error detail dialog */}
      <Dialog open={showError} onOpenChange={setShowError}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-danger">Upstream Error</DialogTitle>
          </DialogHeader>
          <pre className="text-sm text-foreground bg-hover rounded p-3 overflow-auto max-h-60 whitespace-pre-wrap break-all">
            {session.info.error_message}
          </pre>
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Force-close confirmation modal */}
      <ConfirmModal
        open={showCloseConfirm}
        title="Close Connection"
        message="Force close this SSE connection? The upstream stream will be cancelled and the client will be disconnected."
        confirmLabel="Close Connection"
        variant="danger"
        onConfirm={() => {
          onClose();
          setShowCloseConfirm(false);
        }}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </div>
  );
}
