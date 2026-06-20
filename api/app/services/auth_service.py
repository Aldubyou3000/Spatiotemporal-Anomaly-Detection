import logging
import secrets
import threading
import time

from supabase import ClientOptions, create_client
from supabase_auth.errors import AuthApiError

from ..core.config import settings
from ..core.lockout import lockout
from .audit_service import audit

logger = logging.getLogger("auth.service")

# In-process store for the OAuth PKCE round-trip: state -> (code_verifier, expiry).
# The `state` value travels in the URL (it always survives the Google→Supabase→API
# redirect chain, unlike a cookie), so we key off it instead of relying on a cookie
# surviving cross-site redirects. A matching, unexpired, single-use entry IS the
# CSRF defence (state is unguessable and must exist in our store).
# In-process is consistent with the project's single-worker SSE broker constraint;
# Redis is the documented multi-worker upgrade path.
_OAUTH_STATE_TTL = 600   # 10 minutes to complete consent
_OAUTH_STATE_MAX = 1000  # hard ceiling — drop oldest beyond this (abuse guard)
# state -> (code_verifier, return_url, expiry). return_url is None for the web
# flow (cookies) and the app deep-link (e.g. "spatiotemporal://oauth-callback")
# for the mobile flow, so the callback knows where to bounce the browser.
_oauth_states: dict[str, tuple[str, str | None, float]] = {}
_oauth_states_lock = threading.Lock()


def _oauth_state_put(state: str, code_verifier: str, return_url: str | None = None) -> None:
    now = time.monotonic()
    with _oauth_states_lock:
        # Opportunistic GC of expired entries so the dict can't grow unbounded.
        expired = [s for s, (_, _, exp) in _oauth_states.items() if exp <= now]
        for s in expired:
            _oauth_states.pop(s, None)
        # Hard ceiling: even within the TTL window, never let the store grow past
        # _OAUTH_STATE_MAX. Drop the oldest entries first (dict preserves insertion
        # order). Bounded memory even under a burst of /start calls.
        while len(_oauth_states) >= _OAUTH_STATE_MAX:
            _oauth_states.pop(next(iter(_oauth_states)), None)
        _oauth_states[state] = (code_verifier, return_url, now + _OAUTH_STATE_TTL)


def _oauth_state_pop(state: str) -> tuple[str, str | None] | None:
    """Return (verifier, return_url) for `state` and remove it (one-time use).
    None if missing or expired."""
    now = time.monotonic()
    with _oauth_states_lock:
        entry = _oauth_states.pop(state, None)
    if not entry:
        return None
    verifier, return_url, expiry = entry
    if expiry <= now:
        return None
    return verifier, return_url


class _DictStorage:
    """Minimal in-memory storage so the PKCE code_verifier produced during
    sign_in_with_oauth can be read back out (the public method discards it).

    GoTrue's SyncSupportedStorage interface is just get/set/remove_item.
    """

    def __init__(self) -> None:
        self._data: dict[str, str] = {}

    def get_item(self, key: str) -> str | None:
        return self._data.get(key)

    def set_item(self, key: str, value: str) -> None:
        self._data[key] = value

    def remove_item(self, key: str) -> None:
        self._data.pop(key, None)


def _service_client():
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def _anon_client():
    return create_client(settings.supabase_url, settings.supabase_anon_key)


def _pkce_anon_client(storage: _DictStorage):
    """Anon client in PKCE flow mode, backed by the given storage so we can
    capture the generated code_verifier (start leg) or supply it (callback)."""
    return create_client(
        settings.supabase_url,
        settings.supabase_anon_key,
        options=ClientOptions(
            flow_type="pkce",
            storage=storage,
            persist_session=False,
            auto_refresh_token=False,
        ),
    )


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


