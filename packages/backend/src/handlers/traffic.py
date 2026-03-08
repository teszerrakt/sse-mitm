from __future__ import annotations

import logging

from aiohttp import web

from src.models import (
    HttpRequestData,
    HttpResponseData,
    NewTrafficMsg,
    TrafficUpdatedMsg,
)
from src.traffic_store import TrafficStore

logger = logging.getLogger(__name__)


async def traffic_log_handler(request: web.Request) -> web.Response:
    """
    POST /traffic/log

    Receive an observed (non-intercepted) request or response from the addon.
    Creates or updates a traffic entry and broadcasts to all WS clients.

    Body format for request:
    {
        "phase": "request",
        "flow_id": "...",
        "request": { HttpRequestData fields }
    }

    Body format for response:
    {
        "phase": "response",
        "flow_id": "...",
        "request": { HttpRequestData fields },  // included for new entries
        "response": { HttpResponseData fields }
    }
    """
    traffic_store: TrafficStore = request.app["traffic_store"]
    ws_broadcaster = request.app["ws_broadcaster"]

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    phase = body.get("phase")
    flow_id = body.get("flow_id", "")

    if phase == "request":
        req_data = HttpRequestData(**body["request"])
        entry = traffic_store.create_entry(req_data, is_intercepted=False)
        # Store flow_id -> entry_id mapping for later response matching
        _flow_map(request.app)[flow_id] = entry.id

        await ws_broadcaster(
            NewTrafficMsg(type="new_traffic", entry=entry).model_dump_json()
        )
        return web.json_response({"entry_id": entry.id})

    elif phase == "response":
        entry_id = _flow_map(request.app).get(flow_id)
        if entry_id is None:
            # Request wasn't tracked (maybe cleared), create a new entry
            req_data = HttpRequestData(**body.get("request", {}))
            entry = traffic_store.create_entry(req_data, is_intercepted=False)
            entry_id = entry.id

        resp_data = HttpResponseData(**body["response"])
        updated = traffic_store.update_response(entry_id, resp_data)
        if updated:
            await ws_broadcaster(
                TrafficUpdatedMsg(
                    type="traffic_updated", entry=updated
                ).model_dump_json()
            )
        # Clean up flow mapping
        _flow_map(request.app).pop(flow_id, None)
        return web.json_response({"entry_id": entry_id})

    elif phase == "error":
        entry_id = _flow_map(request.app).get(flow_id)
        if entry_id:
            updated = traffic_store.mark_error(entry_id)
            if updated:
                await ws_broadcaster(
                    TrafficUpdatedMsg(
                        type="traffic_updated", entry=updated
                    ).model_dump_json()
                )
            _flow_map(request.app).pop(flow_id, None)
        return web.json_response({"status": "ok"})

    return web.json_response({"error": f"Unknown phase: {phase}"}, status=400)


