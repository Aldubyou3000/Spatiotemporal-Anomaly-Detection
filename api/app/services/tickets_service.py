from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from supabase import Client

from ..schemas.tickets import TicketCreate, TicketUpdate


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Selects ────────────────────────────────────────────────────────────────

_SELECT_LIST = (
    "id, ticket_number, title, station_id, status, priority, anomaly_zone, analyst_id, technician_id, "
    "follow_up_count, created_at, updated_at, "
    "ticket_technicians(user_id, assigned_at, removed_at, profiles!ticket_technicians_user_id_fkey(id, username, full_name))"
)

_SELECT_DETAIL = (
    "id, ticket_number, title, description, station_id, status, priority, anomaly_zone, anomaly_data, "
    "analyst_id, technician_id, follow_up_count, last_follow_up_at, follow_up_notes, "
    "cancelled_at, cancellation_reason, "
    "created_at, assigned_at, completed_at, verified_at, updated_at, "
    "ticket_technicians(user_id, assigned_at, removed_at, profiles!ticket_technicians_user_id_fkey(id, username, full_name))"
)


def _join_technicians(row: dict) -> dict:
    """Flatten junction rows into technicians[] (active) and technicians_history[] (removed)."""
    junctions = row.pop("ticket_technicians", None) or []
    active = []
    history = []
    for j in junctions:
        profile = j.get("profiles") or {}
        entry = {
            "id": profile.get("id") or j.get("user_id"),
            "username": profile.get("username", ""),
            "full_name": profile.get("full_name", ""),
            "assigned_at": j.get("assigned_at", ""),
            "removed_at": j.get("removed_at"),
        }
        if j.get("removed_at"):
            history.append(entry)
        else:
            active.append(entry)
    row["technicians"] = active
    row["technicians_history"] = history
    # Shadow single-technician field for backwards compat (PDF, old clients)
    row["technician"] = (
        {"id": active[0]["id"], "username": active[0]["username"],
         "full_name": active[0]["full_name"]}
        if active else None
    )
    # Ensure follow-up and cancellation fields always present
    row.setdefault("follow_up_count", 0)
    row.setdefault("last_follow_up_at", None)
    row.setdefault("follow_up_notes", None)
    row.setdefault("cancelled_at", None)
    row.setdefault("cancellation_reason", None)
    return row


# ── Read ───────────────────────────────────────────────────────────────────

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
    items = [_join_technicians(r) for r in (res.data or [])]
    return {"items": items, "total": res.count or 0}


def get_ticket(sb: Client, ticket_id: str) -> dict | None:
    res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    rows = res.data or []
    if not rows:
        return None
    return _join_technicians(rows[0])


# ── Create ─────────────────────────────────────────────────────────────────

def create_ticket(sb: Client, analyst_id: str, data: TicketCreate) -> dict:
    # Validate all technician IDs before touching the tickets table
    profile_res = (
        sb.table("profiles")
        .select("id")
        .in_("id", data.technician_ids)
        .eq("role", "technician")
        .eq("is_active", True)
        .execute()
    )
    valid_ids = {r["id"] for r in (profile_res.data or [])}
    invalid = [tid for tid in data.technician_ids if tid not in valid_ids]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or inactive technician IDs: {invalid}",
        )

    now = _now()
    payload = {
        "analyst_id": analyst_id,
        "title": data.title,
        "station_id": data.station_id,
        "priority": data.priority,
        "status": "assigned",
        "technician_id": data.technician_ids[0],  # shadow column — first assignee
        "assigned_at": now,
    }
    if data.description is not None:
        payload["description"] = data.description
    if data.anomaly_zone is not None:
        payload["anomaly_zone"] = data.anomaly_zone
    if data.anomaly_data is not None:
        payload["anomaly_data"] = data.anomaly_data

    insert_res = sb.table("tickets").insert(payload).execute()
    inserted = (insert_res.data or [])
    if not inserted:
        raise RuntimeError("Failed to create ticket — insert returned no rows")
    new_id = inserted[0]["id"]

    # Insert junction rows
    junctions = [
        {"ticket_id": new_id, "user_id": tid, "assigned_at": now, "assigned_by": analyst_id}
        for tid in data.technician_ids
    ]
    sb.table("ticket_technicians").insert(junctions).execute()

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", new_id).limit(1).execute()
    rows = detail_res.data or []
    if not rows:
        raise RuntimeError("Ticket inserted but could not be re-read")
    return _join_technicians(rows[0])


# ── Update ─────────────────────────────────────────────────────────────────

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
        elif data.status == "pending_review":
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
    return _join_technicians(rows[0])


# ── Technician assignment management ───────────────────────────────────────

