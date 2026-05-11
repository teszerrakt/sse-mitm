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
- [Rust](https://www.rust-lang.org/tools/install) (desktop app only)

## Quick Start

```bash
bun run install:all        # install all dependencies (uv + bun)
bun run dev:web            # relay server + mitmproxy + Vite dev server
```

Open `http://localhost:5173` in your browser. On your mobile device, set WiFi proxy to `<your-machine-ip>:28080`.

### iOS Device Setup

To intercept HTTPS traffic (including SSE) from an iOS device, you need to install and trust the mitmproxy CA certificate.

#### 1. Find your Mac's IP address

```bash
ipconfig getifaddr en0
```

Note the IP (e.g., `192.168.1.100`). Your iOS device must be on the same WiFi network.

#### 2. Serve the certificate

```bash
cd ~/.mitmproxy && python3 -m http.server 8888
```

The certificate is auto-generated the first time mitmproxy runs (during `bun run dev:web`).

#### 3. Download the certificate on your iOS device

1. Open **Safari** on your iOS device (must be Safari, not Chrome)
2. Go to `http://<your-mac-ip>:8888/mitmproxy-ca-cert.pem`
3. Tap **Allow** when prompted to download the configuration profile

#### 4. Install the profile

1. Open **Settings > General > VPN & Device Management**
2. Tap the **mitmproxy** profile under "Downloaded Profile"
3. Tap **Install**, enter your passcode, and confirm

#### 5. Trust the certificate

> This step is required and often missed.

1. Go to **Settings > General > About > Certificate Trust Settings**
2. Enable **Full Trust** for the mitmproxy root certificate
3. Tap **Continue** on the warning dialog

#### 6. Configure WiFi proxy

1. Go to **Settings > Wi-Fi** and tap the **(i)** next to your connected network
2. Scroll to **HTTP Proxy** and select **Manual**
3. Set **Server** to your Mac's IP and **Port** to `28080`
4. Tap **Save**

#### 7. Verify

Trigger an SSE request from your app. You should see it intercepted in the orthrus UI at `http://localhost:5173`.

> **Note:** Some SDKs (e.g., Datadog, ContentSquare) use certificate pinning and will show TLS errors in the proxy logs. This is expected and does not affect your app's SSE traffic.

### Android Device Setup

1. Export the mitmproxy CA certificate from `~/.mitmproxy/mitmproxy-ca-cert.cer`
2. Transfer it to your Android device
3. Go to **Settings > Security > Install from storage** and install the certificate
4. Set WiFi proxy to `<your-mac-ip>:28080`

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
| **Forward All** | Flush all pending events without reviewing |

**Auto-Forward**: Toggle in the toolbar to let all events pass through automatically.

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
