"""app.core.chat.dispatcher — priority order, suspension, and
workload-based failover across the four wired chat providers (task #131).
Every provider call is mocked here (never hit a real API/local model from
an automated test); this file exercises the dispatcher's own routing
logic, which is real, novel code with real failure-mode risk — get it
wrong and every request either piles onto one provider or silently never
reaches a configured, working one.

Every test explicitly monkeypatches `is_configured` on all four provider
modules rather than relying on whatever real keys happen to be present in
.env for this environment — deterministic, not coupled to ambient secrets.
"""

from datetime import date

import pytest

from app.core.chat import dispatcher, workload
from app.core.chat.schema import TripExtraction
from app.models.settings import Setting

TODAY = date(2026, 8, 13)


def _extraction(tag: str) -> TripExtraction:
    return TripExtraction(
        aircraft_registration=tag,
        aircraft_type_query=None,
        operator_name=None,
        crew_count=None,
        pax_count=None,
        legs=[],
    )


def _set_all_configured(monkeypatch, *, configured: dict[str, bool]) -> None:
    for name, module in dispatcher.PROVIDERS.items():
        monkeypatch.setattr(module, "is_configured", lambda c=configured.get(name, False): c)


async def _set_setting(session, key: str, value: str) -> str:
    setting = await session.get(Setting, key)
    original = setting.value
    setting.value = value
    await session.commit()
    return original


async def _restore_setting(session, key: str, original: str) -> None:
    setting = await session.get(Setting, key)
    setting.value = original
    await session.commit()


class TestPriorityOrder:
    @pytest.mark.asyncio
    async def test_first_configured_candidate_in_priority_order_wins(self, session, monkeypatch):
        calls: list[str] = []

        async def _ollama_extract(message, *, today, timeout=None):
            calls.append("ollama")
            return _extraction("from-ollama")

        async def _deepseek_extract(message, *, today, timeout=None):
            calls.append("deepseek")
            return _extraction("from-deepseek")

        _set_all_configured(monkeypatch, configured={"ollama": True, "deepseek": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["ollama"], "extract_trip_request", _ollama_extract)
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _deepseek_extract)

        original = await _set_setting(session, "chat_provider_priority", "deepseek,ollama,anthropic,openai")
        try:
            result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original)

        assert result is not None
        assert result.aircraft_registration == "from-deepseek"
        assert calls == ["deepseek"]  # ollama never called — deepseek came first and succeeded

    @pytest.mark.asyncio
    async def test_unconfigured_candidate_is_skipped(self, session, monkeypatch):
        async def _deepseek_extract(message, *, today, timeout=None):
            return _extraction("from-deepseek")

        _set_all_configured(monkeypatch, configured={"deepseek": True})  # ollama NOT configured
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _deepseek_extract)

        original = await _set_setting(session, "chat_provider_priority", "ollama,deepseek,anthropic,openai")
        try:
            result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original)

        assert result is not None
        assert result.aircraft_registration == "from-deepseek"

    @pytest.mark.asyncio
    async def test_provider_missing_from_priority_list_still_gets_a_chance(self, session, monkeypatch):
        # Priority list only names two of the four — openai isn't one of
        # them, but is still configured and should be appended at the end
        # rather than becoming permanently unreachable.
        async def _openai_extract(message, *, today, timeout=None):
            return _extraction("from-openai")

        _set_all_configured(monkeypatch, configured={"openai": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["openai"], "extract_trip_request", _openai_extract)

        original = await _set_setting(session, "chat_provider_priority", "ollama,deepseek")
        try:
            result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original)

        assert result is not None
        assert result.aircraft_registration == "from-openai"


