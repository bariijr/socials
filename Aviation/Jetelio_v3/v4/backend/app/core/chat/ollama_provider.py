"""Ollama-backed LLM tool-calling — one of four interchangeable providers
(task #130: ollama/deepseek/anthropic/openai all wired at once, admin
picks priority via named settings). Self-hosted, no API key/billing,
originally added standalone in task #129 after DeepSeek (task #127) and
Anthropic (task #125) both hit real billing walls. Ollama exposes an
OpenAI-compatible chat endpoint, so this talks to it directly over
`httpx` (already a dependency throughout this backend), same shape as
the other three provider modules in this package.

`call_tool` is the generic primitive (any tool schema/system prompt —
task #137 reuses it for OCR field extraction, not just trip-chat).
`extract_trip_request` is a thin wrapper over it using
app.core.chat.schema's trip-specific contract, kept so
app.services.trip_chat_service's existing call site/tests are untouched.
See app.core.chat.dispatcher for how the admin's priority/suspension
choice picks this module over the other three.

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

# Fallback only — app.core.chat.dispatcher normally passes the live
# chat_timeout_ollama_seconds named setting (task #132, admin-editable
# without a deploy) as the `timeout` kwarg below. This constant only
# matters when a provider function is called directly without one (e.g.
# a script). Live-measured: a real llama3.2:1b tool-call on CPU took ~41s
# with the container able to actually hold the model in memory (task #131
# — under a tighter memory limit it thrashes to disk and takes far
# longer), so 60s was cutting that margin close.
REQUEST_TIMEOUT_SECONDS = 120.0


def is_configured() -> bool:
    return bool(get_settings().ollama_base_url)


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
    if not settings.ollama_base_url:
        return None
    request_timeout = timeout if timeout is not None else REQUEST_TIMEOUT_SECONDS

    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message},
        ],
        "tools": [
            {
                "type": "function",
                "function": {"name": tool_name, "description": tool_description, "parameters": input_schema},
            }
        ],
        "tool_choice": {"type": "function", "function": {"name": tool_name}},
        "stream": False,
    }

    try:
        async with httpx.AsyncClient(timeout=request_timeout) as client:
            response = await client.post(
                f"{settings.ollama_base_url.rstrip('/')}/v1/chat/completions",
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
    except Exception:
        logger.warning("Ollama tool-call request failed", exc_info=True)
        return None

    try:
        tool_calls = body["choices"][0]["message"]["tool_calls"]
        arguments = tool_calls[0]["function"]["arguments"]
        # Ollama's OpenAI-compat layer returns this as a dict on some
        # versions and a JSON string on others — handle both rather than
        # assuming one, since a small local model's exact output shape is
        # less predictable than a hosted provider's.
        return json.loads(arguments) if isinstance(arguments, str) else arguments
    except (KeyError, IndexError, TypeError, ValueError):
        logger.warning("Ollama tool-call response had no usable tool call", exc_info=True)
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
        logger.warning("Ollama trip extraction tool-call arguments did not match the expected shape", exc_info=True)
        return None
