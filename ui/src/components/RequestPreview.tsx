import { useState } from "react";
import type { RequestInfo } from "../types";
import { CodeBlock } from "./CodeBlock";

interface Props {
  request: RequestInfo;
}

export function RequestPreview({ request }: Props) {
  const [showHeaders, setShowHeaders] = useState(false);

  return (
    <div className="border-b border-[var(--border)] text-sm">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-[var(--accent)] font-semibold uppercase text-xs">
          {request.method}
        </span>
        <span className="text-[var(--text)] font-mono truncate flex-1">{request.url}</span>
        <button
          onClick={() => setShowHeaders((v) => !v)}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] uppercase tracking-wide border border-[var(--border)] px-2 py-0.5 rounded"
        >
          {showHeaders ? "Hide Headers" : "Headers"}
        </button>
      </div>

      {/* Headers (collapsible) */}
      {showHeaders && (
        <div className="px-3 pb-2 overflow-x-auto">
          <table className="text-xs text-[var(--text-muted)] font-mono">
            <tbody>
              {Object.entries(request.headers).map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-4 text-[var(--text-dim)] whitespace-nowrap align-top">{k}</td>
                  <td className="text-[var(--text)] break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Body */}
      {request.body && (
        <div className="px-3 pb-2">
          <div className="rounded overflow-hidden border border-[var(--border)]">
            <CodeBlock value={request.body} maxHeight="240px" />
          </div>
        </div>
      )}
    </div>
  );
}
