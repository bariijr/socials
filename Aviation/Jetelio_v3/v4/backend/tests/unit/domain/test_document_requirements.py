from datetime import date

from app.domain.document_requirements import (
    AvailableDocument,
    DocumentRequirementStatus,
    match_document_type,
    resolve_required_documents,
)

TODAY = date(2026, 6, 1)


class TestMatchDocumentType:
    def test_matches_plain_keyword(self):
        assert match_document_type("Insurance") == "INSURANCE"

    def test_matches_case_insensitively(self):
        assert match_document_type("aircraft insurance certificate") == "INSURANCE"

    def test_prefers_longest_keyword_match(self):
        # "certificate of airworthiness" should resolve to COFA, not the
        # shorter "airworthiness" substring landing on AIRWORTHINESS.
        assert match_document_type("Certificate of Airworthiness") == "COFA"

    def test_aoc_abbreviation_matches_operator_certificate(self):
        assert match_document_type("Copy of AOC") == "OPERATOR_CERTIFICATE"

    def test_unrecognized_requirement_returns_none(self):
        assert match_document_type("General Declaration (GenDec)") is None


class TestResolveRequiredDocuments:
    def test_valid_document_is_attached(self):
        available = [AvailableDocument("INSURANCE", "doc-1", "ins.pdf", "application/pdf", date(2027, 1, 1), "AIRCRAFT")]
        results = resolve_required_documents(["Insurance Certificate"], available, TODAY)
        assert results[0].status == DocumentRequirementStatus.ATTACHED
        assert results[0].document_id == "doc-1"

    def test_expired_document_is_flagged_not_silently_attached(self):
        available = [AvailableDocument("INSURANCE", "doc-1", "ins.pdf", "application/pdf", date(2025, 1, 1), "AIRCRAFT")]
        results = resolve_required_documents(["Insurance Certificate"], available, TODAY)
        assert results[0].status == DocumentRequirementStatus.EXPIRED

    def test_no_document_on_file_is_missing(self):
        results = resolve_required_documents(["Insurance Certificate"], [], TODAY)
        assert results[0].status == DocumentRequirementStatus.MISSING
        assert results[0].doc_type == "INSURANCE"

    def test_unmatchable_free_text_is_unmatched_not_silently_skipped(self):
        results = resolve_required_documents(["General Declaration"], [], TODAY)
        assert results[0].status == DocumentRequirementStatus.UNMATCHED
        assert results[0].doc_type is None

    def test_document_expiring_exactly_today_still_counts_as_valid(self):
        available = [AvailableDocument("REGISTRATION", "doc-1", "reg.pdf", "application/pdf", TODAY, "AIRCRAFT")]
        results = resolve_required_documents(["Registration"], available, TODAY)
        assert results[0].status == DocumentRequirementStatus.ATTACHED

    def test_document_with_no_expiry_never_expires(self):
        available = [AvailableDocument("OPERATOR_CERTIFICATE", "doc-1", "aoc.pdf", "application/pdf", None, "PARTY")]
        results = resolve_required_documents(["AOC"], available, TODAY)
        assert results[0].status == DocumentRequirementStatus.ATTACHED

    def test_multiple_requirements_resolve_independently(self):
        available = [AvailableDocument("INSURANCE", "doc-1", "ins.pdf", "application/pdf", date(2027, 1, 1), "AIRCRAFT")]
        results = resolve_required_documents(["Insurance Certificate", "Noise Certificate"], available, TODAY)
        assert results[0].status == DocumentRequirementStatus.ATTACHED
        assert results[1].status == DocumentRequirementStatus.MISSING
        assert results[1].doc_type == "NOISE_CERTIFICATE"