# ── Google OAuth (shared web + mobile) ──────────────────────────────────────
# Server-side PKCE: the client never talks to Supabase directly. `oauth_start`
# builds the Google authorize URL, generates a state nonce, and stores
# {state -> (code_verifier, return_url)} server-side (see _oauth_state_put). The
# state is embedded in the authorize URL so Supabase/Google echo it back on the
# callback — it survives the cross-domain redirect chain where a cookie would not.
# The completion helper looks the verifier up by state, exchanges the code for a
# Supabase session, then applies the SAME profile/role/active gate as password
# login — so an unprovisioned Google account is rejected and no orphan account is
# left behind. Role is never taken from Google; it comes from the `profiles` table.
#
#   * Web   → callback = oauth_google_callback_url,  required_role="analyst",   return_url=None (cookies)
#   * Mobile→ callback = mobile_oauth_callback_url,  required_role="technician",return_url="spatiotemporal://…"


def oauth_start(provider: str = "google", *, callback_url: str | None = None,
                return_url: str | None = None) -> dict:
    """Return {url, state} for the OAuth redirect.

    `callback_url` is the BACKEND endpoint Supabase redirects to (web vs mobile);
    defaults to the web callback. `return_url` is the optional app deep-link the
    mobile callback will bounce the browser to (stored server-side, not sent to
    Google). The GoTrue client generates the PKCE verifier inside
    sign_in_with_oauth and stashes it in storage (the public method discards it),
    so we read it back out of our custom storage and keep it keyed by `state`.
    """
    callback_url = callback_url or settings.oauth_google_callback_url
    state = secrets.token_urlsafe(32)
    # Put the state in the redirect_to PATH, not the query. Supabase matches the
    # whole redirect_to against its allow list; a `?query` does NOT reliably match
    # a `**` wildcard there (it falls back to Site URL), but a path segment does:
    # register `…/callback/**` and `**` spans the `/state` segment AND the `?code=`
    # Supabase appends. `token_urlsafe` has no `/`, so it stays one clean segment.
    redirect_to = f"{callback_url.rstrip('/')}/{state}"
    storage = _DictStorage()
    client = _pkce_anon_client(storage)
    res = client.auth.sign_in_with_oauth(
        {
            "provider": provider,
            "options": {"redirect_to": redirect_to},
        }
    )

    # GoTrue stores the verifier under f"{storage_key}-code-verifier"; find it
    # without hardcoding the key prefix (version-independent).
    code_verifier = next(
        (v for k, v in storage._data.items() if k.endswith("-code-verifier")),
        None,
    )
    if not code_verifier:
        raise RuntimeError("PKCE code_verifier was not produced by the OAuth client.")

    _oauth_state_put(state, code_verifier, return_url)
    return {"url": res.url, "state": state}


class OAuthGateError(ValueError):
    """OAuth completion failure that also carries the app return_url (when known)
    so the mobile callback can deep-link the error back with the correct scheme.
    `return_url` is None only when the state lookup itself failed (we never
    learned where to bounce). Subclasses ValueError so existing `except ValueError`
    handlers (web) keep working unchanged."""

    def __init__(self, message: str, return_url: str | None = None) -> None:
        super().__init__(message)
        self.return_url = return_url


