from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator

from src.models import (
    DelayStep,
    DropRestStep,
    DropStep,
    EventAction,
    HistoryEntry,
    MockConfig,
    MockStep,
    PassthroughRestStep,
    PassthroughStep,
    RequestInfo,
    SessionInfo,
    SessionStatus,
    SSEEvent,
)

logger = logging.getLogger(__name__)

_EOF = SSEEvent(event="__eof__", data="")


class Session:
    """
    Holds full state for one intercepted SSE request.

    Lifecycle
    ---------
    1. Relay handler creates the session and starts streaming upstream
       events into ``enqueue_upstream_event()``.
    2. The WebSocket handler (or auto-forward logic) reads pending events
       and calls approve/drop/inject methods.
    3. The relay handler reads ``approved_events()`` and writes each event
       to the downstream client SSE stream.
    """

    def __init__(self, request: RequestInfo) -> None:
        self.id: str = uuid.uuid4().hex[:12]
        self.request: RequestInfo = request
        self.status: SessionStatus = SessionStatus.ACTIVE
        self.created_at: float = time.time()

        self._pending: asyncio.Queue[SSEEvent] = asyncio.Queue()
        self._approved: asyncio.Queue[SSEEvent | None] = asyncio.Queue()
        self._history: list[HistoryEntry] = []
        self._auto_forward: bool = False

    # ------------------------------------------------------------------
    # Upstream side
    # ------------------------------------------------------------------

    async def enqueue_upstream_event(self, event: SSEEvent) -> None:
        if self._auto_forward:
            await self._record_and_approve(event, EventAction.FORWARD, event)
        else:
            await self._pending.put(event)

    async def signal_upstream_done(self) -> None:
        """Called when the upstream SSE stream closes."""
        await self._pending.put(_EOF)

    # ------------------------------------------------------------------
    # QA control side (called by WebSocket handler)
    # ------------------------------------------------------------------

    async def get_next_pending(self) -> SSEEvent | None:
        """Return next pending event for QA; None means stream is done."""
        event = await self._pending.get()
        if event.event == "__eof__":
            return None
        return event

    async def forward(self, index: int) -> None:
        event = self._get_original(index)
        await self._record_and_approve(event, EventAction.FORWARD, event)

    async def edit_and_forward(self, index: int, modified: SSEEvent) -> None:
        original = self._get_original(index)
        await self._record_and_approve(original, EventAction.EDIT, modified)

    async def drop(self, index: int) -> None:
        event = self._get_original(index)
        await self._record_and_approve(event, EventAction.DROP, None)

    async def inject(self, synthetic: SSEEvent) -> None:
        entry = HistoryEntry(
            index=len(self._history),
            timestamp=time.time(),
            original_event=None,
            action=EventAction.INJECT,
            sent_event=synthetic,
            delay_ms=0,
        )
        self._history.append(entry)
        await self._approved.put(synthetic)

    async def delay_then_forward(self, index: int, delay_ms: int) -> None:
        await asyncio.sleep(delay_ms / 1000)
        event = self._get_original(index)
        entry = HistoryEntry(
            index=len(self._history),
            timestamp=time.time(),
            original_event=event,
            action=EventAction.DELAY,
            sent_event=event,
            delay_ms=delay_ms,
        )
        self._history.append(entry)
        await self._approved.put(event)

    async def forward_all(self) -> None:
        self._auto_forward = True
        while not self._pending.empty():
            try:
                event = self._pending.get_nowait()
                if event.event == "__eof__":
                    await self.close_stream()
                    return
                await self._record_and_approve(event, EventAction.FORWARD, event)
            except asyncio.QueueEmpty:
                break

    async def close_stream(self) -> None:
        self.status = SessionStatus.COMPLETED
        await self._approved.put(None)

    # ------------------------------------------------------------------
    # Client side (relay handler)
    # ------------------------------------------------------------------

    async def approved_events(self) -> AsyncIterator[SSEEvent]:
        while True:
            event = await self._approved.get()
            if event is None:
                return
            yield event

    # ------------------------------------------------------------------
    # Auto-forward toggle
    # ------------------------------------------------------------------

    def enable_auto_forward(self) -> None:
        self._auto_forward = True

    def disable_auto_forward(self) -> None:
        self._auto_forward = False

    @property
    def auto_forward(self) -> bool:
        return self._auto_forward

    # ------------------------------------------------------------------
    # Serialization
    # ------------------------------------------------------------------

    def to_session_info(self) -> SessionInfo:
        return SessionInfo(
            id=self.id,
            request=self.request,
            status=self.status,
            created_at=self.created_at,
            event_count=len(self._history),
            pending_count=self._pending.qsize(),
        )

    def to_mock_config(self, name: str) -> MockConfig:
        """Convert session history to a replayable MockConfig."""
        import re as _re
        from urllib.parse import urlparse

        from src.models import MatchConfig

        parsed = urlparse(self.request.url)
        url_pattern = _re.escape(parsed.path)

        steps = []
        for entry in self._history:
            if entry.action == EventAction.FORWARD:
                steps.append(
                    PassthroughStep(
                        action="passthrough",
                        match_event=entry.original_event.event
                        if entry.original_event
                        else None,
                    )
                )
            elif entry.action == EventAction.DELAY:
                steps.append(DelayStep(action="delay", delay_ms=max(entry.delay_ms, 1)))
                steps.append(
                    PassthroughStep(
                        action="passthrough",
                        match_event=entry.original_event.event
                        if entry.original_event
                        else None,
                    )
                )
            elif entry.action == EventAction.EDIT:
                if entry.sent_event:
                    steps.append(
                        MockStep(
                            action="mock",
                            event=entry.sent_event.event,
                            data=entry.sent_event.data,
                            comment="Edited from original",
                        )
                    )
                if entry.original_event:
                    steps.append(
                        DropStep(
                            action="drop",
                            match_event=entry.original_event.event,
                        )
                    )
            elif entry.action == EventAction.DROP:
                steps.append(
                    DropStep(
                        action="drop",
                        match_event=entry.original_event.event
                        if entry.original_event
                        else None,
                    )
                )
            elif entry.action == EventAction.INJECT:
                if entry.sent_event:
                    steps.append(
                        MockStep(
                            action="mock",
                            event=entry.sent_event.event,
                            data=entry.sent_event.data,
                            comment="Injected event",
                        )
                    )

        return MockConfig(
            name=name,
            enabled=False,
            match=MatchConfig(url_pattern=url_pattern),
            mode="pipeline",
            pipeline=steps,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_original(self, index: int) -> SSEEvent:
        for entry in self._history:
            if entry.index == index and entry.original_event is not None:
                return entry.original_event
        raise KeyError(f"No original event found for index {index}")

    async def _record_and_approve(
        self,
        original: SSEEvent | None,
        action: EventAction,
        sent: SSEEvent | None,
        delay_ms: int = 0,
    ) -> None:
        entry = HistoryEntry(
            index=len(self._history),
            timestamp=time.time(),
            original_event=original,
            action=action,
            sent_event=sent,
            delay_ms=delay_ms,
        )
        self._history.append(entry)
        if sent is not None:
            await self._approved.put(sent)
