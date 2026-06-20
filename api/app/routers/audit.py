"""Audit log read API — analyst/admin only, read-only.

Endpoints:
  GET  /api/audit           — paginated list with rich filters
  GET  /api/audit/export    — full filtered result as CSV download
  GET  /api/audit/integrity — run chain-hash verification on a range
  GET  /api/audit/stats     — event-type counts for a time range (dashboard widget)
"""

import csv
import io
import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.dependencies import get_supabase, require_analyst
from ..schemas.audit import AuditChainReport, AuditChainResult, AuditLogListResponse

router = APIRouter(prefix="/api/audit", tags=["audit"])
limiter = Limiter(key_func=get_remote_address)

# Max rows the export endpoint will materialise — a safeguard against OOM.
_EXPORT_LIMIT = 50_000


def _parse_dt(value: str | None) -> str | None:
    """Accept ISO-8601 datetime strings; pass through None."""
    if value is None:
        return None
    try:
        datetime.fromisoformat(value)
    except ValueError:
        return None
    return value


def _build_query(
    sb,
    *,
    event: str | None,
    user_id: str | None,
    entity_type: str | None,
    entity_id: str | None,
    ip: str | None,
    success: bool | None,
    from_dt: str | None,
    to_dt: str | None,
    enriched: bool = True,
):
    """Return a supabase-py query builder with all filters applied."""
    table = "audit_log_enriched" if enriched else "audit_log"
    q = sb.table(table).select("*")

    if event:
        q = q.eq("event", event)
    if user_id:
        q = q.eq("user_id", user_id)
    if entity_type:
        q = q.eq("entity_type", entity_type)
    if entity_id:
        q = q.eq("entity_id", entity_id)
    if ip:
        q = q.eq("ip", ip)
    if success is not None:
        q = q.eq("success", success)
    if from_dt:
        q = q.gte("created_at", from_dt)
    if to_dt:
        q = q.lte("created_at", to_dt)

    return q


@router.get("", response_model=AuditLogListResponse)
@limiter.limit("30/minute")
def list_audit_logs(
    request: Request,
    _user: dict = Depends(require_analyst),
    # Filters
    event: str | None = Query(None, description="Exact event name, e.g. 'login_failed'"),
    user_id: str | None = Query(None, description="Actor UUID"),
    entity_type: str | None = Query(None, description="e.g. 'ticket', 'inspection_report'"),
    entity_id: str | None = Query(None),
    ip: str | None = Query(None),
    success: bool | None = Query(None),
    from_dt: str | None = Query(None, description="ISO-8601 lower bound, e.g. '2026-01-01T00:00:00Z'"),
    to_dt: str | None = Query(None, description="ISO-8601 upper bound"),
    # Pagination
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Return a paginated, filterable audit log for the analyst dashboard."""
    sb = get_supabase()
    q = _build_query(
        sb,
        event=event, user_id=user_id, entity_type=entity_type,
        entity_id=entity_id, ip=ip, success=success,
        from_dt=_parse_dt(from_dt), to_dt=_parse_dt(to_dt),
    )

    # Total count (Supabase returns count via a separate head request)
    count_res = q.order("id", desc=True).execute()
    total = len(count_res.data or [])

    # Paginated page
    rows = (
        _build_query(
            sb,
            event=event, user_id=user_id, entity_type=entity_type,
            entity_id=entity_id, ip=ip, success=success,
            from_dt=_parse_dt(from_dt), to_dt=_parse_dt(to_dt),
        )
        .order("id", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data or []
    )

    return {"total": total, "items": rows}


@router.get("/export")
@limiter.limit("5/minute")
def export_audit_csv(
    request: Request,
    _user: dict = Depends(require_analyst),
    event: str | None = Query(None),
    user_id: str | None = Query(None),
    entity_type: str | None = Query(None),
    entity_id: str | None = Query(None),
    ip: str | None = Query(None),
    success: bool | None = Query(None),
    from_dt: str | None = Query(None),
    to_dt: str | None = Query(None),
):
    """Download filtered audit log as CSV (max 50 000 rows)."""
    sb = get_supabase()
    rows = (
        _build_query(
            sb,
            event=event, user_id=user_id, entity_type=entity_type,
            entity_id=entity_id, ip=ip, success=success,
            from_dt=_parse_dt(from_dt), to_dt=_parse_dt(to_dt),
        )
        .order("id", desc=True)
        .limit(_EXPORT_LIMIT)
        .execute()
        .data or []
    )

    columns = [
        "id", "created_at", "event", "user_id", "actor_name", "actor_email",
        "actor_role", "credential", "entity_type", "entity_id",
        "ip", "user_agent", "request_id", "success", "error_message",
        "changes", "meta", "chain_hash",
    ]

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        # Flatten jsonb fields to strings for CSV
        for field in ("changes", "meta"):
            if row.get(field) is not None:
                row[field] = json.dumps(row[field])
        writer.writerow(row)

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"audit_log_{ts}.csv"

    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/integrity")
@limiter.limit("5/minute")
def verify_chain_integrity(
    request: Request,
    _user: dict = Depends(require_analyst),
    from_id: int = Query(1, ge=1),
    to_id: int | None = Query(None),
):
    """Run the DB-side chain hash verification and return tampered rows.

    A non-empty `results` list where `is_intact=False` indicates tampering.
    Note: Postgres SHA-256 vs Python SHA-256 canonical JSON may have minor
    ordering differences on some JSONB rows — cross-check against the Python
    chain when forensically investigating.
    """
    sb = get_supabase()
    res = sb.rpc("audit_log_verify_chain", {"p_from_id": from_id, "p_to_id": to_id}).execute()
    rows: list[AuditChainResult] = res.data or []

    tampered = [r for r in rows if not r.get("is_intact", True)]
    return AuditChainReport(
        checked=len(rows),
        tampered=len(tampered),
        results=rows,
    )


@router.get("/stats")
@limiter.limit("30/minute")
def audit_stats(
    request: Request,
    _user: dict = Depends(require_analyst),
    from_dt: str | None = Query(None, description="ISO-8601 lower bound"),
    to_dt: str | None = Query(None, description="ISO-8601 upper bound"),
):
    """Return per-event counts for the specified time range.

    Useful for the analyst dashboard widget: failed logins, lockouts,
    ticket operations, etc.
    """
    sb = get_supabase()
    q = sb.table("audit_log").select("event, success")
    if from_dt:
        q = q.gte("created_at", _parse_dt(from_dt))
    if to_dt:
        q = q.lte("created_at", _parse_dt(to_dt))

    rows = q.execute().data or []

    counts: dict[str, dict] = {}
    for row in rows:
        evt = row["event"]
        if evt not in counts:
            counts[evt] = {"event": evt, "total": 0, "failures": 0}
        counts[evt]["total"] += 1
        if not row.get("success", True):
            counts[evt]["failures"] += 1

    return sorted(counts.values(), key=lambda x: x["total"], reverse=True)
