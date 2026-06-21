from __future__ import annotations

from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator


TicketStatus = str  # 'assigned' | 'in-progress' | 'pending_review' | 'follow_up' | 'verified'
TicketPriority = str  # 'low' | 'medium' | 'high'
AnomalyZone = str  # 'A' | 'B' | 'C'


class TicketCreate(BaseModel):
    title: str
    description: str | None = None
    station_id: str
    priority: TicketPriority = "medium"
    anomaly_zone: AnomalyZone | None = None
    anomaly_data: dict[str, Any] | None = None
    technician_ids: list[str]  # at least one required

    @field_validator("technician_ids")
    @classmethod
    def at_least_one(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one technician must be assigned")
        return v


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    technician_id: str | None = None  # kept for legacy PATCH compat; use /technicians endpoints instead
    title: str | None = None
    description: str | None = None


class TechnicianSummary(BaseModel):
    id: str
    username: str
    full_name: str


class TechnicianWorkload(BaseModel):
    """Per-status tally of a technician's *active* (non-terminal) ticket
    assignments — drives the "3 active · 1 in review" breakdown in the analyst
    assignment UI. Counts only; never carries ticket rows/ids.

    The ``in-progress`` status string contains a hyphen (not a valid Python
    identifier), so it's exposed via a serialization alias; the JSON keys match
    the literal ticket status values the frontend already uses."""
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    assigned: int = 0
    in_progress: int = Field(0, alias="in-progress")
    pending_review: int = 0
    follow_up: int = 0


class TechnicianListItem(BaseModel):
    """Analyst-facing technician row for the assignment pickers. Mirrors the
    profiles columns plus the computed workload — returned by
    GET /api/tickets/technicians (require_analyst)."""
    id: str
    username: str
    full_name: str
    email: str
    station_ids: list[str] = []
    is_active: bool
    active_ticket_count: int = 0
    workload_by_status: TechnicianWorkload = TechnicianWorkload()


class TechnicianAssignment(BaseModel):
    id: str
    username: str
    full_name: str
    assigned_at: str
    removed_at: str | None = None


class TechnicianAssignRequest(BaseModel):
    technician_ids: list[str]
    reason: str | None = None  # optional analyst note explaining the (re)assignment — audited, not stored on the ticket

    @field_validator("technician_ids")
    @classmethod
    def at_least_one(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("At least one technician id required")
        return v

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class TicketDetail(BaseModel):
    id: str
    ticket_number: int
    title: str
    description: str | None
    station_id: str
    status: TicketStatus
    priority: TicketPriority
    anomaly_zone: AnomalyZone | None
    anomaly_data: dict[str, Any] | None
    analyst_id: str
    technician_id: str | None
    technician: TechnicianSummary | None        # shadow: technicians[0] (kept for PDF compat)
    technicians: list[TechnicianAssignment]     # active assignees
    technicians_history: list[TechnicianAssignment] = []  # previously removed assignees
    follow_up_count: int
    last_follow_up_at: str | None
    follow_up_notes: str | None
    cancelled_at: str | None = None
    cancellation_reason: str | None = None
    created_at: str
    assigned_at: str | None
    completed_at: str | None
    verified_at: str | None
    updated_at: str


class TicketListItem(BaseModel):
    id: str
    ticket_number: int
    title: str
    station_id: str
    status: TicketStatus
    priority: TicketPriority
    anomaly_zone: AnomalyZone | None
    analyst_id: str
    technician_id: str | None
    technician: TechnicianSummary | None       # shadow: technicians[0]
    technicians: list[TechnicianAssignment]
    follow_up_count: int
    created_at: str
    updated_at: str


class TicketListResponse(BaseModel):
    items: list[TicketListItem]
    total: int


class FollowUpRequest(BaseModel):
    follow_up_notes: str  # required — analyst must explain the reason


class CancelRequest(BaseModel):
    reason: str  # required — analyst must state why the ticket is being cancelled

    @field_validator("reason")
    @classmethod
    def reason_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Cancellation reason cannot be blank")
        return v.strip()
