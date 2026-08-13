"""Per-IP, per-endpoint-bucket rate limiting for the public Feasibility IQ
surface. Fixed-window counter in Redis: INCR + EXPIRE on first hit of the
window. The limit itself is the named setting
feasibility_iq_rate_limit_per_hour, editable at runtime by SUPER ADMIN —
never a literal here.
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import get_redis
from app.database import get_db
from app.services import settings_service

WINDOW_SECONDS = 3600


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, *, limit_setting_key: str = "feasibility_iq_rate_limit_per_hour"):
    """Usage: Depends(rate_limit("check")) — a distinct bucket per route so
    hammering one endpoint doesn't burn another's quota. `limit_setting_key`
    lets a bucket use its own ceiling instead of the shared default — e.g.
    "chat" uses chat_parse_rate_limit_per_hour, since that bucket costs a
    real LLM API call per request rather than a free DB lookup.
    """

    async def _dependency(request: Request, session: AsyncSession = Depends(get_db)) -> None:
        settings_map = await settings_service.get_typed_settings_map(session)
        limit = settings_map[limit_setting_key]

        client = get_redis()
        key = f"ratelimit:{bucket}:{_client_ip(request)}"
        current = await client.incr(key)
        if current == 1:
            await client.expire(key, WINDOW_SECONDS)

        if current > limit:
            ttl = await client.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded — try again later.",
                headers={"Retry-After": str(max(ttl, 1))},
            )

    return _dependency
