import { useState } from "react";
import type {
  TrafficEntry,
  RequestModification,
  ResponseModification,
} from "../types";
import { CodeBlock } from "./CodeBlock";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  ArrowUp,
  ArrowDown,
  Play,
  Pencil,
  Ban,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";

interface Props {
  entry: TrafficEntry;
  onResumeRequest: (
    trafficId: string,
    modifications?: RequestModification | null,
  ) => void;
  onResumeResponse: (
    trafficId: string,
    modifications?: ResponseModification | null,
  ) => void;
  onAbort: (trafficId: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(entry: TrafficEntry) {
  switch (entry.status) {
    case "pending_request":
      return (
        <Badge variant="warning">
          <ArrowUp size={10} /> REQUEST PAUSED
        </Badge>
      );
    case "pending_response":
      return (
        <Badge variant="warning">
          <ArrowDown size={10} /> RESPONSE PAUSED
        </Badge>
      );
    case "in_flight":
      return <Badge variant="accent">IN FLIGHT</Badge>;
    case "completed":
      return <Badge variant="success">COMPLETED</Badge>;
    case "error":
      return <Badge variant="danger">ERROR</Badge>;
    case "aborted":
      return <Badge variant="outline">ABORTED</Badge>;
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusCodeColor(code: number): string {
  if (code >= 500) return "text-danger";
  if (code >= 400) return "text-danger";
  if (code >= 300) return "text-warning";
  return "text-success";
}

// ── Headers table component ──────────────────────────────────────────────────

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) {
    return (
      <div className="px-3 py-2 text-muted-foreground text-xs">No headers</div>
    );
  }
  return (
    <div className="px-3 py-2 overflow-x-auto">
      <table className="text-xs text-muted-foreground font-mono w-full">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-border/50 last:border-0">
              <td className="pr-4 py-0.5 text-dim whitespace-nowrap align-top">
                {k}
              </td>
              <td className="py-0.5 text-foreground break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Query params table ───────────────────────────────────────────────────────

function QueryTable({ query }: { query: Record<string, string> }) {
  const entries = Object.entries(query);
  if (entries.length === 0) return null;
  return (
    <div className="px-3 py-2 overflow-x-auto">
      <table className="text-xs text-muted-foreground font-mono w-full">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-border/50 last:border-0">
              <td className="pr-4 py-0.5 text-accent whitespace-nowrap align-top">
                {k}
              </td>
              <td className="py-0.5 text-foreground break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-1.5 flex items-center gap-1.5 text-xs text-dim uppercase tracking-wider font-medium hover:bg-hover transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {count !== undefined && (
          <span className="text-muted-foreground ml-1">({count})</span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── Request edit form ────────────────────────────────────────────────────────

function RequestEditForm({
  entry,
  onResume,
  onAbort,
}: {
  entry: TrafficEntry;
  onResume: (mods?: RequestModification | null) => void;
  onAbort: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState(entry.request.method);
  const [url, setUrl] = useState(entry.request.url);
  const [body, setBody] = useState(entry.request.body ?? "");

  const handleResume = () => {
    if (!editing) {
      onResume(null);
      return;
    }
    const mods: RequestModification = {};
    if (method !== entry.request.method) mods.method = method;
    if (url !== entry.request.url) mods.url = url;
    if (body !== (entry.request.body ?? "")) mods.body = body;
    const hasChanges =
      mods.method !== undefined ||
      mods.url !== undefined ||
      mods.body !== undefined;
    onResume(hasChanges ? mods : null);
  };

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap bg-warning/5">
        <Badge variant="warning">
          <ArrowUp size={10} /> REQUEST BREAKPOINT
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {!editing && (
            <Button variant="accent" size="xs" onClick={() => setEditing(true)}>
              <Pencil size={12} />
              Edit
            </Button>
          )}
          <Button variant="success" size="xs" onClick={handleResume}>
            <Play size={12} />
            {editing ? "Send Modified" : "Resume"}
          </Button>
          <Button variant="danger" size="xs" onClick={onAbort}>
            <Ban size={12} />
            Abort
          </Button>
        </div>
      </div>
      {editing && (
        <div className="px-3 py-2 space-y-2 bg-hover/30">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-14 shrink-0">
              Method
            </label>
            <Input
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-7 text-xs font-mono flex-1"
              spellCheck={false}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-14 shrink-0">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-7 text-xs font-mono flex-1"
              spellCheck={false}
            />
          </div>
          {entry.request.body !== null && (
            <div>
              <label className="text-xs text-muted-foreground">Body</label>
              <div className="mt-1 rounded overflow-hidden border border-border">
                <CodeBlock
                  value={body}
                  readOnly={false}
                  onChange={setBody}
                  height="160px"
                  lineNumbers
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Response edit form ───────────────────────────────────────────────────────

function ResponseEditForm({
  entry,
  onResume,
}: {
  entry: TrafficEntry;
  onResume: (mods?: ResponseModification | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [statusCode, setStatusCode] = useState(
    String(entry.response?.status_code ?? 200),
  );
  const [body, setBody] = useState(entry.response?.body ?? "");

  const handleResume = () => {
    if (!editing) {
      onResume(null);
      return;
    }
    const mods: ResponseModification = {};
    const origCode = entry.response?.status_code ?? 200;
    const newCode = Number.parseInt(statusCode, 10);
    if (!Number.isNaN(newCode) && newCode !== origCode)
      mods.status_code = newCode;
    if (body !== (entry.response?.body ?? "")) mods.body = body;
    const hasChanges =
      mods.status_code !== undefined || mods.body !== undefined;
    onResume(hasChanges ? mods : null);
  };

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 flex items-center gap-2 flex-wrap bg-warning/5">
        <Badge variant="warning">
          <ArrowDown size={10} /> RESPONSE BREAKPOINT
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          {!editing && (
            <Button variant="accent" size="xs" onClick={() => setEditing(true)}>
              <Pencil size={12} />
              Edit
            </Button>
          )}
          <Button variant="success" size="xs" onClick={handleResume}>
            <Play size={12} />
            {editing ? "Send Modified" : "Resume"}
          </Button>
        </div>
      </div>
      {editing && (
        <div className="px-3 py-2 space-y-2 bg-hover/30">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20 shrink-0">
              Status Code
            </label>
            <Input
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              className="h-7 text-xs font-mono w-24"
              spellCheck={false}
            />
          </div>
          {entry.response?.body !== null && (
            <div>
              <label className="text-xs text-muted-foreground">Body</label>
              <div className="mt-1 rounded overflow-hidden border border-border">
                <CodeBlock
                  value={body}
                  readOnly={false}
                  onChange={setBody}
                  height="200px"
                  lineNumbers
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TrafficDetail({
  entry,
  onResumeRequest,
  onResumeResponse,
  onAbort,
}: Props) {
  const queryEntries = Object.entries(entry.request.query);
  const requestHeaderCount = Object.keys(entry.request.headers).length;
  const responseHeaderCount = entry.response
    ? Object.keys(entry.response.headers).length
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-panel shrink-0 flex-wrap">
        {statusBadge(entry)}
        {entry.response && (
          <span
            className={`text-sm font-mono font-semibold ${statusCodeColor(entry.response.status_code)}`}
          >
            {entry.response.status_code} {entry.response.reason}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {entry.duration_ms !== null && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {formatDuration(entry.duration_ms)}
            </span>
          )}
          {entry.request.body_size > 0 && (
            <span>
              <ArrowUp size={10} className="inline" />{" "}
              {formatSize(entry.request.body_size)}
            </span>
          )}
          {entry.response && entry.response.body_size > 0 && (
            <span>
              <ArrowDown size={10} className="inline" />{" "}
              {formatSize(entry.response.body_size)}
            </span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Breakpoint action bars */}
        {entry.status === "pending_request" && (
          <RequestEditForm
            entry={entry}
            onResume={(mods) => onResumeRequest(entry.id, mods)}
            onAbort={() => onAbort(entry.id)}
          />
        )}
        {entry.status === "pending_response" && (
          <ResponseEditForm
            entry={entry}
            onResume={(mods) => onResumeResponse(entry.id, mods)}
          />
        )}

        {/* ── REQUEST SECTION ────────────────────────────────────── */}
        <div className="px-3 py-1.5 border-b border-border bg-panel">
          <span className="text-xs text-dim uppercase tracking-wider font-medium">
            Request
          </span>
        </div>

        {/* URL bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <span className="text-accent font-semibold uppercase text-xs">
            {entry.request.method}
          </span>
          <span className="text-foreground font-mono text-sm truncate flex-1">
            {entry.request.url}
          </span>
          <span className="text-dim text-[10px] shrink-0">
            {entry.request.http_version}
          </span>
        </div>

        {/* General info */}
        <Section title="General" defaultOpen>
          <div className="px-3 py-2 space-y-1 text-xs">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Host</span>
              <span className="text-foreground font-mono">
                {entry.request.host}:{entry.request.port}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">
                Scheme
              </span>
              <span className="text-foreground font-mono">
                {entry.request.scheme}
              </span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Path</span>
              <span className="text-foreground font-mono break-all">
                {entry.request.path}
              </span>
            </div>
            {entry.request.client_ip && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">
                  Client IP
                </span>
                <span className="text-foreground font-mono">
                  {entry.request.client_ip}
                </span>
              </div>
            )}
            {entry.request.content_type && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 shrink-0">
                  Content-Type
                </span>
                <span className="text-foreground font-mono">
                  {entry.request.content_type}
                </span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Time</span>
              <span className="text-foreground font-mono">
                {formatTimestamp(entry.request.timestamp)}
              </span>
            </div>
          </div>
        </Section>

        {/* Query params */}
        {queryEntries.length > 0 && (
          <Section title="Query Parameters" count={queryEntries.length}>
            <QueryTable query={entry.request.query} />
          </Section>
        )}

        {/* Request headers */}
        <Section title="Request Headers" count={requestHeaderCount}>
          <HeadersTable headers={entry.request.headers} />
        </Section>

        {/* Request body */}
        {entry.request.body && (
          <Section title="Request Body">
            <div className="px-3 py-2">
              <div className="rounded overflow-hidden border border-border">
                <CodeBlock value={entry.request.body} maxHeight="300px" />
              </div>
            </div>
          </Section>
        )}

        {/* ── RESPONSE SECTION ───────────────────────────────────── */}
        {entry.response && (
          <>
            <div className="px-3 py-1.5 border-b border-border bg-panel">
              <span className="text-xs text-dim uppercase tracking-wider font-medium">
                Response
              </span>
            </div>

            {/* Status line */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
              <span
                className={`font-mono font-semibold text-sm ${statusCodeColor(entry.response.status_code)}`}
              >
                {entry.response.status_code}
              </span>
              <span className="text-muted-foreground text-sm">
                {entry.response.reason}
              </span>
              <span className="text-dim text-[10px] ml-auto">
                {entry.response.http_version}
              </span>
            </div>

            {/* Response general */}
            <Section title="Response Info" defaultOpen>
              <div className="px-3 py-2 space-y-1 text-xs">
                {entry.response.content_type && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">
                      Content-Type
                    </span>
                    <span className="text-foreground font-mono">
                      {entry.response.content_type}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">
                    Body Size
                  </span>
                  <span className="text-foreground font-mono">
                    {formatSize(entry.response.body_size)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-muted-foreground w-24 shrink-0">
                    Started
                  </span>
                  <span className="text-foreground font-mono">
                    {formatTimestamp(entry.response.timestamp_start)}
                  </span>
                </div>
                {entry.response.timestamp_end && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-24 shrink-0">
                      Ended
                    </span>
                    <span className="text-foreground font-mono">
                      {formatTimestamp(entry.response.timestamp_end)}
                    </span>
                  </div>
                )}
              </div>
            </Section>

            {/* Response headers */}
            <Section title="Response Headers" count={responseHeaderCount}>
              <HeadersTable headers={entry.response.headers} />
            </Section>

            {/* Response body */}
            {entry.response.body && (
              <Section title="Response Body" defaultOpen>
                <div className="px-3 py-2">
                  <div className="rounded overflow-hidden border border-border">
                    <CodeBlock
                      value={entry.response.body}
                      maxHeight="400px"
                    />
                  </div>
                </div>
              </Section>
            )}
          </>
        )}

        {/* No response yet */}
        {!entry.response &&
          entry.status !== "pending_request" &&
          entry.status !== "aborted" && (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Waiting for response...
            </div>
          )}

        {entry.status === "aborted" && !entry.response && (
          <div className="flex items-center justify-center py-12 text-danger text-sm">
            Request was aborted
          </div>
        )}
      </div>
    </div>
  );
}
