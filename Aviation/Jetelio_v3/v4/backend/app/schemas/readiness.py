from pydantic import BaseModel


class GateStatus(BaseModel):
    key: str
    label: str
    verified: int
    required: int
    status: str  # "BLOCKED - N outstanding" | "CLEARED"
    evidence_columns: str


class PilotExitReport(BaseModel):
    gates: list[GateStatus]
    blocked_gate_count: int
    total_gate_count: int
    verdict: str  # "PILOT" | "LIVE"
    allow_unverified_for_planning: bool


class ReadinessRow(BaseModel):
    dataset: str
    populated: int
    total: int
    percent_complete: float
    criticality: str
    blocks: str


class ImportSheetResult(BaseModel):
    sheet: str
    rows_seen: int
    rows_loaded: int
    rows_skipped: int
    rows_quarantined: int
    notes: list[str] = []


class ImportReport(BaseModel):
    started_at: str
    finished_at: str
    source_file: str
    sheets: list[ImportSheetResult]
    readiness: list[ReadinessRow]
    overall_percent_complete: float
    pilot_exit: PilotExitReport
