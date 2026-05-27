from __future__ import annotations

from pydantic import BaseModel


class TechnicianCreate(BaseModel):
    full_name: str
    username: str
    email: str
    password: str
    phone: str | None = None


class TechnicianProfile(BaseModel):
    id: str
    username: str
    full_name: str
    email: str
    phone: str | None
    station_ids: list[str]
    is_active: bool
    created_at: str
