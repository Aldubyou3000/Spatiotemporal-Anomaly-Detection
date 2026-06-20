"""Web dashboard auth endpoints — cookie-based, analyst role only.

Security layers applied here:
  - Rate limiting: 10/min login, 30/min refresh (via slowapi)
  - CSRF double-submit cookie: a random token is set in a readable JS cookie
    (`csrf_token`) and must be echoed in the `X-CSRF-Token` request header for
    all mutating endpoints.  httpOnly cookies cannot be read by JS, so an
    attacker making a cross-site request cannot supply the correct header.
  - Session fingerprinting: a HMAC of (IP, User-Agent) is stored in the
    `session_fp` httpOnly cookie and checked on every protected request in
    dependencies.py.
  - Anti-fixation: the fingerprint cookie is regenerated on every login and
    every token refresh so a pre-login cookie cannot be reused post-login.
  - Server-side revocation: logout calls Supabase sign-out so the refresh
    token is invalidated at the provider level, not just client-side.
"""

import logging
import secrets

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.config import settings
from ..core.dependencies import _client_ip, _client_ua, get_current_user
from ..core.security import make_session_fingerprint
from ..schemas.auth import LoginRequest, LoginResponse
from ..services.audit_service import audit
from ..services.auth_service import (
    login,
    oauth_complete,
    oauth_start,
    refresh_session,
    revoke_session,
)

logger = logging.getLogger("auth.router")

router = APIRouter(prefix="/api/auth", tags=["auth"])
limiter = Limiter(key_func=get_remote_address)

_ACCESS_MAX_AGE = 30 * 60           # 30 minutes
_REFRESH_MAX_AGE = 7 * 24 * 60 * 60  # 7 days
_FP_MAX_AGE = _REFRESH_MAX_AGE      # fingerprint lives as long as the refresh token


def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    request: Request,
) -> None:
    """Set all three session cookies atomically.

    Cookies set here:
      access_token  — httpOnly, not readable by JS, holds the JWT
      refresh_token — httpOnly, only sent to /api/auth/refresh
      session_fp    — httpOnly, binds session to (IP, UA) fingerprint
      csrf_token    — NOT httpOnly (JS must read it), SameSite=Strict,
                      paired with the X-CSRF-Token header check
    """
    samesite = settings.cookie_samesite
    secure = settings.cookie_secure

    fp = make_session_fingerprint(_client_ip(request), _client_ua(request), settings.csrf_secret)
    csrf = secrets.token_hex(32)

    for name, value, max_age, path in [
        ("access_token",  access_token,  _ACCESS_MAX_AGE,  "/"),
        ("refresh_token", refresh_token, _REFRESH_MAX_AGE, "/api/auth/refresh"),
        ("session_fp",    fp,            _FP_MAX_AGE,      "/"),
    ]:
        response.set_cookie(
            name, value,
            httponly=True,
            secure=secure,
            samesite=samesite,
            max_age=max_age,
            path=path,
        )

    # CSRF token — readable by JS so it can be sent in X-CSRF-Token header.
    # SameSite=Strict prevents it from being sent cross-site at all, but the
    # header requirement is the primary defence.
    response.set_cookie(
        "csrf_token", csrf,
        httponly=False,
        secure=secure,
        samesite="strict",
        max_age=_ACCESS_MAX_AGE,
        path="/",
    )


def _delete_all_cookies(response: Response) -> None:
    secure = settings.cookie_secure
    samesite = settings.cookie_samesite
    for name, path in [
        ("access_token",  "/"),
        ("refresh_token", "/api/auth/refresh"),
        ("session_fp",    "/"),
        ("csrf_token",    "/"),
    ]:
        response.delete_cookie(name, httponly=True, secure=secure, samesite=samesite, path=path)


def _require_csrf(x_csrf_token: str | None = Header(default=None, alias="X-CSRF-Token"),
                  csrf_cookie: str | None = Cookie(default=None, alias="csrf_token")) -> None:
    """FastAPI dependency: enforce CSRF double-submit for mutating endpoints.

    Skipped on login (no session exists yet — the cookie is just being issued).
    """
    if not x_csrf_token or not csrf_cookie:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token missing")
    import hmac
    if not hmac.compare_digest(x_csrf_token, csrf_cookie):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token invalid")


