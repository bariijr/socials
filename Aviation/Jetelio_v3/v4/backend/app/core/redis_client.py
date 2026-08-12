"""Shared async Redis client. Only Celery talks to Redis today (as its
broker); this gives the API process its own connection for rate limiting
and the Feasibility IQ check_id cache.
"""

import asyncio
from weakref import WeakKeyDictionary

import redis.asyncio as redis

from app.config import get_settings

# One client per running event loop, not a single @lru_cache'd instance.
# A plain @lru_cache pins the client (and its connections) to whichever
# loop first called this — fine in production (one long-lived loop) but
# breaks under pytest-asyncio's per-test event loops ("Event loop is
# closed" / "attached to a different loop" errors).
_clients: "WeakKeyDictionary[asyncio.AbstractEventLoop, redis.Redis]" = WeakKeyDictionary()


def get_redis() -> redis.Redis:
    loop = asyncio.get_event_loop()
    client = _clients.get(loop)
    if client is None:
        settings = get_settings()
        client = redis.from_url(settings.redis_url, decode_responses=True)
        _clients[loop] = client
    return client
