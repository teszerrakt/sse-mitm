from __future__ import annotations

import logging

from aiohttp import web

from src.cookie_jar import CookieJar

logger = logging.getLogger(__name__)


async def cookie_store_handler(request: web.Request) -> web.Response:
    """POST /cookies/store

    Body: ``{"url": "https://...", "cookies": "k1=v1; k2=v2; ..."}``

    Called by the mitmproxy addon to deposit rich cookie strings
    observed from passing browser traffic.  Returns 200 on success
    with ``{"stored": true/false}`` indicating whether the cookies
    were rich enough to keep.
    """
    cookie_jar: CookieJar = request.app["cookie_jar"]

    try:
        body = await request.json()
    except Exception:
        raise web.HTTPBadRequest(reason="Invalid JSON body")

    url = body.get("url", "")
    cookies = body.get("cookies", "")

    if not url or not cookies:
        return web.json_response({"stored": False})

    stored = cookie_jar.store(url, cookies)
    return web.json_response({"stored": stored})


async def cookie_list_handler(request: web.Request) -> web.Response:
    """GET /cookies

    Returns the list of domains that have stored cookies.
    Useful for debugging in the UI.
    """
    cookie_jar: CookieJar = request.app["cookie_jar"]
    return web.json_response({"domains": cookie_jar.domains()})


async def cookie_clear_handler(request: web.Request) -> web.Response:
    """DELETE /cookies

    Clears all stored cookies.
    """
    cookie_jar: CookieJar = request.app["cookie_jar"]
    cookie_jar.clear()
    return web.json_response({"ok": True})
