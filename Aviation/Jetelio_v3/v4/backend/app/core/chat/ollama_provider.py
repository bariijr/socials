"""Ollama-backed trip-request extraction — one of four interchangeable
providers (task #130: ollama/deepseek/anthropic/openai all wired at once,
admin picks via the chat_provider named setting). Self-hosted, no API
key/billing, originally added standalone in task #129 after DeepSeek
(task #127) and Anthropic (task #125) both hit real billing walls. Ollama
exposes an OpenAI-compatible chat endpoint, so this talks to it directly
over `httpx` (already a dependency throughout this backend), same shape
as the other three provider modules in this package.

See app.core.chat.schema for the shared, provider-agnostic extraction
contract — this module only wraps that schema into the request shape and
unwraps the response. See app.core.chat.dispatcher for how the admin's
provider choice picks this module over the other three.

Never raises — every failure mode (no base URL configured, network/API
error, a malformed or missing tool-call, or a small local model that
doesn't honor tool_choice reliably) returns None, the same
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

# Live-measured: a real llama3.2:1b tool-call on CPU took ~41s with the
# container able to actually hold the model in memory (task #131 finding —
# under a tighter memory limit it thrashes to disk and takes far longer).
# 60s was cutting that margin close; give real headroom above the
# measured baseline rather than a round-number guess.
REQUEST_TIMEOUT_SECONDS = 120.0


def is_configured() -> bool:
    return bool(get_settings().ollama_base_url)


async def extract_trip_request(message: str, *, today: date) -> TripExtraction | None:
    settings = get_settings()
    if not settings.ollama_base_url:
        return None

    payload = {
        "model": settings.ollama_model,
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
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/v1/chat/completions",
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except Exception:
        logger.warning("Ollama trip extraction request failed", exc_info=True)
        return None

    try:
        tool_calls = body["choices"][0]["message"]["tool_calls"]
        arguments = tool_calls[0]["function"]["arguments"]
        # Ollama's OpenAI-compat layer returns this as a dict on some
        # versions and a JSON string on others — handle both rather than
        # assuming one, since a small local model's exact output shape is
        # less predictable than a hosted provider's.
        raw = json.loads(arguments) if isinstance(arguments, str) else arguments
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("Ollama trip extraction response had no usable tool call", exc_info=True)
        return None

    try:
        return parse_extraction(raw)
    except Exception:
        logger.warning("Ollama trip extraction tool-call arguments did not match the expected shape", exc_info=True)
        return None
