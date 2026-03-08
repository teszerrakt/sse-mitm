from __future__ import annotations

import json
from pathlib import Path

import pytest
from aiohttp.test_utils import TestClient


class TestGetConfig:
    """Integration tests for GET /config."""

    @pytest.mark.asyncio
    async def test_returns_config_with_proxy_address(self, client: TestClient) -> None:
        resp = await client.get("/config")
        assert resp.status == 200
        data = await resp.json()
        assert "sse_patterns" in data
        assert "relay_host" in data
        assert "relay_port" in data
        assert "proxy_address" in data

    @pytest.mark.asyncio
    async def test_returns_defaults_when_no_file(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        missing = tmp_path / "nonexistent_config.json"
        client.app["config_file"] = missing
        resp = await client.get("/config")
        assert resp.status == 200
        data = await resp.json()
        assert data["sse_patterns"] == ["*/sse*", "*/stream*"]

    @pytest.mark.asyncio
    async def test_reads_custom_patterns_from_disk(
        self, client: TestClient, tmp_path: Path
    ) -> None:
        cfg = tmp_path / "config.json"
        cfg.write_text(json.dumps({"sse_patterns": ["*/custom*"]}))
        client.app["config_file"] = cfg
        resp = await client.get("/config")
        data = await resp.json()
        assert data["sse_patterns"] == ["*/custom*"]


class TestPutConfig:
    """Integration tests for PUT /config."""

    @pytest.mark.asyncio
    async def test_updates_sse_patterns(
        self, client: TestClient, tmp_config: Path
    ) -> None:
        client.app["config_file"] = tmp_config
        resp = await client.put(
            "/config",
            json={"sse_patterns": ["*/new-pattern*"]},
        )
        assert resp.status == 200
        data = await resp.json()
        assert data["sse_patterns"] == ["*/new-pattern*"]
        # Verify persisted to disk
        on_disk = json.loads(tmp_config.read_text())
        assert on_disk["sse_patterns"] == ["*/new-pattern*"]

    @pytest.mark.asyncio
    async def test_put_response_includes_proxy_address(
        self, client: TestClient, tmp_config: Path
    ) -> None:
        """PUT response must include proxy_address so the frontend can stay in sync."""
        client.app["config_file"] = tmp_config
        resp = await client.put(
            "/config",
            json={"sse_patterns": ["*/sse*"]},
        )
        assert resp.status == 200
        data = await resp.json()
        assert "proxy_address" in data
        assert ":" in data["proxy_address"]  # "ip:port" format

    @pytest.mark.asyncio
    async def test_rejects_missing_sse_patterns(self, client: TestClient) -> None:
        resp = await client.put("/config", json={"other_field": "value"})
        assert resp.status == 400
        data = await resp.json()
        assert "Missing required field" in data["error"]

    @pytest.mark.asyncio
    async def test_rejects_non_array_patterns(self, client: TestClient) -> None:
        resp = await client.put("/config", json={"sse_patterns": "not-an-array"})
        assert resp.status == 400
        data = await resp.json()
        assert "must be an array" in data["error"]

    @pytest.mark.asyncio
    async def test_rejects_empty_array(self, client: TestClient) -> None:
        resp = await client.put("/config", json={"sse_patterns": []})
        assert resp.status == 400
        data = await resp.json()
        assert "must not be empty" in data["error"]

    @pytest.mark.asyncio
    async def test_rejects_non_string_items(self, client: TestClient) -> None:
        resp = await client.put("/config", json={"sse_patterns": [123, 456]})
        assert resp.status == 400
        data = await resp.json()
        assert "must be strings" in data["error"]

    @pytest.mark.asyncio
    async def test_rejects_invalid_json_body(self, client: TestClient) -> None:
        resp = await client.put(
            "/config",
            data=b"not json",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status == 400

    @pytest.mark.asyncio
    async def test_roundtrip_put_then_get(
        self, client: TestClient, tmp_config: Path
    ) -> None:
        """PUT new patterns, then GET should reflect the change."""
        new_patterns = ["*/roundtrip-a*", "*/roundtrip-b*"]
        client.app["config_file"] = tmp_config
        put_resp = await client.put("/config", json={"sse_patterns": new_patterns})
        assert put_resp.status == 200

        get_resp = await client.get("/config")
        assert get_resp.status == 200
        data = await get_resp.json()
        assert data["sse_patterns"] == new_patterns
