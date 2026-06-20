"""Mobile app endpoints — technician-scoped, Bearer token auth.

All routes here require a valid technician JWT in the Authorization header.
The mobile app stores this token in Expo SecureStore, never in localStorage.
"""

import logging
from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.dependencies import get_supabase, require_technician_mobile
from ..core.config import settings
from ..services.audit_service import audit
from ..services.auth_service import (
    OAuthGateError,
    mobile_login as _mobile_login,
    oauth_complete_mobile,
    oauth_start,
    refresh_session,
    revoke_session,
)
from supabase_auth.errors import AuthApiError

logger = logging.getLogger("mobile.router")

router = APIRouter(prefix="/api/mobile", tags=["mobile"])
limiter = Limiter(key_func=get_remote_address)


def _one(table_res) -> dict | None:
    """Return the first row from a list result, or None."""
    rows = table_res.data
    if not rows:
        return None
    return rows[0]


def _signed_url(sb, bucket: str, path: str, expires: int = 3600) -> str:
    """Generate a signed URL for a single path (kept for one-off use)."""
    result = _signed_urls_batch(sb, bucket, [path], expires)
    return result.get(path, "")


def _signed_urls_batch(sb, bucket: str, paths: list[str], expires: int = 3600) -> dict[str, str]:
    """Sign multiple storage paths in one HTTP call. Returns {path: signed_url}.
    Falls back gracefully — missing entries return empty string."""
    if not paths:
        return {}
    try:
        res = sb.storage.from_(bucket).create_signed_urls(paths, expires)
        out: dict[str, str] = {}
        for item in (res if isinstance(res, list) else []):
            p = item.get("path", "")
            url = item.get("signedURL") or item.get("signedUrl") or item.get("signed_url") or ""
            if p:
                out[p] = url
        return out
    except Exception:
        return {}


# ─── Auth ─────────────────────────────────────────────────────────────────────

class MobileLoginRequest(BaseModel):
    credential: str
    password: str


class MobileLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


class MobileRefreshRequest(BaseModel):
    refresh_token: str


@router.post("/auth/login", response_model=MobileLoginResponse)
@limiter.limit("10/minute")
def mobile_login_endpoint(request: Request, body: MobileLoginRequest):
    """Technician login — returns tokens directly (stored in SecureStore, never cookies)."""
    client_ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    try:
        result = _mobile_login(body.credential, body.password, client_ip=client_ip,
                               user_agent=request.headers.get("User-Agent", ""))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return result


