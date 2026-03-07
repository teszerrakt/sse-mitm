import { useState } from "react";
import type { PendingEvent, HistoryEntry, SSEEvent } from "../types";
import { EventEditor } from "./EventEditor";
import { InjectModal } from "./InjectModal";
import { CodeBlock } from "./CodeBlock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Props {
  pending: PendingEvent[];
  history: HistoryEntry[];
  onForward: (index: number, event: SSEEvent) => void;
  onEdit: (index: number, original: SSEEvent, edited: SSEEvent) => void;
  onDrop: (index: number, event: SSEEvent) => void;
  onInject: (afterIndex: number, event: SSEEvent) => void;
  onDelay: (index: number, event: SSEEvent, delayMs: number) => void;
}

type Modal =
  | { kind: "edit"; index: number; event: SSEEvent }
  | { kind: "inject"; afterIndex: number }
  | { kind: "delay"; index: number; event: SSEEvent }
  | null;

function ActionLabel({ action }: { action: string }) {
  const variants: Record<string, "success" | "accent" | "danger" | "inject" | "warning" | "outline"> = {
    forward: "success",
    edit: "accent",
    drop: "danger",
    inject: "inject",
    delay: "warning",
  };
  return (
    <Badge variant={variants[action] ?? "outline"} className="uppercase font-semibold">
      {action}
    </Badge>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const base = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  // Insert ".SSS" before the AM/PM suffix, or append if no suffix
  return base.replace(/(\s?[AP]M)$/i, `.${ms}$1`) || `${base}.${ms}`;
}

export function EventRow({
  pending,
  history,
  onForward,
  onEdit,
  onDrop,
  onInject,
  onDelay,
}: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [delayMs, setDelayMs] = useState(500);
  const [expandedHistIdx, setExpandedHistIdx] = useState<number | null>(null);
  const [expandedPendIdx, setExpandedPendIdx] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-0 text-sm">
      {/* History entries */}
      {history.map((h, i) => (
        <div key={`h-${i}`} className="border-b border-border">
          <button
            className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-hover transition-colors"
            onClick={() => setExpandedHistIdx(expandedHistIdx === i ? null : i)}
          >
            <span className="text-muted-foreground text-xs w-6 text-right shrink-0">
              #{h.index}
            </span>
            <ActionLabel action={h.action} />
            <span className="text-muted-foreground font-mono">
              {h.original_event?.event ?? "—"}
            </span>
            {h.delay_ms > 0 && (
              <span className="text-warning text-xs">+{h.delay_ms}ms</span>
            )}
            <span className="ml-auto text-muted-foreground text-xs tabular-nums">
              {formatTime(h.timestamp)}
            </span>
            <span className="text-muted-foreground text-xs">
              {expandedHistIdx === i ? "▲" : "▼"}
            </span>
          </button>
          {expandedHistIdx === i && (
            <div className="px-3 pb-2">
              {h.sent_event && (
                <div className="rounded overflow-hidden border border-border">
                  <CodeBlock value={h.sent_event.data} maxHeight="300px" />
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Pending events (breakpoint held) */}
      {pending.map((p, i) => (
        <div key={`p-${i}`} className="border-b border-border bg-hover">
          {/* Summary row */}
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-muted-foreground text-xs w-6 text-right shrink-0">
              #{p.index}
            </span>
            <Badge variant="warning" className="uppercase font-semibold">pending</Badge>
            <span className="text-foreground font-mono">{p.event.event}</span>
            <button
              className="ml-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setExpandedPendIdx(expandedPendIdx === i ? null : i)}
            >
              {expandedPendIdx === i ? "▲" : "▼"}
            </button>
            {/* Action buttons */}
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="success"
                size="xs"
                onClick={() => onForward(p.index, p.event)}
              >
                Forward
              </Button>
              <Button
                variant="accent"
                size="xs"
                onClick={() => setModal({ kind: "edit", index: p.index, event: p.event })}
              >
                Edit
              </Button>
              <Button
                variant="danger"
                size="xs"
                onClick={() => onDrop(p.index, p.event)}
              >
                Drop
              </Button>
              <Button
                variant="inject"
                size="xs"
                onClick={() => setModal({ kind: "inject", afterIndex: p.index })}
              >
                Inject
              </Button>
            </div>
          </div>

          {/* Expanded data */}
          {expandedPendIdx === i && (
            <div className="px-3 pb-2">
              <div className="rounded overflow-hidden border border-border">
                <CodeBlock value={p.event.data} maxHeight="300px" />
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Modals */}
      {modal?.kind === "edit" && (
        <EventEditor
          event={modal.event}
          onConfirm={(edited) => {
            onEdit(modal.index, modal.event, edited);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "inject" && (
        <InjectModal
          afterIndex={modal.afterIndex}
          onConfirm={(event) => {
            onInject(modal.afterIndex, event);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.kind === "delay" && (
        <Dialog open onOpenChange={(v) => { if (!v) setModal(null); }}>
          <DialogContent className="sm:max-w-xs" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="text-sm text-warning">
                Delay Event #{modal.index}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">
                  delay (ms)
                </Label>
                <Input
                  type="number"
                  min={1}
                  className="focus:border-warning"
                  value={delayMs}
                  onChange={(e) => setDelayMs(Number(e.target.value))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModal(null)}>
                Cancel
              </Button>
              <Button
                variant="warning-solid"
                onClick={() => {
                  onDelay(modal.index, modal.event, delayMs);
                  setModal(null);
                }}
              >
                Delay + Forward
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