# ── Google OAuth (analyst web sign-in) ──────────────────────────────────────
# Two-leg server-side PKCE flow. /start redirects the browser to Google with a
# PKCE challenge and a state nonce; the PKCE verifier is kept server-side keyed by
# that state (see auth_service._oauth_state_*). /callback receives the code + the
# echoed state, looks up the verifier, exchanges the code for a Supabase session,
# enforces analyst-role gating, and on success issues the SAME session cookies as
# password login. We key off `state` (in the URL) rather than a cookie because a
# SameSite cookie does not reliably survive the Google→Supabase→API redirect
# chain. Failures redirect back to the web login page with a friendly ?error=
# code — never JSON, because these are top-level browser navigations, not fetches.

def _login_redirect(error: str | None = None) -> RedirectResponse:
    base = settings.web_app_url.rstrip("/")
    url = f"{base}/login?error={error}" if error else f"{base}/login"
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND)


@router.get("/oauth/google/start")
@limiter.limit("10/minute")
def oauth_google_start(request: Request):
    if not settings.google_oauth_enabled:
        return _login_redirect("oauth_disabled")
    try:
        data = oauth_start("google")
    except Exception:
        logger.exception("[auth] oauth start failed")
        return _login_redirect("oauth_unavailable")

    return RedirectResponse(data["url"], status_code=status.HTTP_302_FOUND)


@router.get("/oauth/google/callback/{state}")
@limiter.limit("10/minute")
def oauth_google_callback(
    request: Request,
    state: str,
    code: str | None = None,
    error: str | None = None,
):
    # `state` is a PATH segment (Supabase matched `…/callback/**`); `code` is the
    # query param Supabase appended. User cancelled / Google error → no code.
    if error or not code:
        return _login_redirect("oauth_cancelled")

    try:
        result = oauth_complete(
            code, state,
            client_ip=_client_ip(request), user_agent=_client_ua(request),
        )
    except ValueError:
        return _login_redirect("oauth_denied")

    # Success — issue the same session cookies as password login and land the
    # analyst on the dashboard.
    resp = RedirectResponse(f"{settings.web_app_url.rstrip('/')}/zones",
                            status_code=status.HTTP_302_FOUND)
    _set_auth_cookies(resp, result["access_token"], result["refresh_token"], request)
    logger.info("[auth] web oauth login: user_id=%s ip=%s", result["user"].get("id"), _client_ip(request))
    return resp


@router.post("/login", response_model=LoginResponse)
@limiter.limit("10/minute")
def login_endpoint(request: Request, body: LoginRequest, response: Response):
    # No CSRF check here — no session cookie exists yet before login.
    # The fingerprint and CSRF tokens are issued as part of this response.
    try:
        result = login(body.credential, body.password, client_ip=_client_ip(request), user_agent=_client_ua(request))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    _set_auth_cookies(response, result["access_token"], result["refresh_token"], request)
    logger.info("[auth] web login: user_id=%s ip=%s", result["user"].get("id"), _client_ip(request))
    return {"user": result["user"]}


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh_endpoint(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    _csrf: None = Depends(_require_csrf),
):
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        result = refresh_session(refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    # Rotate fingerprint and CSRF token on every refresh (anti-fixation)
    _set_auth_cookies(response, result["access_token"], result["refresh_token"], request)
    # Audit the real refresher (from the verified new session) so anomalous
    # refresh patterns are attributable, not logged as "unknown".
    audit.session_refresh(user_id=result.get("user_id") or "unknown", ip=_client_ip(request))
    return {"ok": True}


@router.get("/me")
def me_endpoint(user: dict = Depends(get_current_user)):
    return user


@router.post("/logout")
def logout_endpoint(
    request: Request,
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    user: dict = Depends(get_current_user),
):
    # CSRF is intentionally not checked here: get_current_user validates the JWT,
    # which is the meaningful auth guard. Requiring CSRF on logout can prevent users
    # from signing out when the short-lived csrf_token cookie has already expired.
    revoked = revoke_session(refresh_token) if refresh_token else False

    _delete_all_cookies(response)
    logger.info("[auth] web logout: user_id=%s server_revoked=%s", user.get("id"), revoked)
    audit.logout(user_id=str(user["id"]), ip=_client_ip(request), platform="web")
    if refresh_token and not revoked:
        # Cookies are gone client-side, but the provider didn't confirm the
        # refresh token is dead — surface it for monitoring.
        logger.warning("[auth] logout did not confirm server-side revocation: user_id=%s", user.get("id"))
    return {"ok": True}
