"""JWT verification and session fingerprinting.

JWT verification supports:
  - Legacy HS256 (symmetric, shared JWT secret)
  - Modern ES256/RS256 (asymmetric, public key via JWKS)

Session fingerprinting binds every session to a (IP, User-Agent) hash stored
in a non-sensitive opaque cookie.  A mismatch on a protected request is a
signal of session hijacking and triggers re-authentication.

The fingerprint is a HMAC-SHA256 of "ip:ua" keyed by csrf_secret so an
attacker who can read the cookie cannot forge a valid fingerprint for a
different IP/UA combination.
"""

import hashlib
import hmac
import logging
from functools import lru_cache

import jwt
from jwt import PyJWKClient

logger = logging.getLogger("auth.security")


@lru_cache(maxsize=4)
def _jwks_client(supabase_url: str) -> PyJWKClient:
    """One PyJWKClient per project URL; reuses its internal cache."""
    jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return PyJWKClient(jwks_url, cache_keys=True, lifespan=3600)


def verify_supabase_token(token: str, jwt_secret: str, supabase_url: str | None = None) -> dict:
    """Verify a Supabase-issued JWT.

    Returns the decoded payload on success, or an empty dict on any failure
    (bad signature, expired, malformed, unknown algorithm).
    """
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        return {}

    alg = header.get("alg", "HS256")

    try:
        if alg == "HS256":
            return jwt.decode(
                token, jwt_secret, algorithms=["HS256"], options={"verify_aud": False}
            )

        if alg in ("ES256", "RS256"):
            if not supabase_url:
                return {}
            signing_key = _jwks_client(supabase_url).get_signing_key_from_jwt(token).key
            return jwt.decode(
                token, signing_key, algorithms=[alg], options={"verify_aud": False}
            )

        return {}
    except jwt.PyJWTError:
        return {}


# ─── Session fingerprinting ───────────────────────────────────────────────────

def make_session_fingerprint(ip: str, user_agent: str, secret: str) -> str:
    """Return an opaque HMAC fingerprint for a (IP, UA) pair.

    Stored in the `session_fp` cookie (httpOnly, same attributes as
    access_token) and compared on every protected request.
    """
    raw = f"{ip}:{user_agent}"
    return hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()


def verify_session_fingerprint(
    stored_fp: str | None,
    current_ip: str,
    current_ua: str,
    secret: str,
    user_id: str = "",
) -> bool:
    """Return True if the stored fingerprint matches the current request context.

    A missing fingerprint returns False so old sessions without one are
    invalidated and the user is asked to re-authenticate.
    """
    if not stored_fp:
        return False
    expected = make_session_fingerprint(current_ip, current_ua, secret)
    match = hmac.compare_digest(stored_fp, expected)
    if not match:
        logger.warning(
            "[security] fingerprint MISMATCH — possible hijack: user_id=%s ip=%s",
            user_id, current_ip,
        )
    return match
