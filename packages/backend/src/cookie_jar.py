from __future__ import annotations

import logging
import time
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Minimum number of cookies to consider a cookie string "rich" enough to store.
# The tiny `_dd_s` tracking cookie alone is 1 cookie — we want real auth sessions.
_MIN_COOKIE_COUNT = 3

# Maximum age (seconds) before a stored cookie entry is considered stale.
_MAX_AGE_SEC = 30 * 60  # 30 minutes


def _extract_domain(url: str) -> str:
    """Extract the registrable domain from a URL for cookie grouping.

    For ``https://www-pr32488.web.tvlk.dev/api/...`` this returns
    ``web.tvlk.dev`` so that cookies captured from *any* request to the
    same webapx cluster can be reused for SSE interception.
    """
    hostname = urlparse(url).hostname or ""
    parts = hostname.split(".")
    # Keep the last 3 parts for *.web.tvlk.dev style domains
    # but fall back to last 2 for simpler domains (example.com)
    if len(parts) >= 3:
        return ".".join(parts[-3:])
    return hostname


def _count_cookies(cookie_header: str) -> int:
    """Count the number of key=value pairs in a Cookie header string."""
    return len([c for c in cookie_header.split(";") if "=" in c])


class CookieJar:
    """In-memory per-domain cookie store.

    The mitmproxy addon observes **all** browser traffic and posts rich
    ``Cookie`` headers to the relay via ``POST /cookies/store``.  When the
    relay needs to make an upstream SSE request whose captured headers
    only carry a thin cookie (e.g. ``_dd_s``), it can borrow the richer
    cookie string from this jar.

    Thread-safety: all access is from the single aiohttp event loop, so
    no locking is needed.
    """

    def __init__(self, *, max_age_sec: float = _MAX_AGE_SEC) -> None:
        self._store: dict[
            str, tuple[str, float]
        ] = {}  # domain → (cookie_header, timestamp)
        self._max_age_sec = max_age_sec

    def store(self, url: str, cookie_header: str) -> bool:
        """Store a cookie header for the domain derived from *url*.

        Returns ``True`` if the cookie was stored, ``False`` if it was
        rejected (too few cookies or empty).
        """
        if not cookie_header:
            return False

        count = _count_cookies(cookie_header)
        if count < _MIN_COOKIE_COUNT:
            return False

        domain = _extract_domain(url)
        if not domain:
            return False

        existing = self._store.get(domain)
        if existing is not None:
            existing_count = _count_cookies(existing[0])
            # Only overwrite if the new cookie string is at least as rich
            if count < existing_count:
                return False

        self._store[domain] = (cookie_header, time.time())
        logger.debug(
            "Stored %d cookies for domain %s",
            count,
            domain,
        )
        return True

    def get(self, url: str) -> str | None:
        """Return a stored cookie header for the domain derived from *url*.

        Returns ``None`` if no cookies are stored or the entry is stale.
        """
        domain = _extract_domain(url)
        entry = self._store.get(domain)
        if entry is None:
            return None

        cookie_header, ts = entry
        if (time.time() - ts) > self._max_age_sec:
            # Stale — remove and return nothing
            del self._store[domain]
            logger.debug("Evicted stale cookies for domain %s", domain)
            return None

        return cookie_header

    def clear(self) -> None:
        """Remove all stored cookies."""
        self._store.clear()

    def domains(self) -> list[str]:
        """Return a list of domains that have stored cookies."""
        return list(self._store.keys())
