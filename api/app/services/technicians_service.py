from __future__ import annotations

import logging

from supabase import Client, create_client

from ..core.config import settings
from ..core.errors import friendly_db_error
from ..schemas.technicians import TechnicianCreate

logger = logging.getLogger("technicians.service")


def _admin_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _rollback_auth_user(admin: Client, user_id: str) -> None:
    """Best-effort delete of an auth user created moments ago, when the matching
    profile insert failed. Prevents an orphaned auth account from blocking a
    retry (its email would otherwise collide)."""
    try:
        admin.auth.admin.delete_user(user_id)
    except Exception:  # noqa: BLE001 — cleanup is best-effort
        logger.warning("[technicians] failed to roll back orphaned auth user %s", user_id)


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

    # Create the Supabase auth user with confirmed email. A duplicate email
    # surfaces here as an AuthApiError; translate it to a friendly message
    # instead of leaking the raw provider error.
    try:
        auth_res = admin.auth.admin.create_user(
            {
                "email": data.email,
                "password": data.password,
                "email_confirm": True,
                "user_metadata": {"full_name": data.full_name, "username": data.username},
            }
        )
    except Exception as e:  # noqa: BLE001 — translate, never leak the raw error
        raise ValueError(friendly_db_error(
            e, default="Could not create the account. Please check the email and try again.")) from e
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

    # A duplicate username trips the profiles_username_key unique constraint here.
    # If the profile insert fails after the auth user was created, roll the auth
    # user back so a retry with a different username isn't blocked by a duplicate
    # email from the orphaned auth account.
    try:
        upsert_res = admin.table("profiles").upsert(profile_data).execute()
    except Exception as e:  # noqa: BLE001 — translate, never leak the raw error
        _rollback_auth_user(admin, user_id)
        raise ValueError(friendly_db_error(e)) from e
    if not (upsert_res.data or []):
        _rollback_auth_user(admin, user_id)
        raise ValueError("Could not create the technician account. Please try again.")

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
