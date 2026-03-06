# SSE Event Debugger — Implementation Plan

## Overview

A browser-based SSE debugging tool for QA. It intercepts SSE (Server-Sent Events)
traffic using mitmproxy, routes it through a custom relay server, and presents
a Chrome DevTools-style Network tab UI where QA can inspect, pause, edit, drop,
inject, and delay individual SSE events in real time. Sessions can be saved as
JSON mock files and replayed later without a live server.

---

## Architecture

```
┌─────────────────┐   HTTPS via WiFi proxy   ┌─────────────────────┐
│  Mobile App /   │ ────────────────────────▶ │    mitmproxy        │
│  Browser        │                           │    addon.py         │
│  (QA device)    │ ◀──────────────────────── │    :8080            │
└─────────────────┘   SSE stream back         └──────────┬──────────┘
                                                         │ rewrites SSE requests
                                                         │ to relay server
                                                         ▼
                                              ┌─────────────────────┐
                                              │   Relay Server      │
                                              │   relay_server.py   │
                                              │   aiohttp :9000     │
                                              │                     │
                                              │  /relay  ─────────────────────▶ Real Staging Server
                                              │  /ws (WebSocket)    │ ◀──── SSE events
                                              │  /ui (React app)    │
                                              │  /replay            │
                                              │  /sessions          │
                                              └──────────┬──────────┘
                                                         │ WebSocket
                                                         ▼
                                              ┌─────────────────────┐
                                              │   Web UI            │
                                              │   React + Vite      │
                                              │   shadcn/ui         │
                                              │   CodeMirror        │
                                              │                     │
                                              │  Network tab view   │
                                              │  per-event control  │
                                              │  save/replay        │
                                              └─────────────────────┘
```

### Data Flow

1. QA device WiFi proxy → `mitmproxy :8080`
2. mitmproxy `addon.py` checks if URL matches configured SSE patterns
3. **SSE match**: rewrites request to `http://localhost:9000/relay?target=<original_url>`,
   preserving all original headers and body
4. **Non-SSE**: passes through unchanged to real server
5. Relay server receives request, makes its own request to the real staging server
6. Relay reads upstream SSE events one-by-one
7. Each event is sent to the Web UI via WebSocket
8. Web UI displays event in the Network tab (Chrome DevTools style)
9. QA decides action per event: **Forward / Edit / Drop / Inject / Delay**
10. Relay streams approved events back through mitmproxy to the client
11. QA can toggle **Auto-Forward** to passthrough everything with logging only
12. QA clicks **Save Session** to export the session as a reusable JSON mock file

---

## Project Structure

```
orthrus/
├── docs/
│   └── implementation-plan.md     ← this file
│
├── pyproject.toml                  # uv project config
├── uv.lock
│
├── addon.py                        # mitmproxy addon (~100 lines)
├── relay_server.py                 # aiohttp app entry point (~80 lines)
│
├── src/
│   ├── models.py                   # Pydantic v2 models, all types
│   ├── sse_parser.py               # SSE chunk → SSEEvent parser
│   ├── sse_client.py               # aiohttp upstream SSE reader
│   ├── session.py                  # Session state + event queues
│   ├── session_manager.py          # Registry of all active sessions
│   ├── mock_loader.py              # Load/watch/validate mock JSON files
│   ├── pipeline_runner.py          # Executes saved pipeline mocks (replay mode)
│   └── handlers/
│       ├── relay.py                # POST /relay handler
│       ├── websocket.py            # GET /ws handler
│       ├── sessions.py             # GET /sessions handler
│       └── replay.py               # POST /replay handler
│
├── ui/                             # React + Vite frontend
│   ├── package.json                # bun project
│   ├── bun.lockb
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── NetworkTab.tsx      # Left panel: list of SSE sessions (like Network tab)
│       │   ├── SessionDetail.tsx   # Right panel: events for selected session
│       │   ├── EventRow.tsx        # Single event with action buttons
│       │   ├── EventEditor.tsx     # CodeMirror JSON editor modal
│       │   ├── InjectModal.tsx     # Create new synthetic event
│       │   ├── DelayControl.tsx    # Delay input for an event
│       │   ├── RequestPreview.tsx  # Shows original request URL + body
│       │   └── AutoForwardToggle.tsx
│       ├── hooks/
│       │   ├── useWebSocket.ts     # WebSocket connection + message handling
│       │   └── useSessions.ts      # Session state management
│       ├── types/
│       │   └── index.ts            # TypeScript types (mirrors Python models)
│       └── lib/
│           └── utils.ts
│
├── mocks/                          # Saved/example mock files
│   ├── _example_slow_polling.json
│   ├── _example_inject_error.json
│   └── _example_full_mock.json
│
└── run.sh                          # Start relay server + mitmproxy
```

