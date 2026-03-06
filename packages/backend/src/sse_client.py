from __future__ import annotations

import asyncio
from typing import Callable, Coroutine, Any

import aiohttp

from src.models import RequestInfo, SSEEvent
from src.sse_parser import SSEParser


OnEventCallback = Callable[[SSEEvent], Coroutine[Any, Any, None]]
OnEndCallback = Callable[[], Coroutine[Any, Any, None]]
OnErrorCallback = Callable[[Exception], Coroutine[Any, Any, None]]

# Headers that must not be forwarded to the upstream server
_HOP_BY_HOP_HEADERS: frozenset[str] = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        # mitmproxy / relay bookkeeping headers
        "host",
    }
)


def _filter_headers(headers: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in headers.items() if k.lower() not in _HOP_BY_HOP_HEADERS}


async def stream_upstream_sse(
    *,
    client_session: aiohttp.ClientSession,
    request: RequestInfo,
    on_event: OnEventCallback,
    on_end: OnEndCallback,
    on_error: OnErrorCallback,
) -> None:
    """
    Connect to the upstream SSE endpoint described by *request*, parse the
    stream event-by-event, and call the provided callbacks.

    Parameters
    ----------
    client_session:
        A shared ``aiohttp.ClientSession`` (caller manages its lifetime).
    request:
        Original request info (URL, method, headers, body).
    on_event:
        Called for each complete SSEEvent parsed from the stream.
    on_end:
        Called once when the upstream connection closes cleanly.
    on_error:
        Called with the exception when the upstream connection fails.
    """
    parser = SSEParser()
    headers = _filter_headers(request.headers)

    try:
        async with client_session.request(
            method=request.method,
            url=request.url,
            headers=headers,
            data=request.body,
            timeout=aiohttp.ClientTimeout(
                total=None,  # no total timeout — SSE streams can be long
                connect=30,
                sock_read=None,  # no read timeout — events may be held at breakpoint
            ),
        ) as resp:
            resp.raise_for_status()

            async for chunk in resp.content.iter_chunked(4096):
                if not chunk:
                    continue
                events = parser.feed(chunk)
                for event in events:
                    await on_event(event)

            # Flush any remaining partial event
            remaining = parser.flush()
            if remaining is not None:
                await on_event(remaining)

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        await on_error(exc)
        return

    await on_end()
