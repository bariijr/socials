"""Pure logic for re-deriving service_catalogue parentage from the code
prefix. Ported defect: the source workbook's sub_services.service_id was
historically shifted by one from SS-017 onward — every sub-service's
parent must be RE-DERIVED here, never trusted verbatim from an id column,
and the importer fails loudly on anything that cannot be resolved.

Rule, in precedence order:
1. The sub-service code's prefix (everything before the first '-') is
   compared against every top-level service's `code`. An exact match is
   authoritative and OVERRIDES whatever parent id the source row stated —
   this is the actual fix for the SS-017+ shift defect (e.g. code
   'FUL-JTA' resolves to the service whose code is 'FUL', regardless of
   what the source's stated parent said).
2. Some code families are shared by more than one service and cannot be
   split by prefix alone (in the shipped catalogue: 'PRM' covers both
   Overflight Permits (OVF) and Landing Permits (LDG) — e.g. 'PRM-LND' is
   Landing, 'PRM-OVF' is Overflight). Rows below SS-017 are not affected
   by the historical shift, so for a ambiguous/no-match prefix we fall
   back to the source's stated parent PROVIDED it resolves to a real
   service row, and record that fact in mapping_audit for traceability.
3. If neither resolves, this is unresolved: raise ServiceCatalogueImportError
   rather than guessing or silently dropping the row.
"""

from dataclasses import dataclass


class ServiceCatalogueImportError(Exception):
    def __init__(self, sub_service_code: str, reason: str):
        self.sub_service_code = sub_service_code
        self.reason = reason
        super().__init__(f"{sub_service_code}: {reason}")


@dataclass(frozen=True)
class ServiceRef:
    id: object
    code: str
    category: str


@dataclass(frozen=True)
class DerivedParent:
    parent_id: object
    category: str
    mapping_audit: str


def derive_parent(
    *,
    sub_service_code: str,
    stated_parent_service_code: str | None,
    services_by_code: dict[str, ServiceRef],
) -> DerivedParent:
    prefix = sub_service_code.split("-")[0]

    by_prefix = services_by_code.get(prefix)
    if by_prefix is not None:
        note = f"parent derived from code prefix '{prefix}' -> {by_prefix.code}"
        if stated_parent_service_code and stated_parent_service_code != by_prefix.code:
            note += f" (source stated parent code {stated_parent_service_code!r}, code-prefix rule overrides)"
        return DerivedParent(parent_id=by_prefix.id, category=by_prefix.category, mapping_audit=note)

    if stated_parent_service_code:
        stated = services_by_code.get(stated_parent_service_code)
        if stated is not None:
            return DerivedParent(
                parent_id=stated.id,
                category=stated.category,
                mapping_audit=(
                    f"code prefix '{prefix}' matches no service; fell back to source-stated "
                    f"parent {stated_parent_service_code!r}"
                ),
            )

    raise ServiceCatalogueImportError(
        sub_service_code,
        f"code prefix {prefix!r} matches no service, and stated parent "
        f"{stated_parent_service_code!r} does not resolve either",
    )