def assign_technicians(
    sb: Client, ticket_id: str, technician_ids: list[str], assigned_by: str
) -> dict:
    """Add technician(s) to a ticket. Idempotent — existing assignments are kept."""
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket["status"] == "verified":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot reassign technicians on a verified ticket",
        )

    # Validate technician IDs
    profile_res = (
        sb.table("profiles")
        .select("id")
        .in_("id", technician_ids)
        .eq("role", "technician")
        .eq("is_active", True)
        .execute()
    )
    valid_ids = {r["id"] for r in (profile_res.data or [])}
    invalid = [tid for tid in technician_ids if tid not in valid_ids]
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or inactive technician IDs: {invalid}",
        )

    now = _now()

    # For each id: if a soft-deleted row exists, restore it; otherwise insert fresh
    existing_res = (
        sb.table("ticket_technicians")
        .select("user_id, removed_at")
        .eq("ticket_id", ticket_id)
        .in_("user_id", technician_ids)
        .execute()
    )
    existing = {r["user_id"]: r for r in (existing_res.data or [])}

    to_restore = [tid for tid in technician_ids if tid in existing]
    to_insert  = [tid for tid in technician_ids if tid not in existing]

    if to_restore:
        for tid in to_restore:
            sb.table("ticket_technicians").update({
                "removed_at": None, "removed_by": None, "assigned_at": now,
            }).eq("ticket_id", ticket_id).eq("user_id", tid).execute()

    if to_insert:
        junctions = [
            {"ticket_id": ticket_id, "user_id": tid, "assigned_at": now, "assigned_by": assigned_by}
            for tid in to_insert
        ]
        sb.table("ticket_technicians").insert(junctions).execute()

    # Keep shadow column pointing to earliest active assignee
    current_junctions = (
        sb.table("ticket_technicians")
        .select("user_id")
        .eq("ticket_id", ticket_id)
        .is_("removed_at", "null")
        .order("assigned_at")
        .limit(1)
        .execute()
    )
    if current_junctions.data:
        sb.table("tickets").update({
            "technician_id": current_junctions.data[0]["user_id"],
            "updated_at": now,
        }).eq("id", ticket_id).execute()

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    return _join_technicians((detail_res.data or [{}])[0])


def remove_technician(sb: Client, ticket_id: str, user_id: str, removed_by: str | None = None) -> dict:
    """Soft-delete a technician from a ticket. Fails if it would leave zero active assignees."""
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket["status"] in ("verified", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove technicians from a closed ticket",
        )

    active_res = (
        sb.table("ticket_technicians")
        .select("user_id", count="exact")
        .eq("ticket_id", ticket_id)
        .is_("removed_at", "null")
        .execute()
    )
    if (active_res.count or 0) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the last technician — a ticket must have at least one assignee",
        )

    now = _now()
    sb.table("ticket_technicians").update({
        "removed_at": now,
        "removed_by": removed_by,
    }).eq("ticket_id", ticket_id).eq("user_id", user_id).execute()

    # Update shadow column if the removed user was the shadow
    if ticket.get("technician_id") == user_id:
        remaining = (
            sb.table("ticket_technicians")
            .select("user_id")
            .eq("ticket_id", ticket_id)
            .is_("removed_at", "null")
            .order("assigned_at")
            .limit(1)
            .execute()
        )
        if remaining.data:
            sb.table("tickets").update({
                "technician_id": remaining.data[0]["user_id"],
                "updated_at": now,
            }).eq("id", ticket_id).execute()

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    return _join_technicians((detail_res.data or [{}])[0])


# ── Follow-up workflow ─────────────────────────────────────────────────────

def request_follow_up(
    sb: Client, ticket_id: str, follow_up_notes: str, analyst_id: str
) -> dict:
    """Archive the active report and send ticket back for a re-visit."""
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket["status"] != "pending_review":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Follow-up can only be requested when ticket is in 'pending_review' status",
        )

    now = _now()

    # Archive the active report (so the next technician submission creates a new
    # round) AND persist the analyst's note onto that round, so the dashboard can
    # show the per-round follow-up narrative. tickets.follow_up_notes (set below)
    # only ever holds the latest note; this keeps every round's note with it.
    sb.table("inspection_reports").update(
        {"is_active": False, "follow_up_notes": follow_up_notes}
    ).eq("ticket_id", ticket_id).eq("is_active", True).execute()

    # Increment follow_up_count, store analyst notes, transition status
    new_count = (ticket.get("follow_up_count") or 0) + 1
    sb.table("tickets").update({
        "status": "follow_up",
        "follow_up_count": new_count,
        "last_follow_up_at": now,
        "follow_up_notes": follow_up_notes,
        "updated_at": now,
    }).eq("id", ticket_id).execute()

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    return _join_technicians((detail_res.data or [{}])[0])


# ── Cancellation ──────────────────────────────────────────────────────────

def cancel_ticket(sb: Client, ticket_id: str, reason: str) -> dict:
    """Cancel a ticket. Only allowed when status is 'assigned' (before work starts)."""
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket["status"] != "assigned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tickets can only be cancelled before work has started (status must be 'assigned')",
        )

    now = _now()
    sb.table("tickets").update({
        "status": "cancelled",
        "cancelled_at": now,
        "cancellation_reason": reason,
        "updated_at": now,
    }).eq("id", ticket_id).execute()

    detail_res = sb.table("tickets").select(_SELECT_DETAIL).eq("id", ticket_id).limit(1).execute()
    return _join_technicians((detail_res.data or [{}])[0])


# ── Technicians list ───────────────────────────────────────────────────────

def list_technicians(sb: Client, *, limit: int = 200, offset: int = 0) -> list[dict]:
    res = (
        sb.table("profiles")
        .select("id, username, full_name, email, station_ids, is_active")
        .eq("role", "technician")
        .eq("is_active", True)
        .order("full_name")
        .range(offset, offset + limit - 1)
        .execute()
    )
    return res.data or []
