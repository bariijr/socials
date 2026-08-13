"""Anthropic-backed LLM tool-calling — one of four interchangeable
providers (task #130: ollama/deepseek/anthropic/openai all wired at
once, admin picks priority via named settings) after Anthropic alone
hit a real billing wall (task #125, credit balance too low). Talks to
the Messages API directly over `httpx` (already a dependency throughout
this backend) rather than adding the `anthropic` SDK for one endpoint —
same reasoning as the other three provider modules in this package.

`call_tool` is the generic primitive (any tool schema/system prompt —
task #137 reuses it for OCR field extraction, not just trip-chat).
`extract_trip_request` is a thin wrapper over it using
app.core.chat.schema's trip-specific contract, kept so
app.services.trip_chat_service's existing call site/tests are untouched.
See app.core.chat.dispatcher for how the admin's priority/suspension
choice picks this module over the other three.

Never raises — every failure mode (no API key configured, network/API
error, a malformed or missing tool-use block) returns None, the same
NO_PROVIDER_CONFIGURED-style honesty as app.core.ocr.tesseract_provider
and app.core.email_client.
"""

import logging
from datetime import date

import httpx

from app.config import get_settings
from app.core.chat.schema import (
    INPUT_SCHEMA,
    SYSTEM_PROMPT,
    TOOL_DESCRIPTION,
    TOOL_NAME,
    TripExtraction,
    parse_extraction,
)

logger = logging.getLogger(__name__)

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
MODEL = "claude-sonnet-5"
# Fallback only — app.core.chat.dispatcher normally passes the live
# chat_timeout_anthropic_seconds named setting (task #132) as `timeout`.
REQUEST_TIMEOUT_SECONDS = 30.0


def is_configured() -> bool:
    return bool(get_settings().anthropic_api_key)


async def call_tool(
    message: str,
    *,
    system_prompt: str,
    tool_name: str,
    tool_description: str,
    input_schema: dict,
    timeout: float | None = None,
) -> dict | None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None
    request_timeout = timeout if timeout is not None else REQUEST_TIMEOUT_SECONDS

    payload = {
        "model": MODEL,
        "max_tokens": 2048,
        "system": system_prompt,
        "messages": [{"role": "user", "content": message}],
        "tools": [{"name": tool_name, "description": tool_description, "input_schema": input_schema}],
        "tool_choice": {"type": "tool", "name": tool_name},
    }

    try:
        async with httpx.AsyncClient(timeout=request_timeout) as client:
            response = await client.post(
                API_URL,
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": API_VERSION,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except Exception:
        logger.warning("Anthropic tool-call request failed", exc_info=True)
        return None

    try:
        tool_block = next(block for block in body["content"] if block.get("type") == "tool_use")
        return tool_block["input"]
    except (KeyError, TypeError, StopIteration):
        logger.warning("Anthropic tool-call response had no usable tool-use block", exc_info=True)
        return None


async def extract_trip_request(message: str, *, today: date, timeout: float | None = None) -> TripExtraction | None:
    raw = await call_tool(
        message,
        system_prompt=SYSTEM_PROMPT.format(today=today.isoformat()),
        tool_name=TOOL_NAME,
        tool_description=TOOL_DESCRIPTION,
        input_schema=INPUT_SCHEMA,
        timeout=timeout,
    )
    if raw is None:
        return None
    try:
        return parse_extraction(raw)
    except Exception:
        logger.warning("Anthropic trip extraction tool-use input did not match the expected shape", exc_info=True)
        return None
