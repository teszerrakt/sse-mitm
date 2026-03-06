"""Unified entry point for Orthrus backend.

Runs both the aiohttp relay server and the mitmproxy interceptor
on a single asyncio event loop. Used by PyInstaller to produce
a single self-contained binary for the Tauri desktop sidecar.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal
from pathlib import Path

from aiohttp import web
from mitmproxy.options import Options
from mitmproxy.tools.dump import DumpMaster

from relay_server import create_app

logger = logging.getLogger(__name__)


async def _start_relay(
    host: str,
    port: int,
    mocks_dir: Path,
    auto_forward: bool,
) -> web.AppRunner:
    """Start the aiohttp relay server without blocking the event loop."""
    app = create_app(mocks_dir=mocks_dir, auto_forward=auto_forward)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info("Relay server listening on http://%s:%d", host, port)
    return runner


async def _start_mitmproxy(
    listen_host: str,
    listen_port: int,
    ssl_insecure: bool,
    relay_host: str,
    relay_port: int,
) -> DumpMaster:
    """Start mitmproxy DumpMaster with the SSE interceptor addon."""
    from addon import SSEInterceptorAddon

    opts = Options(
        listen_host=listen_host,
        listen_port=listen_port,
        ssl_insecure=ssl_insecure,
    )
    master = DumpMaster(opts, with_termlog=True, with_dumper=False)
    master.addons.add(
        SSEInterceptorAddon(
            relay_host=relay_host,
            relay_port=relay_port,
        )
    )
    logger.info("mitmproxy listening on %s:%d", listen_host, listen_port)
    return master


async def run(args: argparse.Namespace) -> None:
    """Run both relay server and mitmproxy on a shared event loop."""
    mocks_dir = Path(args.mocks_dir)

    runner = await _start_relay(
        host=args.host,
        port=args.relay_port,
        mocks_dir=mocks_dir,
        auto_forward=args.auto_forward,
    )

    master = await _start_mitmproxy(
        listen_host=args.host,
        listen_port=args.proxy_port,
        ssl_insecure=True,
        relay_host="localhost",
        relay_port=args.relay_port,
    )

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, master.shutdown)

    try:
        await master.run()
    finally:
        await runner.cleanup()
        logger.info("Orthrus backend shut down")


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(description="Orthrus Backend — Relay + Proxy")
    parser.add_argument(
        "--relay-port",
        type=int,
        default=29000,
        help="Relay server port (default: 29000)",
    )
    parser.add_argument(
        "--proxy-port",
        type=int,
        default=28080,
        help="mitmproxy port (default: 28080)",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Bind host (default: 0.0.0.0)",
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

    try:
        asyncio.run(run(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
