import json
from datetime import datetime

from app.schemas.readiness import ImportReport, ImportSheetResult, PilotExitReport, ReadinessRow


def build_report(
    *,
    started_at: datetime,
    finished_at: datetime,
    source_file: str,
    sheets: list[ImportSheetResult],
    readiness: list[ReadinessRow],
    pilot_exit: PilotExitReport,
) -> ImportReport:
    populated = sum(r.populated for r in readiness)
    total = sum(r.total for r in readiness) or 1
    return ImportReport(
        started_at=started_at.isoformat(),
        finished_at=finished_at.isoformat(),
        source_file=source_file,
        sheets=sheets,
        readiness=readiness,
        overall_percent_complete=round(populated / total * 100, 2),
        pilot_exit=pilot_exit,
    )


def print_report(report: ImportReport) -> None:
    print("=" * 88)
    print(f"JETELIO V3 IMPORT REPORT — {report.started_at} -> {report.finished_at}")
    print(f"Source: {report.source_file}")
    print("=" * 88)
    print(f"{'SHEET':<38}{'SEEN':>7}{'LOADED':>8}{'SKIPPED':>9}{'QUARANTINED':>13}")
    for sr in report.sheets:
        print(f"{sr.sheet:<38}{sr.rows_seen:>7}{sr.rows_loaded:>8}{sr.rows_skipped:>9}{sr.rows_quarantined:>13}")
        for note in sr.notes[:5]:
            print(f"    - {note}")
        if len(sr.notes) > 5:
            print(f"    ... and {len(sr.notes) - 5} more notes")

    print("-" * 88)
    print("DATA READINESS")
    for row in report.readiness:
        print(f"  [{row.criticality:<8}] {row.dataset:<55} {row.populated:>6} / {row.total:<6} ({row.percent_complete:>6.2f}%)")
    print(f"OVERALL: {report.overall_percent_complete}% of tracked reference data populated")

    print("-" * 88)
    print(f"PILOT-EXIT GATE VERDICT: {report.pilot_exit.verdict}")
    print(f"allow_unverified_for_planning = {report.pilot_exit.allow_unverified_for_planning}")
    for gate in report.pilot_exit.gates:
        print(f"  [{gate.status:<28}] {gate.label}")
    print("=" * 88)


def write_report_json(report: ImportReport, path: str) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(json.loads(report.model_dump_json()), f, indent=2)
