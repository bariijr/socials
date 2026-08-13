"""Per-provider concurrent in-flight request tracking (task #131) — lets
the dispatcher treat a chat provider as "busy" and fail over to the next
one in priority order, rather than piling requests onto a
resource-constrained backend (Ollama on a small VPS, in particular).
Redis-backed (already used for rate limiting, app.core.rate_limit) since
this has to be shared across every worker process, not per-process memory.

This is advisory load-shedding, not a hard resource lock: a leaked
counter (process killed mid-request, no chance to decrement) self-clears
via TTL rather than leaving a provider stuck "busy" forever.
"""

from contextlib import asynccontextmanager

from app.core.redis_client import get_redis

_KEY_PREFIX = "chat:inflight:"
_TTL_SECONDS = 120  # comfortably longer than any provider's own request timeout


def _key(provider_name: str) -> str:
    return f"{_KEY_PREFIX}{provider_name}"


async def current_inflight(provider_name: str) -> int:
    client = get_redis()
    value = await client.get(_key(provider_name))
    return int(value) if value else 0


async def is_busy(provider_name: str, *, max_concurrent: int) -> bool:
    return await current_inflight(provider_name) >= max_concurrent


@asynccontextmanager
async def track_inflight(provider_name: str):
    client = get_redis()
    key = _key(provider_name)
    await client.incr(key)
    await client.expire(key, _TTL_SECONDS)
    try:
        yield
    finally:
        new_value = await client.decr(key)
        if new_value < 0:
            # A race or a stale/expired key made this decrement unmatched —
            # advisory counter, so just clamp rather than treat it as an error.
            await client.set(key, 0)
