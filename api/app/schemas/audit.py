from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: int
    created_at: datetime
    event: str
    user_id: str | None = None
    actor_name: str | None = None
    actor_email: str | None = None
    actor_role: str | None = None
    credential: str | None = None
    entity_type: str | None = None
    entity_id: str | None = None
    changes: dict[str, Any] | None = None
    ip: str | None = None
    user_agent: str | None = None
    request_id: str | None = None
    success: bool = True
    error_message: str | None = None
    chain_hash: str | None = None
    meta: dict[str, Any] | None = None


class AuditLogListResponse(BaseModel):
    total: int
    items: list[AuditLogEntry]


class AuditChainResult(BaseModel):
    id: int
    created_at: datetime
    event: str
    stored_hash: str
    prev_hash: str
    is_intact: bool


class AuditChainReport(BaseModel):
    checked: int
    tampered: int
    results: list[AuditChainResult]