---

## Python: Key Files

### `addon.py` — mitmproxy addon

**Responsibilities:**
- Load SSE URL patterns from config (env var or `config.json`)
- `request()` hook: if URL matches SSE pattern, rewrite to relay server
- `response()` hook: if relay is bypassed (non-SSE), do nothing

```python
# Pseudocode
class SSEInterceptorAddon:
    relay_host: str = "localhost"
    relay_port: int = 9000
    sse_patterns: list[re.Pattern[str]]

    def request(self, flow: http.HTTPFlow) -> None:
        if self._matches_sse_pattern(flow.request.pretty_url):
            original_url = flow.request.pretty_url
            flow.request.host = self.relay_host
            flow.request.port = self.relay_port
            flow.request.scheme = "http"
            flow.request.path = f"/relay"
            flow.request.query["target"] = original_url
            # Original method, headers, body preserved
```

**Config** (via env vars or `config.json`):
```json
{
  "relay_port": 9000,
  "sse_patterns": [
    "/flight/search/sse/",
    "/search/sse/"
  ]
}
```

---

### `src/models.py` — All types (Pydantic v2)

All models use `model_config = ConfigDict(frozen=True)` for immutability.

#### Core types

```python
class SSEEvent(BaseModel):
    model_config = ConfigDict(frozen=True)
    event: str
    data: str
    id: str | None = None
    retry: int | None = None

class RequestInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    url: str
    method: str
    headers: dict[str, str]
    body: str | None
```

#### Session types

```python
class SessionStatus(str, Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    ERROR = "error"

class EventAction(str, Enum):
    FORWARD = "forward"
    EDIT = "edit"        # forward modified version, drop original
    DROP = "drop"
    INJECT = "inject"    # synthetic event, no real event consumed
    DELAY = "delay"      # delay before forwarding

class HistoryEntry(BaseModel):
    model_config = ConfigDict(frozen=True)
    index: int
    timestamp: float
    original_event: SSEEvent | None     # None for injected events
    action: EventAction
    sent_event: SSEEvent | None         # None for dropped events
    delay_ms: int = 0

class SessionInfo(BaseModel):
    model_config = ConfigDict(frozen=True)
    id: str
    request: RequestInfo
    status: SessionStatus
    created_at: float
    event_count: int
    pending_count: int
```

#### Mock / Pipeline types (discriminated union on `action`)

```python
class PassthroughStep(BaseModel):
    action: Literal["passthrough"]
    match_event: str | None = None
    comment: str | None = None

class PassthroughRestStep(BaseModel):
    action: Literal["passthrough_rest"]
    comment: str | None = None

class MockStep(BaseModel):
    action: Literal["mock"]
    event: str
    data: str
    comment: str | None = None

class DelayStep(BaseModel):
    action: Literal["delay"]
    delay_ms: Annotated[int, Field(gt=0)]
    comment: str | None = None

class DropStep(BaseModel):
    action: Literal["drop"]
    match_event: str | None = None
    comment: str | None = None

class DropRestStep(BaseModel):
    action: Literal["drop_rest"]
    comment: str | None = None

PipelineStep = Annotated[
    PassthroughStep | PassthroughRestStep | MockStep | DelayStep | DropStep | DropRestStep,
    Field(discriminator="action")
]

class MatchConfig(BaseModel):
    url_pattern: str

    @field_validator("url_pattern")
    @classmethod
    def validate_regex(cls, v: str) -> str:
        re.compile(v)
        return v

class MockConfig(BaseModel):
    name: str
    description: str | None = None
    enabled: bool
    match: MatchConfig
    mode: Literal["pipeline", "full_mock"]
    pipeline: list[PipelineStep]

    @model_validator(mode="after")
    def validate_pipeline(self) -> "MockConfig":
        # Rule 1: full_mock only allows mock + delay
        # Rule 2: after passthrough_rest/drop_rest, only mock + delay allowed
        # Rule 3: no two *_rest steps
        # Rule 4: at most one mock can be enabled
        ...
        return self
```

