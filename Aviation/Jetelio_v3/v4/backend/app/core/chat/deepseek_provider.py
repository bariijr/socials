"""DeepSeek-backed trip-request extraction (task #127 — swapped from
Anthropic, task #125/§7.19, after the user's Anthropic account hit a
billing wall; user's explicit choice and API key). DeepSeek's chat API is
OpenAI-compatible, so this talks to it directly over `httpx` (already a
dependency throughout this backend) rather than pulling in a whole
provider SDK for one endpoint.

See app.core.chat.schema for the shared, provider-agnostic extraction
contract — this module only wraps that schema into DeepSeek's request
shape and unwraps its response, same split app.core.chat.anthropic_provider
used before it (now removed; the schema module is what made the swap not
touch app.services.trip_chat_service at all).

Never raises — every failure mode (no API key configured, network/API
error, a malformed or missing tool-call) returns None, the same
NO_PROVIDER_CONFIGURED-style honesty as app.core.ocr.tesseract_provider
and app.core.email_client.
"""

import json
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

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"
REQUEST_TIMEOUT_SECONDS = 30.0


async def extract_trip_request(message: str, *, today: date) -> TripExtraction | None:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return None

    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.format(today=today.isoformat())},
            {"role": "user", "content": message},
        ],
        "tools": [
            {
                "type": "function",
                "function": {"name": TOOL_NAME, "description": TOOL_DESCRIPTION, "parameters": INPUT_SCHEMA},
            }
        ],
        "tool_choice": {"type": "function", "function": {"name": TOOL_NAME}},
        "max_tokens": 2048,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                API_URL,
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}", "Content-Type": "application/json"},
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except Exception:
        logger.warning("DeepSeek trip extraction request failed", exc_info=True)
        return None

    try:
        tool_calls = body["choices"][0]["message"]["tool_calls"]
        arguments_json = tool_calls[0]["function"]["arguments"]
        raw = json.loads(arguments_json)
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("DeepSeek trip extraction response had no usable tool call", exc_info=True)
        return None

    try:
        return parse_extraction(raw)
    except Exception:
        logger.warning("DeepSeek trip extraction tool-call arguments did not match the expected shape", exc_info=True)
        return None
