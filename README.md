# fpr-sse-mitm

SSE debugging tool for QA — intercepts Server-Sent Events with mitmproxy, routes them through a relay server, and presents a Chrome DevTools-style UI to inspect, pause, edit, drop, inject, and delay individual events in real time.

## Architecture

```
Mobile/Browser ──WiFi proxy──► mitmproxy :8080
                                   │
                                   │ rewrites SSE requests to /relay?target=<url>
                                   ▼
                           relay server :9000   ◄──► WebSocket ◄──► Browser UI
                                   │
                                   │ upstream SSE fetch
                                   ▼
                           Real SSE Server
```

## Quick Start

```bash
# Install Python deps
uv sync

# Install UI deps
cd ui && bun install && cd ..

# Build UI
cd ui && bun run build && cd ..

# Run everything
./run.sh
```

Open `http://localhost:9000` in your browser.

On your mobile device, set the WiFi proxy to `<your-machine-ip>:8080`.

## How It Works

1. **mitmproxy** (`addon.py`) handles HTTPS CONNECT tunneling and certificate installation. It intercepts matching SSE requests and rewrites them to the relay server.
2. **relay server** (`relay_server.py`) receives the rewritten request, fetches the real SSE stream from upstream, and holds each event at a breakpoint until the QA engineer acts on it via the UI.
3. **WebSocket** connects the browser UI to the relay server for real-time bidirectional control.
4. **React UI** (`ui/`) shows all active SSE sessions in a left panel; clicking a session shows events in a right panel with action buttons.

## Event Actions

| Action | Description |
|--------|-------------|
| **Forward** | Send the event as-is to the client |
| **Edit** | Modify the event data, then forward |
| **Drop** | Discard the event (client never sees it) |
| **Inject** | Send a synthetic event not from the real stream |
| **Delay** | Wait N ms then forward |
| **Forward All** | Flush all pending events without reviewing |

**Auto-Forward**: Toggle in the toolbar to let all events pass through automatically (like normal browsing, but with logging).

## Mock Files

Drop `.json` files into `mocks/`. Set `"enabled": true` on exactly one file to activate it.

```json
{
  "enabled": true,
  "url_pattern": "*/sse*",
  "mode": "pipeline",
  "pipeline": [
    { "action": "passthrough" },
    { "action": "delay", "delay_ms": 2000 },
    { "action": "mock", "event": { "event": "injected", "data": "{}", "id": null, "retry": null } },
    { "action": "passthrough_rest" }
  ]
}
```

See `mocks/_example_*.json` for more examples. Mock files are hot-reloaded — no server restart needed.

## Configuration

`config.json` controls which URLs mitmproxy intercepts:

```json
{
  "intercept_patterns": ["*/sse*", "*/stream*", "*/events*"],
  "relay_host": "127.0.0.1",
  "relay_port": 9000
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_PORT` | `9000` | Relay server port |
| `PROXY_PORT` | `8080` | mitmproxy port |
| `MOCKS_DIR` | `./mocks` | Mock files directory |

## Development

```bash
# Python type check
uv run mypy src/ relay_server.py addon.py

# Python lint
uv run ruff check .

# UI dev server (hot reload, proxies to relay)
cd ui && bun run dev
```
