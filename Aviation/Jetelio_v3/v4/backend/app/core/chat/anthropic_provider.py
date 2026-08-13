"""Anthropic-backed trip-request extraction — one of four interchangeable
providers (task #130: ollama/deepseek/anthropic/openai all wired at once,
admin picks via the chat_provider named setting) after Anthropic alone hit
a real billing wall (task #125, credit balance too low). Talks to the
Messages API directly over `httpx` (already a dependency throughout this
backend) rather than adding the `anthropic` SDK for one endpoint — same
reasoning as the other three provider modules in this package.

See app.core.chat.schema for the shared, provider-agnostic extraction
contract — this module only wraps that schema into Anthropic's tool-use
request shape and unwraps its response. See app.core.chat.dispatcher for
how the admin's provider choice picks this module over the other three.

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
REQUEST_TIMEOUT_SECONDS = 30.0


def is_configured() -> bool:
    return bool(get_settings().anthropic_api_key)


async def extract_trip_request(message: str, *, today: date) -> TripExtraction | None:
    settings = get_settings()
    if not settings.anthropic_api_key:
        return None

    payload = {
        "model": MODEL,
        "max_tokens": 2048,
        "system": SYSTEM_PROMPT.format(today=today.isoformat()),
        "messages": [{"role": "user", "content": message}],
        "tools": [{"name": TOOL_NAME, "description": TOOL_DESCRIPTION, "input_schema": INPUT_SCHEMA}],
        "tool_choice": {"type": "tool", "name": TOOL_NAME},
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
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
        logger.warning("Anthropic trip extraction request failed", exc_info=True)
        return None

    try:
        tool_block = next(block for block in body["content"] if block.get("type") == "tool_use")
        raw = tool_block["input"]
    except (KeyError, TypeError, StopIteration):
        logger.warning("Anthropic trip extraction response had no usable tool-use block", exc_info=True)
        return None

    try:
        return parse_extraction(raw)
    except Exception:
        logger.warning("Anthropic trip extraction tool-use input did not match the expected shape", exc_info=True)
        return None
