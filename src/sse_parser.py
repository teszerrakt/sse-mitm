from __future__ import annotations

import re

from src.models import SSEEvent

_FIELD_RE = re.compile(r"^([^:]*):?(.*)")


class SSEParser:
    """
    Stateful SSE parser.

    Feed raw bytes from the upstream response; get back a list of fully
    parsed ``SSEEvent`` objects.  Handles events split across multiple
    network chunks.
    """

    def __init__(self) -> None:
        self._buf: str = ""
        self._event: str = "message"
        self._data_lines: list[str] = []
        self._id: str | None = None
        self._retry: int | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def feed(self, chunk: bytes) -> list[SSEEvent]:
        """Append *chunk* to the internal buffer and return complete events."""
        self._buf += chunk.decode("utf-8", errors="replace")
        return self._drain()

    def flush(self) -> SSEEvent | None:
        """
        If there is a partial (unterminated) event in the buffer, parse
        and return it.  Call once when the upstream stream closes.
        """
        if self._data_lines:
            return self._dispatch()
        return None

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _drain(self) -> list[SSEEvent]:
        """Extract all complete event blocks (terminated by blank line)."""
        events: list[SSEEvent] = []
        while "\n\n" in self._buf:
            block, self._buf = self._buf.split("\n\n", 1)
            event = self._parse_block(block)
            if event is not None:
                events.append(event)
        return events

    def _parse_block(self, block: str) -> SSEEvent | None:
        """Parse one event block and reset per-event state."""
        for line in block.splitlines():
            line = line.rstrip("\r")

            if line.startswith(":"):
                # Comment line — ignore
                continue

            m = _FIELD_RE.match(line)
            if not m:
                continue

            field, value = m.group(1), m.group(2)
            # SSE spec: if value starts with a single space, strip it
            if value.startswith(" "):
                value = value[1:]

            if field == "event":
                self._event = value
            elif field == "data":
                self._data_lines.append(value)
            elif field == "id":
                self._id = value
            elif field == "retry":
                if value.isdigit():
                    self._retry = int(value)

        return self._dispatch()

    def _dispatch(self) -> SSEEvent | None:
        """Build an SSEEvent from accumulated fields and reset state."""
        if not self._data_lines:
            self._reset_event_state()
            return None

        data = "\n".join(self._data_lines)
        event = SSEEvent(
            event=self._event,
            data=data,
            id=self._id,
            retry=self._retry,
        )
        self._reset_event_state()
        return event

    def _reset_event_state(self) -> None:
        self._event = "message"
        self._data_lines = []
        self._id = None
        self._retry = None
