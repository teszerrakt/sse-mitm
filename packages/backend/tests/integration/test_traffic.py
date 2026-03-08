from __future__ import annotations

import asyncio
import json

import pytest
from aiohttp.test_utils import TestClient


class TestTrafficIntercept:
    """Integration tests for POST /traffic/intercept.

    The intercept handler blocks until the user acts (via WebSocket).
    These tests verify that the relay server stays responsive while an
    intercept is pending — i.e. the event loop is NOT blocked.
    """

    @pytest.mark.asyncio
    async def test_server_responds_during_pending_intercept(
        self, client: TestClient
    ) -> None:
        """Regression test for event-loop deadlock.

        When a breakpoint intercept is active (waiting for user decision),
        the relay server must still handle other HTTP requests.
        If this test times out, the event loop is blocked.
        """
        # 1. Fire the intercept request — it will block waiting for a decision.
        intercept_task = asyncio.create_task(
            client.post(
                "/traffic/intercept",
                json={
                    "phase": "request",
                    "flow_id": "test-flow-1",
                    "request": {
                        "method": "GET",
                        "url": "http://example.com/api",
                        "scheme": "http",
                        "host": "example.com",
                        "port": 80,
                        "path": "/api",
                        "http_version": "HTTP/1.1",
                        "headers": {},
                        "query": {},
                        "body": None,
                        "body_size": 0,
                        "content_type": None,
                        "client_ip": "127.0.0.1",
                        "timestamp": 1234567890.0,
                    },
                },
            )
        )

        # Give the server a moment to receive and start processing the intercept
        await asyncio.sleep(0.05)

        # 2. While the intercept is pending, verify the server still responds.
        #    If the event loop were blocked, this would hang forever.
        config_resp = await asyncio.wait_for(
            client.get("/config"),
            timeout=2.0,
        )
        assert config_resp.status == 200, (
            "GET /config should succeed while an intercept is pending"
        )

        # 3. Resolve the intercept via WebSocket so the test cleans up.
        ws = await client.ws_connect("/ws")
        # First, get the traffic entry id from the traffic list
        traffic_resp = await client.get("/traffic")
        entries = await traffic_resp.json()
        assert len(entries) >= 1
        entry_id = entries[-1]["id"]

        await ws.send_str(
            json.dumps({"type": "resume_request", "traffic_id": entry_id})
        )
        await ws.close()

        # 4. The intercept request should now complete.
        resp = await asyncio.wait_for(intercept_task, timeout=2.0)
        data = await resp.json()
        assert data["action"] == "resume"

    @pytest.mark.asyncio
    async def test_response_intercept_does_not_block_server(
        self, client: TestClient
    ) -> None:
        """Same as above but for response-phase intercepts."""
        # Log a request first so we have a flow_id mapping
        await client.post(
            "/traffic/log",
            json={
                "phase": "request",
                "flow_id": "test-flow-2",
                "request": {
                    "method": "GET",
                    "url": "http://example.com/api",
                    "scheme": "http",
                    "host": "example.com",
                    "port": 80,
                    "path": "/api",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "query": {},
                    "body": None,
                    "body_size": 0,
                    "content_type": None,
                    "client_ip": "127.0.0.1",
                    "timestamp": 1234567890.0,
                },
            },
        )

        # Fire a response-phase intercept
        intercept_task = asyncio.create_task(
            client.post(
                "/traffic/intercept",
                json={
                    "phase": "response",
                    "flow_id": "test-flow-2",
                    "request": {
                        "method": "GET",
                        "url": "http://example.com/api",
                        "scheme": "http",
                        "host": "example.com",
                        "port": 80,
                        "path": "/api",
                        "http_version": "HTTP/1.1",
                        "headers": {},
                        "query": {},
                        "body": None,
                        "body_size": 0,
                        "content_type": None,
                        "client_ip": "127.0.0.1",
                        "timestamp": 1234567890.0,
                    },
                    "response": {
                        "status_code": 200,
                        "reason": "OK",
                        "http_version": "HTTP/1.1",
                        "headers": {"content-type": "application/json"},
                        "body": '{"ok": true}',
                        "body_size": 12,
                        "content_type": "application/json",
                        "timestamp_start": 1234567890.5,
                        "timestamp_end": 1234567891.0,
                    },
                },
            )
        )

        await asyncio.sleep(0.05)

        # Server must still respond while intercept is pending
        config_resp = await asyncio.wait_for(
            client.get("/config"),
            timeout=2.0,
        )
        assert config_resp.status == 200

        # Resolve via WebSocket
        ws = await client.ws_connect("/ws")
        traffic_resp = await client.get("/traffic")
        entries = await traffic_resp.json()
        entry_id = entries[-1]["id"]

        await ws.send_str(
            json.dumps({"type": "resume_response", "traffic_id": entry_id})
        )
        await ws.close()

        resp = await asyncio.wait_for(intercept_task, timeout=2.0)
        data = await resp.json()
        assert data["action"] == "resume"

    @pytest.mark.asyncio
    async def test_abort_intercept(self, client: TestClient) -> None:
        """Aborting an intercept should return action='abort'."""
        intercept_task = asyncio.create_task(
            client.post(
                "/traffic/intercept",
                json={
                    "phase": "request",
                    "flow_id": "test-flow-abort",
                    "request": {
                        "method": "POST",
                        "url": "http://example.com/submit",
                        "scheme": "http",
                        "host": "example.com",
                        "port": 80,
                        "path": "/submit",
                        "http_version": "HTTP/1.1",
                        "headers": {},
                        "query": {},
                        "body": None,
                        "body_size": 0,
                        "content_type": None,
                        "client_ip": "127.0.0.1",
                        "timestamp": 1234567890.0,
                    },
                },
            )
        )

        await asyncio.sleep(0.05)

        ws = await client.ws_connect("/ws")
        traffic_resp = await client.get("/traffic")
        entries = await traffic_resp.json()
        entry_id = entries[-1]["id"]

        await ws.send_str(json.dumps({"type": "abort_request", "traffic_id": entry_id}))
        await ws.close()

        resp = await asyncio.wait_for(intercept_task, timeout=2.0)
        data = await resp.json()
        assert data["action"] == "abort"


