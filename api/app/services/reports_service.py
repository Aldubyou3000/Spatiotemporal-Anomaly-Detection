from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from ..schemas.reports import ReportApprove


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_SELECT = (
    "id, ticket_id, technician_id, notes, severity, root_cause, corrective_action, issue_resolved, "
    "submitted_at, analyst_approved, analyst_approved_at, analyst_notes, round, is_active, created_at, "
    "tickets!inspection_reports_ticket_id_fkey(id, title, station_id, anomaly_zone, status), "
    "profiles!inspection_reports_technician_id_fkey(id, username, full_name)"
)


def _shape(row: dict) -> dict:
    ticket = row.pop("tickets", None)
    row["ticket"] = (
        {
            "id": ticket["id"],
            "title": ticket["title"],
            "station_id": ticket["station_id"],
            "anomaly_zone": ticket.get("anomaly_zone"),
            "status": ticket.get("status"),
        }
        if ticket
        else None
    )
    tech = row.pop("profiles", None)
    row["technician"] = (
        {"id": tech["id"], "username": tech["username"], "full_name": tech["full_name"]}
        if tech
        else None
    )
    row.setdefault("round", 1)
    row.setdefault("is_active", True)
    return row


def list_reports(sb: Client) -> dict:
    res = (
        sb.table("inspection_reports")
        .select(_SELECT)
        .order("submitted_at", desc=True)
        .execute()
    )
    rows = [_shape(r) for r in (res.data or [])]

    pending = []
    follow_up = []
    approved = []
    for r in rows:
        ticket_status = (r.get("ticket") or {}).get("status", "")
        if r["analyst_approved"]:
            approved.append(r)
        elif ticket_status == "follow_up":
            # Archived report from a ticket waiting for re-visit
            follow_up.append(r)
        elif r.get("is_active", True):
            pending.append(r)
        # inactive non-approved reports that aren't follow_up are historical — omit from lists

    return {"pending": pending, "follow_up": follow_up, "approved": approved}


def get_report(sb: Client, report_id: str) -> dict | None:
    res = (
        sb.table("inspection_reports")
        .select(_SELECT)
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None
    return _shape(rows[0])


def approve_report(sb: Client, report_id: str, data: ReportApprove) -> dict | None:
    from fastapi import HTTPException, status as http_status

    now = _now()
    patch = {
        "analyst_approved": True,
        "analyst_approved_at": now,
    }
    if data.analyst_notes is not None:
        patch["analyst_notes"] = data.analyst_notes

    # Fetch the report and verify it is the active one
    report_res = (
        sb.table("inspection_reports")
        .select("ticket_id, is_active")
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    report_rows = report_res.data or []
    if not report_rows:
        return None

    report_row = report_rows[0]
    ticket_id = report_row["ticket_id"]

    # Validate ticket status — can only approve when pending_review
    ticket_res = (
        sb.table("tickets")
        .select("status")
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    ticket_rows = ticket_res.data or []
    if ticket_rows and ticket_rows[0]["status"] != "pending_review":
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Report can only be approved when the ticket is in 'pending_review' status",
        )

    sb.table("tickets").update(
        {"status": "verified", "verified_at": now, "updated_at": now}
    ).eq("id", ticket_id).execute()

    update_res = (
        sb.table("inspection_reports")
        .update(patch)
        .eq("id", report_id)
        .execute()
    )
    if not (update_res.data or []):
        return None

    detail_res = (
        sb.table("inspection_reports")
        .select(_SELECT)
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    detail_rows = detail_res.data or []
    if not detail_rows:
        return None
    return _shape(detail_rows[0])
