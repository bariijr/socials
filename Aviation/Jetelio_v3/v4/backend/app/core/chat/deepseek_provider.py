"""DeepSeek-backed trip-request extraction — one of four interchangeable
providers (task #130: ollama/deepseek/anthropic/openai all wired at once,
admin picks via the chat_provider named setting) after DeepSeek alone hit a
real billing wall (task #127, credit balance too low). DeepSeek's chat API
is OpenAI-compatible, so this talks to it directly over `httpx` (already a
dependency throughout this backend) rather than pulling in a whole
provider SDK for one endpoint.

See app.core.chat.schema for the shared, provider-agnostic extraction
contract — this module only wraps that schema into DeepSeek's request
shape and unwraps its response. See app.core.chat.dispatcher for how the
admin's provider choice picks this module over the other three.

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
# Fallback only — app.core.chat.dispatcher normally passes the live
# chat_timeout_deepseek_seconds named setting (task #132) as `timeout`.
REQUEST_TIMEOUT_SECONDS = 30.0


def is_configured() -> bool:
    return bool(get_settings().deepseek_api_key)


async def extract_trip_request(message: str, *, today: date, timeout: float | None = None) -> TripExtraction | None:
    settings = get_settings()
    if not settings.deepseek_api_key:
        return None
    request_timeout = timeout if timeout is not None else REQUEST_TIMEOUT_SECONDS

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
        async with httpx.AsyncClient(timeout=request_timeout) as client:
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
