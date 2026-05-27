from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from ..schemas.reports import ReportApprove


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_SELECT = (
    "id, ticket_id, technician_id, notes, sensor_working, severity, root_cause, "
    "submitted_at, analyst_approved, analyst_approved_at, analyst_notes, created_at, "
    "tickets!inspection_reports_ticket_id_fkey(id, title, station_id, anomaly_zone), "
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
    return row


def list_reports(sb: Client) -> dict:
    res = (
        sb.table("inspection_reports")
        .select(_SELECT)
        .order("submitted_at", desc=True)
        .execute()
    )
    rows = [_shape(r) for r in (res.data or [])]
    pending = [r for r in rows if not r["analyst_approved"]]
    approved = [r for r in rows if r["analyst_approved"]]
    return {"pending": pending, "approved": approved}


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
    now = _now()
    patch = {
        "analyst_approved": True,
        "analyst_approved_at": now,
    }
    if data.analyst_notes is not None:
        patch["analyst_notes"] = data.analyst_notes

    # Mark the linked ticket as verified
    report_res = (
        sb.table("inspection_reports")
        .select("ticket_id")
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    report_rows = report_res.data or []
    if not report_rows:
        return None

    ticket_id = report_rows[0]["ticket_id"]

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
