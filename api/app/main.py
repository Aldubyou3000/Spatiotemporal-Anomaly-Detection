import logging
import traceback

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .core.config import settings
from .routers import audit, auth, mobile, reports, technicians, tickets, zones

logger = logging.getLogger("uvicorn.error")

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

app = FastAPI(title="Spatiotemporal Anomaly Detection API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "[unhandled] %s %s -> %s: %s\n%s",
        request.method, request.url.path, type(exc).__name__, exc,
        traceback.format_exc(),
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


_origin_regex = (
    r"http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?"
    if settings.dev_mode else None
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With",
                   "Cache-Control", "X-CSRF-Token"],
    expose_headers=["Content-Length"],
    max_age=600,
)

# CSP is intentionally permissive for the API server itself (no HTML served).
# Tighten this if the API ever serves HTML responses.
_CSP = (
    "default-src 'none'; "
    "frame-ancestors 'none'"
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = _CSP
    response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
    # HSTS: only meaningful when TLS is terminated (cookie_secure=True in prod)
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    return response


app.include_router(auth.router)
app.include_router(zones.router)
app.include_router(tickets.router)
app.include_router(reports.router)
app.include_router(technicians.router)
app.include_router(mobile.router)
app.include_router(audit.router)


@app.on_event("startup")
async def _startup_audit():
    from .services.audit_service import audit, AuditEvent
    audit.log(event=AuditEvent.SYSTEM_STARTUP, meta={"version": "1.0.0"})


@app.get("/health")
def health():
    return {"status": "ok"}
