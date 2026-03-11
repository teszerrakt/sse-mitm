from __future__ import annotations

import pytest
from aiohttp.test_utils import TestClient


class TestCookieStore:
    """Integration tests for POST /cookies/store."""

    @pytest.mark.asyncio
    async def test_stores_rich_cookies(self, client: TestClient) -> None:
        resp = await client.post(
            "/cookies/store",
            json={
                "url": "https://www-pr123.web.tvlk.dev/api/foo",
                "cookies": "a=1; b=2; c=3; d=4",
            },
        )
        assert resp.status == 200
        body = await resp.json()
        assert body["stored"] is True

    @pytest.mark.asyncio
    async def test_rejects_thin_cookies(self, client: TestClient) -> None:
        resp = await client.post(
            "/cookies/store",
            json={
                "url": "https://www-pr123.web.tvlk.dev/api/foo",
                "cookies": "_dd_s=abc",
            },
        )
        assert resp.status == 200
        body = await resp.json()
        assert body["stored"] is False

    @pytest.mark.asyncio
    async def test_rejects_missing_fields(self, client: TestClient) -> None:
        resp = await client.post(
            "/cookies/store",
            json={"url": "", "cookies": ""},
        )
        assert resp.status == 200
        body = await resp.json()
        assert body["stored"] is False

    @pytest.mark.asyncio
    async def test_rejects_invalid_json(self, client: TestClient) -> None:
        resp = await client.post(
            "/cookies/store",
            data=b"not json",
            headers={"content-type": "application/json"},
        )
        assert resp.status == 400


class TestCookieList:
    """Integration tests for GET /cookies."""

    @pytest.mark.asyncio
    async def test_empty_initially(self, client: TestClient) -> None:
        resp = await client.get("/cookies")
        body = await resp.json()
        assert body["domains"] == []

    @pytest.mark.asyncio
    async def test_lists_stored_domains(self, client: TestClient) -> None:
        await client.post(
            "/cookies/store",
            json={
                "url": "https://www.web.tvlk.dev/api",
                "cookies": "a=1; b=2; c=3",
            },
        )
        resp = await client.get("/cookies")
        body = await resp.json()
        assert "web.tvlk.dev" in body["domains"]


class TestCookieClear:
    """Integration tests for DELETE /cookies."""

    @pytest.mark.asyncio
    async def test_clears_all_cookies(self, client: TestClient) -> None:
        # Store some cookies first
        await client.post(
            "/cookies/store",
            json={
                "url": "https://www.web.tvlk.dev/api",
                "cookies": "a=1; b=2; c=3",
            },
        )
        # Clear
        resp = await client.delete("/cookies")
        assert resp.status == 200
        body = await resp.json()
        assert body["ok"] is True

        # Verify empty
        resp = await client.get("/cookies")
        body = await resp.json()
        assert body["domains"] == []
