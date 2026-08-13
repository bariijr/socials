"""LLM-assisted structured field extraction from already-OCR'd document
text (task #137) — text-first, per explicit user choice: Tesseract
(tesseract_provider.py) already produces raw_text cheaply and locally on
every run; this hands that text to whichever chat provider the SAME
chat_provider_priority/chat_provider_suspended/chat_timeout_*/
chat_provider_max_concurrent named settings currently prefer — the
identical AI-provider plumbing task #131 built for trip-chat
(app.core.chat.dispatcher.call_tool), not a second, parallel copy of it.
"AI usage priority" is one shared setting across every feature in this
codebase that calls an LLM, not one per feature.

The field schema for a given doc_type is built directly from
app.core.document_template_registry.DOCUMENT_TEMPLATES_BY_TYPE — the same
source of truth tesseract_provider.py's regex guesser already reads, so
adding/renaming an expected field in one place updates both extraction
paths.

Still no more authoritative than the regex guesser it augments —
extracted_fields stays a best-effort suggestion a human checks at
/verify time, never something that sets Document.status itself (see
tesseract_provider.py's docstring, same discipline). Never raises: any
failure (no provider available/configured, malformed response, no
expected fields for this doc_type) returns None and the caller falls
back to the regex guess, never a blank document.
"""

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.chat import dispatcher as chat_dispatcher
from app.core.document_template_registry import DocumentTemplateDefinition

logger = logging.getLogger(__name__)

TOOL_NAME = "extract_document_fields"
TOOL_DESCRIPTION = (
    "Extract structured field values from raw OCR text taken from a scanned document. "
    "Only extract what the text actually contains — never infer or invent a value that "
    "isn't genuinely present."
)

SYSTEM_PROMPT_TEMPLATE = """You extract structured field values from raw OCR text taken from a scanned {doc_name}. \
The OCR text may contain scan noise, broken lines, or misread characters near the real values — use judgement, \
but never invent a value that isn't genuinely present in the text. Leave a field null rather than guessing if \
you aren't reasonably confident it's correct. Resolve dates to ISO 8601 (YYYY-MM-DD) only when the source \
format is unambiguous; otherwise leave that field null rather than guessing the format."""


def _build_input_schema(template: DocumentTemplateDefinition) -> dict:
    properties: dict[str, dict] = {}
    for f in template.expected_fields:
        if f["type"] == "list":
            properties[f["key"]] = {
                "type": ["array", "null"],
                "items": {"type": "string"},
                "description": f["label"],
            }
        elif f["type"] == "date":
            properties[f["key"]] = {
                "type": ["string", "null"],
                "description": f"{f['label']} — ISO 8601 (YYYY-MM-DD) if present and unambiguous, else null.",
            }
        else:
            properties[f["key"]] = {"type": ["string", "null"], "description": f["label"]}
    return {"type": "object", "properties": properties, "required": []}


def _coerce_fields(raw: dict, template: DocumentTemplateDefinition) -> dict[str, str]:
    """Only keeps keys the template actually defines (an LLM adding an
    unrequested key is ignored, not trusted), stringifies list values
    (Document.extracted_fields is dict[str, str], matching the regex
    guesser's shape), and drops null/empty guesses — a field the LLM
    isn't confident about simply doesn't appear, same as the regex path
    never populating a key it couldn't guess.
    """
    out: dict[str, str] = {}
    for f in template.expected_fields:
        value = raw.get(f["key"])
        if value is None or value == "" or value == []:
            continue
        out[f["key"]] = ", ".join(str(v) for v in value) if isinstance(value, list) else str(value)
    return out


async def extract_fields_via_llm(
    session: AsyncSession, raw_text: str, template: DocumentTemplateDefinition
) -> dict[str, str] | None:
    if not raw_text.strip() or not template.expected_fields:
        return None

    raw = await chat_dispatcher.call_tool(
        session,
        raw_text,
        system_prompt=SYSTEM_PROMPT_TEMPLATE.format(doc_name=template.name.lower()),
        tool_name=TOOL_NAME,
        tool_description=TOOL_DESCRIPTION,
        input_schema=_build_input_schema(template),
    )
    if raw is None:
        return None
    try:
        return _coerce_fields(raw, template)
    except Exception:
        logger.warning("LLM document-field extraction returned an unusable shape", exc_info=True)
        return None
