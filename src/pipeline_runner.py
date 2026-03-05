from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Iterator

from src.models import (
    DelayStep,
    DropRestStep,
    DropStep,
    MockConfig,
    MockStep,
    PassthroughRestStep,
    PassthroughStep,
    PipelineStep,
    SSEEvent,
)
from src.sse_client import stream_upstream_sse
from src.sse_parser import SSEParser

import aiohttp

logger = logging.getLogger(__name__)


async def run_pipeline(
    *,
    mock: MockConfig,
    upstream_events: list[SSEEvent] | None = None,
) -> AsyncIterator[SSEEvent]:
    """
    Execute a MockConfig pipeline and yield SSEEvent objects.

    For ``full_mock`` mode, *upstream_events* is ignored (no real server).
    For ``pipeline`` mode with a live stream, callers should use
    ``run_pipeline_live`` instead.

    This function is primarily used for replaying saved mock files.
    """
    return _run_steps(mock.pipeline, iter(upstream_events or []))


async def _run_steps(
    steps: list[PipelineStep],
    upstream: Iterator[SSEEvent],
) -> AsyncIterator[SSEEvent]:
    """Internal step executor — yields events according to the pipeline."""
    for step in steps:
        if isinstance(step, MockStep):
            yield SSEEvent(event=step.event, data=step.data)

        elif isinstance(step, DelayStep):
            await asyncio.sleep(step.delay_ms / 1000)

        elif isinstance(step, PassthroughStep):
            real = next(upstream, None)
            if real is None:
                logger.warning(
                    "passthrough step expected event '%s' but upstream is exhausted",
                    step.match_event,
                )
                return
            if step.match_event and real.event != step.match_event:
                logger.warning(
                    "passthrough expected '%s' but got '%s' — forwarding anyway",
                    step.match_event,
                    real.event,
                )
            yield real

        elif isinstance(step, DropStep):
            real = next(upstream, None)
            if real is None:
                logger.warning(
                    "drop step expected event '%s' but upstream is exhausted",
                    step.match_event,
                )
                return
            if step.match_event and real.event != step.match_event:
                logger.warning(
                    "drop expected '%s' but got '%s' — dropping anyway",
                    step.match_event,
                    real.event,
                )
            # Discard

        elif isinstance(step, PassthroughRestStep):
            for real in upstream:
                yield real
            return

        elif isinstance(step, DropRestStep):
            # Consume and discard all
            for _ in upstream:
                pass
            return


# ---------------------------------------------------------------------------
# Live pipeline runner (connects to real upstream server)
# ---------------------------------------------------------------------------


async def run_pipeline_live(
    *,
    mock: MockConfig,
    client_session: aiohttp.ClientSession,
    request_info_url: str,
    request_method: str,
    request_headers: dict[str, str],
    request_body: str | None,
) -> AsyncIterator[SSEEvent]:
    """
    Execute a pipeline mock against a live upstream SSE connection.

    Reads all upstream events first (into memory), then runs the pipeline.
    This is simpler and covers all cases; suitable for mocks since the
    pipeline is already defined upfront.
    """
    from src.models import RequestInfo

    upstream_events: list[SSEEvent] = []
    done_event = asyncio.Event()
    error_holder: list[Exception] = []

    async def on_event(event: SSEEvent) -> None:
        upstream_events.append(event)

    async def on_end() -> None:
        done_event.set()

    async def on_error(exc: Exception) -> None:
        error_holder.append(exc)
        done_event.set()

    from src.sse_client import stream_upstream_sse

    await stream_upstream_sse(
        client_session=client_session,
        request=RequestInfo(
            url=request_info_url,
            method=request_method,
            headers=request_headers,
            body=request_body,
        ),
        on_event=on_event,
        on_end=on_end,
        on_error=on_error,
    )

    if error_holder:
        raise error_holder[0]

    return _run_steps(mock.pipeline, iter(upstream_events))
