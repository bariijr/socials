"""Routes LLM tool-calls across the four wired chat providers (task #131
— supersedes task #130's single admin-picked provider). All four
(ollama/deepseek/anthropic/openai) share the exact same generic
`call_tool(message, *, system_prompt, tool_name, tool_description,
input_schema, timeout) -> dict | None` primitive plus `is_configured() ->
bool`, so this module's job is deciding which one actually handles a
given request. `extract_trip_request` is the trip-chat-specific wrapper
(task #125+); task #137 added `call_tool` here as the general entry
point so OCR field extraction (app.core.ocr.llm_extractor) reuses the
exact same priority/suspension/workload/timeout plumbing instead of a
second copy of it — "AI usage priority" is one shared setting across
every feature that calls an LLM in this codebase, not one per feature.

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
- **Per-provider timeout**: `chat_timeout_<provider>_seconds` (task
  #132, admin-editable) is passed into that provider's own
  `extract_trip_request(..., timeout=...)`, overriding its module-level
  fallback constant. Ollama's default is much higher than the hosted
  providers' — local CPU inference is slower (task #131's live
  measurement: ~41s for a llama3.2:1b tool-call with adequate memory).
- **Failover on failure**: a configured-and-available provider that
  returns None (bad key, API outage, malformed tool-call, a small local
  model that fumbled the extraction, or a timeout) also falls through to
  the next candidate, not just an unconfigured/suspended/busy one.

Only returns None once every candidate has been tried/skipped — same
NO_PROVIDER_CONFIGURED-style honesty as every other optional integration
in this codebase; the caller never gets a fabricated result.
"""

import logging
from datetime import date
from types import ModuleType
from typing import Awaitable, Callable, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat import anthropic_provider, deepseek_provider, ollama_provider, openai_provider, workload
from app.core.chat.schema import TripExtraction
from app.services import settings_service

T = TypeVar("T")

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


def _candidate_order_from_map(settings_map: dict[str, object]) -> list[str]:
    priority = [p for p in _parse_csv_names(settings_map.get("chat_provider_priority")) if p in PROVIDERS]
    for name in DEFAULT_PRIORITY:
        if name not in priority:
            priority.append(name)
    suspended = set(_parse_csv_names(settings_map.get("chat_provider_suspended")))
    return [name for name in priority if name not in suspended]


def _timeout_from_map(settings_map: dict[str, object], name: str) -> float | None:
    value = settings_map.get(f"chat_timeout_{name}_seconds")
    return float(value) if value else None


async def _candidate_order(session: AsyncSession) -> list[str]:
    settings_map = await settings_service.get_typed_settings_map(session)
    return _candidate_order_from_map(settings_map)


async def is_any_provider_available(session: AsyncSession) -> bool:
    """True once at least one non-suspended candidate is actually
    configured. Deliberately ignores current workload — busy is
    transient and doesn't mean "not configured"; a request arriving
    while every candidate is momentarily busy still gets a real attempt,
    just with a live workload check at call time.
    """
    candidates = await _candidate_order(session)
    return any(PROVIDERS[name].is_configured() for name in candidates)


async def _dispatch(session: AsyncSession, attempt: Callable[[ModuleType, float | None], Awaitable[T | None]]) -> T | None:
    """Shared priority/suspension/workload/timeout/failover loop. `attempt`
    is called with (provider_module, resolved_timeout) for each candidate
    in order and must return the result or None on failure — the actual
    request shape (trip extraction vs. a generic tool-call) is entirely
    the caller's concern.
    """
    settings_map = await settings_service.get_typed_settings_map(session)
    candidates = _candidate_order_from_map(settings_map)
    max_concurrent_value = settings_map.get("chat_provider_max_concurrent")
    max_concurrent = int(max_concurrent_value) if max_concurrent_value else DEFAULT_MAX_CONCURRENT

    for name in candidates:
        provider = PROVIDERS[name]
        if not provider.is_configured():
            continue
        if await workload.is_busy(name, max_concurrent=max_concurrent):
            logger.info("chat provider %s busy (>=%s in flight) — trying next candidate", name, max_concurrent)
            continue

        timeout = _timeout_from_map(settings_map, name)
        async with workload.track_inflight(name):
            result = await attempt(provider, timeout)
        if result is not None:
            return result
        logger.info("chat provider %s failed — trying next candidate", name)

    return None


async def extract_trip_request(session: AsyncSession, message: str, *, today: date) -> TripExtraction | None:
    async def attempt(provider: ModuleType, timeout: float | None) -> TripExtraction | None:
        return await provider.extract_trip_request(message, today=today, timeout=timeout)

    return await _dispatch(session, attempt)


async def call_tool(
    session: AsyncSession,
    message: str,
    *,
    system_prompt: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict,
) -> dict | None:
    """Generic tool-call entry point (task #137) — same failover chain as
    extract_trip_request, any tool schema. Used by
    app.core.ocr.llm_extractor for document field extraction.
    """

    async def attempt(provider: ModuleType, timeout: float | None) -> dict | None:
        return await provider.call_tool(
            message,
            system_prompt=system_prompt,
            tool_name=tool_name,
            tool_description=tool_description,
            input_schema=input_schema,
            timeout=timeout,
        )

    return await _dispatch(session, attempt)
