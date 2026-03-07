<p align="center">
  <img src="packages/web/src/assets/orthrus.png" alt="Orthrus" width="120" />
</p>

# Orthrus

SSE debugging tool — intercepts Server-Sent Events via mitmproxy, routes them through a relay server, and presents a browser UI (or native macOS app) to inspect, pause, edit, drop, inject, and delay individual events in real time.

```
Mobile/Browser ──WiFi proxy──► mitmproxy :28080
                                   │
                                   │ rewrites SSE requests to /relay?target=<url>
                                   ▼
                           relay server :29000   ◄──► WebSocket ◄──► Browser UI / Desktop App
                                   │
                                   │ upstream SSE fetch
                                   ▼
                           Real SSE Server
```

## Prerequisites

- [Python 3.12+](https://www.python.org/downloads/) with [uv](https://docs.astral.sh/uv/getting-started/installation/)
- [bun](https://bun.sh/docs/installation)

## Quick Start

```bash
bun run install:all        # install all dependencies (uv + bun)
bun run dev:web            # relay server + mitmproxy + Vite dev server
```

Open `http://localhost:5173` in your browser. On your mobile device, set WiFi proxy to `<your-machine-ip>:28080`.

### Desktop App (macOS)

```bash
bun run dev:desktop        # relay server + mitmproxy + Tauri dev
bun run build:desktop      # build .app + .dmg
```

## Event Actions

| Action | Description |
|--------|-------------|
| **Forward** | Send the event as-is to the client |
| **Edit** | Modify the event data, then forward |
| **Drop** | Discard the event (client never sees it) |
| **Inject** | Send a synthetic event not from the real stream |
| **Delay** | Wait N ms then forward |
| **Forward All** | Flush all pending events without reviewing |

**Auto-Forward**: Toggle in the toolbar to let all events pass through automatically.

## Mock Files

Drop `.json` files into `mocks/`. Set `"enabled": true` on exactly one to activate it. Mock files are hot-reloaded.

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

## Configuration

`config.json` controls which URLs mitmproxy intercepts. Editable from the Settings page in the UI.

```json
{
  "sse_patterns": ["*/sse*", "*/stream*", "*/events*"],
  "relay_host": "127.0.0.1",
  "relay_port": 29000
}
```

Patterns use glob syntax. Changes are hot-reloaded on every request.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_PORT` | `29000` | Relay server port |
| `PROXY_PORT` | `28080` | mitmproxy port |
| `MOCKS_DIR` | `./mocks` | Mock files directory |