class TestSuspension:
    @pytest.mark.asyncio
    async def test_suspended_provider_is_skipped_even_if_first_in_priority(self, session, monkeypatch):
        calls: list[str] = []

        async def _ollama_extract(message, *, today, timeout=None):
            calls.append("ollama")
            return _extraction("from-ollama")

        async def _deepseek_extract(message, *, today, timeout=None):
            calls.append("deepseek")
            return _extraction("from-deepseek")

        _set_all_configured(monkeypatch, configured={"ollama": True, "deepseek": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["ollama"], "extract_trip_request", _ollama_extract)
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _deepseek_extract)

        original_priority = await _set_setting(session, "chat_provider_priority", "ollama,deepseek,anthropic,openai")
        original_suspended = await _set_setting(session, "chat_provider_suspended", "ollama")
        try:
            result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original_priority)
            await _restore_setting(session, "chat_provider_suspended", original_suspended)

        assert result is not None
        assert result.aircraft_registration == "from-deepseek"
        assert "ollama" not in calls

    @pytest.mark.asyncio
    async def test_all_suspended_or_unconfigured_reports_unavailable(self, session, monkeypatch):
        _set_all_configured(monkeypatch, configured={})  # none configured

        result = await dispatcher.is_any_provider_available(session)
        assert result is False


class TestFailoverOnFailure:
    @pytest.mark.asyncio
    async def test_configured_provider_returning_none_falls_through_to_next(self, session, monkeypatch):
        async def _ollama_extract(message, *, today, timeout=None):
            return None  # e.g. small local model fumbled the extraction

        async def _deepseek_extract(message, *, today, timeout=None):
            return _extraction("from-deepseek")

        _set_all_configured(monkeypatch, configured={"ollama": True, "deepseek": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["ollama"], "extract_trip_request", _ollama_extract)
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _deepseek_extract)

        original = await _set_setting(session, "chat_provider_priority", "ollama,deepseek,anthropic,openai")
        try:
            result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original)

        assert result is not None
        assert result.aircraft_registration == "from-deepseek"

    @pytest.mark.asyncio
    async def test_every_candidate_failing_returns_none(self, session, monkeypatch):
        async def _always_none(message, *, today, timeout=None):
            return None

        _set_all_configured(monkeypatch, configured={"ollama": True, "deepseek": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["ollama"], "extract_trip_request", _always_none)
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _always_none)

        result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        assert result is None


class TestWorkloadFailover:
    @pytest.mark.asyncio
    async def test_busy_provider_is_skipped_in_favor_of_next(self, session, monkeypatch):
        calls: list[str] = []

        async def _ollama_extract(message, *, today, timeout=None):
            calls.append("ollama")
            return _extraction("from-ollama")

        async def _deepseek_extract(message, *, today, timeout=None):
            calls.append("deepseek")
            return _extraction("from-deepseek")

        _set_all_configured(monkeypatch, configured={"ollama": True, "deepseek": True})
        monkeypatch.setattr(dispatcher.PROVIDERS["ollama"], "extract_trip_request", _ollama_extract)
        monkeypatch.setattr(dispatcher.PROVIDERS["deepseek"], "extract_trip_request", _deepseek_extract)

        original_priority = await _set_setting(session, "chat_provider_priority", "ollama,deepseek,anthropic,openai")
        original_max = await _set_setting(session, "chat_provider_max_concurrent", "1")
        try:
            # Occupy ollama's one concurrency slot before the real call.
            async with workload.track_inflight("ollama"):
                result = await dispatcher.extract_trip_request(session, "irrelevant", today=TODAY)
        finally:
            await _restore_setting(session, "chat_provider_priority", original_priority)
            await _restore_setting(session, "chat_provider_max_concurrent", original_max)
            # Clean up regardless of assertion outcome below.
            from app.core.redis_client import get_redis

            await get_redis().delete("chat:inflight:ollama")

        assert result is not None
        assert result.aircraft_registration == "from-deepseek"
        assert "ollama" not in calls

    @pytest.mark.asyncio
    async def test_track_inflight_decrements_after_use(self):
        assert await workload.current_inflight("test-provider-xyz") == 0
        async with workload.track_inflight("test-provider-xyz"):
            assert await workload.current_inflight("test-provider-xyz") == 1
        assert await workload.current_inflight("test-provider-xyz") == 0
