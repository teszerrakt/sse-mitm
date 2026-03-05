from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from mitmproxy import http
from mitmproxy.net.http import http1

logger = logging.getLogger(__name__)

CONFIG_FILE = Path(__file__).parent / "config.json"

_DEFAULT_CONFIG: dict[str, Any] = {
    "relay_host": "localhost",
    "relay_port": 9000,
    "sse_patterns": [
        r"/.*sse.*",
        r"/.*stream.*",
    ],
}


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
    """

    def __init__(self) -> None:
        config = _load_config()
        self._relay_host: str = config["relay_host"]
        self._relay_port: int = int(config["relay_port"])
        self._patterns: list[re.Pattern[str]] = [
            re.compile(p) for p in config["sse_patterns"]
        ]
        logger.info(
            "SSE interceptor ready — relay at %s:%d, patterns: %s",
            self._relay_host,
            self._relay_port,
            [p.pattern for p in self._patterns],
        )

    def request(self, flow: http.HTTPFlow) -> None:
        """Intercept matching SSE requests and redirect to relay server."""
        url = flow.request.pretty_url
        if not self._is_sse_request(flow):
            return

        logger.info("Intercepting SSE request: %s", url)

        # Preserve the original URL so the relay can forward it upstream
        original_url = url

        # Rewrite request to relay server
        flow.request.host = self._relay_host
        flow.request.port = self._relay_port
        flow.request.scheme = "http"

        # Keep the original path but point to /relay with target param
        flow.request.path = f"/relay?target={_url_encode(original_url)}"

        # Ensure HTTP/1.1 — relay server speaks HTTP/1.1
        flow.request.http_version = "HTTP/1.1"

        # Remove headers that would confuse the relay
        flow.request.headers.pop("host", None)
        flow.request.headers["host"] = f"{self._relay_host}:{self._relay_port}"

    def _is_sse_request(self, flow: http.HTTPFlow) -> bool:
        url = flow.request.pretty_url
        return any(p.search(url) for p in self._patterns)


def _url_encode(url: str) -> str:
    from urllib.parse import quote

    return quote(url, safe="")


# mitmproxy entry point
addons = [SSEInterceptorAddon()]
