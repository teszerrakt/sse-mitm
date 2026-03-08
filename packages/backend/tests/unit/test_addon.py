from __future__ import annotations

import inspect

from addon import SSEInterceptorAddon


class TestAddonHooksAreAsync:
    """Guard against regression: addon hooks that call _post_to_relay for
    breakpoint intercepts MUST be async.  If they are sync, they block the
    shared asyncio event loop (the relay server becomes unresponsive while
    a breakpoint is active).

    See: https://github.com/teszerrakt/orthrus/issues/XXX
    """

    def test_request_hook_is_coroutine_function(self) -> None:
        assert inspect.iscoroutinefunction(SSEInterceptorAddon.request), (
            "SSEInterceptorAddon.request must be async — "
            "a sync hook blocks the event loop during breakpoint intercepts"
        )

    def test_response_hook_is_coroutine_function(self) -> None:
        assert inspect.iscoroutinefunction(SSEInterceptorAddon.response), (
            "SSEInterceptorAddon.response must be async — "
            "a sync hook blocks the event loop during breakpoint intercepts"
        )
