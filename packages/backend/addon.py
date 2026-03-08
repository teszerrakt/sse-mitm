from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from fnmatch import fnmatch
from pathlib import Path
from typing import Any
from urllib import error as url_error
from urllib import request as url_request

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
    "api_breakpoint_patterns": [],
}

_TLS_ERROR_DEBOUNCE_SEC = 5.0

# Maximum body size (bytes) we'll capture for traffic logging/intercept
_MAX_BODY_CAPTURE = 512 * 1024  # 512 KB

_VALID_STAGES = {"request", "response", "both"}


def _normalize_breakpoint_rules(raw: list[Any]) -> list[dict[str, str | bool]]:
    """Normalize api_breakpoint_patterns from config.

    Accepts both legacy bare strings and ``{"pattern": ..., "stage": ..., "enabled": ...}``
    objects.  Bare strings are promoted to ``{"pattern": <str>, "stage": "both", "enabled": True}``.
    """
    result: list[dict[str, str | bool]] = []
    for item in raw:
        if isinstance(item, str):
            result.append({"pattern": item, "stage": "both", "enabled": True})
        elif isinstance(item, dict) and "pattern" in item:
            stage = item.get("stage", "both")
            if stage not in _VALID_STAGES:
                stage = "both"
            enabled = item.get("enabled", True)
            if not isinstance(enabled, bool):
                enabled = True
            result.append(
                {"pattern": item["pattern"], "stage": stage, "enabled": enabled}
            )
    return result


def _load_config() -> dict[str, Any]:
    if CONFIG_FILE.exists():
        try:
            return {**_DEFAULT_CONFIG, **json.loads(CONFIG_FILE.read_text())}
        except Exception as exc:
            logger.warning("Failed to load config.json: %s — using defaults", exc)
    return dict(_DEFAULT_CONFIG)


def _extract_request_data(flow: http.HTTPFlow) -> dict[str, Any]:
    """Extract HTTP request data from a mitmproxy flow into a dict
    matching ``HttpRequestData`` fields."""
    req = flow.request
    body: str | None = None
    body_size = len(req.raw_content) if req.raw_content else 0

    if body_size > 0 and body_size <= _MAX_BODY_CAPTURE:
        try:
            body = req.get_text(strict=False)
        except ValueError:
            # Binary content — base64 encode
            body = base64.b64encode(req.raw_content or b"").decode("ascii")

    peer = flow.client_conn.peername
    client_ip = str(peer[0]) if peer else None

    return {
        "method": req.method,
        "url": req.pretty_url,
        "scheme": req.scheme,
        "host": req.host,
        "port": req.port,
        "path": req.path,
        "http_version": req.http_version,
        "headers": dict(req.headers),
        "query": dict(req.query),
        "body": body,
        "body_size": body_size,
        "content_type": req.headers.get("content-type"),
        "client_ip": client_ip,
        "timestamp": time.time(),
    }


def _extract_response_data(flow: http.HTTPFlow) -> dict[str, Any] | None:
    """Extract HTTP response data from a mitmproxy flow into a dict
    matching ``HttpResponseData`` fields."""
    resp = flow.response
    if resp is None:
        return None

    body: str | None = None
    body_size = len(resp.raw_content) if resp.raw_content else 0

    if body_size > 0 and body_size <= _MAX_BODY_CAPTURE:
        try:
            body = resp.get_text(strict=False)
        except ValueError:
            body = base64.b64encode(resp.raw_content or b"").decode("ascii")

    return {
        "status_code": resp.status_code,
        "reason": resp.reason or "",
        "http_version": resp.http_version,
        "headers": dict(resp.headers),
        "body": body,
        "body_size": body_size,
        "content_type": resp.headers.get("content-type"),
        "timestamp_start": resp.timestamp_start or 0.0,
        "timestamp_end": resp.timestamp_end,
    }


def _apply_request_modifications(flow: http.HTTPFlow, mods: dict[str, Any]) -> None:
    """Apply user-specified modifications to the mitmproxy request."""
    if mods.get("method"):
        flow.request.method = mods["method"]
    if mods.get("url"):
        flow.request.url = mods["url"]
    if mods.get("headers"):
        flow.request.headers.clear()
        for k, v in mods["headers"].items():
            flow.request.headers[k] = v
    if mods.get("body") is not None:
        flow.request.set_text(mods["body"])


