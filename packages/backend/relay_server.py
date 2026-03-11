from __future__ import annotations

import argparse
import asyncio
import logging
import os
import ssl
from pathlib import Path

import aiohttp
import certifi
from aiohttp import web
from aiohttp.typedefs import Handler

from src.cookie_jar import CookieJar
from src.handlers.cert import (
    get_cert_download_handler,
    get_cert_status_handler,
    post_cert_install_handler,
    post_tls_error_handler,
)
from src.handlers.config import get_config_handler, put_config_handler
from src.handlers.cookies import (
    cookie_clear_handler,
    cookie_list_handler,
    cookie_store_handler,
)
from src.handlers.ingest import (
    ingest_chunk_handler,
    ingest_drain_handler,
    ingest_end_handler,
    ingest_start_handler,
)
from src.handlers.relay import relay_handler
from src.handlers.replay import replay_handler
from src.handlers.sessions import clear_sessions_handler, sessions_handler
from src.handlers.traffic import (
    traffic_clear_handler,
    traffic_intercept_handler,
    traffic_list_handler,
    traffic_log_handler,
)
from src.handlers.websocket import websocket_handler
from src.mock_loader import MockLoader
from src.session_manager import SessionManager
from src.traffic_store import TrafficStore

logger = logging.getLogger(__name__)

_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
}


@web.middleware
async def cors_middleware(
    request: web.Request,
    handler: Handler,
) -> web.StreamResponse:
    """Add CORS headers to all responses.

    Required for Tauri production mode where the frontend origin
    is tauri://localhost and the backend is http://localhost:29000.
    """
    if request.method == "OPTIONS":
        return web.Response(headers=_CORS_HEADERS)
    response = await handler(request)
    response.headers.update(_CORS_HEADERS)
    return response


_DEFAULT_CONFIG_FILE = (
    Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parent.parent.parent)))
    / "config.json"
)
UI_DIST = (
    Path(os.environ.get("ORTHRUS_ROOT", str(Path(__file__).parent.parent.parent)))
    / "packages"
    / "web"
    / "dist"
)


async def _ws_broadcaster(app: web.Application):
    """Return a broadcaster coroutine bound to this app's ws_clients set."""

    async def broadcast(message: str) -> None:
        dead: list[web.WebSocketResponse] = []
        for ws in list(app["ws_clients"]):
            try:
                await asyncio.wait_for(ws.send_str(message), timeout=5.0)
            except Exception:
                dead.append(ws)
        for ws in dead:
            app["ws_clients"].discard(ws)

    return broadcast


async def on_startup(app: web.Application) -> None:
    # Use certifi CA bundle for outbound HTTPS — required inside PyInstaller
    # where Python's default ssl module can't find the system CA store.
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    connector = aiohttp.TCPConnector(ssl=ssl_ctx)
    app["http_client"] = aiohttp.ClientSession(connector=connector)
    app["ws_clients"] = set()
    app["ws_broadcaster"] = await _ws_broadcaster(app)

    mock_loader: MockLoader = app["mock_loader"]
    mock_loader.load_all()

    # Start file watcher in background
    app["watcher_task"] = asyncio.create_task(mock_loader.start_watching())
    logger.info("Relay server started")


async def on_shutdown(app: web.Application) -> None:
    app["watcher_task"].cancel()
    await app["http_client"].close()
    for ws in list(app["ws_clients"]):
        await ws.close()
    logger.info("Relay server shut down")


def create_app(
    mocks_dir: Path,
    auto_forward: bool = False,
    config_file: Path | None = None,
) -> web.Application:
    app = web.Application(middlewares=[cors_middleware])

    # Shared state
    app["session_manager"] = SessionManager()
    app["traffic_store"] = TrafficStore()
    app["traffic_flow_map"] = {}
    app["mock_loader"] = MockLoader(mocks_dir)
    app["mocks_dir"] = mocks_dir
    app["auto_forward_default"] = auto_forward
    app["config_file"] = config_file or _DEFAULT_CONFIG_FILE
    app["cookie_jar"] = CookieJar()

    # Routes
    app.router.add_post("/relay", relay_handler)
    app.router.add_post("/ingest/start", ingest_start_handler)
    app.router.add_post("/ingest/chunk", ingest_chunk_handler)
    app.router.add_post("/ingest/drain", ingest_drain_handler)
    app.router.add_post("/ingest/end", ingest_end_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/sessions", sessions_handler)
    app.router.add_delete("/sessions", clear_sessions_handler)
    app.router.add_post("/replay", replay_handler)
    app.router.add_get("/config", get_config_handler)
    app.router.add_put("/config", put_config_handler)
    app.router.add_get("/cert", get_cert_download_handler)
    app.router.add_get("/cert/status", get_cert_status_handler)
    app.router.add_post("/cert/install", post_cert_install_handler)
    app.router.add_post("/tls-error", post_tls_error_handler)

    # Cookie jar routes (borrow-cookie for SSE auth)
    app.router.add_post("/cookies/store", cookie_store_handler)
    app.router.add_get("/cookies", cookie_list_handler)
    app.router.add_delete("/cookies", cookie_clear_handler)

    # HTTP traffic routes
    app.router.add_post("/traffic/log", traffic_log_handler)
    app.router.add_post("/traffic/intercept", traffic_intercept_handler)
    app.router.add_get("/traffic", traffic_list_handler)
    app.router.add_delete("/traffic", traffic_clear_handler)

    # Serve React UI build artifacts
    if UI_DIST.exists():
        app.router.add_static("/assets", UI_DIST / "assets")
        if (UI_DIST / "fonts").exists():
            app.router.add_static("/fonts", UI_DIST / "fonts")

        def static_file_handler(path: Path):
            async def handler(request: web.Request) -> web.FileResponse:
                return web.FileResponse(path)

            return handler

        for static_file in (
            "favicon.ico",
            "favicon-32x32.png",
            "apple-touch-icon.png",
            "orthrus.png",
        ):
            file_path = UI_DIST / static_file
            if file_path.exists():
                app.router.add_get(
                    f"/{static_file}",
                    static_file_handler(file_path),
                )

        async def serve_index(request: web.Request) -> web.FileResponse:
            return web.FileResponse(UI_DIST / "index.html")

        app.router.add_get("/", serve_index)
        app.router.add_get("/ui", serve_index)
        app.router.add_get("/ui/{tail:.*}", serve_index)
    else:
        logger.warning(
            "UI dist not found at %s — run 'bun run build:web' first", UI_DIST
        )

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)
    return app


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="SSE Event Debugger — Relay Server")
    parser.add_argument(
        "--port", type=int, default=29000, help="Relay server port (default: 29000)"
    )
    parser.add_argument(
        "--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--mocks-dir",
        default="mocks",
        help="Path to mocks directory (default: mocks/)",
    )
    parser.add_argument(
        "--auto-forward",
        action="store_true",
        help="Auto-forward all events without UI breakpoints",
    )
    args = parser.parse_args()

    mocks_dir = Path(args.mocks_dir)
    app = create_app(mocks_dir=mocks_dir, auto_forward=args.auto_forward)

    logger.info("Starting relay server on http://%s:%d", args.host, args.port)
    logger.info("Open Web UI at http://localhost:%d/ui", args.port)
    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
