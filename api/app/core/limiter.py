"""Single slowapi Limiter shared across all routers.

Uses X-Forwarded-For so per-route limits are per-real-client, not per-proxy IP.
Import `limiter` from here; do NOT create router-local Limiter instances (they
create independent MemoryStorage and share the proxy-IP bucket bug).
"""
from fastapi import Request
from slowapi import Limiter


def _rate_limit_key(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_rate_limit_key, default_limits=["120/minute"])
