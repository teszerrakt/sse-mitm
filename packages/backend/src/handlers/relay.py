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
from src.cookie_jar import CookieJar

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
        "x-original-client-ip",
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


def _count_cookies(cookie_header: str) -> int:
    """Count key=value pairs in a Cookie header string."""
    return len([c for c in cookie_header.split(";") if "=" in c])


def _enrich_cookies(req_info: RequestInfo, cookie_jar: CookieJar | None) -> RequestInfo:
    """Replace a thin Cookie header with a richer one from the jar.

    If the current request has ≤2 cookies and the jar has a richer
    cookie string for the same domain, swap it in.  Returns a new
    ``RequestInfo`` (frozen model) with updated headers.
    """
    if cookie_jar is None:
        return req_info

    jar_cookies = cookie_jar.get(req_info.url)
    if jar_cookies is None:
        return req_info

    current_cookie = req_info.headers.get("cookie", "")
    if _count_cookies(current_cookie) > 2:
        # Already rich enough — don't overwrite
        return req_info

    logger.info(
        "Borrowing cookies for %s (had %d, jar has %d)",
        req_info.url,
        _count_cookies(current_cookie),
        _count_cookies(jar_cookies),
    )
    enriched_headers = {**req_info.headers, "cookie": jar_cookies}
    return RequestInfo(
        url=req_info.url,
        method=req_info.method,
        headers=enriched_headers,
        body=req_info.body,
        client_ip=req_info.client_ip,
        user_agent=req_info.user_agent,
    )


def _build_request_info(request: web.Request) -> RequestInfo:
    target_url = request.query.get("target", "")
    original_method = request.query.get("method", request.method)
    client_ip = request.headers.get("x-original-client-ip") or request.remote
    user_agent = request.headers.get("user-agent")
    headers = {
        k.lower(): v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return RequestInfo(
        url=target_url,
        method=original_method,
        headers=headers,
        body=None,  # filled after reading body
        client_ip=client_ip,
        user_agent=user_agent,
    )


async def relay_handler(request: web.Request) -> web.StreamResponse:
    """
    POST /relay?target=<original_url>

    1. Create a Session.
    2. Notify all WebSocket clients of the new session.
    3. Start background task: stream upstream SSE → session pending queue.
    4. Start background task: pump pending events through User controls.
    5. Stream approved events back to the client as SSE.

    When the addon provides a ``session_id`` query parameter, the session
    was already created by ``/ingest/start`` and upstream chunks are fed
    by the addon via ``/ingest/chunk``.  In that case we skip step 3
    (no ``_read_upstream`` task) because the addon handles upstream fetching.
    """
    session_manager: SessionManager = request.app["session_manager"]
    ws_broadcaster = request.app["ws_broadcaster"]
    http_client: aiohttp.ClientSession = request.app["http_client"]
    auto_forward_default: bool = request.app.get("auto_forward_default", False)

    # Check if this is an addon-fed ingest session
    session_id = request.query.get("session_id")
    ingest_mode = False

    if session_id:
        # Look up pre-created session from /ingest/start
        session = session_manager.get(session_id)
        if session is None:
            raise web.HTTPNotFound(
                reason=f"Session {session_id} not found (was /ingest/start called?)"
            )
        ingest_mode = True
        logger.info(
            "Relay handler attached to ingest session %s → %s",
            session.id,
            session.request.url,
        )
    else:
        # Original behavior: create session and fetch upstream ourselves
        body_bytes = await request.read()
        body = body_bytes.decode("utf-8") if body_bytes else None

        req_info = _build_request_info(request)
        req_info = RequestInfo(
            url=req_info.url,
            method=req_info.method,
            headers=req_info.headers,
            body=body,
            client_ip=req_info.client_ip,
            user_agent=req_info.user_agent,
        )

        if not req_info.url:
            raise web.HTTPBadRequest(reason="Missing 'target' query parameter")

        # Borrow-cookie: enrich thin cookies from the jar (per-SSE-rule flag)
        borrow_cookies = request.query.get("borrow_cookies", "1") == "1"
        if borrow_cookies:
            req_info = _enrich_cookies(req_info, request.app.get("cookie_jar"))

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

    # Background: read upstream SSE (only when NOT in ingest mode)
    upstream_task: asyncio.Task[None] | None = None
    if not ingest_mode:
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
        if upstream_task is not None:
            upstream_task.cancel()
        await session.close_stream()
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
    from src.models import EventMsg, SessionUpdatedMsg
    from src.sse_client import stream_upstream_sse

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
        error_message = str(exc)
        await ws_broadcaster(
            ErrorMsg(
                type="error",
                session_id=session.id,
                message=error_message,
            ).model_dump_json()
        )
        await session.fail_stream(error_message)

    await stream_upstream_sse(
        client_session=http_client,
        request=req_info,
        on_event=on_event,
        on_end=on_end,
        on_error=on_error,
    )
