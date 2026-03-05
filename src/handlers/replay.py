from __future__ import annotations

import logging

import aiohttp
from aiohttp import web

from src.mock_loader import MockLoader
from src.models import RequestInfo, SSEEvent

logger = logging.getLogger(__name__)

_SSE_HEADERS = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


def _format_sse(event: SSEEvent) -> bytes:
    parts: list[str] = []
    if event.id is not None:
        parts.append(f"id: {event.id}")
    parts.append(f"event: {event.event}")
    parts.append(f"data: {event.data}")
    parts.append("\n")
    return "\n".join(parts).encode("utf-8")


async def replay_handler(request: web.Request) -> web.StreamResponse:
    """
    POST /replay

    Replay a saved mock pipeline without a live server. The active mock
    from the mocks/ directory is used (must have enabled: true).

    If the mock mode is 'pipeline', the request body is forwarded upstream
    and events are processed through the pipeline steps. For 'full_mock' mode,
    no upstream connection is made.
    """
    mock_loader: MockLoader = request.app["mock_loader"]
    http_client: aiohttp.ClientSession = request.app["http_client"]

    mock = mock_loader.get_active()
    if mock is None:
        raise web.HTTPNotFound(
            reason="No active mock found. Set enabled: true in a mock file."
        )

    body_bytes = await request.read()
    body = body_bytes.decode("utf-8") if body_bytes else None

    response = web.StreamResponse(status=200, headers=_SSE_HEADERS)
    await response.prepare(request)

    if mock.mode == "full_mock":
        from src.pipeline_runner import _run_steps

        async for event in _run_steps(mock.pipeline, iter([])):
            await response.write(_format_sse(event))
    else:
        # Pipeline mode: connect to upstream and run pipeline
        target_url = request.query.get("target", "")
        if not target_url:
            raise web.HTTPBadRequest(
                reason="Missing 'target' query parameter for pipeline mode"
            )

        headers = {
            k: v
            for k, v in request.headers.items()
            if k.lower() not in {"host", "connection", "transfer-encoding"}
        }
        req_info = RequestInfo(
            url=target_url,
            method=request.method,
            headers=headers,
            body=body,
        )

        upstream_events: list[SSEEvent] = []
        done = False

        from src.sse_client import stream_upstream_sse

        async def on_event(event: SSEEvent) -> None:
            upstream_events.append(event)

        async def on_end() -> None:
            nonlocal done
            done = True

        async def on_error(exc: Exception) -> None:
            nonlocal done
            logger.error("Replay upstream error: %s", exc)
            done = True

        await stream_upstream_sse(
            client_session=http_client,
            request=req_info,
            on_event=on_event,
            on_end=on_end,
            on_error=on_error,
        )

        from src.pipeline_runner import _run_steps

        async for event in _run_steps(mock.pipeline, iter(upstream_events)):
            await response.write(_format_sse(event))

    return response
