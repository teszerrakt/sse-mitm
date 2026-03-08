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
  client_ip: string | null;
  user_agent: string | null;
}

// ── HTTP Traffic types (general API interception) ────────────────────────────

export type TrafficStatus =
  | "pending_request"
  | "in_flight"
  | "pending_response"
  | "completed"
  | "error"
  | "aborted";

export interface HttpRequestData {
  method: string;
  url: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  http_version: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: string | null;
  body_size: number;
  content_type: string | null;
  client_ip: string | null;
  timestamp: number;
}

export interface HttpResponseData {
  status_code: number;
  reason: string;
  http_version: string;
  headers: Record<string, string>;
  body: string | null;
  body_size: number;
  content_type: string | null;
  timestamp_start: number;
  timestamp_end: number | null;
}

export interface TrafficEntry {
  id: string;
  status: TrafficStatus;
  is_intercepted: boolean;
  request: HttpRequestData;
  response: HttpResponseData | null;
  duration_ms: number | null;
  created_at: number;
}

export interface RequestModification {
  method?: string | null;
  url?: string | null;
  headers?: Record<string, string> | null;
  body?: string | null;
}

export interface ResponseModification {
  status_code?: number | null;
  headers?: Record<string, string> | null;
  body?: string | null;
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
  client_ip: string | null;
  user_agent: string | null;
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

export interface SessionsClearedMsg {
  type: "sessions_cleared";
}

export interface TlsErrorMsg {
  type: "tls_error";
  client_ip: string;
  sni: string | null;
  timestamp: number;
}

export interface NewTrafficMsg {
  type: "new_traffic";
  entry: TrafficEntry;
}

export interface TrafficUpdatedMsg {
  type: "traffic_updated";
  entry: TrafficEntry;
}

export interface TrafficClearedMsg {
  type: "traffic_cleared";
}

export type ServerMsg =
  | NewSessionMsg
  | EventMsg
  | StreamEndMsg
  | ErrorMsg
  | SessionUpdatedMsg
  | SessionsClearedMsg
  | TlsErrorMsg
  | NewTrafficMsg
  | TrafficUpdatedMsg
  | TrafficClearedMsg;

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

export interface ClearSessionsCmd {
  type: "clear_sessions";
}

export interface CloseSessionCmd {
  type: "close_session";
  session_id: string;
}

export interface ResumeRequestCmd {
  type: "resume_request";
  traffic_id: string;
  modifications?: RequestModification | null;
}

export interface ResumeResponseCmd {
  type: "resume_response";
  traffic_id: string;
  modifications?: ResponseModification | null;
}

export interface AbortRequestCmd {
  type: "abort_request";
  traffic_id: string;
}

export interface ClearTrafficCmd {
  type: "clear_traffic";
}

export type ClientCmd =
  | ForwardCmd
  | EditCmd
  | DropCmd
  | InjectCmd
  | DelayCmd
  | ForwardAllCmd
  | SaveSessionCmd
  | ClearSessionsCmd
  | CloseSessionCmd
  | ResumeRequestCmd
  | ResumeResponseCmd
  | AbortRequestCmd
  | ClearTrafficCmd;

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

// ── Settings / Config types ───────────────────────────────────────────────────

export type BreakpointStage = "request" | "response" | "both";

export interface ApiBreakpointRule {
  pattern: string;
  stage: BreakpointStage;
  enabled: boolean;
}

export interface AppConfig {
  sse_patterns: string[];
  api_breakpoint_patterns: ApiBreakpointRule[];
  relay_host: string;
  relay_port: number;
  proxy_address: string;
}

export interface CertStatus {
  platform: string;
  auto_install_supported: boolean;
  cert_exists: boolean;
  cert_path: string;
  installed: boolean;
  message: string | null;
}
