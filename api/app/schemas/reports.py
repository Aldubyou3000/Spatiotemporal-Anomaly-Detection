from __future__ import annotations

from pydantic import BaseModel


class ReportApprove(BaseModel):
    analyst_notes: str | None = None


class ReportTechnicianSummary(BaseModel):
    id: str
    username: str
    full_name: str


class ReportTicketSummary(BaseModel):
    id: str
    title: str
    station_id: str
    anomaly_zone: str | None
    status: str | None = None


class InspectionReport(BaseModel):
    id: str
    ticket_id: str
    ticket: ReportTicketSummary | None
    technician_id: str
    technician: ReportTechnicianSummary | None
    notes: str | None
    severity: str | None
    root_cause: str | None
    corrective_action: str | None = None
    issue_resolved: bool | None = None
    submitted_at: str | None
    analyst_approved: bool
    analyst_approved_at: str | None
    analyst_notes: str | None
    round: int = 1
    is_active: bool = True
    created_at: str


class InspectionReportListResponse(BaseModel):
    pending: list[InspectionReport]
    follow_up: list[InspectionReport]
    approved: list[InspectionReport]
