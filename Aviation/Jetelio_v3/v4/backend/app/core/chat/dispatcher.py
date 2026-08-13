"""Routes trip-request extraction across the four wired chat providers
(task #131 — supersedes task #130's single admin-picked provider). All
four (ollama/deepseek/anthropic/openai) share the exact same
`extract_trip_request(message, *, today) -> TripExtraction | None` /
`is_configured() -> bool` contract, so this module's job is deciding which
one actually handles a given request:

- **Priority**: try order comes from the admin-editable `chat_provider_priority`
  named setting (CSV, e.g. "anthropic,openai,deepseek,ollama") — a SUPER
  ADMIN can reorder it at runtime, no deploy needed, same as every other
  named setting. Any of the four missing from that list still gets a
  chance, appended at the end — a typo or partial list must never
  silently make a real, configured provider unreachable.
- **Suspension**: `chat_provider_suspended` (CSV) removes a provider from
  consideration entirely regardless of priority — for taking one offline
  deliberately (maintenance, cost control) without losing its place in
  the priority list.
- **Workload**: `chat_provider_max_concurrent` caps how many in-flight
  extraction requests a single provider may have at once (see
  app.core.chat.workload) before the dispatcher treats it as busy and
  moves on to the next candidate — this is what lets all four "work
  concurrently": multiple requests can be in flight across different
  providers at the same time, rather than serializing behind whichever
  one happens to be first in priority.
- **Failover on failure**: a configured-and-available provider that
  returns None (bad key, API outage, malformed tool-call, a small local
  model that fumbled the extraction) also falls through to the next
  candidate, not just an unconfigured/suspended/busy one.

Only returns None once every candidate has been tried/skipped — same
NO_PROVIDER_CONFIGURED-style honesty as every other optional integration
in this codebase; the caller never gets a fabricated result.
"""

import logging
from datetime import date
from types import ModuleType

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat import anthropic_provider, deepseek_provider, ollama_provider, openai_provider, workload
from app.core.chat.schema import TripExtraction
from app.services import settings_service

logger = logging.getLogger(__name__)

DEFAULT_PRIORITY = ["ollama", "deepseek", "anthropic", "openai"]
DEFAULT_MAX_CONCURRENT = 2

PROVIDERS: dict[str, ModuleType] = {
    "ollama": ollama_provider,
    "deepseek": deepseek_provider,
    "anthropic": anthropic_provider,
    "openai": openai_provider,
}


def _parse_csv_names(raw: object) -> list[str]:
    return [p.strip().lower() for p in str(raw or "").split(",") if p.strip()]


async def _candidate_order(session: AsyncSession) -> list[str]:
    settings_map = await settings_service.get_typed_settings_map(session)
    priority = [p for p in _parse_csv_names(settings_map.get("chat_provider_priority")) if p in PROVIDERS]
    for name in DEFAULT_PRIORITY:
        if name not in priority:
            priority.append(name)
    suspended = set(_parse_csv_names(settings_map.get("chat_provider_suspended")))
    return [name for name in priority if name not in suspended]


async def _max_concurrent(session: AsyncSession) -> int:
    settings_map = await settings_service.get_typed_settings_map(session)
    value = settings_map.get("chat_provider_max_concurrent")
    return int(value) if value else DEFAULT_MAX_CONCURRENT


async def is_any_provider_available(session: AsyncSession) -> bool:
    """True once at least one non-suspended candidate is actually
    configured. Deliberately ignores current workload — busy is
    transient and doesn't mean "not configured"; a request arriving
    while every candidate is momentarily busy still gets a real attempt,
    just with a live workload check at call time.
    """
    candidates = await _candidate_order(session)
    return any(PROVIDERS[name].is_configured() for name in candidates)


async def extract_trip_request(session: AsyncSession, message: str, *, today: date) -> TripExtraction | None:
    candidates = await _candidate_order(session)
    max_concurrent = await _max_concurrent(session)

    for name in candidates:
        provider = PROVIDERS[name]
        if not provider.is_configured():
            continue
        if await workload.is_busy(name, max_concurrent=max_concurrent):
            logger.info("chat provider %s busy (>=%s in flight) — trying next candidate", name, max_concurrent)
            continue

        async with workload.track_inflight(name):
            result = await provider.extract_trip_request(message, today=today)
        if result is not None:
            return result
        logger.info("chat provider %s failed to extract — trying next candidate", name)

    return None
