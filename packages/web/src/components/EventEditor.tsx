import { useState } from "react";
import type { SSEEvent } from "../types";
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

interface Props {
  event: SSEEvent;
  onConfirm: (edited: SSEEvent) => void;
  onClose: () => void;
}

export function EventEditor({ event, onConfirm, onClose }: Props) {
  const [eventType, setEventType] = useState(event.event);
  const [data, setData] = useState(event.data);
  const [id, setId] = useState(event.id ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    // Always send minified JSON if data is valid JSON, else send as-is
    let finalData = data;
    try {
      finalData = JSON.stringify(JSON.parse(data));
    } catch {
      // not JSON — send raw
    }
    setError(null);
    onConfirm({
      event: eventType,
      data: finalData,
      id: id.length > 0 ? id : null,
      retry: event.retry,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="sm:max-w-[640px] max-h-[80vh] flex flex-col"
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="text-sm">Edit Event</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-3">
          {/* Event type */}
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              event type
            </Label>
            <Input
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </div>

          {/* ID */}
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              id (optional)
            </Label>
            <Input
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="(none)"
            />
          </div>

          {/* Data */}
          <div className="flex flex-col gap-1 flex-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              data
            </Label>
            <div className="rounded overflow-hidden border border-border">
              <CodeBlock
                value={data}
                readOnly={false}
                onChange={(val) => {
                  setData(val);
                  setError(null);
                }}
                height="220px"
                lineNumbers
              />
            </div>
          </div>

          {error && <div className="text-danger text-sm">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Forward Edited</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
