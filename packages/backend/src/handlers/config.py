from __future__ import annotations

import json
import logging
import os
import socket
from pathlib import Path

from aiohttp import web

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parents[3])))
CONFIG_FILE = _PROJECT_ROOT / "config.json"

_DEFAULT_CONFIG = {
    "sse_patterns": ["*/sse*", "*/stream*"],
    "relay_host": "127.0.0.1",
    "relay_port": 29000,
}


def _get_lan_ip() -> str:
    """Return the machine's LAN IP — the address other devices can reach."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _read_config() -> dict:
    if CONFIG_FILE.exists():
        try:
            on_disk = json.loads(CONFIG_FILE.read_text())
            return {**_DEFAULT_CONFIG, **on_disk}
        except Exception as exc:
            logger.warning("Failed to read config.json: %s", exc)
    return dict(_DEFAULT_CONFIG)


def _write_config(data: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(data, indent=2) + "\n")


async def get_config_handler(request: web.Request) -> web.Response:
    """GET /config — return current config.json contents plus runtime info."""
    config = _read_config()
    proxy_port = int(os.environ.get("PROXY_PORT", 28080))
    config["proxy_address"] = f"{_get_lan_ip()}:{proxy_port}"
    return web.json_response(config)


async def put_config_handler(request: web.Request) -> web.Response:
    """PUT /config — update sse_patterns in config.json."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    if "sse_patterns" not in body:
        return web.json_response(
            {"error": "Missing required field: sse_patterns"}, status=400
        )

    patterns = body["sse_patterns"]
    if not isinstance(patterns, list):
        return web.json_response({"error": "sse_patterns must be an array"}, status=400)
    if not patterns:
        return web.json_response(
            {"error": "sse_patterns must not be empty"}, status=400
        )
    if not all(isinstance(p, str) for p in patterns):
        return web.json_response({"error": "All patterns must be strings"}, status=400)

    # Merge with existing config — only sse_patterns is user-editable
    current = _read_config()
    updated = {**current, "sse_patterns": patterns}
    _write_config(updated)

    logger.info("Config updated — sse_patterns: %s", patterns)
    return web.json_response(updated)