#### WebSocket message types (discriminated union on `type`)

**Server → UI:**
```python
class NewSessionMsg(BaseModel):
    type: Literal["new_session"]
    session: SessionInfo

class EventMsg(BaseModel):
    type: Literal["event"]
    session_id: str
    index: int
    event: SSEEvent

class StreamEndMsg(BaseModel):
    type: Literal["stream_end"]
    session_id: str

class ErrorMsg(BaseModel):
    type: Literal["error"]
    session_id: str
    message: str

ServerMsg = Annotated[
    NewSessionMsg | EventMsg | StreamEndMsg | ErrorMsg,
    Field(discriminator="type")
]
```

**UI → Server:**
```python
class ForwardCmd(BaseModel):
    type: Literal["forward"]
    session_id: str
    index: int

class EditCmd(BaseModel):
    type: Literal["edit"]
    session_id: str
    index: int
    event: SSEEvent         # Modified event to send; original auto-dropped

class DropCmd(BaseModel):
    type: Literal["drop"]
    session_id: str
    index: int

class InjectCmd(BaseModel):
    type: Literal["inject"]
    session_id: str
    after_index: int        # -1 = inject immediately before next pending event
    event: SSEEvent

class DelayCmd(BaseModel):
    type: Literal["delay"]
    session_id: str
    index: int
    delay_ms: Annotated[int, Field(gt=0)]

class ForwardAllCmd(BaseModel):
    type: Literal["forward_all"]
    session_id: str

class SaveSessionCmd(BaseModel):
    type: Literal["save_session"]
    session_id: str
    filename: str           # Saved to mocks/<filename>.json

ClientCmd = Annotated[
    ForwardCmd | EditCmd | DropCmd | InjectCmd | DelayCmd | ForwardAllCmd | SaveSessionCmd,
    Field(discriminator="type")
]
```

---

### `src/sse_parser.py` — Chunk → SSEEvent

Handles SSE events split across multiple chunks.

```python
class SSEParser:
    """Stateful SSE parser. Feed raw bytes, get SSEEvent objects out."""

    _buffer: str

    def feed(self, chunk: bytes) -> list[SSEEvent]:
        """Append chunk to buffer, return any complete events parsed."""
        ...

    def _parse_event_block(self, block: str) -> SSEEvent | None:
        """Parse a single event block (lines between double newlines)."""
        ...
```

SSE format reference:
```
event: context\n
data: {"tvLifetime":"..."}\n
\n
event: debug\n
data: {"data":{...}}\n
\n
```

---

### `src/session.py` — Session state

```python
class Session:
    id: str
    request: RequestInfo
    status: SessionStatus
    created_at: float

    _pending: asyncio.Queue[SSEEvent]       # events from upstream, waiting for QA
    _approved: asyncio.Queue[SSEEvent | None]  # None = close stream
    _history: list[HistoryEntry]
    _auto_forward: bool                     # if True, bypass QA, forward all

    async def enqueue_upstream_event(self, event: SSEEvent) -> None: ...
    async def get_next_pending(self) -> SSEEvent: ...
    async def approve(self, event: SSEEvent | None, delay_ms: int = 0) -> None: ...
    async def approved_events(self) -> AsyncIterator[SSEEvent]: ...
    def enable_auto_forward(self) -> None: ...
    def disable_auto_forward(self) -> None: ...
    def to_mock_config(self, name: str) -> MockConfig: ...  # for save session
    def to_session_info(self) -> SessionInfo: ...
```

