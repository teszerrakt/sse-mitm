from __future__ import annotations

import time
from unittest.mock import patch

from src.cookie_jar import CookieJar, _count_cookies, _extract_domain


class TestExtractDomain:
    """Unit tests for _extract_domain()."""

    def test_three_part_domain(self) -> None:
        assert (
            _extract_domain("https://www-pr32488.web.tvlk.dev/api/foo")
            == "web.tvlk.dev"
        )

    def test_four_part_domain(self) -> None:
        assert _extract_domain("https://a.b.web.tvlk.dev/x") == "web.tvlk.dev"

    def test_two_part_domain(self) -> None:
        assert _extract_domain("https://example.com/path") == "example.com"

    def test_simple_hostname(self) -> None:
        assert _extract_domain("https://localhost:8080/foo") == "localhost"

    def test_empty_url(self) -> None:
        assert _extract_domain("") == ""


class TestCountCookies:
    """Unit tests for _count_cookies()."""

    def test_single_cookie(self) -> None:
        assert _count_cookies("_dd_s=abc123") == 1

    def test_multiple_cookies(self) -> None:
        assert _count_cookies("a=1; b=2; c=3") == 3

    def test_empty_string(self) -> None:
        assert _count_cookies("") == 0

    def test_ignores_malformed_parts(self) -> None:
        assert _count_cookies("a=1; ; b=2; noequals") == 2


class TestCookieJarStore:
    """Unit tests for CookieJar.store()."""

    def test_stores_rich_cookies(self) -> None:
        jar = CookieJar()
        result = jar.store("https://www-pr123.web.tvlk.dev/api", "a=1; b=2; c=3")
        assert result is True
        assert "web.tvlk.dev" in jar.domains()

    def test_rejects_empty_cookie(self) -> None:
        jar = CookieJar()
        assert jar.store("https://example.com", "") is False

    def test_rejects_thin_cookie(self) -> None:
        jar = CookieJar()
        assert jar.store("https://example.com", "_dd_s=abc") is False
        assert jar.store("https://example.com", "a=1; b=2") is False

    def test_rejects_empty_url(self) -> None:
        jar = CookieJar()
        assert jar.store("", "a=1; b=2; c=3") is False

    def test_overwrites_with_richer_cookie(self) -> None:
        jar = CookieJar()
        jar.store("https://www.web.tvlk.dev/a", "a=1; b=2; c=3")
        jar.store("https://www.web.tvlk.dev/b", "a=1; b=2; c=3; d=4")
        assert jar.get("https://x.web.tvlk.dev/z") == "a=1; b=2; c=3; d=4"

    def test_does_not_overwrite_with_less_rich_cookie(self) -> None:
        jar = CookieJar()
        jar.store("https://www.web.tvlk.dev/a", "a=1; b=2; c=3; d=4")
        result = jar.store("https://www.web.tvlk.dev/b", "a=1; b=2; c=3")
        assert result is False
        assert jar.get("https://x.web.tvlk.dev/z") == "a=1; b=2; c=3; d=4"


class TestCookieJarGet:
    """Unit tests for CookieJar.get()."""

    def test_returns_stored_cookie(self) -> None:
        jar = CookieJar()
        jar.store("https://www-pr123.web.tvlk.dev/api", "a=1; b=2; c=3")
        result = jar.get("https://www-pr456.web.tvlk.dev/sse")
        assert result == "a=1; b=2; c=3"

    def test_returns_none_for_unknown_domain(self) -> None:
        jar = CookieJar()
        assert jar.get("https://unknown.example.com") is None

    def test_evicts_stale_entry(self) -> None:
        jar = CookieJar(max_age_sec=60)
        jar.store("https://www.web.tvlk.dev/a", "a=1; b=2; c=3")

        # Simulate time passing beyond max_age
        with patch("src.cookie_jar.time") as mock_time:
            mock_time.time.return_value = time.time() + 120
            result = jar.get("https://x.web.tvlk.dev/z")

        assert result is None
        assert "web.tvlk.dev" not in jar.domains()


class TestCookieJarClearAndDomains:
    """Unit tests for CookieJar.clear() and .domains()."""

    def test_clear_removes_all(self) -> None:
        jar = CookieJar()
        jar.store("https://www.web.tvlk.dev/a", "a=1; b=2; c=3")
        jar.store("https://example.com/b", "x=1; y=2; z=3")
        assert len(jar.domains()) == 2
        jar.clear()
        assert jar.domains() == []

    def test_domains_returns_stored_domains(self) -> None:
        jar = CookieJar()
        jar.store("https://www.web.tvlk.dev/a", "a=1; b=2; c=3")
        assert jar.domains() == ["web.tvlk.dev"]
