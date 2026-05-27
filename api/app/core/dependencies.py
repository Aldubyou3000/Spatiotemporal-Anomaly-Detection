import logging
from functools import lru_cache

import jwt
from fastapi import Cookie, Depends, Header, HTTPException, status
from supabase import Client, create_client

from .config import settings
from .security import verify_supabase_token

logger = logging.getLogger("auth")


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _verify_and_load_profile(token: str) -> dict:
    """Shared token verification + profile load used by both cookie and Bearer paths."""
    try:
        header = jwt.get_unverified_header(token)
        unverified = jwt.decode(token, options={"verify_signature": False})
        logger.info(
            f"[auth] Token alg={header.get('alg')} kid={header.get('kid')} "
            f"sub={unverified.get('sub')} iss={unverified.get('iss')}"
        )
    except Exception as e:
        logger.warning(f"[auth] Could not parse token: {e}")

    payload = verify_supabase_token(
        token,
        settings.supabase_jwt_secret,
        supabase_url=settings.supabase_url,
    )
    if not payload:
        logger.warning("[auth] Token verification FAILED (signature/expiry)")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    sb = get_supabase()
    result = (
        sb.table("profiles")
        .select("id, role, full_name, username, email, phone, station_ids, is_active")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User profile not found")

    return rows[0]


def get_current_user(access_token: str | None = Cookie(default=None)) -> dict:
    """Cookie-based auth — used by the web dashboard."""
    if not access_token:
        logger.warning("[auth] No access_token cookie received")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return _verify_and_load_profile(access_token)


def get_mobile_user(authorization: str | None = Header(default=None)) -> dict:
    """Bearer token auth — used by the mobile app (token stored in SecureStore)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    return _verify_and_load_profile(token)


def require_analyst(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "analyst":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst access required")
    return user


def require_technician_mobile(user: dict = Depends(get_mobile_user)) -> dict:
    if user.get("role") != "technician":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Technician access required")
    return user
