"""The canonical list of person roles (task #120) — mirrors
app.core.document_template_registry's shape exactly (a plain dataclass
list, seeded idempotently at startup, admin-editable via CRUD after that).

Replaces the old fixed PersonPublicIn.role regex
("^(PIC|FO|FA|MECHANIC|ENGINEER|CREW|PAX|VIP|PRINCIPAL|OTHER)$", task
#107) and the fixed CREW_ROLES/PAX_ROLES frozensets in
app.domain.credentials. FO stays seeded alongside the user-requested SIC
(same real-world position — Second in Command — different naming
convention) so no already-stored "FO" role value silently breaks; SIC and
MEDICAL_STAFF are the new additions.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PersonRoleSeed:
    code: str
    label: str
    is_crew: bool
    sort_order: int


PERSON_ROLES: list[PersonRoleSeed] = [
    PersonRoleSeed(code="PIC", label="Pilot in Command", is_crew=True, sort_order=0),
    PersonRoleSeed(code="SIC", label="Second in Command", is_crew=True, sort_order=10),
    PersonRoleSeed(code="FO", label="First Officer", is_crew=True, sort_order=20),
    PersonRoleSeed(code="FA", label="Flight Attendant", is_crew=True, sort_order=30),
    PersonRoleSeed(code="MECHANIC", label="Mechanic", is_crew=True, sort_order=40),
    PersonRoleSeed(code="ENGINEER", label="Engineer", is_crew=True, sort_order=50),
    PersonRoleSeed(code="MEDICAL_STAFF", label="Medical Staff", is_crew=True, sort_order=60),
    PersonRoleSeed(code="CREW", label="Crew (other)", is_crew=True, sort_order=70),
    PersonRoleSeed(code="PAX", label="Pax", is_crew=False, sort_order=80),
    PersonRoleSeed(code="VIP", label="VIP", is_crew=False, sort_order=90),
    PersonRoleSeed(code="PRINCIPAL", label="Principal", is_crew=False, sort_order=100),
    PersonRoleSeed(code="OTHER", label="Other", is_crew=False, sort_order=110),
]

PERSON_ROLES_BY_CODE: dict[str, PersonRoleSeed] = {r.code: r for r in PERSON_ROLES}
