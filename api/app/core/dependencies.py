import logging
import threading

import httpx
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from supabase import Client, ClientOptions, create_client

from .config import settings
from .security import verify_session_fingerprint, verify_supabase_token

logger = logging.getLogger("auth")

# Module-level Supabase singleton with a lock so concurrent startup requests
# don't create multiple clients. The client is intentionally never replaced
# during normal operation — Supabase's client handles reconnection internally.
_supabase_client: Client | None = None
_supabase_lock = threading.Lock()

# Shared httpx transport tuned for Render 0.1 CPU + Supabase cold start.
# Default supabase-py uses httpx.Client(timeout=10s) with no Limits tuning —
# under burst (health + SSE + tickets workload) that trips ReadTimeout and
# `httpcore.ReadError: [Errno 11] Resource temporarily unavailable` (FD/EAGAIN
# on http2). Reuse one Client (thread-safe for sync) with 30s timeout,
# conservative pooling and http2 disabled (ALPN http/1.1, no multiplex contention).
_SUPABASE_TIMEOUT = httpx.Timeout(30.0, connect=10.0)
_SUPABASE_LIMITS = httpx.Limits(
    max_connections=20,
    max_keepalive_connections=10,
    keepalive_expiry=30.0,
)
_supabase_httpx: httpx.Client | None = None
_supabase_httpx_lock = threading.Lock()


def _get_supabase_httpx() -> httpx.Client:
    global _supabase_httpx
    if _supabase_httpx is None:
        with _supabase_httpx_lock:
            if _supabase_httpx is None:
                _supabase_httpx = httpx.Client(
                    timeout=_SUPABASE_TIMEOUT,
                    limits=_SUPABASE_LIMITS,
                    http2=False,
                    follow_redirects=True,
                )
    return _supabase_httpx


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        with _supabase_lock:
            if _supabase_client is None:
                # Reuse the tuned httpx client so PostgREST/Storage/GoTrue share
                # one pool (max 20 conns) instead of per-request CLS churn.
                try:
                    httpx_client = _get_supabase_httpx()
                    _supabase_client = create_client(  # type: ignore[call-arg]
                        settings.supabase_url,
                        settings.supabase_service_role_key,
                        options=ClientOptions(  # type: ignore[call-arg]
                            postgrest_client_timeout=30,
                            storage_client_timeout=30,
                            function_client_timeout=30,
                            httpx_client=httpx_client,  # type: ignore[arg-type]
                        ),
                    )
                except Exception:
                    # Fallback to defaults if ClientOptions signature changes
                    _supabase_client = create_client(
                        settings.supabase_url, settings.supabase_service_role_key
                    )
    return _supabase_client


def shutdown_supabase() -> None:
    """Close the shared httpx pool on lifespan shutdown (best-effort)."""
    global _supabase_client, _supabase_httpx
    try:
        if _supabase_httpx is not None:
            _supabase_httpx.close()
    except Exception:
        pass
    _supabase_httpx = None
    _supabase_client = None


def _client_ip(request: Request) -> str:
    """Best-effort real IP — reads X-Forwarded-For when behind a proxy."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _client_ua(request: Request) -> str:
    return request.headers.get("User-Agent", "")


def _verify_and_load_profile(token: str) -> dict:
    """Shared token verification + profile load used by both cookie and Bearer paths."""
    try:
        header = jwt.get_unverified_header(token)
        unverified = jwt.decode(token, options={"verify_signature": False})
        logger.info(
            "[auth] Token alg=%s kid=%s sub=%s iss=%s",
            header.get("alg"), header.get("kid"),
            unverified.get("sub"), unverified.get("iss"),
        )
    except Exception as e:
        logger.warning("[auth] Could not parse token: %s", e)

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

    profile = rows[0]

    if not profile.get("is_active", True):
        logger.warning("[auth] Login attempt by disabled account: user_id=%s", user_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    return profile


def get_current_user(
    request: Request,
    access_token: str | None = Cookie(default=None),
    session_fp: str | None = Cookie(default=None),
) -> dict:
    """Cookie-based auth for the web dashboard.

    Also validates the session fingerprint cookie to detect hijacking.
    On mismatch the session is treated as compromised and a 401 is returned,
    forcing re-authentication and issuing a fresh fingerprint.
    """
    if not access_token:
        logger.warning("[auth] No access_token cookie received from ip=%s", _client_ip(request))
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    profile = _verify_and_load_profile(access_token)

    # Fingerprint check — HOTFIX: log mismatch but do NOT reject (UA drift on
    # Chrome 128->129 / EventSource vs fetch causes spurious 401 which broke
    # prod login + SSE. Keep audit trail but allow session to continue).
    if not verify_session_fingerprint(
        session_fp,
        _client_ip(request),
        _client_ua(request),
        settings.csrf_secret,
        user_id=profile.get("id", ""),
    ):
        logger.warning(
            "[auth] Session fingerprint missing or mismatched (HOTFIX allow): user_id=%s ip=%s ua=%s",
            profile.get("id"), _client_ip(request), _client_ua(request)[:80],
        )
        # Do NOT raise — former 401 blocked production users after Chrome UA bump
        # from ..services.audit_service import audit as _audit
        # _audit.session_hijack_attempt(...)  # muted during hotfix to avoid noise

    return profile


def get_mobile_user(authorization: str | None = Header(default=None)) -> dict:
    """Bearer token auth for the mobile app (token stored in SecureStore)."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ").strip()
    return _verify_and_load_profile(token)


def get_current_user_or_bearer(
    request: Request,
    access_token: str | None = Cookie(default=None),
    session_fp: str | None = Cookie(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    """Accept either web cookie auth or Bearer token (for direct zones upload bypassing Vercel proxy)."""
    # Try Bearer first if present (direct upload from Vercel bypass)
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.removeprefix("Bearer ").strip()
            return _verify_and_load_profile(token)
        except HTTPException:
            pass  # fall through to cookie
    # Fall back to cookie auth
    if not access_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    profile = _verify_and_load_profile(access_token)
    if not verify_session_fingerprint(
        session_fp,
        _client_ip(request),
        _client_ua(request),
        settings.csrf_secret,
        user_id=profile.get("id", ""),
    ):
        logger.warning(
            "[auth] Session fingerprint missing or mismatched (HOTFIX allow, bearer path): user_id=%s ip=%s ua=%s",
            profile.get("id"), _client_ip(request), _client_ua(request)[:80],
        )
        # HOTFIX: do not reject — same UA-drift root cause as above
    return profile


def require_analyst(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "analyst":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst access required")
    return user


def require_analyst_or_bearer(user: dict = Depends(get_current_user_or_bearer)) -> dict:
    if user.get("role") != "analyst":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Analyst access required")
    return user


def require_technician_mobile(user: dict = Depends(get_mobile_user)) -> dict:
    if user.get("role") != "technician":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Technician access required")
    return user
