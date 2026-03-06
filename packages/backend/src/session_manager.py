from __future__ import annotations

from src.models import SessionInfo
from src.session import Session


class SessionManager:
    """
    Registry of all active and completed SSE sessions.

    Thread-safety: all mutations happen inside the asyncio event loop,
    so no explicit locking is needed.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, Session] = {}

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def create(self, session: Session) -> None:
        self._sessions[session.id] = session

    def get(self, session_id: str) -> Session | None:
        return self._sessions.get(session_id)

    def get_or_raise(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise KeyError(f"Session '{session_id}' not found")
        return session

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def all_infos(self) -> list[SessionInfo]:
        return [s.to_session_info() for s in self._sessions.values()]

    def __len__(self) -> int:
        return len(self._sessions)