---

### `src/sse_client.py` — Upstream SSE reader

```python
async def stream_upstream_sse(
    session: aiohttp.ClientSession,
    url: str,
    method: str,
    headers: dict[str, str],
    body: str | None,
    on_event: Callable[[SSEEvent], Awaitable[None]],
    on_end: Callable[[], Awaitable[None]],
    on_error: Callable[[Exception], Awaitable[None]],
) -> None:
    """
    Connect to upstream SSE URL and call on_event for each parsed event.
    Handles chunked transfer, split events, reconnection on error.
    """
```

---

### `src/handlers/relay.py` — POST /relay

```
1. Parse target URL from query params
2. Parse original headers + body from request
3. Create Session via SessionManager
4. Broadcast new_session to all WebSocket clients
5. Start background task: stream_upstream_sse → session.enqueue_upstream_event
6. Start background task: QA approval logic (auto-forward or wait for WS cmd)
7. Return StreamResponse (text/event-stream), writing from session.approved_events()
```

---

### `src/mock_loader.py` — Load + watch mocks

```python
class MockLoader:
    mocks_dir: Path
    _loaded: dict[str, MockConfig]       # filename → config
    _active: MockConfig | None           # the one with enabled=True

    async def start_watching(self) -> None:
        """Use watchfiles to hot-reload on file changes."""

    def get_active(self) -> MockConfig | None: ...
    def get_all(self) -> list[MockConfig]: ...

    def _load_file(self, path: Path) -> MockConfig | None:
        """Load + validate a single JSON file. Log errors, return None on failure."""

    def _enforce_single_enabled(self) -> None:
        """Warn and disable extras if more than one mock has enabled=True."""
```

---

### `src/pipeline_runner.py` — Replay mode

When `/replay` endpoint is called, runs a `MockConfig` pipeline without a live
upstream connection. Only `mock`, `delay`, `passthrough_rest` (no-op), and
`drop_rest` (no-op) steps are executed. Returns a streaming SSE response.

---

## Frontend: Key Components

### Tech Stack

| Tool        | Purpose                         |
| ----------- | ------------------------------- |
| React 18    | UI framework                    |
| Vite        | Build tool (bun runtime)        |
| TypeScript  | Type safety                     |
| shadcn/ui   | Component library (Tailwind)    |
| CodeMirror 6 | JSON editor / viewer            |
| Tailwind CSS | Styling                        |