def _apply_response_modifications(flow: http.HTTPFlow, mods: dict[str, Any]) -> None:
    """Apply user-specified modifications to the mitmproxy response."""
    if flow.response is None:
        return
    if mods.get("status_code") is not None:
        flow.response.status_code = mods["status_code"]
    if mods.get("headers"):
        flow.response.headers.clear()
        for k, v in mods["headers"].items():
            flow.response.headers[k] = v
    if mods.get("body") is not None:
        flow.response.set_text(mods["body"])


class SSEInterceptorAddon:
    """
    mitmproxy addon that:
    1. Detects SSE requests by URL pattern and redirects them to the local
       relay server for event-level debugging (existing behavior).
    2. Logs ALL other HTTP traffic to the relay for observation.
    3. Intercepts (blocks) requests matching ``api_breakpoint_patterns``
       so the user can inspect/modify them in the UI before forwarding.

    Config is hot-reloaded from config.json on file change — no restart needed.
    """

    def __init__(
        self,
        relay_host: str | None = None,
        relay_port: int | None = None,
    ) -> None:
        config = _load_config()
        self._relay_host: str = relay_host or config["relay_host"]
        self._relay_port: int = relay_port or int(config["relay_port"])
        self._patterns: list[str] = list(config["sse_patterns"])
        self._api_breakpoint_rules: list[dict[str, str | bool]] = (
            _normalize_breakpoint_rules(config.get("api_breakpoint_patterns", []))
        )
        self._config_mtime: float = self._get_config_mtime()
        self._last_tls_error_at: dict[tuple[str, str | None], float] = {}
        logger.info(
            "SSE interceptor ready — relay at %s:%d, sse_patterns: %s, "
            "api_breakpoint_rules: %s",
            self._relay_host,
            self._relay_port,
            self._patterns,
            self._api_breakpoint_rules,
        )

    # ------------------------------------------------------------------
    # Config hot-reload
    # ------------------------------------------------------------------

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
            self._api_breakpoint_rules = _normalize_breakpoint_rules(
                config.get("api_breakpoint_patterns", [])
            )
            logger.info(
                "Config reloaded — relay at %s:%d, sse_patterns: %s, "
                "api_breakpoint_rules: %s",
                self._relay_host,
                self._relay_port,
                self._patterns,
                self._api_breakpoint_rules,
            )

    # ------------------------------------------------------------------
    # Pattern matching
    # ------------------------------------------------------------------

    def _is_sse_request(self, url: str) -> bool:
        return any(fnmatch(url, p) for p in self._patterns)

    def _match_api_breakpoint(self, url: str) -> dict[str, str | bool] | None:
        """Return the first matching *enabled* breakpoint rule, or None."""
        for rule in self._api_breakpoint_rules:
            if rule.get("enabled", True) and fnmatch(url, str(rule["pattern"])):
                return rule
        return None

    def _is_relay_request(self, flow: http.HTTPFlow) -> bool:
        """Return True if this flow targets the relay server itself."""
        return (
            flow.request.host in (self._relay_host, "localhost", "127.0.0.1")
            and flow.request.port == self._relay_port
        )

    # ------------------------------------------------------------------
    # mitmproxy hooks
    # ------------------------------------------------------------------

    def request(self, flow: http.HTTPFlow) -> None:
        """
        Called when a complete HTTP request has been received.

        Priority:
        1. Relay requests — skip entirely (avoid recursion)
        2. SSE pattern match — rewrite to relay /relay (existing behavior)
        3. API breakpoint match — block via /traffic/intercept
        4. Everything else — fire-and-forget log via /traffic/log
        """
        self._reload_if_changed()

        # Never intercept/log our own relay traffic
        if self._is_relay_request(flow):
            return

        url = flow.request.pretty_url

        # 1. SSE interception (existing behavior — unchanged)
        if self._is_sse_request(url):
            self._rewrite_to_relay(flow, url)
            return

        # 2. API breakpoint — synchronously block until user acts
        rule = self._match_api_breakpoint(url)
        if rule is not None and rule["stage"] in ("request", "both"):
            logger.info("Breakpoint hit (request): %s %s", flow.request.method, url)
            req_data = _extract_request_data(flow)
            result = self._post_to_relay(
                "/traffic/intercept",
                {
                    "phase": "request",
                    "flow_id": flow.id,
                    "request": req_data,
                },
                timeout=600.0,  # long timeout — user may take time
            )
            if result and result.get("action") == "abort":
                flow.response = http.Response.make(
                    502, b"Request aborted by Orthrus debugger"
                )
                return
            if result and result.get("request_modifications"):
                _apply_request_modifications(flow, result["request_modifications"])
            return

        # 3. Observation — log in background thread (don't block the flow)
        #    Also logs requests that match a response-only breakpoint rule
        req_data = _extract_request_data(flow)
        self._post_to_relay_async(
            "/traffic/log",
            {
                "phase": "request",
                "flow_id": flow.id,
                "request": req_data,
            },
        )

    def response(self, flow: http.HTTPFlow) -> None:
        """
        Called when a complete HTTP response has been received.

        SSE flows (rewritten to /relay) are skipped — they handle their own
        streaming. All other flows get logged or intercepted at response phase.
        """
        # Skip relay traffic and SSE-rewritten flows
        if self._is_relay_request(flow):
            return
        if flow.request.path.startswith("/relay?"):
            return

        url = flow.request.pretty_url

        # API breakpoint — block response phase if stage includes response
        rule = self._match_api_breakpoint(url)
        if rule is not None and rule["stage"] in ("response", "both"):
            logger.info(
                "Breakpoint hit (response): %s %s → %d",
                flow.request.method,
                url,
                flow.response.status_code if flow.response else 0,
            )
            req_data = _extract_request_data(flow)
            resp_data = _extract_response_data(flow)
            result = self._post_to_relay(
                "/traffic/intercept",
                {
                    "phase": "response",
                    "flow_id": flow.id,
                    "request": req_data,
                    "response": resp_data,
                },
                timeout=600.0,
            )
            if result and result.get("action") == "abort":
                flow.response = http.Response.make(
                    502, b"Response aborted by Orthrus debugger"
                )
                return
            if result and result.get("response_modifications"):
                _apply_response_modifications(flow, result["response_modifications"])
            return

        # Observation — log response in background thread
        resp_data = _extract_response_data(flow)
        if resp_data is not None:
            self._post_to_relay_async(
                "/traffic/log",
                {
                    "phase": "response",
                    "flow_id": flow.id,
                    "request": _extract_request_data(flow),
                    "response": resp_data,
                },
            )

    def error(self, flow: http.HTTPFlow) -> None:
        """Called when a flow error occurs (connection reset, timeout, etc.)."""
        if self._is_relay_request(flow):
            return
        if flow.request.path.startswith("/relay?"):
            return

        self._post_to_relay_async(
            "/traffic/log",
            {
                "phase": "error",
                "flow_id": flow.id,
            },
        )

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

    # ------------------------------------------------------------------
    # SSE rewrite (existing behavior, extracted for clarity)
    # ------------------------------------------------------------------

    def _rewrite_to_relay(self, flow: http.HTTPFlow, url: str) -> None:
        """Rewrite an SSE request to point at the relay server's /relay."""
        logger.info("Intercepting SSE request: %s", url)

        original_url = url

        flow.request.host = self._relay_host
        flow.request.port = self._relay_port
        flow.request.scheme = "http"

        flow.request.path = (
            f"/relay?target={_url_encode(original_url)}&method={flow.request.method}"
        )
        flow.request.method = "POST"
        flow.request.http_version = "HTTP/1.1"

        peer = flow.client_conn.peername
        if peer:
            flow.request.headers["x-original-client-ip"] = str(peer[0])

        flow.request.headers.pop("host", None)
        flow.request.headers["host"] = f"{self._relay_host}:{self._relay_port}"

    # ------------------------------------------------------------------
    # Relay communication helpers
    # ------------------------------------------------------------------

    def _relay_url(self, path: str) -> str:
        return f"http://{self._relay_host}:{self._relay_port}{path}"

    def _post_to_relay(
        self,
        path: str,
        payload: dict[str, Any],
        *,
        timeout: float = 5.0,
    ) -> dict[str, Any] | None:
        """POST JSON to relay synchronously, returning parsed response body."""
        try:
            req = url_request.Request(
                url=self._relay_url(path),
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with url_request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except url_error.URLError as exc:
            logger.debug("Failed to POST %s to relay: %s", path, exc)
            return None
        except TimeoutError:
            logger.warning("Timeout posting %s to relay", path)
            return None
        except json.JSONDecodeError as exc:
            logger.debug("Invalid JSON response from relay %s: %s", path, exc)
            return None

    def _post_to_relay_async(
        self,
        path: str,
        payload: dict[str, Any],
    ) -> None:
        """POST JSON to relay in a daemon thread (fire-and-forget)."""
        thread = threading.Thread(
            target=self._post_to_relay,
            args=(path, payload),
            kwargs={"timeout": 2.0},
            daemon=True,
        )
        thread.start()

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
                url=self._relay_url("/tls-error"),
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
