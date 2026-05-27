"""JWT verification for Supabase access tokens.

Supports both:
  - Legacy HS256 (symmetric, shared JWT secret) — older projects
  - Modern ES256/RS256 (asymmetric, public key via JWKS) — projects created
    after Supabase's 2024 default to asymmetric signing

The algorithm is read from the unverified JWT header and routed accordingly.
JWKS keys are cached (default TTL 1h via PyJWKClient.lifespan).
"""

from functools import lru_cache

import jwt
from jwt import PyJWKClient


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
