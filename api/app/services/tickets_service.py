from __future__ import annotations

from datetime import datetime, timezone

from supabase import Client

from ..schemas.tickets import TicketCreate, TicketUpdate


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _join_technician(row: dict) -> dict:
    """Flatten the nested profiles join into a technician summary."""
    tech = row.pop("profiles", None)
    row["technician"] = (
        {"id": tech["id"], "username": tech["username"], "full_name": tech["full_name"]}
        if tech
        else None
    )
    return row


_SELECT_LIST = (
    "id, title, station_id, status, priority, anomaly_zone, analyst_id, technician_id, "
    "created_at, updated_at, profiles!tickets_technician_id_fkey(id, username, full_name)"
)

_SELECT_DETAIL = (
    "id, title, description, station_id, status, priority, anomaly_zone, anomaly_data, "
    "analyst_id, technician_id, created_at, assigned_at, completed_at, verified_at, updated_at, "
    "profiles!tickets_technician_id_fkey(id, username, full_name)"
)


def list_tickets(
    sb: Client,
    *,
    status: str | None = None,
    priority: str | None = None,
    station_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    q = sb.table("tickets").select(_SELECT_LIST, count="exact")
    if status:
        q = q.eq("status", status)
    if priority:
        q = q.eq("priority", priority)
    if station_id:
        q = q.eq("station_id", station_id)
    res = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    items = [_join_technician(r) for r in (res.data or [])]
    return {"items": items, "total": res.count or 0}


def get_ticket(sb: Client, ticket_id: str) -> dict | None:
    res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return None
    return _join_technician(rows[0])


def create_ticket(sb: Client, analyst_id: str, data: TicketCreate) -> dict:
    payload = {
        "analyst_id": analyst_id,
        "title": data.title,
        "station_id": data.station_id,
        "priority": data.priority,
        "status": "assigned",
        "technician_id": data.technician_id,
        "assigned_at": _now(),
    }
    if data.description is not None:
        payload["description"] = data.description
    if data.anomaly_zone is not None:
        payload["anomaly_zone"] = data.anomaly_zone
    if data.anomaly_data is not None:
        payload["anomaly_data"] = data.anomaly_data

    insert_res = sb.table("tickets").insert(payload).execute()
    inserted_rows = insert_res.data or []
    if not inserted_rows:
        raise RuntimeError("Failed to create ticket — insert returned no rows")
    new_id = inserted_rows[0]["id"]

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", new_id).limit(1).execute()
    rows = detail_res.data or []
    if not rows:
        raise RuntimeError("Ticket inserted but could not be re-read")
    return _join_technician(rows[0])


def update_ticket(sb: Client, ticket_id: str, data: TicketUpdate) -> dict | None:
    patch: dict = {"updated_at": _now()}

    if data.title is not None:
        patch["title"] = data.title
    if data.description is not None:
        patch["description"] = data.description
    if data.priority is not None:
        patch["priority"] = data.priority

    if data.technician_id is not None:
        patch["technician_id"] = data.technician_id

    if data.status is not None:
        patch["status"] = data.status
        if data.status == "assigned" and data.technician_id:
            patch["assigned_at"] = _now()
        elif data.status == "completed":
            patch["completed_at"] = _now()
        elif data.status == "verified":
            patch["verified_at"] = _now()

    update_res = sb.table("tickets").update(patch).eq("id", ticket_id).execute()
    if not (update_res.data or []):
        return None

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    rows = detail_res.data or []
    if not rows:
        return None
    return _join_technician(rows[0])


def list_technicians(sb: Client) -> list[dict]:
    res = (
        sb.table("profiles")
        .select("id, username, full_name, email, station_ids, is_active")
        .eq("role", "technician")
        .eq("is_active", True)
        .order("full_name")
        .execute()
    )
    return res.data or []
