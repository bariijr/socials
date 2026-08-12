"""Real Tesseract calls, no mocking — same "test against the real thing"
discipline this codebase uses for MailHog/MinIO (task #103, #109). Needs
the tesseract-ocr binary on PATH, which both the runtime and test Docker
stages install (backend/Dockerfile).
"""

import io

from PIL import Image, ImageDraw, ImageFont

from app.core.ocr.tesseract_provider import extract_text_and_fields


def _synthetic_document_png(lines: list[str]) -> bytes:
    image = Image.new("RGB", (700, 60 * len(lines) + 40), color="white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=36)
    for i, line in enumerate(lines):
        draw.text((20, 20 + i * 60), line, fill="black", font=font)
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


class TestExtractTextAndFields:
    def test_extracts_raw_text_from_a_real_image(self):
        content = _synthetic_document_png(["PASSPORT NUMBER P1234567"])
        result = extract_text_and_fields(content, "image/png", "PASSPORT")
        assert result is not None
        assert "P1234567" in result.raw_text.replace(" ", "")

    def test_guesses_a_field_near_its_label(self):
        content = _synthetic_document_png(["Passport number P1234567", "Expiry date 2030-01-15"])
        result = extract_text_and_fields(content, "image/png", "PASSPORT")
        assert result is not None
        assert result.extracted_fields.get("passport_number") == "P1234567"
        assert result.extracted_fields.get("expires_on") == "2030-01-15"

    def test_list_type_fields_are_never_guessed(self):
        content = _synthetic_document_png(["Type ratings B737 A320"])
        result = extract_text_and_fields(content, "image/png", "PILOT_LICENSE")
        assert result is not None
        assert "ratings" not in result.extracted_fields

    def test_unsupported_content_returns_none(self):
        assert extract_text_and_fields(b"not an image", "text/plain", "PASSPORT") is None

    def test_corrupt_image_bytes_return_none(self):
        assert extract_text_and_fields(b"\x89PNGnot-actually-valid", "image/png", "PASSPORT") is None

    def test_unknown_doc_type_still_returns_raw_text_with_no_fields(self):
        content = _synthetic_document_png(["Some text"])
        result = extract_text_and_fields(content, "image/png", "NOT_A_REAL_TEMPLATE")
        assert result is not None
        assert result.extracted_fields == {}
