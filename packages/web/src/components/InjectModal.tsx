import { useState } from "react";
import type { SSEEvent } from "../types";
import { CodeBlock } from "./CodeBlock";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  afterIndex: number;
  onConfirm: (event: SSEEvent) => void;
  onClose: () => void;
}

const BLANK: SSEEvent = { event: "message", data: "{}", id: null, retry: null };

export function InjectModal({ afterIndex, onConfirm, onClose }: Props) {
  const [eventType, setEventType] = useState(BLANK.event);
  const [data, setData] = useState(BLANK.data);
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    setError(null);
    onConfirm({
      event: eventType,
      data,
      id: id.length > 0 ? id : null,
      retry: null,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[540px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-sm text-inject">
            Inject Synthetic Event
          </DialogTitle>
          <DialogDescription>after index {afterIndex}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              event type
            </Label>
            <Input
              className="focus:border-inject"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              id (optional)
            </Label>
            <Input
              className="focus:border-inject"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="(none)"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-muted-foreground text-xs uppercase tracking-wider">
              data
            </Label>
            <div className="rounded overflow-hidden border border-border">
              <CodeBlock
                value={data}
                readOnly={false}
                onChange={(val) => setData(val)}
                height="160px"
                lineNumbers
              />
            </div>
          </div>

          {error && <div className="text-danger text-sm">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="inject-solid" onClick={handleConfirm}>Inject</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
