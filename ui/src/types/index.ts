// ── Core SSE types ──────────────────────────────────────────────────────────

export interface SSEEvent {
  event: string;
  data: string;
  id: string | null;
  retry: number | null;
}

export interface RequestInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

// ── Session types ────────────────────────────────────────────────────────────

export type SessionStatus = "active" | "completed" | "error";

export type EventAction = "forward" | "edit" | "drop" | "inject" | "delay";

export interface HistoryEntry {
  index: number;
  timestamp: number;
  original_event: SSEEvent | null;
  action: EventAction;
  sent_event: SSEEvent | null;
  delay_ms: number;
}

export interface SessionInfo {
  id: string;
  request: RequestInfo;
  status: SessionStatus;
  created_at: number;
  event_count: number;
  pending_count: number;
}

// ── WebSocket Server → UI messages ───────────────────────────────────────────

export interface NewSessionMsg {
  type: "new_session";
  session: SessionInfo;
}

export interface EventMsg {
  type: "event";
  session_id: string;
  index: number;
  event: SSEEvent;
}

export interface StreamEndMsg {
  type: "stream_end";
  session_id: string;
}

export interface ErrorMsg {
  type: "error";
  session_id: string;
  message: string;
}

export interface SessionUpdatedMsg {
  type: "session_updated";
  session: SessionInfo;
}

export type ServerMsg = NewSessionMsg | EventMsg | StreamEndMsg | ErrorMsg | SessionUpdatedMsg;

// ── WebSocket UI → Server commands ───────────────────────────────────────────

export interface ForwardCmd {
  type: "forward";
  session_id: string;
  index: number;
}

export interface EditCmd {
  type: "edit";
  session_id: string;
  index: number;
  event: SSEEvent;
}

export interface DropCmd {
  type: "drop";
  session_id: string;
  index: number;
}

export interface InjectCmd {
  type: "inject";
  session_id: string;
  after_index: number;
  event: SSEEvent;
}

export interface DelayCmd {
  type: "delay";
  session_id: string;
  index: number;
  delay_ms: number;
}

export interface ForwardAllCmd {
  type: "forward_all";
  session_id: string;
}

export interface SaveSessionCmd {
  type: "save_session";
  session_id: string;
  filename: string;
}

export type ClientCmd =
  | ForwardCmd
  | EditCmd
  | DropCmd
  | InjectCmd
  | DelayCmd
  | ForwardAllCmd
  | SaveSessionCmd;

// ── UI-local types ────────────────────────────────────────────────────────────

/** A pending event waiting at the breakpoint for QA action */
export interface PendingEvent {
  index: number;
  event: SSEEvent;
}

/** All state we track per session in the UI */
export interface SessionState {
  info: SessionInfo;
  pending: PendingEvent[];
  history: HistoryEntry[];
}
