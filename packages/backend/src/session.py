from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections.abc import AsyncIterator

from src.models import (
    DelayStep,
    DropStep,
    EventAction,
    HistoryEntry,
    MockConfig,
    MockStep,
    PassthroughStep,
    PipelineStep,
    RequestInfo,
    SessionInfo,
    SessionStatus,
    SSEEvent,
)

logger = logging.getLogger(__name__)


class Session:
    """
    Holds full state for one intercepted SSE request.

    Lifecycle
    ---------
    1. Relay handler creates the session and starts streaming upstream
       events into ``enqueue_upstream_event()``.
    2. The WebSocket handler (or auto-forward logic) reads pending events
       and calls approve/drop/inject methods by index.
    3. The relay handler reads ``approved_events()`` and writes each event
       to the downstream client SSE stream.
    """

    def __init__(self, request: RequestInfo) -> None:
        self.id: str = uuid.uuid4().hex[:12]
        self.request: RequestInfo = request
        self.status: SessionStatus = SessionStatus.ACTIVE
        self.created_at: float = time.time()

        # Pending events keyed by their assigned index — supports random access
        self._pending_events: dict[int, SSEEvent] = {}
        self._next_index: int = 0

        self._approved: asyncio.Queue[SSEEvent | None] = asyncio.Queue()
        self._history: list[HistoryEntry] = []
        self._auto_forward: bool = False

        # Set when upstream signals EOF; we close the stream once pending is empty
        self._upstream_done: bool = False

    # ------------------------------------------------------------------
    # Upstream side
    # ------------------------------------------------------------------

    async def enqueue_upstream_event(self, event: SSEEvent) -> int:
        """
        Accept an upstream event, assign it the next index, and either
        auto-forward it immediately or hold it for User.

        Returns the assigned index so the caller can broadcast it to the UI.
        """
        index = self._next_index
        self._next_index += 1

        if self._auto_forward:
            entry = HistoryEntry(
                index=len(self._history),
                timestamp=time.time(),
                original_event=event,
                action=EventAction.FORWARD,
                sent_event=event,
                delay_ms=0,
            )
            self._history.append(entry)
            await self._approved.put(event)
        else:
            self._pending_events[index] = event

        return index

    async def signal_upstream_done(self) -> None:
        """Called when the upstream SSE stream closes."""
        self._upstream_done = True
        # If there are no pending events waiting for User action, close immediately
        if not self._pending_events:
            await self.close_stream()

    # ------------------------------------------------------------------
    # User control side (called by WebSocket handler)
    # ------------------------------------------------------------------

    async def forward(self, index: int) -> None:
        event = self._get_pending(index)
        await self._record_and_approve(index, event, EventAction.FORWARD, event)

    async def edit_and_forward(self, index: int, modified: SSEEvent) -> None:
        original = self._get_pending(index)
        await self._record_and_approve(index, original, EventAction.EDIT, modified)

    async def drop(self, index: int) -> None:
        event = self._get_pending(index)
        await self._record_and_approve(index, event, EventAction.DROP, None)

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
        event = self._get_pending(index)
        entry = HistoryEntry(
            index=len(self._history),
            timestamp=time.time(),
            original_event=event,
            action=EventAction.DELAY,
            sent_event=event,
            delay_ms=delay_ms,
        )
        self._history.append(entry)
        self._pending_events.pop(index, None)
        await self._approved.put(event)
        await self._maybe_close_after_last_pending()

    async def forward_all(self) -> None:
        self._auto_forward = True
        # Drain any currently held pending events in index order
        for index in sorted(self._pending_events.keys()):
            event = self._pending_events.pop(index)
            entry = HistoryEntry(
                index=len(self._history),
                timestamp=time.time(),
                original_event=event,
                action=EventAction.FORWARD,
                sent_event=event,
                delay_ms=0,
            )
            self._history.append(entry)
            await self._approved.put(event)
        await self._maybe_close_after_last_pending()

    async def close_stream(self) -> None:
        if self.status == SessionStatus.COMPLETED:
            return
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
            client_ip=self.request.client_ip,
            user_agent=self.request.user_agent,
            status=self.status,
            created_at=self.created_at,
            event_count=len(self._history),
            pending_count=len(self._pending_events),
        )

    def to_mock_config(self, name: str) -> MockConfig:
        """Convert session history to a replayable MockConfig."""
        import re as _re
        from urllib.parse import urlparse

        from src.models import MatchConfig

        parsed = urlparse(self.request.url)
        url_pattern = _re.escape(parsed.path)

        steps: list[PipelineStep] = []
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

    def _get_pending(self, index: int) -> SSEEvent:
        """Return the pending event for the given index, or raise KeyError."""
        event = self._pending_events.get(index)
        if event is None:
            raise KeyError(f"No pending event at index {index}")
        return event

    async def _record_and_approve(
        self,
        index: int,
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
        self._pending_events.pop(index, None)
        if sent is not None:
            await self._approved.put(sent)
        await self._maybe_close_after_last_pending()

    async def _maybe_close_after_last_pending(self) -> None:
        """If upstream is done and no events remain pending, close the stream."""
        if self._upstream_done and not self._pending_events:
            await self.close_stream()