### UI Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  SSE Debugger                                         [Auto-Forward ○]│
├────────────────────────┬─────────────────────────────────────────────┤
│  Sessions              │  Session: abc123                            │
│  ─────────────         │  ─────────────────────────────────────────  │
│  ● abc123  ACTIVE  ●   │  POST /flight/search/sse/fprasix-integration│
│    /flight/search/…    │  Host: search-api-flight.fpr.staging-…      │
│    3 events            │  ────────────── Request Body ─────────────  │
│                        │  { "data": { "tripType": "ROUND_TRIP", … }} │
│  ○ def456  DONE        │  ─────────────────────────────────────────  │
│    /flight/search/…    │                                             │
│    12 events           │  #1  event: context          ✓ FORWARDED   │
│                        │  ┌─────────────────────────────────────┐   │
│                        │  │ {"tvLifetime":"...","tvSession":"..."│   │
│                        │  └─────────────────────────────────────┘   │
│                        │                                             │
│                        │  #2  event: debug            ● PENDING     │
│                        │  ┌─────────────────────────────────────┐   │
│                        │  │ {"data":{"requestSource":"USER_INI…"│   │
│                        │  └─────────────────────────────────────┘   │
│                        │  [▶ Forward] [✏ Edit] [✕ Drop] [⏱ 0ms ▾]  │
│                        │  [+ Inject Before]                         │
│                        │                                             │
│                        │  ◌ Waiting for next event…                 │
│                        │  [+ Inject]  [▶▶ Forward All Remaining]    │
│                        │  ──────────────────────────── [💾 Save] ── │
└────────────────────────┴─────────────────────────────────────────────┘
```

### Component Responsibilities

| Component          | Responsibility                                                     |
| ------------------ | ------------------------------------------------------------------ |
| `NetworkTab`       | Left panel. Lists all sessions. Click to select.                   |
| `SessionDetail`    | Right panel. Shows request info, event list, pending controls.     |
| `EventRow`         | One SSE event. Status badge + JSON preview + action buttons.       |
| `EventEditor`      | Modal with CodeMirror. Edit event data before forwarding.          |
| `InjectModal`      | Modal to create a synthetic event (event type + JSON data).        |
| `DelayControl`     | Inline number input for delay before forwarding an event.          |
| `RequestPreview`   | Shows original request URL, headers, and body (CodeMirror viewer). |
| `AutoForwardToggle`| Global toggle. When ON, all events forward automatically.          |

### TypeScript Types (mirrors Python models)

```typescript
// types/index.ts

export interface SSEEvent {
  event: string
  data: string
  id?: string
  retry?: number
}

export interface RequestInfo {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

export type SessionStatus = "active" | "completed" | "error"
export type EventAction = "forward" | "edit" | "drop" | "inject" | "delay"

export interface HistoryEntry {
  index: number
  timestamp: number
  originalEvent: SSEEvent | null
  action: EventAction
  sentEvent: SSEEvent | null
  delayMs: number
}

export interface SessionInfo {
  id: string
  request: RequestInfo
  status: SessionStatus
  createdAt: number
  eventCount: number
  pendingCount: number
}

// WebSocket messages: Server → UI
export type ServerMsg =
  | { type: "new_session"; session: SessionInfo }
  | { type: "event"; sessionId: string; index: number; event: SSEEvent }
  | { type: "stream_end"; sessionId: string }
  | { type: "error"; sessionId: string; message: string }

// WebSocket commands: UI → Server
export type ClientCmd =
  | { type: "forward"; sessionId: string; index: number }
  | { type: "edit"; sessionId: string; index: number; event: SSEEvent }
  | { type: "drop"; sessionId: string; index: number }
  | { type: "inject"; sessionId: string; afterIndex: number; event: SSEEvent }
  | { type: "delay"; sessionId: string; index: number; delayMs: number }
  | { type: "forward_all"; sessionId: string }
  | { type: "save_session"; sessionId: string; filename: string }
```

---

## Mock File Format

Saved to `mocks/<name>.json`. Created by "Save Session" in UI or written manually.

```json
{
  "name": "Slow flight search with injected error",
  "description": "Delays 3s after context, injects a timeout error",
  "enabled": false,
  "match": {
    "url_pattern": "/flight/search/sse/.*"
  },
  "mode": "pipeline",
  "pipeline": [
    {
      "action": "passthrough",
      "match_event": "context",
      "comment": "Let real context through"
    },
    {
      "action": "delay",
      "delay_ms": 3000,
      "comment": "Simulate slow network"
    },
    {
      "action": "passthrough",
      "match_event": "debug"
    },
    {
      "action": "drop_rest",
      "comment": "Discard all remaining real events"
    },
    {
      "action": "mock",
      "event": "error",
      "data": "{\"errorType\":\"TIMEOUT\",\"userErrorMessage\":\"Search timed out\"}",
      "comment": "Inject fake timeout error"
    }
  ]
}
```

### Pipeline Rules

| Action            | Consumes real event? | Description                                              |
| ----------------- | -------------------- | -------------------------------------------------------- |
| `passthrough`     | Yes (1 event)        | Forward next real event. `match_event` is an assertion.  |
| `passthrough_rest`| Yes (all remaining)  | Forward all remaining real events. Must be last or near-last. |
| `mock`            | No                   | Inject a synthetic event.                                |
| `delay`           | No                   | Sleep for `delay_ms` before next step.                   |
| `drop`            | Yes (1 event)        | Consume + discard next real event.                       |
| `drop_rest`       | Yes (all remaining)  | Consume + discard all remaining real events.             |

**`match_event` semantics**: An assertion, not a filter. If the next real event
type doesn't match, the relay logs a warning and forwards it anyway (no data loss).

**After `*_rest`**: Only `mock` and `delay` steps are valid.

---

## WebSocket Protocol Details

All messages are JSON. Both directions use discriminated union on `type`.

**Relay → UI notifications:**

| Message        | When                                              |
| -------------- | ------------------------------------------------- |
| `new_session`  | A new SSE request arrives at relay                |
| `event`        | An upstream event arrives, waiting for QA action  |
| `stream_end`   | Upstream SSE stream closed                        |
| `error`        | Upstream connection or parse error                |

**UI → Relay commands:**

| Command        | Effect                                                            |
| -------------- | ----------------------------------------------------------------- |
| `forward`      | Send real event as-is to client                                   |
| `edit`         | Send modified event to client, auto-drop original                 |
| `drop`         | Discard event, client never sees it                               |
| `inject`       | Insert synthetic event before a pending event                     |
| `delay`        | Add N ms sleep before forwarding this event                       |
| `forward_all`  | Exit breakpoint mode, forward all remaining real events as-is     |
| `save_session` | Serialize session history to `mocks/<filename>.json`              |

---

## Dependencies

### Python (`pyproject.toml`)

```toml
[project]
name = "orthrus"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "mitmproxy>=10.0",
    "aiohttp>=3.9",
    "pydantic>=2.0",
    "watchfiles>=0.20",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "mypy>=1.8",
    "ruff>=0.3",
]
```

### Frontend (`ui/package.json`)

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "@codemirror/lang-json": "^6",
    "@uiw/react-codemirror": "^4",
    "class-variance-authority": "^0.7",
    "clsx": "^2",
    "tailwind-merge": "^2"
  },
  "devDependencies": {
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vite": "^5",
    "shadcn-ui": "latest"
  }
}
```

---

## Startup & Usage

### `run.sh`

```bash
#!/bin/bash
set -e

# Build UI if dist doesn't exist
if [ ! -d "ui/dist" ]; then
  echo "Building UI..."
  cd ui && bun install && bun run build && cd ..
fi

# Start relay server in background
echo "Starting relay server on :9000..."
uv run python relay_server.py &
RELAY_PID=$!

# Give relay a moment to start
sleep 1

# Start mitmproxy
echo "Starting mitmproxy on :8080..."
echo "Open http://localhost:9000/ui in your browser"
uv run mitmdump -s addon.py

# Cleanup
kill $RELAY_PID
```

### QA Workflow

```bash
# 1. First time setup
uv sync
cd ui && bun install && cd ..

# 2. Start everything
./run.sh

# 3. Open debugger UI
open http://localhost:9000/ui

# 4. Configure device/browser proxy
#    - Host: <your machine IP>
#    - Port: 8080
#    - Install mitmproxy CA cert (http://mitm.it on the device)

# 5. Trigger a flight search in the app
#    → SSE request intercepted → appears in UI
#    → Click each event to Forward / Edit / Drop / Inject / Delay

# 6. Toggle Auto-Forward to just observe without breaking

# 7. Save Session → exports mocks/<name>.json for replay
```

### Replay Saved Mock (no live server)

```bash
# Enable the mock file
# Edit mocks/<name>.json → set "enabled": true

# Start with replay flag (no mitmproxy needed)
uv run python relay_server.py --replay-only

# POST to /replay with original request body
curl -X POST http://localhost:9000/replay \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://...", "body": {...} }'
```

---

## Implementation Order

1. **`src/models.py`** — All types first, everything else depends on this
2. **`src/sse_parser.py`** — Parse SSE chunks into events
3. **`src/session.py`** + **`src/session_manager.py`** — Session state
4. **`src/sse_client.py`** — Upstream SSE reader
5. **`src/mock_loader.py`** — Load + watch mock files
6. **`src/pipeline_runner.py`** — Replay engine
7. **`src/handlers/`** — aiohttp route handlers
8. **`relay_server.py`** — Wire up aiohttp app
9. **`addon.py`** — mitmproxy addon
10. **`ui/`** — React frontend (can be done in parallel with backend)
11. **`run.sh`** + **`mocks/_example_*.json`** + **`README.md`**