async def traffic_intercept_handler(request: web.Request) -> web.Response:
    """
    POST /traffic/intercept

    Called by the addon when a request or response matches a breakpoint pattern.
    This endpoint BLOCKS until the user acts in the UI (resume/modify/abort).

    Body format:
    {
        "phase": "request" | "response",
        "flow_id": "...",
        "request": { HttpRequestData fields },
        "response": { HttpResponseData fields } | null
    }

    Returns:
    {
        "action": "resume" | "abort",
        "request_modifications": { ... } | null,
        "response_modifications": { ... } | null
    }
    """
    traffic_store: TrafficStore = request.app["traffic_store"]
    ws_broadcaster = request.app["ws_broadcaster"]

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "Invalid JSON"}, status=400)

    phase = body.get("phase")
    flow_id = body.get("flow_id", "")

    if phase == "request":
        req_data = HttpRequestData(**body["request"])
        entry = traffic_store.create_entry(req_data, is_intercepted=True)
        _flow_map(request.app)[flow_id] = entry.id

        # Create decision point and broadcast to UI
        decision = traffic_store.create_decision(entry.id)
        await ws_broadcaster(
            NewTrafficMsg(type="new_traffic", entry=entry).model_dump_json()
        )

        # Block until user acts
        action = await decision.wait(timeout=300.0)

        if action == "abort":
            traffic_store.mark_aborted(entry.id)
            aborted = traffic_store.get(entry.id)
            if aborted:
                await ws_broadcaster(
                    TrafficUpdatedMsg(
                        type="traffic_updated", entry=aborted
                    ).model_dump_json()
                )
            traffic_store.remove_decision(entry.id)
            _flow_map(request.app).pop(flow_id, None)
            return web.json_response(
                {
                    "action": "abort",
                    "request_modifications": None,
                    "response_modifications": None,
                }
            )

        # Resume — mark as in-flight
        in_flight = traffic_store.mark_in_flight(entry.id)
        if in_flight:
            await ws_broadcaster(
                TrafficUpdatedMsg(
                    type="traffic_updated", entry=in_flight
                ).model_dump_json()
            )
        traffic_store.remove_decision(entry.id)

        mods = decision.request_modifications
        return web.json_response(
            {
                "action": "resume",
                "request_modifications": mods.model_dump() if mods else None,
                "response_modifications": None,
            }
        )

    elif phase == "response":
        entry_id = _flow_map(request.app).get(flow_id)
        if entry_id is None:
            # Request wasn't tracked, create entry
            req_data = HttpRequestData(**body.get("request", {}))
            entry = traffic_store.create_entry(req_data, is_intercepted=True)
            entry_id = entry.id

        resp_data = HttpResponseData(**body["response"])
        updated = traffic_store.update_response(
            entry_id, resp_data, is_intercepted=True
        )

        # Create decision point for response and broadcast
        decision = traffic_store.create_decision(entry_id)
        if updated:
            await ws_broadcaster(
                TrafficUpdatedMsg(
                    type="traffic_updated", entry=updated
                ).model_dump_json()
            )

        # Block until user acts
        action = await decision.wait(timeout=300.0)

        if action == "abort":
            traffic_store.mark_aborted(entry_id)
            aborted = traffic_store.get(entry_id)
            if aborted:
                await ws_broadcaster(
                    TrafficUpdatedMsg(
                        type="traffic_updated", entry=aborted
                    ).model_dump_json()
                )
            traffic_store.remove_decision(entry_id)
            _flow_map(request.app).pop(flow_id, None)
            return web.json_response(
                {
                    "action": "abort",
                    "request_modifications": None,
                    "response_modifications": None,
                }
            )

        # Resume — mark as completed
        completed = traffic_store.mark_completed(entry_id)
        if completed:
            await ws_broadcaster(
                TrafficUpdatedMsg(
                    type="traffic_updated", entry=completed
                ).model_dump_json()
            )
        traffic_store.remove_decision(entry_id)
        _flow_map(request.app).pop(flow_id, None)

        mods = decision.response_modifications
        return web.json_response(
            {
                "action": "resume",
                "request_modifications": None,
                "response_modifications": mods.model_dump() if mods else None,
            }
        )

    return web.json_response({"error": f"Unknown phase: {phase}"}, status=400)


async def traffic_list_handler(request: web.Request) -> web.Response:
    """GET /traffic — list all traffic entries."""
    traffic_store: TrafficStore = request.app["traffic_store"]
    entries = traffic_store.all_entries()
    return web.json_response([e.model_dump() for e in entries])


async def traffic_clear_handler(request: web.Request) -> web.Response:
    """DELETE /traffic — clear all traffic entries."""
    traffic_store: TrafficStore = request.app["traffic_store"]
    traffic_store.clear_all()
    _flow_map(request.app).clear()

    ws_broadcaster = request.app["ws_broadcaster"]
    from src.models import TrafficClearedMsg

    await ws_broadcaster(TrafficClearedMsg(type="traffic_cleared").model_dump_json())
    return web.json_response({"status": "cleared"})


def _flow_map(app: web.Application) -> dict[str, str]:
    """Get or create the flow_id -> entry_id mapping dict on the app."""
    if "traffic_flow_map" not in app:
        app["traffic_flow_map"] = {}
    return app["traffic_flow_map"]
