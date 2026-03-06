from __future__ import annotations

import json
import logging
import os
import time
from urllib import error as url_error
from urllib import request as url_request
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

from mitmproxy import http
from mitmproxy import tls

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(
    os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parent.parent.parent))
)
CONFIG_FILE = _PROJECT_ROOT / "config.json"

_DEFAULT_CONFIG: dict[str, Any] = {
    "relay_host": "localhost",
    "relay_port": 29000,
    "sse_patterns": [
        "*/sse*",
        "*/stream*",
    ],
}

_TLS_ERROR_DEBOUNCE_SEC = 5.0


def _load_config() -> dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            return {**_DEFAULT_CONFIG, **json.loads(CONFIG_FILE.read_text())}
        except Exception as exc:
            logger.warning("Failed to load config.json: %s — using defaults", exc)
    return _DEFAULT_CONFIG


class SSEInterceptorAddon:
    """
    mitmproxy addon that detects SSE requests by URL pattern and redirects
    them to the local relay server for event-level debugging.

    Non-SSE requests pass through unchanged.
    Intercept patterns use glob syntax (e.g. */sse*, */stream*).
    Config is hot-reloaded from config.json on file change — no restart needed.
    """

    def __init__(self) -> None:
        config = _load_config()
        self._relay_host: str = config["relay_host"]
        self._relay_port: int = int(config["relay_port"])
        self._patterns: list[str] = list(config["sse_patterns"])
        self._config_mtime: float = self._get_config_mtime()
        self._last_tls_error_at: dict[tuple[str, str | None], float] = {}
        logger.info(
            "SSE interceptor ready — relay at %s:%d, patterns: %s",
            self._relay_host,
            self._relay_port,
            self._patterns,
        )

    def _get_config_mtime(self) -> float:
        try:
            return os.path.getmtime(CONFIG_FILE)
        except OSError:
            return 0.0

    def _reload_if_changed(self) -> None:
        mtime = self._get_config_mtime()
        if mtime != self._config_mtime:
            self._config_mtime = mtime
            config = _load_config()
            self._relay_host = config["relay_host"]
            self._relay_port = int(config["relay_port"])
            self._patterns = list(config["sse_patterns"])
            logger.info(
                "Config reloaded — relay at %s:%d, patterns: %s",
                self._relay_host,
                self._relay_port,
                self._patterns,
            )

    def request(self, flow: http.HTTPFlow) -> None:
        """Intercept matching SSE requests and redirect to relay server."""
        self._reload_if_changed()

        url = flow.request.pretty_url
        if not self._is_sse_request(url):
            return

        logger.info("Intercepting SSE request: %s", url)

        # Preserve the original URL so the relay can forward it upstream
        original_url = url

        # Rewrite request to relay server
        flow.request.host = self._relay_host
        flow.request.port = self._relay_port
        flow.request.scheme = "http"

        # Point to /relay with target param
        flow.request.path = f"/relay?target={_url_encode(original_url)}"

        # Relay handler expects POST
        flow.request.method = "POST"

        # Ensure HTTP/1.1 — relay server speaks HTTP/1.1
        flow.request.http_version = "HTTP/1.1"

        # Preserve original client IP for grouping in the UI
        peer = flow.client_conn.peername
        if peer:
            flow.request.headers["x-original-client-ip"] = str(peer[0])

        # Update host header
        flow.request.headers.pop("host", None)
        flow.request.headers["host"] = f"{self._relay_host}:{self._relay_port}"

    def responseheaders(self, flow: http.HTTPFlow) -> None:
        """Enable response streaming for SSE — mitmproxy must not buffer."""
        if flow.request.path.startswith("/relay?"):
            if flow.response is not None:
                flow.response.stream = True  # type: ignore[assignment]

    def tls_failed_client(self, data: tls.TlsData) -> None:
        """Notify relay/UI when a client TLS handshake fails."""
        peer = data.conn.peername
        client_ip = str(peer[0]) if peer else "unknown"
        sni = data.context.client.sni
        now = time.time()
        key = (client_ip, sni)
        last = self._last_tls_error_at.get(key, 0.0)
        if (now - last) < _TLS_ERROR_DEBOUNCE_SEC:
            return

        self._last_tls_error_at[key] = now
        logger.warning(
            "TLS handshake failed from client=%s sni=%s (likely untrusted mitm cert)",
            client_ip,
            sni,
        )
        self._notify_tls_error(client_ip=client_ip, sni=sni, timestamp=now)

    def _is_sse_request(self, url: str) -> bool:
        return any(fnmatch(url, p) for p in self._patterns)

    def _notify_tls_error(
        self, *, client_ip: str, sni: str | None, timestamp: float
    ) -> None:
        payload = {
            "client_ip": client_ip,
            "sni": sni,
            "timestamp": timestamp,
        }
        try:
            req = url_request.Request(
                url=f"http://{self._relay_host}:{self._relay_port}/tls-error",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with url_request.urlopen(req, timeout=0.5):
                pass
        except (url_error.URLError, TimeoutError) as exc:
            logger.debug("Failed to publish tls_error to relay: %s", exc)


def _url_encode(url: str) -> str:
    from urllib.parse import quote

    return quote(url, safe="")


# mitmproxy entry point
addons = [SSEInterceptorAddon()]