def _oauth_exchange_and_gate(code: str, state: str, *, required_role: str,
                             callback_url: str, platform: str,
                             client_ip: str, user_agent: str) -> tuple[dict, str | None]:
    """Shared completion: exchange code → enforce role + active. Returns
    ({access_token, refresh_token, user}, return_url). Raises OAuthGateError
    (a ValueError) on any failure (state/exchange/role/inactive), having audited
    the reason; the error carries the return_url when it is known."""
    popped = _oauth_state_pop(state) if state else None
    if not popped:
        logger.warning("[auth] oauth state lookup failed ip=%s platform=%s", client_ip, platform)
        audit.login_failed(credential="<google-oauth>", ip=client_ip,
                           user_agent=user_agent, reason="oauth_state", platform=platform)
        raise OAuthGateError("Google sign-in could not be verified. Please try again.")
    code_verifier, return_url = popped

    storage = _DictStorage()
    # Re-supply the verifier so exchange_code_for_session can find it if it
    # consults storage; it is also passed explicitly below.
    storage.set_item("sb-code-verifier", code_verifier)
    anon = _pkce_anon_client(storage)

    try:
        auth_res = anon.auth.exchange_code_for_session(
            {
                "auth_code": code,
                "code_verifier": code_verifier,
                "redirect_to": callback_url,
            }
        )
    except AuthApiError as e:
        logger.warning("[auth] oauth code exchange failed ip=%s platform=%s: %s", client_ip, platform, e)
        audit.login_failed(credential="<google-oauth>", ip=client_ip,
                           user_agent=user_agent, reason="oauth_exchange_failed", platform=platform)
        raise OAuthGateError("Google sign-in failed. Please try again.", return_url)

    if not auth_res.user or not auth_res.session:
        audit.login_failed(credential="<google-oauth>", ip=client_ip,
                           user_agent=user_agent, reason="oauth_no_session", platform=platform)
        raise OAuthGateError("Google sign-in failed. Please try again.", return_url)

    email = (auth_res.user.email or "").strip().lower()

    profile_res = _service_client().table("profiles").select("*").eq("email", email).limit(1).execute()
    rows = profile_res.data or []
    profile = rows[0] if rows else None

    if not profile or profile.get("role") != required_role:
        anon.auth.sign_out()
        role = profile.get("role") if profile else "none"
        logger.warning("[auth] oauth role denied for '%s' ip=%s want=%s got=%s",
                       email, client_ip, required_role, role)
        audit.login_failed(credential=email or "<google-oauth>", ip=client_ip,
                           user_agent=user_agent, reason="wrong_role", platform=platform)
        raise OAuthGateError(f"Access denied: this Google account is not an authorised {required_role}.", return_url)

    if not profile.get("is_active", True):
        anon.auth.sign_out()
        logger.warning("[auth] oauth inactive account: '%s' ip=%s", email, client_ip)
        audit.login_failed(credential=email, ip=client_ip, user_agent=user_agent,
                           reason="account_disabled", platform=platform)
        raise OAuthGateError("Account is disabled.", return_url)

    logger.info("[auth] %s oauth login success: user_id=%s ip=%s", required_role, auth_res.user.id, client_ip)
    audit.login_success(user_id=str(auth_res.user.id), credential=email, ip=client_ip,
                        user_agent=user_agent, platform=platform)

    return (
        {
            "access_token": auth_res.session.access_token,
            "refresh_token": auth_res.session.refresh_token,
            "user": profile,
        },
        return_url,
    )


def oauth_complete(code: str, state: str, client_ip: str = "unknown",
                   user_agent: str = "") -> dict:
    """Web (analyst) completion — returns {access_token, refresh_token, user}."""
    result, _ = _oauth_exchange_and_gate(
        code, state, required_role="analyst",
        callback_url=settings.oauth_google_callback_url, platform="web",
        client_ip=client_ip, user_agent=user_agent,
    )
    return result


def oauth_complete_mobile(code: str, state: str, client_ip: str = "unknown",
                          user_agent: str = "") -> tuple[dict, str | None]:
    """Mobile (technician) completion — returns
    ({access_token, refresh_token, user}, return_url). The router redirects the
    browser to `return_url#access_token=…&refresh_token=…` so the app picks up
    the tokens via its deep-link scheme.
    """
    return _oauth_exchange_and_gate(
        code, state, required_role="technician",
        callback_url=settings.mobile_oauth_callback_url, platform="mobile",
        client_ip=client_ip, user_agent=user_agent,
    )


def refresh_session(refresh_token: str) -> dict:
    """Exchange a refresh token for a new access + refresh token pair.

    Supabase rotates the refresh token on every use (and, with reuse-detection
    enabled in the dashboard, replaying a consumed refresh token revokes the
    whole session family). We also surface the authenticated `user_id` so the
    caller can audit *who* refreshed instead of logging "unknown".
    """
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
        "user_id": str(res.user.id) if res.user else None,
    }


def revoke_session(refresh_token: str) -> bool:
    """Sign the session out on the Supabase side using its refresh token.

    Returns True if Supabase confirmed the sign-out (refresh token invalidated
    server-side), False otherwise. The caller still clears cookies regardless,
    but a False result is logged so a provider-side revocation failure is visible
    rather than silently swallowed.
    """
    anon = _anon_client()
    try:
        anon.auth.refresh_session(refresh_token)  # hydrate session so sign_out targets it
        anon.auth.sign_out()
        return True
    except Exception as e:
        logger.warning("[auth] server-side session revocation failed: %s", e)
        return False
