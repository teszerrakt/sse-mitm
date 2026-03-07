import { useState } from "react";
import type { RequestInfo } from "../types";
import { CodeBlock } from "./CodeBlock";
import { Button } from "./ui/button";

interface Props {
  request: RequestInfo;
}

export function RequestPreview({ request }: Props) {
  const [showHeaders, setShowHeaders] = useState(false);

  return (
    <div className="border-b border-border text-sm">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-accent font-semibold uppercase text-xs">
          {request.method}
        </span>
        <span className="text-foreground font-mono truncate flex-1">{request.url}</span>
        <Button variant="outline" size="xs" onClick={() => setShowHeaders((v) => !v)}>
          {showHeaders ? "Hide Headers" : "Headers"}
        </Button>
      </div>

      {/* Headers (collapsible) */}
      {showHeaders && (
        <div className="px-3 pb-2 overflow-x-auto">
          <table className="text-xs text-muted-foreground font-mono">
            <tbody>
              {Object.entries(request.headers).map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-4 text-dim whitespace-nowrap align-top">{k}</td>
                  <td className="text-foreground break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Body */}
      {request.body && (
        <div className="px-3 pb-2">
          <div className="rounded overflow-hidden border border-border">
            <CodeBlock value={request.body} maxHeight="240px" />
          </div>
        </div>
      )}
    </div>
  );
}
