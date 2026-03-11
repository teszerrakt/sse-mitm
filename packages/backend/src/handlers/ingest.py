from __future__ import annotations

import logging

from aiohttp import web

from src.models import (
    ErrorMsg,
    EventMsg,
    NewSessionMsg,
    RequestInfo,
    SessionUpdatedMsg,
)
from src.session import Session
from src.session_manager import SessionManager

logger = logging.getLogger(__name__)


async def ingest_start_handler(request: web.Request) -> web.Response:
    """POST /ingest/start

    Called by the mitmproxy addon BEFORE rewriting the browser request.
    Creates a Session and returns its ``session_id`` so the addon can:
    1. Include ``session_id`` in the rewritten ``/relay`` URL.
    2. POST upstream chunks to ``/ingest/chunk?session_id=<id>``.

    The relay handler will later look up this pre-created session instead
    of creating its own.

    Request body (JSON)::

        {
            "url": "<original upstream URL>",
            "method": "GET",
            "headers": { ... },
            "body": "<optional request body>",
            "client_ip": "<optional>",
            "user_agent": "<optional>"
        }
    """
    session_manager: SessionManager = request.app["session_manager"]
    ws_broadcaster = request.app["ws_broadcaster"]
    auto_forward_default: bool = request.app.get("auto_forward_default", False)

    payload = await request.json()

    req_info = RequestInfo(
        url=payload.get("url", ""),
        method=payload.get("method", "GET"),
        headers=payload.get("headers", {}),
        body=payload.get("body"),
        client_ip=payload.get("client_ip"),
        user_agent=payload.get("user_agent"),
    )

    if not req_info.url:
        raise web.HTTPBadRequest(reason="Missing 'url' in request body")

    session = Session(req_info)
    if auto_forward_default:
        session.enable_auto_forward()

    session_manager.create(session)
    logger.info("Ingest session %s created for %s", session.id, req_info.url)

    # Notify UI of the new session
    await ws_broadcaster(
        NewSessionMsg(
            type="new_session", session=session.to_session_info()
        ).model_dump_json()
    )

    return web.json_response({"session_id": session.id})


async def ingest_chunk_handler(request: web.Request) -> web.Response:
    """POST /ingest/chunk?session_id=<id>

    Called by the mitmproxy addon's background thread as upstream SSE
    bytes arrive.  The raw bytes are fed into the session's SSE parser;
    any complete events are enqueued and broadcast to WebSocket clients.

    Request body: raw bytes (``application/octet-stream``).
    """
    session_manager: SessionManager = request.app["session_manager"]
    ws_broadcaster = request.app["ws_broadcaster"]

    session_id = request.query.get("session_id", "")
    if not session_id:
        raise web.HTTPBadRequest(reason="Missing 'session_id' query parameter")

    session = session_manager.get(session_id)
    if session is None:
        raise web.HTTPNotFound(reason=f"Session {session_id} not found")

    chunk = await request.read()
    if not chunk:
        return web.json_response({"events": 0})

    events = session.feed_chunk(chunk)

    for event in events:
        index = await session.enqueue_upstream_event(event)
        await ws_broadcaster(
            EventMsg(
                type="event",
                session_id=session.id,
                index=index,
                event=event,
            ).model_dump_json()
        )

    if events:
        await ws_broadcaster(
            SessionUpdatedMsg(
                type="session_updated",
                session=session.to_session_info(),
            ).model_dump_json()
        )

    return web.json_response({"events": len(events)})


async def ingest_end_handler(request: web.Request) -> web.Response:
    """POST /ingest/end?session_id=<id>

    Called by the mitmproxy addon when the upstream SSE stream closes
    (either normally or due to an error).

    Optional JSON body::

        {"error": "error message string"}

    If ``error`` is present, the session is failed with that message.
    Otherwise the session is signalled as upstream-done (normal close).
    """
    session_manager: SessionManager = request.app["session_manager"]
    ws_broadcaster = request.app["ws_broadcaster"]

    session_id = request.query.get("session_id", "")
    if not session_id:
        raise web.HTTPBadRequest(reason="Missing 'session_id' query parameter")

    session = session_manager.get(session_id)
    if session is None:
        raise web.HTTPNotFound(reason=f"Session {session_id} not found")

    # Flush any partial event remaining in the parser buffer
    final_event = session.flush_ingest_parser()
    if final_event is not None:
        index = await session.enqueue_upstream_event(final_event)
        await ws_broadcaster(
            EventMsg(
                type="event",
                session_id=session.id,
                index=index,
                event=final_event,
            ).model_dump_json()
        )

    # Check for error
    error_message: str | None = None
    if request.content_type == "application/json":
        try:
            payload = await request.json()
            error_message = payload.get("error")
        except Exception:
            pass

    if error_message:
        logger.error("Ingest session %s upstream error: %s", session.id, error_message)
        await ws_broadcaster(
            ErrorMsg(
                type="error",
                session_id=session.id,
                message=error_message,
            ).model_dump_json()
        )
        await session.fail_stream(error_message)
    else:
        logger.info("Ingest session %s upstream done", session.id)
        await session.signal_upstream_done()

    await ws_broadcaster(
        SessionUpdatedMsg(
            type="session_updated",
            session=session.to_session_info(),
        ).model_dump_json()
    )

    return web.json_response({"ok": True})


async def ingest_drain_handler(request: web.Request) -> web.Response:
    """POST /ingest/drain?session_id=<id>

    Called by the mitmproxy addon's ``response.stream`` tap function after
    it has posted a chunk via ``/ingest/chunk``.  This endpoint blocks
    until at least one approved SSE event is available (i.e. the breakpoint
    queue has been drained by auto-forward or user action), then returns
    the approved events serialized as raw SSE wire-format bytes.

    The tap function returns these bytes to mitmproxy which forwards
    them to the browser — this is how breakpoints control what the
    browser actually receives.

    Query params:
        session_id: Session identifier.
        timeout: Optional float seconds to wait (default 30).

    Response body: raw bytes (``application/octet-stream``).
        - Non-empty bytes → approved SSE event data for the browser.
        - Empty 200 → no events approved within timeout (try again on next chunk).
        - 204 No Content → stream has ended (sentinel received).
    """
    session_manager: SessionManager = request.app["session_manager"]

    session_id = request.query.get("session_id", "")
    if not session_id:
        raise web.HTTPBadRequest(reason="Missing 'session_id' query parameter")

    session = session_manager.get(session_id)
    if session is None:
        raise web.HTTPNotFound(reason=f"Session {session_id} not found")

    timeout = float(request.query.get("timeout", "30"))

    result = await session.drain_approved_bytes(timeout=timeout)

    if result is None:
        # Stream ended (sentinel received)
        return web.Response(status=204)

    return web.Response(
        body=result,
        content_type="application/octet-stream",
    )