@router.post("/auth/refresh")
@limiter.limit("30/minute")
def mobile_refresh(request: Request, body: MobileRefreshRequest):
    """Exchange a refresh token for new tokens."""
    try:
        result = refresh_session(body.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    return result


@router.post("/auth/logout")
@limiter.limit("30/minute")
def mobile_logout(request: Request, body: MobileRefreshRequest, user: dict = Depends(require_technician_mobile)):
    """Invalidate the current session on the Supabase side using the refresh token."""
    client_ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    revoke_session(body.refresh_token)
    audit.logout(user_id=str(user["id"]), ip=client_ip, platform="mobile")
    return {"ok": True}


@router.get("/auth/me")
@limiter.limit("60/minute")
def mobile_me(request: Request, user: dict = Depends(require_technician_mobile)):
    return user


# ─── Google OAuth (technician sign-in) ────────────────────────────────────────
# Server-side PKCE, mirroring the web flow but: (1) gates on technician role,
# (2) returns tokens to the app's deep-link scheme in the URL fragment instead of
# setting cookies. The app opens /start in the system browser; Supabase/Google
# redirect back to /callback; /callback bounces the browser to
# spatiotemporal://oauth-callback#access_token=…&refresh_token=… which the app
# catches via expo-web-browser. The `return_url` is held server-side keyed by
# state, so it never travels to Google.

# The deep-link scheme the app registers (App/app.json "scheme"), used as the
# fallback when we have no recoverable return_url to bounce an error to.
_APP_SCHEME_PREFIX = "spatiotemporal://"

# Allowed return_url schemes/hosts. `Linking.createURL()` resolves differently per
# runtime, so we must accept all of the app's legitimate forms while still
# rejecting arbitrary external redirects (open-redirect protection):
#   * spatiotemporal://      built APK / dev client (production scheme)
#   * exp:// , exps://       Expo Go / dev client
#   * http://<loopback-or-LAN>[:port]/...   Expo web + LAN dev only
# A public http(s) host (e.g. https://evil.com) is never allowed.
import ipaddress
from urllib.parse import urlparse

_ALLOWED_NATIVE_SCHEMES = ("spatiotemporal://", "exp://", "exps://")


def _is_allowed_return_url(url: str) -> bool:
    if any(url.startswith(p) for p in _ALLOWED_NATIVE_SCHEMES):
        return True
    # Only http to a loopback / private (LAN) host is allowed — for Expo web/dev.
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    if parsed.scheme != "http":
        return False
    host = parsed.hostname or ""
    if host == "localhost":
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False  # a real domain name over http — reject
    return ip.is_loopback or ip.is_private


def _mobile_oauth_callback_url(request: Request) -> str:
    """Build the backend callback URL from the host the phone actually used to
    reach the API, so it matches what's registered in Supabase. Honour the
    tunnel/proxy's X-Forwarded-Proto so a cloudflared HTTPS front-end produces an
    https callback (the phone's BROWSER must never get an http LAN hop — Chrome
    blocks cleartext private-network redirects mid-OAuth)."""
    host = request.headers.get("host")
    if host:
        # Behind cloudflared/ngrok, X-Forwarded-Proto is https even though the
        # internal hop to uvicorn is http. Trust it; default to request scheme.
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
        return f"{scheme}://{host}/api/mobile/auth/oauth/google/callback"
    return settings.mobile_oauth_callback_url


@router.get("/auth/oauth/google/start")
@limiter.limit("10/minute")
def mobile_oauth_start(request: Request, return_url: str):
    # Open-redirect guard: only allow the app's own deep-link schemes / LAN dev
    # hosts as the return target. Checked BEFORE the enabled flag so we never
    # bounce an attacker-supplied URL even with an error fragment.
    if not _is_allowed_return_url(return_url):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid return_url")
    if not settings.google_oauth_enabled:
        return _mobile_oauth_error(return_url, "oauth_disabled")
    try:
        data = oauth_start(
            "google",
            callback_url=_mobile_oauth_callback_url(request),
            return_url=return_url,
        )
    except Exception:
        logger.exception("[oauth] mobile oauth_start failed")
        return _mobile_oauth_error(return_url, "oauth_unavailable")
    return _no_store_redirect(data["url"])


@router.get("/auth/oauth/google/callback/{state}")
@limiter.limit("10/minute")
def mobile_oauth_callback(
    request: Request,
    state: str,
    code: str | None = None,
    error: str | None = None,
):
    # `state` arrives as a PATH segment (Supabase matched `…/callback/**`); `code`
    # is the query param Supabase appended after the exchange.
    client_ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    user_agent = request.headers.get("User-Agent", "")

    # On Google error / cancel we don't yet know the return_url (it's keyed by a
    # valid state). Best effort: if state is bad we can't bounce to the app, so
    # show a minimal page. In practice the app also has its own cancel handling.
    if error or not code or not state:
        return _mobile_oauth_terminal_error("oauth_cancelled")

    try:
        result, return_url = oauth_complete_mobile(
            code, state, client_ip=client_ip, user_agent=user_agent,
        )
    except OAuthGateError as exc:
        # Deep-link the error back to the app using the return_url the gate
        # carried (correct scheme for whatever runtime the app is on). Only when
        # the state lookup itself failed is return_url None — then fall back to
        # the production scheme as a best effort.
        if exc.return_url:
            return _mobile_oauth_error(exc.return_url, "oauth_denied")
        return _mobile_oauth_terminal_error("oauth_denied")

    # Success — hand tokens to the app via its deep link, in the URL fragment so
    # they never appear in any server log along the redirect.
    target = (
        f"{return_url}#access_token={result['access_token']}"
        f"&refresh_token={result['refresh_token']}"
    )
    return _no_store_redirect(target)


def _no_store_redirect(url: str) -> RedirectResponse:
    """302 that must never be cached. The in-app browser (Chrome Custom Tabs)
    caches redirects aggressively; a stale cached OAuth redirect short-circuits
    the whole flow (jumps straight to an old target without re-hitting the
    backend/Supabase). `no-store` prevents that."""
    resp = RedirectResponse(url, status_code=status.HTTP_302_FOUND)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


def _mobile_oauth_error(return_url: str, code: str) -> RedirectResponse:
    """Bounce a known-good app return_url with an error fragment."""
    return _no_store_redirect(f"{return_url}#error={code}")


def _mobile_oauth_terminal_error(code: str) -> RedirectResponse:
    """When we can't recover the app return_url, deep-link to the app's fixed
    callback path with the error so the app can still react."""
    return _no_store_redirect(f"{_APP_SCHEME_PREFIX}oauth-callback#error={code}")


# ─── Tickets ──────────────────────────────────────────────────────────────────

def _technician_ticket_ids(sb, user_id: str) -> list[str]:
    """Return ticket_ids where the technician has an active (not removed) assignment."""
    res = (
        sb.table("ticket_technicians")
        .select("ticket_id")
        .eq("user_id", user_id)
        .is_("removed_at", "null")
        .execute()
    )
    return [r["ticket_id"] for r in (res.data or [])]


def _assert_ticket_membership(sb, ticket_id: str, user_id: str) -> None:
    """Raise 404 if the technician does not have an active assignment on this ticket."""
    res = (
        sb.table("ticket_technicians")
        .select("ticket_id")
        .eq("ticket_id", ticket_id)
        .eq("user_id", user_id)
        .is_("removed_at", "null")
        .limit(1)
        .execute()
    )
    if not (res.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")


_TICKET_FIELDS = (
    "id, ticket_number, title, description, station_id, status, priority, anomaly_zone, "
    "anomaly_data, follow_up_count, follow_up_notes, cancelled_at, cancellation_reason, "
    "created_at, assigned_at, completed_at, updated_at"
)


@router.get("/tickets")
@limiter.limit("60/minute")
def mobile_list_tickets(request: Request, user: dict = Depends(require_technician_mobile)):
    """Return all tickets assigned to the authenticated technician."""
    sb = get_supabase()
    ticket_ids = _technician_ticket_ids(sb, user["id"])
    if not ticket_ids:
        return []
    res = (
        sb.table("tickets")
        .select(_TICKET_FIELDS)
        .in_("id", ticket_ids)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/tickets/{ticket_id}")
@limiter.limit("60/minute")
def mobile_get_ticket(request: Request, ticket_id: str, user: dict = Depends(require_technician_mobile)):
    """Get a single ticket with all inspection report rounds — only if the technician is assigned."""
    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])
    ticket = _one(
        sb.table("tickets")
        .select(_TICKET_FIELDS)
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Attach all report rounds so the technician can reference prior visits.
    # follow_up_notes is the analyst note that sent THAT round back — mirrors the
    # web's prior-round history.
    reports_res = (
        sb.table("inspection_reports")
        .select(
            "id, round, is_active, submitted_at, notes, severity, root_cause, "
            "corrective_action, issue_resolved, analyst_approved, analyst_notes, "
            "follow_up_notes"
        )
        .eq("ticket_id", ticket_id)
        .order("round", desc=False)
        .execute()
    )
    reports = reports_res.data or []

    # Fetch all photos for all report rounds, then sign every path in one batch
    # call instead of N serial create_signed_url calls.
    report_ids = [r["id"] for r in reports]
    if report_ids:
        photos_res = (
            sb.table("inspection_photos")
            .select("id, report_id, photo_url, uploaded_at")
            .in_("report_id", report_ids)
            .order("uploaded_at")
            .execute()
        )
        bucket = "inspection-photos"
        photo_rows = photos_res.data or []

        # Resolve each row to its storage path (plain path or embedded in a URL).
        storage_paths: list[str] = []
        row_paths: dict[str, str] = {}  # photo row id → storage path
        for row in photo_rows:
            stored = row.get("photo_url") or ""
            if stored.startswith("http"):
                marker = f"/{bucket}/"
                path = stored.split(marker)[1].split("?")[0] if marker in stored else None
            else:
                path = stored or None
            if path:
                storage_paths.append(path)
                row_paths[row["id"]] = path

        # One batch call instead of N serial calls.
        signed = _signed_urls_batch(sb, bucket, storage_paths, 3600)

        by_report: dict[str, list[dict]] = {rid: [] for rid in report_ids}
        for row in photo_rows:
            path = row_paths.get(row["id"])
            url = signed.get(path, "") if path else ""
            by_report.setdefault(row["report_id"], []).append(
                {"id": row["id"], "photo_url": url or row.get("photo_url", "")}
            )
        for r in reports:
            r["photos"] = by_report.get(r["id"], [])
    else:
        for r in reports:
            r["photos"] = []

    ticket["reports"] = reports
    return ticket


class TicketStatusUpdate(BaseModel):
    status: str


@router.patch("/tickets/{ticket_id}/status")
@limiter.limit("30/minute")
def mobile_update_ticket_status(
    request: Request,
    ticket_id: str,
    body: TicketStatusUpdate,
    user: dict = Depends(require_technician_mobile),
):
    """Update ticket status — technician can only set 'in-progress'.
    Report submission handles the pending_review transition automatically.
    """
    if body.status != "in-progress":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Technicians can only set status to 'in-progress'. Submit a report to advance to pending_review.",
        )

    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])

    existing = _one(
        sb.table("tickets")
        .select("id, status")
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Allow transition from assigned or follow_up to in-progress
    allowed_from = {"assigned", "follow_up"}
    if existing["status"] not in allowed_from:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot set in-progress from '{existing['status']}' status",
        )

    now = datetime.now(timezone.utc).isoformat()
    sb.table("tickets").update({"status": "in-progress", "updated_at": now}).eq("id", ticket_id).execute()

    client_ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    audit.ticket_status_changed(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        old_status=existing["status"],
        new_status="in-progress",
        ip=client_ip,
    )
    return {"id": ticket_id, "status": "in-progress", "updated_at": now}


