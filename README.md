<p align="center">
  <img src="ui/src/assets/orthrus.png" alt="Orthrus" width="120" />
</p>

# Orthrus

SSE debugging tool — intercepts Server-Sent Events with mitmproxy, routes them through a relay server, and presents a Chrome DevTools-style UI to inspect, pause, edit, drop, inject, and delay individual events in real time.

## Architecture

```
Mobile/Browser ──WiFi proxy──► mitmproxy :28080
                                   │
                                   │ rewrites SSE requests to /relay?target=<url>
                                   ▼
                           relay server :29000   ◄──► WebSocket ◄──► Browser UI
                                   │
                                   │ upstream SSE fetch
                                   ▼
                           Real SSE Server
```

## Prerequisites

- [Python 3.12+](https://www.python.org/downloads/)
- [uv](https://docs.astral.sh/uv/getting-started/installation/) — Python package manager (installs mitmproxy and all Python deps)
- [bun](https://bun.sh/docs/installation) — JavaScript runtime & package manager

## Quick Start

```bash
# Check prerequisites and install all dependencies
./install.sh

# Build the UI
cd ui && bun run build && cd ..

# Run everything
./run.sh
```

`run.sh` auto-builds the UI only when inputs change (`ui/src`, `ui/index.html`, `ui/package.json`, `ui/bun.lock`, `ui/vite.config.ts`, `ui/tsconfig*.json`).

Open `http://localhost:29000` in your browser.

On your mobile device, set the WiFi proxy to `<your-machine-ip>:28080`.

## How It Works

1. **mitmproxy** (`addon.py`) handles HTTPS CONNECT tunneling and certificate installation. It intercepts matching SSE requests and rewrites them to the relay server.
2. **relay server** (`relay_server.py`) receives the rewritten request, fetches the real SSE stream from upstream, and holds each event at a breakpoint until the user acts on it via the UI.
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

`config.json` controls which URLs mitmproxy intercepts. You can also edit patterns from the **Settings page** in the UI (gear icon in top bar).

```json
{
  "sse_patterns": ["*/sse*", "*/stream*", "*/events*"],
  "relay_host": "127.0.0.1",
  "relay_port": 29000
}
```

Patterns use glob syntax — `*` matches anything. The addon hot-reloads `config.json` on every request (cheap mtime check), so changes take effect immediately without restarting mitmproxy.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_PORT` | `29000` | Relay server port |
| `PROXY_PORT` | `28080` | mitmproxy port |
| `MOCKS_DIR` | `./mocks` | Mock files directory |

## Development

```bash
# Run everything with Vite HMR (relay + mitmproxy + Vite dev server)
./run_dev.sh

# Python type check
uv run mypy src/ relay_server.py addon.py

# Python lint
uv run ruff check .

# UI dev server only (if relay is already running separately)
cd ui && bun run dev
```
