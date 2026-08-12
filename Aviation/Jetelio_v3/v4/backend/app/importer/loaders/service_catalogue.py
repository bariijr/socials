from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.service_catalogue import ServiceCatalogueImportError, ServiceRef, derive_parent
from app.importer.xlsx_reader import i, read_rows, s
from app.models.service_catalogue import ServiceCatalogueEntry, ServiceCategory, ServiceLevel
from app.schemas.readiness import ImportSheetResult


async def load_service_catalogue(session: AsyncSession, ws) -> ImportSheetResult:
    loaded = skipped = 0
    notes: list[str] = []
    rows_seen = 0

    existing = {row.code: row for row in (await session.execute(select(ServiceCatalogueEntry))).scalars().all()}

    all_rows = list(read_rows(ws, header_row=2, data_start_row=3))
    rows_seen = len(all_rows)

    services_by_code: dict[str, ServiceRef] = {}
    services_by_workbook_id: dict[str, str] = {}

    # Pass 1: top-level SERVICE rows, so parentage for pass 2 can resolve.
    for row in all_rows:
        if s(row, "level") != "SERVICE":
            continue
        workbook_id = s(row, "id")
        code = s(row, "code")
        category = s(row, "category")
        name = s(row, "name")
        if not (workbook_id and code and category and name):
            skipped += 1
            notes.append(f"service row {workbook_id!r}: missing required field, skipped")
            continue

        values = dict(
            name=name,
            description=s(row, "description"),
            category=ServiceCategory(category),
            ground_grid_order=i(row, "ground_grid_order"),
            level=ServiceLevel.SERVICE,
            parent_service_id=None,
            mapping_audit=None,
        )
        existing_row = existing.get(code)
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
            entry = existing_row
        else:
            entry = ServiceCatalogueEntry(code=code, **values)
            session.add(entry)
        await session.flush()

        services_by_code[code] = ServiceRef(id=entry.id, code=code, category=category)
        services_by_workbook_id[workbook_id] = code
        loaded += 1

    # Pass 2: SUB-SERVICE rows, parentage re-derived from the code prefix.
    for row in all_rows:
        if s(row, "level") != "SUB-SERVICE":
            continue
        workbook_id = s(row, "id")
        code = s(row, "code")
        name = s(row, "name")
        if not (workbook_id and code and name):
            skipped += 1
            notes.append(f"sub-service row {workbook_id!r}: missing required field, skipped")
            continue

        stated_parent_workbook_id = s(row, "parent_service_id")
        stated_parent_code = services_by_workbook_id.get(stated_parent_workbook_id) if stated_parent_workbook_id else None

        try:
            derived = derive_parent(
                sub_service_code=code, stated_parent_service_code=stated_parent_code, services_by_code=services_by_code
            )
        except ServiceCatalogueImportError as exc:
            skipped += 1
            notes.append(f"sub-service {code}: FAILED LOUDLY - {exc.reason}")
            continue

        values = dict(
            name=name,
            description=s(row, "description"),
            category=ServiceCategory(derived.category),
            ground_grid_order=None,
            level=ServiceLevel.SUB_SERVICE,
            parent_service_id=derived.parent_id,
            mapping_audit=derived.mapping_audit,
        )
        existing_row = existing.get(code)
        if existing_row is not None:
            for k, v in values.items():
                setattr(existing_row, k, v)
        else:
            session.add(ServiceCatalogueEntry(code=code, **values))
        loaded += 1

    await session.flush()
    return ImportSheetResult(
        sheet="SERVICE CATALOGUE", rows_seen=rows_seen, rows_loaded=loaded, rows_skipped=skipped,
        rows_quarantined=0, notes=notes,
    )
