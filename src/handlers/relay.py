from __future__ import annotations

import asyncio
import logging

import aiohttp
from aiohttp import web

from src.models import (
    ErrorMsg,
    NewSessionMsg,
    RequestInfo,
    SSEEvent,
    StreamEndMsg,
)
from src.session import Session
from src.session_manager import SessionManager

logger = logging.getLogger(__name__)

# SSE wire format helpers
_SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}

# SSE comment heartbeat — keeps Postman/curl/browser connections alive while
# events are held at a breakpoint. Invisible to SSE consumers.
_HEARTBEAT_BYTES = b": keep-alive\n\n"
_HEARTBEAT_INTERVAL = 5  # seconds — short enough to beat Postman's read timeout

# Headers that must not be forwarded upstream
_HOP_BY_HOP = frozenset(
    {
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "host",
    }
)


def _format_sse(event: SSEEvent) -> bytes:
    parts: list[str] = []
    if event.id is not None:
        parts.append(f"id: {event.id}")
    parts.append(f"event: {event.event}")
    parts.append(f"data: {event.data}")
    parts.append("\n")
    return "\n".join(parts).encode("utf-8")


def _build_request_info(request: web.Request) -> RequestInfo:
    target_url = request.query.get("target", "")
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    return RequestInfo(
        url=target_url,
        method=request.method,
        headers=headers,
        body=None,  # filled after reading body
    )


async def relay_handler(request: web.Request) -> web.StreamResponse:
    """
    POST /relay?target=<original_url>

    1. Create a Session.
    2. Notify all WebSocket clients of the new session.
    3. Start background task: stream upstream SSE → session pending queue.
    4. Start background task: pump pending events through QA controls.
    5. Stream approved events back to the client as SSE.
    """
    session_manager: SessionManager = request.app["session_manager"]
    ws_broadcaster = request.app["ws_broadcaster"]
    http_client: aiohttp.ClientSession = request.app["http_client"]
    auto_forward_default: bool = request.app.get("auto_forward_default", False)

    # Read original request body
    body_bytes = await request.read()
    body = body_bytes.decode("utf-8") if body_bytes else None

    req_info = _build_request_info(request)
    req_info = RequestInfo(
        url=req_info.url,
        method=req_info.method,
        headers=req_info.headers,
        body=body,
    )

    if not req_info.url:
        raise web.HTTPBadRequest(reason="Missing 'target' query parameter")

    session = Session(req_info)
    if auto_forward_default:
        session.enable_auto_forward()

    session_manager.create(session)
    logger.info("New session %s → %s", session.id, req_info.url)

    # Notify UI
    await ws_broadcaster(
        NewSessionMsg(
            type="new_session", session=session.to_session_info()
        ).model_dump_json()
    )

    # Background: read upstream SSE
    upstream_task = asyncio.create_task(
        _read_upstream(session, http_client, req_info, ws_broadcaster)
    )

    # Prepare streaming response to client
    response = web.StreamResponse(status=200, headers=_SSE_HEADERS)
    await response.prepare(request)
    # Immediately flush a body byte so mitmproxy/Postman know the stream is live
    # and don't close the connection waiting for the first real event
    await response.write(b": connected\n\n")

    async def _heartbeat() -> None:
        """Periodically write SSE comment lines so the client never times out."""
        try:
            while True:
                await asyncio.sleep(_HEARTBEAT_INTERVAL)
                await response.write(_HEARTBEAT_BYTES)
        except (asyncio.CancelledError, ConnectionResetError):
            pass

    heartbeat_task = asyncio.create_task(_heartbeat())

    try:
        async for event in session.approved_events():
            await response.write(_format_sse(event))
    except ConnectionResetError:
        logger.info("Session %s: client disconnected", session.id)
    finally:
        heartbeat_task.cancel()
        upstream_task.cancel()
        await session.close_stream()
        session.status.__class__  # noqa: keep alive
        await ws_broadcaster(
            StreamEndMsg(type="stream_end", session_id=session.id).model_dump_json()
        )

    return response


async def _read_upstream(
    session: Session,
    http_client: aiohttp.ClientSession,
    req_info: RequestInfo,
    ws_broadcaster,
) -> None:
    from src.sse_client import stream_upstream_sse
    from src.models import EventMsg, SessionUpdatedMsg

    async def on_event(event: SSEEvent) -> None:
        index = await session.enqueue_upstream_event(event)
        await ws_broadcaster(
            EventMsg(
                type="event",
                session_id=session.id,
                index=index,
                event=event,
            ).model_dump_json()
        )
        await ws_broadcaster(
            SessionUpdatedMsg(
                type="session_updated",
                session=session.to_session_info(),
            ).model_dump_json()
        )

    async def on_end() -> None:
        await session.signal_upstream_done()

    async def on_error(exc: Exception) -> None:
        logger.error("Session %s upstream error: %s", session.id, exc)
        await session.signal_upstream_done()
        await ws_broadcaster(
            ErrorMsg(
                type="error",
                session_id=session.id,
                message=str(exc),
            ).model_dump_json()
        )
        await session.close_stream()

    await stream_upstream_sse(
        client_session=http_client,
        request=req_info,
        on_event=on_event,
        on_end=on_end,
        on_error=on_error,
    )
