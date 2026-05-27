from __future__ import annotations

from supabase import Client, create_client

from ..core.config import settings
from ..schemas.technicians import TechnicianCreate


def _admin_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def list_technicians(sb: Client) -> list[dict]:
    res = (
        sb.table("profiles")
        .select("id, username, full_name, email, phone, station_ids, is_active, created_at")
        .eq("role", "technician")
        .order("full_name")
        .execute()
    )
    return res.data or []


def create_technician(data: TechnicianCreate) -> dict:
    admin = _admin_client()

    # Create the Supabase auth user with confirmed email
    auth_res = admin.auth.admin.create_user(
        {
            "email": data.email,
            "password": data.password,
            "email_confirm": True,
            "user_metadata": {"full_name": data.full_name, "username": data.username},
        }
    )
    user_id = auth_res.user.id

    profile_data: dict = {
        "id": user_id,
        "username": data.username.strip().lower(),
        "full_name": data.full_name.strip(),
        "email": data.email.strip().lower(),
        "role": "technician",
        "is_active": True,
        "station_ids": [],
    }
    if data.phone:
        profile_data["phone"] = data.phone.strip()

    upsert_res = admin.table("profiles").upsert(profile_data).execute()
    if not (upsert_res.data or []):
        raise RuntimeError("Failed to upsert technician profile")

    detail_res = (
        admin.table("profiles")
        .select("id, username, full_name, email, phone, station_ids, is_active, created_at")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = detail_res.data or []
    if not rows:
        raise RuntimeError("Technician profile inserted but could not be re-read")
    return rows[0]


def toggle_technician_active(sb: Client, technician_id: str, is_active: bool) -> dict | None:
    update_res = (
        sb.table("profiles")
        .update({"is_active": is_active})
        .eq("id", technician_id)
        .eq("role", "technician")
        .execute()
    )
    if not (update_res.data or []):
        return None

    detail_res = (
        sb.table("profiles")
        .select("id, username, full_name, email, phone, station_ids, is_active, created_at")
        .eq("id", technician_id)
        .limit(1)
        .execute()
    )
    rows = detail_res.data or []
    return rows[0] if rows else None
