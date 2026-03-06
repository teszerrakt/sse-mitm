from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

import aiohttp
from aiohttp import web

from src.handlers.cert import (
    get_cert_download_handler,
    get_cert_status_handler,
    post_cert_install_handler,
    post_tls_error_handler,
)
from src.handlers.config import get_config_handler, put_config_handler
from src.handlers.relay import relay_handler
from src.handlers.replay import replay_handler
from src.handlers.sessions import sessions_handler
from src.handlers.websocket import websocket_handler
from src.mock_loader import MockLoader
from src.session_manager import SessionManager

logger = logging.getLogger(__name__)

UI_DIST = Path(__file__).parent / "ui" / "dist"


async def _ws_broadcaster(app: web.Application):
    """Return a broadcaster coroutine bound to this app's ws_clients set."""

    async def broadcast(message: str) -> None:
        dead: list[web.WebSocketResponse] = []
        for ws in app["ws_clients"]:
            try:
                await ws.send_str(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            app["ws_clients"].discard(ws)

    return broadcast


async def on_startup(app: web.Application) -> None:
    app["http_client"] = aiohttp.ClientSession()
    app["ws_clients"]: set[web.WebSocketResponse] = set()
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


def create_app(mocks_dir: Path, auto_forward: bool = False) -> web.Application:
    app = web.Application()

    # Shared state
    app["session_manager"] = SessionManager()
    app["mock_loader"] = MockLoader(mocks_dir)
    app["mocks_dir"] = mocks_dir
    app["auto_forward_default"] = auto_forward

    # Routes
    app.router.add_post("/relay", relay_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_get("/sessions", sessions_handler)
    app.router.add_post("/replay", replay_handler)
    app.router.add_get("/config", get_config_handler)
    app.router.add_put("/config", put_config_handler)
    app.router.add_get("/cert", get_cert_download_handler)
    app.router.add_get("/cert/status", get_cert_status_handler)
    app.router.add_post("/cert/install", post_cert_install_handler)
    app.router.add_post("/tls-error", post_tls_error_handler)

    # Serve React UI build artifacts
    if UI_DIST.exists():
        app.router.add_static("/assets", UI_DIST / "assets")

        async def serve_index(request: web.Request) -> web.FileResponse:
            return web.FileResponse(UI_DIST / "index.html")

        app.router.add_get("/", serve_index)
        app.router.add_get("/ui", serve_index)
        app.router.add_get("/ui/{tail:.*}", serve_index)
    else:
        logger.warning(
            "UI dist not found at %s — run 'cd ui && bun run build' first", UI_DIST
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
