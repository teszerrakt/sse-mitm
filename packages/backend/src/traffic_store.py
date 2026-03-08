from __future__ import annotations

import asyncio
import logging
import time
import uuid

from src.models import (
    HttpRequestData,
    HttpResponseData,
    RequestModification,
    ResponseModification,
    TrafficEntry,
    TrafficStatus,
)

logger = logging.getLogger(__name__)


class InterceptDecision:
    """Async wait-point for an intercepted flow waiting on user action."""

    def __init__(self) -> None:
        self._event: asyncio.Event = asyncio.Event()
        self._action: str = "resume"  # "resume", "abort"
        self._request_mods: RequestModification | None = None
        self._response_mods: ResponseModification | None = None

    def resume_request(self, mods: RequestModification | None = None) -> None:
        self._action = "resume"
        self._request_mods = mods
        self._event.set()

    def resume_response(self, mods: ResponseModification | None = None) -> None:
        self._action = "resume"
        self._response_mods = mods
        self._event.set()

    def abort(self) -> None:
        self._action = "abort"
        self._event.set()

    async def wait(self, timeout: float = 300.0) -> str:
        """Wait for user decision. Returns 'resume' or 'abort'."""
        try:
            await asyncio.wait_for(self._event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            logger.warning("Intercept decision timed out — auto-resuming")
            self._action = "resume"
        return self._action

    @property
    def action(self) -> str:
        return self._action

    @property
    def request_modifications(self) -> RequestModification | None:
        return self._request_mods

    @property
    def response_modifications(self) -> ResponseModification | None:
        return self._response_mods


class TrafficStore:
    """
    Registry of all HTTP traffic entries (both observed and intercepted).

    Thread-safety: all mutations happen inside the asyncio event loop,
    so no explicit locking is needed.
    """

    def __init__(self) -> None:
        self._entries: dict[str, TrafficEntry] = {}
        self._decisions: dict[str, InterceptDecision] = {}
        # Ordering: keep insertion order for listing
        self._order: list[str] = []

    # ------------------------------------------------------------------
    # Traffic lifecycle
    # ------------------------------------------------------------------

    def create_entry(
        self,
        request: HttpRequestData,
        *,
        is_intercepted: bool = False,
    ) -> TrafficEntry:
        """Create a new traffic entry for an observed or intercepted request."""
        entry_id = uuid.uuid4().hex[:12]
        status = (
            TrafficStatus.PENDING_REQUEST if is_intercepted else TrafficStatus.IN_FLIGHT
        )
        entry = TrafficEntry(
            id=entry_id,
            status=status,
            is_intercepted=is_intercepted,
            request=request,
            response=None,
            duration_ms=None,
            created_at=time.time(),
        )
        self._entries[entry_id] = entry
        self._order.append(entry_id)
        return entry

    def update_response(
        self,
        entry_id: str,
        response: HttpResponseData,
        *,
        is_intercepted: bool = False,
    ) -> TrafficEntry | None:
        """Update a traffic entry with its response data."""
        entry = self._entries.get(entry_id)
        if entry is None:
            return None

        duration_ms = None
        if response.timestamp_end and entry.request.timestamp:
            duration_ms = (response.timestamp_end - entry.request.timestamp) * 1000

        status = (
            TrafficStatus.PENDING_RESPONSE
            if is_intercepted
            else TrafficStatus.COMPLETED
        )
        updated = TrafficEntry(
            id=entry.id,
            status=status,
            is_intercepted=entry.is_intercepted,
            request=entry.request,
            response=response,
            duration_ms=duration_ms,
            created_at=entry.created_at,
        )
        self._entries[entry_id] = updated
        return updated

    def mark_completed(self, entry_id: str) -> TrafficEntry | None:
        """Mark an entry as completed (after user resumes intercepted response)."""
        entry = self._entries.get(entry_id)
        if entry is None:
            return None
        updated = TrafficEntry(
            id=entry.id,
            status=TrafficStatus.COMPLETED,
            is_intercepted=entry.is_intercepted,
            request=entry.request,
            response=entry.response,
            duration_ms=entry.duration_ms,
            created_at=entry.created_at,
        )
        self._entries[entry_id] = updated
        return updated

    def mark_in_flight(self, entry_id: str) -> TrafficEntry | None:
        """Mark an intercepted request as in-flight (user resumed it)."""
        entry = self._entries.get(entry_id)
        if entry is None:
            return None
        updated = TrafficEntry(
            id=entry.id,
            status=TrafficStatus.IN_FLIGHT,
            is_intercepted=entry.is_intercepted,
            request=entry.request,
            response=entry.response,
            duration_ms=entry.duration_ms,
            created_at=entry.created_at,
        )
        self._entries[entry_id] = updated
        return updated

    def mark_error(self, entry_id: str) -> TrafficEntry | None:
        """Mark an entry as errored."""
        entry = self._entries.get(entry_id)
        if entry is None:
            return None
        updated = TrafficEntry(
            id=entry.id,
            status=TrafficStatus.ERROR,
            is_intercepted=entry.is_intercepted,
            request=entry.request,
            response=entry.response,
            duration_ms=entry.duration_ms,
            created_at=entry.created_at,
        )
        self._entries[entry_id] = updated
        return updated

    def mark_aborted(self, entry_id: str) -> TrafficEntry | None:
        """Mark an entry as aborted by the user."""
        entry = self._entries.get(entry_id)
        if entry is None:
            return None
        updated = TrafficEntry(
            id=entry.id,
            status=TrafficStatus.ABORTED,
            is_intercepted=entry.is_intercepted,
            request=entry.request,
            response=entry.response,
            duration_ms=entry.duration_ms,
            created_at=entry.created_at,
        )
        self._entries[entry_id] = updated
        return updated

    def get(self, entry_id: str) -> TrafficEntry | None:
        return self._entries.get(entry_id)

    def get_or_raise(self, entry_id: str) -> TrafficEntry:
        entry = self._entries.get(entry_id)
        if entry is None:
            raise KeyError(f"Traffic entry '{entry_id}' not found")
        return entry

    def all_entries(self) -> list[TrafficEntry]:
        """Return all entries in insertion order."""
        return [self._entries[eid] for eid in self._order if eid in self._entries]

    def clear_all(self) -> None:
        """Remove all traffic entries and pending decisions."""
        self._entries.clear()
        self._order.clear()
        # Abort any pending intercept decisions
        for decision in self._decisions.values():
            decision.abort()
        self._decisions.clear()

    # ------------------------------------------------------------------
    # Intercept decision management
    # ------------------------------------------------------------------

    def create_decision(self, entry_id: str) -> InterceptDecision:
        """Create an async decision point for an intercepted flow."""
        decision = InterceptDecision()
        self._decisions[entry_id] = decision
        return decision

    def get_decision(self, entry_id: str) -> InterceptDecision | None:
        return self._decisions.get(entry_id)

    def remove_decision(self, entry_id: str) -> None:
        self._decisions.pop(entry_id, None)

    def __len__(self) -> int:
        return len(self._entries)
