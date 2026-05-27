from __future__ import annotations

from typing import Any
from pydantic import BaseModel


TicketStatus = str  # 'assigned' | 'in-progress' | 'completed' | 'verified'
TicketPriority = str  # 'low' | 'medium' | 'high'
AnomalyZone = str  # 'A' | 'B' | 'C'


class TicketCreate(BaseModel):
    title: str
    description: str | None = None
    station_id: str
    priority: TicketPriority = "medium"
    anomaly_zone: AnomalyZone | None = None
    anomaly_data: dict[str, Any] | None = None
    technician_id: str  # required — ticket is always assigned on creation


class TicketUpdate(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    technician_id: str | None = None
    title: str | None = None
    description: str | None = None


class TechnicianSummary(BaseModel):
    id: str
    username: str
    full_name: str


class TicketDetail(BaseModel):
    id: str
    title: str
    description: str | None
    station_id: str
    status: TicketStatus
    priority: TicketPriority
    anomaly_zone: AnomalyZone | None
    anomaly_data: dict[str, Any] | None
    analyst_id: str
    technician_id: str | None
    technician: TechnicianSummary | None
    created_at: str
    assigned_at: str | None
    completed_at: str | None
    verified_at: str | None
    updated_at: str


class TicketListItem(BaseModel):
    id: str
    title: str
    station_id: str
    status: TicketStatus
    priority: TicketPriority
    anomaly_zone: AnomalyZone | None
    analyst_id: str
    technician_id: str | None
    technician: TechnicianSummary | None
    created_at: str
    updated_at: str


class TicketListResponse(BaseModel):
    items: list[TicketListItem]
    total: int
