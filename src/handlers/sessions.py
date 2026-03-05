from __future__ import annotations

from aiohttp import web

from src.session_manager import SessionManager


async def sessions_handler(request: web.Request) -> web.Response:
    """
    GET /sessions

    Returns a JSON array of all active/completed session summaries,
    matching the SessionInfo model (mirrors Chrome DevTools Network tab entries).
    """
    session_manager: SessionManager = request.app["session_manager"]
    infos = session_manager.all_infos()
    payload = [info.model_dump() for info in infos]
    return web.json_response(payload)
