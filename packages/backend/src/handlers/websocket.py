from __future__ import annotations

import json
import logging
from typing import Any

import aiohttp
from aiohttp import web
from pydantic import TypeAdapter

from src.models import (
    AbortRequestCmd,
    ClearSessionsCmd,
    ClearTrafficCmd,
    ClientCmd,
    CloseSessionCmd,
    DelayCmd,
    DropCmd,
    EditCmd,
    ForwardAllCmd,
    ForwardCmd,
    InjectCmd,
    ResumeRequestCmd,
    ResumeResponseCmd,
    SaveSessionCmd,
    SessionUpdatedMsg,
    SessionsClearedMsg,
    TrafficClearedMsg,
)
from src.session_manager import SessionManager
from src.traffic_store import TrafficStore

logger = logging.getLogger(__name__)


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """
    GET /ws

    Bidirectional WebSocket channel between the relay server and the Web UI.
    - Server pushes: new_session, event, stream_end, error, session_updated
    - Client sends: forward, edit, drop, inject, delay, forward_all, save_session, close_session
    """
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)

    # Register this WS connection so the relay handler can broadcast to it
    ws_clients: set[web.WebSocketResponse] = request.app["ws_clients"]
    ws_clients.add(ws)
    logger.info("WebSocket client connected (total: %d)", len(ws_clients))

    session_manager: SessionManager = request.app["session_manager"]
    traffic_store: TrafficStore = request.app["traffic_store"]
    mocks_dir = request.app["mocks_dir"]

    try:
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                await _handle_command(
                    msg.data,
                    session_manager,
                    ws,
                    mocks_dir,
                    ws_clients,
                    traffic_store,
                )
            elif msg.type in (
                aiohttp.WSMsgType.ERROR,
                aiohttp.WSMsgType.CLOSE,
            ):
                break
    finally:
        ws_clients.discard(ws)
        logger.info("WebSocket client disconnected (total: %d)", len(ws_clients))

    return ws


async def _handle_command(
    raw: str,
    session_manager: SessionManager,
    ws: web.WebSocketResponse,
    mocks_dir: Any,
    ws_clients: set[web.WebSocketResponse],
    traffic_store: TrafficStore,
) -> None:
    try:
        data = json.loads(raw)
        cmd = _parse_cmd(data)
    except Exception as exc:
        logger.warning("Invalid WS command: %s — %s", raw[:200], exc)
        await ws.send_str(json.dumps({"type": "error", "message": str(exc)}))
        return

    # clear_sessions has no session_id — handle before session lookup
    if isinstance(cmd, ClearSessionsCmd):
        session_manager.clear_all()
        cleared = SessionsClearedMsg(type="sessions_cleared")
        msg_str = cleared.model_dump_json()
        dead: list[web.WebSocketResponse] = []
        for client in ws_clients:
            try:
                await client.send_str(msg_str)
            except Exception:
                dead.append(client)
        for client in dead:
            ws_clients.discard(client)
        return

    # --- Traffic commands (no session_id) ---

    if isinstance(cmd, ClearTrafficCmd):
        traffic_store.clear_all()
        cleared_msg = TrafficClearedMsg(type="traffic_cleared")
        msg_str = cleared_msg.model_dump_json()
        dead = []
        for client in ws_clients:
            try:
                await client.send_str(msg_str)
            except Exception:
                dead.append(client)
        for client in dead:
            ws_clients.discard(client)
        return

    if isinstance(cmd, ResumeRequestCmd):
        decision = traffic_store.get_decision(cmd.traffic_id)
        if decision is None:
            await ws.send_str(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"No pending intercept for traffic '{cmd.traffic_id}'",
                    }
                )
            )
            return
        decision.resume_request(cmd.modifications)
        return

    if isinstance(cmd, ResumeResponseCmd):
        decision = traffic_store.get_decision(cmd.traffic_id)
        if decision is None:
            await ws.send_str(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"No pending intercept for traffic '{cmd.traffic_id}'",
                    }
                )
            )
            return
        decision.resume_response(cmd.modifications)
        return

    if isinstance(cmd, AbortRequestCmd):
        decision = traffic_store.get_decision(cmd.traffic_id)
        if decision is None:
            await ws.send_str(
                json.dumps(
                    {
                        "type": "error",
                        "message": f"No pending intercept for traffic '{cmd.traffic_id}'",
                    }
                )
            )
            return
        decision.abort()
        return

    # --- SSE session commands ---

    try:
        session = session_manager.get_or_raise(cmd.session_id)
    except KeyError as exc:
        await ws.send_str(json.dumps({"type": "error", "message": str(exc)}))
        return

    if isinstance(cmd, ForwardCmd):
        await session.forward(cmd.index)

    elif isinstance(cmd, EditCmd):
        await session.edit_and_forward(cmd.index, cmd.event)

    elif isinstance(cmd, DropCmd):
        await session.drop(cmd.index)

    elif isinstance(cmd, InjectCmd):
        await session.inject(cmd.event)

    elif isinstance(cmd, DelayCmd):
        # Run delay in background so WS isn't blocked
        import asyncio

        asyncio.create_task(session.delay_then_forward(cmd.index, cmd.delay_ms))

    elif isinstance(cmd, ForwardAllCmd):
        await session.forward_all()

    elif isinstance(cmd, SaveSessionCmd):
        await _save_session(session, cmd.filename, mocks_dir, ws)
        return

    elif isinstance(cmd, CloseSessionCmd):
        # Signal the downstream relay handler to stop streaming. The relay
        # handler's finally-block will cancel upstream, send stream_end, etc.
        await session.close_stream()
        return

    # Broadcast updated session info
    updated = SessionUpdatedMsg(
        type="session_updated",
        session=session.to_session_info(),
    )
    await ws.send_str(updated.model_dump_json())


def _parse_cmd(data: dict) -> Any:
    """Parse raw dict into a typed ClientCmd using Pydantic discriminated union."""
    adapter: TypeAdapter[ClientCmd] = TypeAdapter(ClientCmd)
    return adapter.validate_python(data)


async def _save_session(
    session: Any,
    filename: str,
    mocks_dir: Any,
    ws: web.WebSocketResponse,
) -> None:
    import json
    from pathlib import Path

    # Sanitise filename
    safe = "".join(c for c in filename if c.isalnum() or c in "._- ")
    if not safe.endswith(".json"):
        safe += ".json"

    path = Path(mocks_dir) / safe
    mock = session.to_mock_config(filename.replace(".json", ""))
    path.write_text(mock.model_dump_json(indent=2), encoding="utf-8")
    logger.info("Session %s saved to %s", session.id, path)

    await ws.send_str(
        json.dumps({"type": "session_saved", "filename": safe, "path": str(path)})
    )
