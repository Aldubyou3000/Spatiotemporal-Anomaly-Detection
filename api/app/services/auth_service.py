from supabase import create_client
from supabase_auth.errors import AuthApiError

from ..core.config import settings


def _service_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _anon_client():
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def _resolve_to_email(credential: str) -> str:
    """Accepts a username or email and always returns an email."""
    credential = credential.strip().lower()
    if "@" in credential:
        return credential

    res = _service_client().rpc("get_email_by_username", {"p_username": credential}).execute()
    if not res.data:
        raise ValueError("Username not found.")
    return res.data


def login(credential: str, password: str) -> dict:
    """Verify analyst credentials and return Supabase session tokens + profile."""
    email = _resolve_to_email(credential)

    anon = _anon_client()
    try:
        auth_res = anon.auth.sign_in_with_password({"email": email, "password": password})
    except AuthApiError as e:
        raise ValueError(str(e))
    if not auth_res.user:
        raise ValueError("Invalid credentials.")

    profile_res = _service_client().table("profiles").select("*").eq("id", auth_res.user.id).limit(1).execute()
    rows = profile_res.data or []
    profile = rows[0] if rows else None

    if not profile or profile.get("role") != "analyst":
        anon.auth.sign_out()
        raise ValueError("Access denied: analyst accounts only.")

    return {
        "access_token": auth_res.session.access_token,
        "refresh_token": auth_res.session.refresh_token,
        "user": profile,
    }


def refresh_session(refresh_token: str) -> dict:
    """Exchange a refresh token for a new access + refresh token pair."""
    anon = _anon_client()
    try:
        res = anon.auth.refresh_session(refresh_token)
    except AuthApiError as e:
        raise ValueError(str(e))
    if not res.session:
        raise ValueError("Invalid or expired refresh token.")
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
    }