# ─── Reports ──────────────────────────────────────────────────────────────────

class ReportSubmit(BaseModel):
    ticket_id: str
    notes: str
    severity: str | None = None
    root_cause: str | None = None
    corrective_action: str | None = None
    issue_resolved: bool | None = None


@router.post("/reports", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def mobile_submit_report(
    request: Request,
    body: ReportSubmit,
    user: dict = Depends(require_technician_mobile),
):
    """Submit an inspection report for a ticket the technician is assigned to.

    Idempotent for the active round: returns the existing active report if already submitted
    (unless the ticket is in follow_up status, in which case a new round is always created).
    """
    sb = get_supabase()
    _assert_ticket_membership(sb, body.ticket_id, user["id"])

    ticket = _one(
        sb.table("tickets")
        .select("id, status")
        .eq("id", body.ticket_id)
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if body.severity and body.severity not in {"low", "medium", "high"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="severity must be low, medium, or high")

    now = datetime.now(timezone.utc).isoformat()
    ticket_status = ticket["status"]

    # Idempotency: return active report if one exists AND ticket is not in follow_up
    # (follow_up means analyst explicitly asked for a new visit, so always allow a new round)
    if ticket_status != "follow_up":
        active = _one(
            sb.table("inspection_reports")
            .select("id, ticket_id, submitted_at, round")
            .eq("ticket_id", body.ticket_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if active:
            return active

    # Compute next round number
    max_round_res = (
        sb.table("inspection_reports")
        .select("round")
        .eq("ticket_id", body.ticket_id)
        .order("round", desc=True)
        .limit(1)
        .execute()
    )
    max_round = (max_round_res.data or [{}])[0].get("round", 0) if max_round_res.data else 0
    next_round = max_round + 1

    try:
        report_res = (
            sb.table("inspection_reports")
            .insert({
                "ticket_id": body.ticket_id,
                "technician_id": user["id"],
                "notes": body.notes,
                "severity": body.severity,
                "root_cause": body.root_cause or None,
                "corrective_action": body.corrective_action or None,
                "issue_resolved": body.issue_resolved,
                "submitted_at": now,
                "round": next_round,
                "is_active": True,
            })
            .select("id, ticket_id, submitted_at, round")
            .execute()
        )
    except Exception as e:
        err = str(e)
        if "unique" in err.lower() or "duplicate" in err.lower():
            # Race condition — return whatever is now active
            fallback = _one(
                sb.table("inspection_reports")
                .select("id, ticket_id, submitted_at, round")
                .eq("ticket_id", body.ticket_id)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
            if fallback:
                return fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to submit report: {err}")

    if not report_res.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Report insert returned no data")

    sb.table("tickets").update({
        "status": "pending_review",
        "completed_at": now,
        "updated_at": now,
    }).eq("id", body.ticket_id).execute()

    report_row = report_res.data[0]
    mob_ip = request.client.host if request.client else "unknown"
    fwd2 = request.headers.get("X-Forwarded-For")
    if fwd2:
        mob_ip = fwd2.split(",")[0].strip()
    audit.report_submitted(
        actor_id=str(user["id"]),
        report_id=str(report_row["id"]),
        ticket_id=body.ticket_id,
        ip=mob_ip,
    )
    return report_row


@router.get("/tickets/{ticket_id}/report-id")
@limiter.limit("60/minute")
def mobile_get_report_id(
    request: Request,
    ticket_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Return the active inspection report for a ticket (if one exists)."""
    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])

    report = _one(
        sb.table("inspection_reports")
        .select(
            "id, ticket_id, submitted_at, notes, severity, root_cause, corrective_action, issue_resolved, "
            "analyst_approved, analyst_approved_at, analyst_notes, round, is_active"
        )
        .eq("ticket_id", ticket_id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    return report  # None if no active report — frontend handles this


@router.get("/tickets/{ticket_id}/follow-up-context")
@limiter.limit("60/minute")
def mobile_get_follow_up_context(
    request: Request,
    ticket_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Return follow-up metadata for a ticket so the mobile report screen can show context."""
    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])

    ticket = _one(
        sb.table("tickets")
        .select("follow_up_count, follow_up_notes")
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Return summary of all prior (inactive) reports as history
    history_res = (
        sb.table("inspection_reports")
        .select("round, submitted_at, severity")
        .eq("ticket_id", ticket_id)
        .eq("is_active", False)
        .order("round")
        .execute()
    )

    return {
        "follow_up_count": ticket.get("follow_up_count") or 0,
        "follow_up_notes": ticket.get("follow_up_notes"),
        "previous_reports": history_res.data or [],
    }


@router.get("/tickets/{ticket_id}/attachments")
@limiter.limit("60/minute")
def mobile_get_ticket_attachments(
    request: Request,
    ticket_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Return CSV/file attachments for a ticket."""
    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])

    res = (
        sb.table("ticket_attachments")
        .select("id, ticket_id, file_name, file_url, file_size, created_at")
        .eq("ticket_id", ticket_id)
        .order("created_at")
        .execute()
    )
    rows = res.data or []

    bucket = "ticket-attachments"
    marker = f"/{bucket}/"
    paths = [
        row["file_url"].split(marker)[1].split("?")[0]
        for row in rows
        if marker in row["file_url"]
    ]
    signed = _signed_urls_batch(sb, bucket, paths, 3600)

    result = []
    for row in rows:
        path = row["file_url"].split(marker)[1].split("?")[0] if marker in row["file_url"] else None
        fresh = signed.get(path, "") if path else ""
        result.append({**row, "file_url": fresh or row["file_url"]})
    return result


@router.get("/reports/{report_id}/photos")
@limiter.limit("60/minute")
def mobile_get_report_photos(
    request: Request,
    report_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Return signed photo URLs for an inspection report."""
    sb = get_supabase()
    # Verify report exists and technician is assigned to the ticket
    report = _one(
        sb.table("inspection_reports")
        .select("id, ticket_id")
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    _assert_ticket_membership(sb, report["ticket_id"], user["id"])

    res = (
        sb.table("inspection_photos")
        .select("id, photo_url")
        .eq("report_id", report_id)
        .order("uploaded_at")
        .execute()
    )
    rows = res.data or []

    bucket = "inspection-photos"
    marker = f"/{bucket}/"

    # Resolve each row to its storage path.
    row_paths: dict[str, str] = {}
    for row in rows:
        stored = row["photo_url"] or ""
        if stored.startswith("http"):
            path = stored.split(marker)[1].split("?")[0] if marker in stored else None
        else:
            path = stored or None
        if path:
            row_paths[row["id"]] = path

    signed = _signed_urls_batch(sb, bucket, list(row_paths.values()), 3600)

    result = []
    for row in rows:
        path = row_paths.get(row["id"])
        fresh = signed.get(path, "") if path else ""
        result.append({**row, "photo_url": fresh or row["photo_url"]})
    return result


@router.post("/reports/{report_id}/photos", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
async def mobile_upload_photo(
    request: Request,
    report_id: str,
    photo: UploadFile = File(...),
    user: dict = Depends(require_technician_mobile),
):
    """Upload an inspection photo for a report owned by this technician.

    File is sent as multipart/form-data with field name 'photo'.
    Returns the signed photo URL (1-hour expiry).
    """
    sb = get_supabase()

    report = _one(
        sb.table("inspection_reports")
        .select("id, ticket_id")
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    _assert_ticket_membership(sb, report["ticket_id"], user["id"])

    allowed_types = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    content_type = photo.content_type or "image/jpeg"
    if content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only JPEG, PNG, WebP, and HEIC images are accepted")

    MAX_SIZE = 10 * 1024 * 1024  # 10 MB
    if photo.size is not None and photo.size > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo must be under 10 MB")
    data = await photo.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo must be under 10 MB")

    ext = content_type.split("/")[1].split(";")[0]
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    path = f"{report_id}/{ts}.{ext}"

    sb.storage.from_("inspection-photos").upload(path, data, {"content-type": content_type, "upsert": "true"})

    # Store the storage path (not a signed URL) so we can always generate fresh URLs on fetch
    sb.table("inspection_photos").insert({"report_id": report_id, "photo_url": path}).execute()

    signed_url = _signed_url(sb, "inspection-photos", path, 3600)

    ph_ip = request.client.host if request.client else "unknown"
    fwd3 = request.headers.get("X-Forwarded-For")
    if fwd3:
        ph_ip = fwd3.split(",")[0].strip()
    audit.file_uploaded(
        actor_id=str(user["id"]),
        entity_type="inspection_report",
        entity_id=report_id,
        file_name=photo.filename or path,
        file_size=len(data),
        ip=ph_ip,
    )
    return {"photo_url": signed_url, "path": path}


def _fmt_date(val: str | None) -> str:
    if not val:
        return "—"
    try:
        return datetime.fromisoformat(val).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return val


@router.get("/tickets/{ticket_id}/pdf")
@limiter.limit("20/minute")
def mobile_download_ticket_pdf(
    request: Request,
    ticket_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Generate and stream a PDF report for a ticket assigned to this technician."""
    sb = get_supabase()
    _assert_ticket_membership(sb, ticket_id, user["id"])
    ticket = _one(
        sb.table("tickets")
        .select(
            "id, title, description, station_id, status, priority, anomaly_zone, anomaly_data, "
            "analyst_id, technician_id, created_at, assigned_at, completed_at, verified_at, updated_at"
        )
        .eq("id", ticket_id)
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2.5 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "TicketTitle",
        parent=styles["Title"],
        fontSize=18,
        leading=22,
        spaceAfter=6,
    )
    label_style = ParagraphStyle(
        "Label",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#6B7280"),
        spaceAfter=2,
        fontName="Helvetica-Bold",
    )
    value_style = ParagraphStyle(
        "Value",
        parent=styles["Normal"],
        fontSize=11,
        spaceAfter=10,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Normal"],
        fontSize=9,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#374151"),
        spaceBefore=14,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=8,
    )

    story = [
        Paragraph("Maintenance Ticket Report", title_style),
        Paragraph(ticket["title"], styles["Heading2"]),
        Spacer(1, 0.4 * cm),
    ]

    # Meta table
    meta_data = [
        ["Ticket ID", ticket["id"]],
        ["Station", ticket["station_id"]],
        ["Status", ticket["status"].replace("-", " ").title()],
        ["Priority", ticket["priority"].title()],
        ["Anomaly Zone", ticket.get("anomaly_zone") or "—"],
        ["Created", _fmt_date(ticket.get("created_at"))],
        ["Assigned", _fmt_date(ticket.get("assigned_at"))],
        ["Completed", _fmt_date(ticket.get("completed_at"))],
        ["Verified", _fmt_date(ticket.get("verified_at"))],
    ]

    meta_table = Table(
        [[Paragraph(k, label_style), Paragraph(str(v), value_style)] for k, v in meta_data],
        colWidths=[4 * cm, 12 * cm],
    )
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#F9FAFB"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(meta_table)

    if ticket.get("description"):
        story.append(Paragraph("DESCRIPTION", section_style))
        story.append(Paragraph(ticket["description"], body_style))

    anomaly = ticket.get("anomaly_data") or {}
    if anomaly:
        story.append(Paragraph("ANOMALY DATA", section_style))
        anomaly_rows = []
        for k, v in anomaly.items():
            display_val = f"{v:.4f}" if isinstance(v, float) else str(v)
            anomaly_rows.append(
                [Paragraph(k, label_style), Paragraph(display_val, value_style)]
            )
        anomaly_table = Table(anomaly_rows, colWidths=[6 * cm, 10 * cm])
        anomaly_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.HexColor("#F9FAFB"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(anomaly_table)

    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph(
        f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} — Spatiotemporal Anomaly Detection System",
        ParagraphStyle("Footer", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#9CA3AF")),
    ))

    doc.build(story)
    buf.seek(0)

    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in ticket["title"])[:60]
    filename = f"ticket_{ticket_id[:8]}_{safe_title}.pdf".replace(" ", "_")

    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Activity feed ─────────────────────────────────────────────────────────────
# A technician-scoped, sanitised view of the audit log: every lifecycle event on
# tickets the technician is (or was) assigned to. The raw audit_log holds IPs,
# user agents, chain hashes and other users' identities — NONE of that crosses
# this boundary. We emit only: event, the related ticket (id/number/title for
# tap-to-open), a coarse actor flag (you | analyst | system), and a timestamp.

# Audit events that belong on a technician's activity feed. Auth, security,
# pipeline and account noise are intentionally excluded.
_ACTIVITY_EVENTS = (
    "ticket_created",
    "ticket_status_changed",
    "ticket_updated",
    "technician_assigned",
    "report_submitted",
    "report_approved",
    "follow_up_requested",
    "ticket_cancelled",
    "file_uploaded",
    "photo_uploaded",
)


@router.get("/activity")
@limiter.limit("60/minute")
def mobile_activity(request: Request, user: dict = Depends(require_technician_mobile)):
    """Sanitised, technician-scoped audit feed for tickets assigned to this user."""
    sb = get_supabase()
    uid = user["id"]

    ticket_ids = _technician_ticket_ids(sb, uid)
    if not ticket_ids:
        return []
    ticket_id_set = set(ticket_ids)

    # Map ticket_id → {number, title} for human-readable rows (one round-trip).
    tickets_res = (
        sb.table("tickets")
        .select("id, ticket_number, title")
        .in_("id", ticket_ids)
        .execute()
    )
    ticket_meta = {
        t["id"]: {"number": t.get("ticket_number"), "title": t.get("title")}
        for t in (tickets_res.data or [])
    }

    # Pull recent audit rows for the relevant events. We over-fetch a little and
    # filter to this technician's tickets in Python, because report events store
    # the ticket linkage in meta.ticket_id rather than entity_id.
    rows = (
        sb.table("audit_log")
        .select("id, created_at, event, user_id, entity_type, entity_id, meta")
        .in_("event", list(_ACTIVITY_EVENTS))
        .order("created_at", desc=True)
        .limit(300)
        .execute()
    ).data or []

    out: list[dict] = []
    for r in rows:
        meta = r.get("meta") or {}
        # Resolve which ticket this row is about.
        if r.get("entity_type") == "ticket":
            tid = r.get("entity_id")
        else:  # inspection_report / file / photo events carry ticket_id in meta
            tid = meta.get("ticket_id")

        if tid not in ticket_id_set:
            continue  # not this technician's ticket → never surface it

        tm = ticket_meta.get(tid, {})
        # Coarse actor flag only — never expose another user's identity.
        actor = "you" if r.get("user_id") == uid else "analyst"

        out.append({
            "id": r["id"],
            "event": r["event"],
            "ticket_id": tid,
            "ticket_number": tm.get("number"),
            "ticket_title": tm.get("title"),
            "actor": actor,
            "created_at": r["created_at"],
        })

    return out
