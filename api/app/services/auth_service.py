import logging

from supabase import create_client
from supabase_auth.errors import AuthApiError

from ..core.config import settings
from ..core.lockout import lockout
from .audit_service import audit

logger = logging.getLogger("auth.service")


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


def login(credential: str, password: str, client_ip: str = "unknown", user_agent: str = "") -> dict:
    """Verify analyst credentials and return Supabase session tokens + profile.

    Enforces account lockout before any Supabase call to prevent credential
    stuffing.  On success the lockout counter is cleared.
    """
    normalised = credential.strip().lower()

    locked, remaining = lockout.is_locked(normalised)
    if locked:
        wait = int(remaining)
        logger.warning("[auth] login blocked — locked for %ds: '%s' ip=%s", wait, normalised, client_ip)
        audit.login_locked(credential=normalised, ip=client_ip, seconds_remaining=remaining)
        raise ValueError(f"Account temporarily locked. Try again in {wait} seconds.")

    try:
        email = _resolve_to_email(credential)
    except ValueError:
        # Don't leak whether the username exists — record failure and re-raise
        lockout.record_failure(normalised)
        audit.login_failed(credential=normalised, ip=client_ip, reason="username_not_found")
        raise ValueError("Invalid credentials.")

    anon = _anon_client()
    try:
        auth_res = anon.auth.sign_in_with_password({"email": email, "password": password})
    except AuthApiError as e:
        lockout.record_failure(normalised)
        logger.warning("[auth] sign_in_with_password failed for '%s' ip=%s: %s", normalised, client_ip, e)
        audit.login_failed(credential=normalised, ip=client_ip, reason="bad_password")
        raise ValueError("Invalid credentials.")

    if not auth_res.user:
        lockout.record_failure(normalised)
        audit.login_failed(credential=normalised, ip=client_ip, reason="no_user_returned")
        raise ValueError("Invalid credentials.")

    profile_res = _service_client().table("profiles").select("*").eq("id", auth_res.user.id).limit(1).execute()
    rows = profile_res.data or []
    profile = rows[0] if rows else None

    if not profile or profile.get("role") != "analyst":
        anon.auth.sign_out()
        lockout.record_failure(normalised)
        logger.warning("[auth] role denied for '%s' ip=%s role=%s", normalised, client_ip, profile.get("role") if profile else "none")
        audit.login_failed(credential=normalised, ip=client_ip, reason="wrong_role")
        raise ValueError("Access denied: analyst accounts only.")

    if not profile.get("is_active", True):
        anon.auth.sign_out()
        logger.warning("[auth] inactive account login attempt: '%s' ip=%s", normalised, client_ip)
        audit.login_failed(credential=normalised, user_id=auth_res.user.id if auth_res.user else None,
                           ip=client_ip, reason="account_disabled")
        raise ValueError("Account is disabled.")

    lockout.record_success(normalised)
    logger.info("[auth] analyst login success: user_id=%s ip=%s", auth_res.user.id, client_ip)
    audit.login_success(user_id=str(auth_res.user.id), credential=normalised, ip=client_ip,
                        user_agent=user_agent, platform="web")

    return {
        "access_token": auth_res.session.access_token,
        "refresh_token": auth_res.session.refresh_token,
        "user": profile,
    }


def mobile_login(credential: str, password: str, client_ip: str = "unknown", user_agent: str = "") -> dict:
    """Verify technician credentials and return tokens for SecureStore storage."""
    normalised = credential.strip().lower()

    locked, remaining = lockout.is_locked(normalised)
    if locked:
        wait = int(remaining)
        audit.login_locked(credential=normalised, ip=client_ip, seconds_remaining=remaining)
        raise ValueError(f"Account temporarily locked. Try again in {wait} seconds.")

    try:
        email = _resolve_to_email(credential)
    except ValueError:
        lockout.record_failure(normalised)
        audit.login_failed(credential=normalised, ip=client_ip, reason="username_not_found", platform="mobile")
        raise ValueError("Invalid credentials.")

    anon = _anon_client()
    try:
        auth_res = anon.auth.sign_in_with_password({"email": email, "password": password})
    except AuthApiError as e:
        lockout.record_failure(normalised)
        logger.warning("[auth] mobile sign_in failed for '%s' ip=%s: %s", normalised, client_ip, e)
        audit.login_failed(credential=normalised, ip=client_ip, reason="bad_password", platform="mobile")
        raise ValueError("Invalid credentials.")

    if not auth_res.user:
        lockout.record_failure(normalised)
        audit.login_failed(credential=normalised, ip=client_ip, reason="no_user_returned", platform="mobile")
        raise ValueError("Invalid credentials.")

    sb = _service_client()
    profile_res = sb.table("profiles").select("*").eq("id", auth_res.user.id).limit(1).execute()
    rows = profile_res.data or []
    profile = rows[0] if rows else None

    if not profile or profile.get("role") != "technician":
        anon.auth.sign_out()
        lockout.record_failure(normalised)
        audit.login_failed(credential=normalised, ip=client_ip, reason="wrong_role", platform="mobile")
        raise ValueError("Access denied: technician accounts only.")

    if not profile.get("is_active", True):
        anon.auth.sign_out()
        audit.login_failed(credential=normalised, ip=client_ip, reason="account_disabled", platform="mobile")
        raise ValueError("Account is disabled.")

    lockout.record_success(normalised)
    logger.info("[auth] technician login success: user_id=%s ip=%s", auth_res.user.id, client_ip)
    audit.login_success(user_id=str(auth_res.user.id), credential=normalised, ip=client_ip,
                        user_agent=user_agent, platform="mobile")

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


def revoke_session(refresh_token: str) -> None:
    """Sign the session out on the Supabase side using its refresh token."""
    anon = _anon_client()
    try:
        anon.auth.refresh_session(refresh_token)  # hydrate session so sign_out targets it
        anon.auth.sign_out()
    except Exception:
        pass  # best-effort; cookies are already cleared by the caller
