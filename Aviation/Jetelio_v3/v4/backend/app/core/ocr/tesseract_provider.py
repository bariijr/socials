"""Tesseract-based OCR provider for Person/Party documents (task #109).

CPU-only text extraction plus a best-effort, honestly-labeled heuristic for
guessing structured field values near their label text. This is NOT a
verification mechanism — see app.models.document.Document's docstring.
extracted_fields is always a guess for a human to check against
DocumentTypeTemplate.expected_fields at /verify time; nothing in this
module ever sets Document.status. Never raises — every failure mode
(unsupported content type, undecodable file, tesseract binary missing)
returns None so a document just falls back to the same
PENDING_VERIFICATION state it was already in, matching the
NO_PROVIDER_CONFIGURED discipline used everywhere else in this codebase.

Kept as plain functions, not a class-based provider registry — there is
exactly one engine today (same judgment call already made for
app.core.email_client). Promote to an interface if a second engine is
ever added.
"""

import io
import logging
import re
from dataclasses import dataclass, field

import pytesseract
from PIL import Image, UnidentifiedImageError

from app.core.document_template_registry import DOCUMENT_TEMPLATES_BY_TYPE

logger = logging.getLogger(__name__)

_DATE_PATTERN = re.compile(
    r"\b(?:\d{4}-\d{2}-\d{2}"
    r"|\d{1,2}[\/\-\s][A-Za-z]{3,9}[\/\-\s]\d{2,4}"
    r"|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b"
)
_ALNUM_TOKEN_PATTERN = re.compile(r"\b(?=[A-Z0-9\-]{4,20}\b)(?=[A-Z0-9\-]*\d)[A-Z0-9\-]+\b", re.IGNORECASE)
_LABEL_WINDOW_CHARS = 60


@dataclass
class OcrResult:
    raw_text: str
    extracted_fields: dict[str, str] = field(default_factory=dict)
    engine: str = "tesseract"


def _load_image(content: bytes, content_type: str | None) -> Image.Image | None:
    if content_type and content_type.lower().startswith("application/pdf"):
        try:
            import fitz  # PyMuPDF — imported lazily, only needed for PDFs

            pdf = fitz.open(stream=content, filetype="pdf")
            if pdf.page_count == 0:
                return None
            pix = pdf[0].get_pixmap(dpi=200)
            return Image.open(io.BytesIO(pix.tobytes("png")))
        except Exception:
            logger.warning("Failed to render PDF page for OCR", exc_info=True)
            return None
    try:
        return Image.open(io.BytesIO(content))
    except (UnidentifiedImageError, OSError):
        return None


def _guess_field(raw_text: str, label: str, field_type: str) -> str | None:
    label_match = re.search(re.escape(label), raw_text, re.IGNORECASE)
    if label_match is None:
        return None
    window = raw_text[label_match.end() : label_match.end() + _LABEL_WINDOW_CHARS]
    pattern = _DATE_PATTERN if field_type == "date" else _ALNUM_TOKEN_PATTERN
    found = pattern.search(window)
    return found.group(0) if found else None


def extract_text_and_fields(content: bytes, content_type: str | None, doc_type: str) -> OcrResult | None:
    """Returns None on any failure (unsupported/undecodable file, missing
    tesseract binary) — the caller treats that exactly like "no OCR
    provider configured" and leaves the document untouched.
    """
    image = _load_image(content, content_type)
    if image is None:
        return None

    try:
        raw_text = pytesseract.image_to_string(image)
    except pytesseract.TesseractNotFoundError:
        logger.warning("tesseract binary not found on PATH — OCR skipped")
        return None
    except pytesseract.TesseractError:
        logger.warning("tesseract failed to process document", exc_info=True)
        return None

    if not raw_text.strip():
        return OcrResult(raw_text="", extracted_fields={})

    template = DOCUMENT_TEMPLATES_BY_TYPE.get(doc_type)
    extracted_fields: dict[str, str] = {}
    if template is not None:
        for expected in template.expected_fields:
            if expected["type"] == "list":
                continue
            guess = _guess_field(raw_text, expected["label"], expected["type"])
            if guess is not None:
                extracted_fields[expected["key"]] = guess

    return OcrResult(raw_text=raw_text, extracted_fields=extracted_fields)
