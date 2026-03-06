from __future__ import annotations

import asyncio
import logging
import re
import sys
import time
from pathlib import Path

from aiohttp import web

from src.models import TlsErrorMsg

logger = logging.getLogger(__name__)

MITM_DIR = Path.home() / ".mitmproxy"
MITM_CERT_PATH = MITM_DIR / "mitmproxy-ca-cert.pem"
LOGIN_KEYCHAIN = Path.home() / "Library" / "Keychains" / "login.keychain-db"


async def _run_cmd(*args: str) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    return (
        proc.returncode or 0,
        out.decode("utf-8", errors="replace"),
        err.decode("utf-8", errors="replace"),
    )


async def _cert_fingerprint_sha1() -> str | None:
    if not MITM_CERT_PATH.exists():
        return None

    code, out, _ = await _run_cmd(
        "openssl",
        "x509",
        "-in",
        str(MITM_CERT_PATH),
        "-noout",
        "-fingerprint",
        "-sha1",
    )
    if code != 0:
        return None

    match = re.search(r"=([A-Fa-f0-9:]+)", out)
    if not match:
        return None
    return match.group(1).replace(":", "").upper()


async def _is_cert_trusted_macos() -> bool:
    fingerprint = await _cert_fingerprint_sha1()
    if not fingerprint:
        return False

    code, out, _ = await _run_cmd(
        "security",
        "find-certificate",
        "-a",
        "-Z",
        "-k",
        str(LOGIN_KEYCHAIN),
    )
    if code != 0:
        return False

    return fingerprint in out.replace(" ", "").upper()


async def _build_status() -> dict[str, object]:
    cert_exists = MITM_CERT_PATH.exists()
    platform = sys.platform
    auto_install_supported = platform == "darwin"
    installed = await _is_cert_trusted_macos() if auto_install_supported else False

    message: str | None = None
    if not cert_exists:
        message = (
            "mitmproxy certificate not generated yet. Start mitmproxy once "
            "to create ~/.mitmproxy/mitmproxy-ca-cert.pem"
        )
    elif auto_install_supported and not installed:
        message = "mitmproxy certificate exists but is not trusted in login keychain"

    return {
        "platform": platform,
        "auto_install_supported": auto_install_supported,
        "cert_exists": cert_exists,
        "cert_path": str(MITM_CERT_PATH),
        "installed": installed,
        "message": message,
    }


async def get_cert_status_handler(request: web.Request) -> web.Response:
    """GET /cert/status — report whether mitmproxy cert is generated/trusted."""
    return web.json_response(await _build_status())


async def get_cert_download_handler(request: web.Request) -> web.StreamResponse:
    """GET /cert — download mitmproxy CA cert PEM."""
    if not MITM_CERT_PATH.exists():
        return web.json_response(
            {
                "error": (
                    "mitmproxy certificate not found. "
                    "Start mitmproxy once to generate it."
                )
            },
            status=404,
        )

    response = web.FileResponse(path=MITM_CERT_PATH)
    response.headers["Content-Disposition"] = (
        'attachment; filename="mitmproxy-ca-cert.pem"'
    )
    return response


async def post_cert_install_handler(request: web.Request) -> web.Response:
    """POST /cert/install — trust cert in macOS login keychain (no sudo)."""
    if sys.platform != "darwin":
        return web.json_response(
            {
                "ok": False,
                "error": "Auto-install is only supported on macOS",
            },
            status=400,
        )

    if not MITM_CERT_PATH.exists():
        return web.json_response(
            {
                "ok": False,
                "error": "mitmproxy certificate not found. Start mitmproxy once first.",
            },
            status=404,
        )

    code, _, err = await _run_cmd(
        "security",
        "add-trusted-cert",
        "-p",
        "ssl",
        "-p",
        "basic",
        "-k",
        str(LOGIN_KEYCHAIN),
        str(MITM_CERT_PATH),
    )
    if code != 0:
        logger.warning("Failed to trust mitmproxy cert: %s", err.strip())
        return web.json_response(
            {
                "ok": False,
                "error": err.strip() or "Failed to add certificate to login keychain",
            },
            status=500,
        )

    return web.json_response({"ok": True, "status": await _build_status()})


async def post_tls_error_handler(request: web.Request) -> web.Response:
    """POST /tls-error — internal hook from mitmproxy addon for UI warnings."""
    ws_broadcaster = request.app["ws_broadcaster"]

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    client_ip = body.get("client_ip")
    if not isinstance(client_ip, str) or not client_ip:
        return web.json_response(
            {"error": "client_ip must be a non-empty string"}, status=400
        )

    raw_sni = body.get("sni")
    sni = raw_sni if isinstance(raw_sni, str) and raw_sni else None

    raw_timestamp = body.get("timestamp")
    timestamp = (
        float(raw_timestamp) if isinstance(raw_timestamp, (int, float)) else time.time()
    )

    message = TlsErrorMsg(
        type="tls_error",
        client_ip=client_ip,
        sni=sni,
        timestamp=timestamp,
    )
    await ws_broadcaster(message.model_dump_json())
    return web.json_response({"ok": True})