class TestTrafficLog:
    """Integration tests for POST /traffic/log (observation, non-blocking)."""

    @pytest.mark.asyncio
    async def test_log_request_phase(self, client: TestClient) -> None:
        resp = await client.post(
            "/traffic/log",
            json={
                "phase": "request",
                "flow_id": "log-flow-1",
                "request": {
                    "method": "GET",
                    "url": "http://example.com/page",
                    "scheme": "http",
                    "host": "example.com",
                    "port": 80,
                    "path": "/page",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "query": {},
                    "body": None,
                    "body_size": 0,
                    "content_type": None,
                    "client_ip": "127.0.0.1",
                    "timestamp": 1234567890.0,
                },
            },
        )
        assert resp.status == 200
        data = await resp.json()
        assert "entry_id" in data

    @pytest.mark.asyncio
    async def test_log_response_phase(self, client: TestClient) -> None:
        # First log a request
        req_resp = await client.post(
            "/traffic/log",
            json={
                "phase": "request",
                "flow_id": "log-flow-2",
                "request": {
                    "method": "GET",
                    "url": "http://example.com/page",
                    "scheme": "http",
                    "host": "example.com",
                    "port": 80,
                    "path": "/page",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "query": {},
                    "body": None,
                    "body_size": 0,
                    "content_type": None,
                    "client_ip": "127.0.0.1",
                    "timestamp": 1234567890.0,
                },
            },
        )
        assert req_resp.status == 200

        # Then log the response
        resp = await client.post(
            "/traffic/log",
            json={
                "phase": "response",
                "flow_id": "log-flow-2",
                "request": {
                    "method": "GET",
                    "url": "http://example.com/page",
                    "scheme": "http",
                    "host": "example.com",
                    "port": 80,
                    "path": "/page",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "query": {},
                    "body": None,
                    "body_size": 0,
                    "content_type": None,
                    "client_ip": "127.0.0.1",
                    "timestamp": 1234567890.0,
                },
                "response": {
                    "status_code": 200,
                    "reason": "OK",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "body": "hello",
                    "body_size": 5,
                    "content_type": "text/plain",
                    "timestamp_start": 1234567890.5,
                    "timestamp_end": 1234567891.0,
                },
            },
        )
        assert resp.status == 200

    @pytest.mark.asyncio
    async def test_traffic_list_and_clear(self, client: TestClient) -> None:
        # Log a request
        await client.post(
            "/traffic/log",
            json={
                "phase": "request",
                "flow_id": "log-flow-3",
                "request": {
                    "method": "GET",
                    "url": "http://example.com/page",
                    "scheme": "http",
                    "host": "example.com",
                    "port": 80,
                    "path": "/page",
                    "http_version": "HTTP/1.1",
                    "headers": {},
                    "query": {},
                    "body": None,
                    "body_size": 0,
                    "content_type": None,
                    "client_ip": "127.0.0.1",
                    "timestamp": 1234567890.0,
                },
            },
        )

        # List — should have at least one entry
        resp = await client.get("/traffic")
        entries = await resp.json()
        assert len(entries) >= 1

        # Clear
        resp = await client.delete("/traffic")
        assert resp.status == 200

        # List — should be empty
        resp = await client.get("/traffic")
        entries = await resp.json()
        assert len(entries) == 0
