from __future__ import annotations

import json
import logging
import os
import socket
from pathlib import Path

from aiohttp import web

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_FILE = (
    Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parents[4]))) / "config.json"
)

_VALID_STAGES = {"request", "response", "both"}

_DEFAULT_CONFIG = {
    "sse_patterns": ["*/sse*", "*/stream*"],
    "api_breakpoint_patterns": [],
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


def _normalize_breakpoint_rules(raw: list) -> list[dict[str, str | bool]]:
    """Normalize api_breakpoint_patterns entries.

    Accepts both legacy bare strings (``"*/api/*"``) and full rule objects
    (``{"pattern": "*/api/*", "stage": "both", "enabled": true}``).  Bare
    strings are promoted to ``{"pattern": <str>, "stage": "both", "enabled": True}``.
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


def _read_config(config_file: Path) -> dict:
    if config_file.exists():
        try:
            on_disk = json.loads(config_file.read_text())
            merged = {**_DEFAULT_CONFIG, **on_disk}
            # Normalize legacy string[] api_breakpoint_patterns to object[]
            merged["api_breakpoint_patterns"] = _normalize_breakpoint_rules(
                merged.get("api_breakpoint_patterns", [])
            )
            return merged
        except Exception as exc:
            logger.warning("Failed to read %s: %s", config_file, exc)
    return dict(_DEFAULT_CONFIG)


def _write_config(config_file: Path, data: dict) -> None:
    config_file.parent.mkdir(parents=True, exist_ok=True)
    config_file.write_text(json.dumps(data, indent=2) + "\n")


async def get_config_handler(request: web.Request) -> web.Response:
    """GET /config — return current config.json contents plus runtime info."""
    config_file: Path = request.app["config_file"]
    config = _read_config(config_file)
    proxy_port = int(os.environ.get("PROXY_PORT", 28080))
    config["proxy_address"] = f"{_get_lan_ip()}:{proxy_port}"
    return web.json_response(config)


async def put_config_handler(request: web.Request) -> web.Response:
    """PUT /config — update sse_patterns and/or api_breakpoint_patterns in config.json."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    if "sse_patterns" not in body and "api_breakpoint_patterns" not in body:
        return web.json_response(
            {
                "error": "Missing required field: sse_patterns or api_breakpoint_patterns"
            },
            status=400,
        )

    # Validate sse_patterns if present
    if "sse_patterns" in body:
        patterns = body["sse_patterns"]
        if not isinstance(patterns, list):
            return web.json_response(
                {"error": "sse_patterns must be an array"}, status=400
            )
        if not patterns:
            return web.json_response(
                {"error": "sse_patterns must not be empty"}, status=400
            )
        if not all(isinstance(p, str) for p in patterns):
            return web.json_response(
                {"error": "All sse_patterns must be strings"}, status=400
            )

    # Validate api_breakpoint_patterns if present
    if "api_breakpoint_patterns" in body:
        bp_patterns = body["api_breakpoint_patterns"]
        if not isinstance(bp_patterns, list):
            return web.json_response(
                {"error": "api_breakpoint_patterns must be an array"}, status=400
            )
        # Accept both legacy strings and rule objects
        for item in bp_patterns:
            if isinstance(item, str):
                continue  # legacy format — will be normalised on save
            if isinstance(item, dict):
                if "pattern" not in item or not isinstance(item["pattern"], str):
                    return web.json_response(
                        {
                            "error": "Each api_breakpoint_patterns object must have a string 'pattern' field"
                        },
                        status=400,
                    )
                stage = item.get("stage", "both")
                if stage not in _VALID_STAGES:
                    return web.json_response(
                        {
                            "error": f"Invalid stage '{stage}' — must be one of: request, response, both"
                        },
                        status=400,
                    )
                if "enabled" in item and not isinstance(item["enabled"], bool):
                    return web.json_response(
                        {"error": "The 'enabled' field must be a boolean"},
                        status=400,
                    )
            else:
                return web.json_response(
                    {
                        "error": "api_breakpoint_patterns items must be strings or {pattern, stage} objects"
                    },
                    status=400,
                )

    # Merge with existing config — only pattern fields are user-editable
    config_file: Path = request.app["config_file"]
    current = _read_config(config_file)
    if "sse_patterns" in body:
        current["sse_patterns"] = body["sse_patterns"]
    if "api_breakpoint_patterns" in body:
        # Normalize to canonical object format before saving
        current["api_breakpoint_patterns"] = _normalize_breakpoint_rules(
            body["api_breakpoint_patterns"]
        )
    _write_config(config_file, current)

    logger.info(
        "Config updated — sse_patterns: %s, api_breakpoint_patterns: %s",
        current["sse_patterns"],
        current.get("api_breakpoint_patterns", []),
    )

    # Include runtime-only fields so the frontend state stays complete
    proxy_port = int(os.environ.get("PROXY_PORT", 28080))
    current["proxy_address"] = f"{_get_lan_ip()}:{proxy_port}"
    return web.json_response(current)
