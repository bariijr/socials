"""app.core.ocr.llm_extractor — schema generation per doc_type, field
coercion, and null-handling for the text-first LLM extraction pass added
on top of Tesseract's regex guesser (task #137). The chat provider call
itself is always mocked here (never hit a real API from an automated
test, same discipline as test_chat_dispatcher.py/test_trip_chat_service.py)
— this file exercises the OCR-specific logic around that call: building a
correct JSON-schema per document type from
app.core.document_template_registry, and turning an LLM's raw dict answer
into the same dict[str, str] shape Document.extracted_fields expects.
"""

from datetime import date

import pytest

from app.core.chat import dispatcher as chat_dispatcher
from app.core.document_template_registry import DOCUMENT_TEMPLATES_BY_TYPE
from app.core.ocr import llm_extractor


class TestBuildInputSchema:
    def test_string_field(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        schema = llm_extractor._build_input_schema(template)
        assert schema["properties"]["passport_number"] == {
            "type": ["string", "null"],
            "description": "Passport number",
        }

    def test_date_field_mentions_iso_format(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        schema = llm_extractor._build_input_schema(template)
        assert schema["properties"]["expires_on"]["type"] == ["string", "null"]
        assert "YYYY-MM-DD" in schema["properties"]["expires_on"]["description"]

    def test_list_field(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PILOT_LICENSE"]
        schema = llm_extractor._build_input_schema(template)
        assert schema["properties"]["ratings"]["type"] == ["array", "null"]
        assert schema["properties"]["ratings"]["items"] == {"type": "string"}

    def test_no_field_is_required(self):
        # Every field must be optional — an LLM that's unsure about one
        # field must never be forced to invent a value just to produce a
        # schema-valid response for the others.
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        schema = llm_extractor._build_input_schema(template)
        assert schema["required"] == []


class TestCoerceFields:
    def test_drops_null_and_empty_values(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        raw = {"passport_number": "P1234567", "issuing_country_iso3": None, "issued_on": ""}
        out = llm_extractor._coerce_fields(raw, template)
        assert out == {"passport_number": "P1234567"}

    def test_ignores_keys_not_in_template(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        raw = {"passport_number": "P1234567", "made_up_field": "should not appear"}
        out = llm_extractor._coerce_fields(raw, template)
        assert "made_up_field" not in out

    def test_joins_list_values_into_a_string(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PILOT_LICENSE"]
        raw = {"ratings": ["B737", "A320"]}
        out = llm_extractor._coerce_fields(raw, template)
        assert out["ratings"] == "B737, A320"

    def test_empty_list_is_dropped(self):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PILOT_LICENSE"]
        raw = {"ratings": []}
        out = llm_extractor._coerce_fields(raw, template)
        assert "ratings" not in out

    def test_literal_null_like_strings_are_dropped(self):
        # Real failure mode found live-testing against a real scanned
        # document (task #137): a model emitted the text "null" as a
        # JSON string value instead of the real null token.
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        raw = {"passport_number": "P1234567", "issuing_country_iso3": "null", "issued_on": "N/A"}
        out = llm_extractor._coerce_fields(raw, template)
        assert out == {"passport_number": "P1234567"}


class TestExtractFieldsViaLlm:
    @pytest.mark.asyncio
    async def test_returns_none_for_blank_text(self, session):
        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        result = await llm_extractor.extract_fields_via_llm(session, "   ", template)
        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_provider_available(self, session, monkeypatch):
        async def _no_provider(session, message, *, system_prompt, tool_name, tool_description, input_schema):
            return None

        monkeypatch.setattr(chat_dispatcher, "call_tool", _no_provider)

        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        result = await llm_extractor.extract_fields_via_llm(session, "some ocr text", template)
        assert result is None

    @pytest.mark.asyncio
    async def test_passes_doc_specific_system_prompt_and_schema_to_dispatcher(self, session, monkeypatch):
        captured = {}

        async def _capture(session, message, *, system_prompt, tool_name, tool_description, input_schema):
            captured["message"] = message
            captured["system_prompt"] = system_prompt
            captured["tool_name"] = tool_name
            captured["input_schema"] = input_schema
            return {"passport_number": "P9999999"}

        monkeypatch.setattr(chat_dispatcher, "call_tool", _capture)

        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        result = await llm_extractor.extract_fields_via_llm(session, "raw ocr text here", template)

        assert result == {"passport_number": "P9999999"}
        assert captured["message"] == "raw ocr text here"
        assert "passport" in captured["system_prompt"].lower()
        assert captured["tool_name"] == llm_extractor.TOOL_NAME
        assert "passport_number" in captured["input_schema"]["properties"]

    @pytest.mark.asyncio
    async def test_malformed_dispatcher_response_returns_none_not_raises(self, session, monkeypatch):
        async def _bad_shape(session, message, *, system_prompt, tool_name, tool_description, input_schema):
            return "not a dict"  # a real provider bug/edge case must never crash OCR

        monkeypatch.setattr(chat_dispatcher, "call_tool", _bad_shape)

        template = DOCUMENT_TEMPLATES_BY_TYPE["PASSPORT"]
        result = await llm_extractor.extract_fields_via_llm(session, "raw ocr text", template)
        assert result is None
