import pytest

from app.domain.service_catalogue import ServiceCatalogueImportError, ServiceRef, derive_parent


def _services():
    return {
        "GH": ServiceRef(id="svc-gh-id", code="GH", category="GROUND"),
        "OVF": ServiceRef(id="svc-ovf-id", code="OVF", category="PERMIT"),
        "LDG": ServiceRef(id="svc-ldg-id", code="LDG", category="PERMIT"),
        "FUL": ServiceRef(id="svc-ful-id", code="FUL", category="GROUND"),
    }


class TestDeriveParent:
    def test_code_prefix_match_is_authoritative(self):
        """This is the actual fix for the SS-017+ off-by-one defect: the
        code prefix wins even when it disagrees with the source's stated
        parent.
        """
        result = derive_parent(
            sub_service_code="FUL-JTA", stated_parent_service_code="LDG", services_by_code=_services()
        )
        assert result.parent_id == "svc-ful-id"
        assert result.category == "GROUND"
        assert "code prefix" in result.mapping_audit

    def test_code_prefix_match_agrees_with_stated_parent(self):
        result = derive_parent(sub_service_code="GH-RMP", stated_parent_service_code="GH", services_by_code=_services())
        assert result.parent_id == "svc-gh-id"

    def test_ambiguous_prefix_falls_back_to_stated_parent(self):
        """'PRM' is shared by both OVF and LDG in the real catalogue —
        cannot be split by prefix alone, so the source's stated parent is
        trusted, and the fallback is recorded in mapping_audit.
        """
        result = derive_parent(
            sub_service_code="PRM-LND", stated_parent_service_code="LDG", services_by_code=_services()
        )
        assert result.parent_id == "svc-ldg-id"
        assert "fell back" in result.mapping_audit

    def test_unresolvable_fails_loudly(self):
        with pytest.raises(ServiceCatalogueImportError):
            derive_parent(sub_service_code="XYZ-001", stated_parent_service_code=None, services_by_code=_services())

    def test_unresolvable_with_bad_stated_parent_fails_loudly(self):
        with pytest.raises(ServiceCatalogueImportError):
            derive_parent(
                sub_service_code="XYZ-001", stated_parent_service_code="NOPE", services_by_code=_services()
            )
