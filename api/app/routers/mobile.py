"""Mobile app endpoints — technician-scoped, Bearer token auth.

All routes here require a valid technician JWT in the Authorization header.
The mobile app stores this token in Expo SecureStore, never in localStorage.
"""

from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
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
from ..services.auth_service import mobile_login as _mobile_login, refresh_session, revoke_session
from supabase_auth.errors import AuthApiError

router = APIRouter(prefix="/api/mobile", tags=["mobile"])
limiter = Limiter(key_func=get_remote_address)


def _one(table_res) -> dict | None:
    """Return the first row from a list result, or None."""
    rows = table_res.data
    if not rows:
        return None
    return rows[0]


def _signed_url(sb, bucket: str, path: str, expires: int = 3600) -> str:
    """Generate a signed URL, handling all supabase-py v2 response shapes."""
    try:
        res = sb.storage.from_(bucket).create_signed_url(path, expires)
        if isinstance(res, dict):
            return (
                res.get("signedURL") or res.get("signedUrl") or
                res.get("signed_url") or ""
            )
        # Object with attribute (some supabase-py versions return a dataclass)
        return (
            getattr(res, "signed_url", None) or
            getattr(res, "signedURL", None) or
            getattr(res, "signedUrl", None) or ""
        )
    except Exception:
        return ""


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


# ─── Tickets ──────────────────────────────────────────────────────────────────

@router.get("/tickets")
@limiter.limit("60/minute")
def mobile_list_tickets(request: Request, user: dict = Depends(require_technician_mobile)):
    """Return all tickets assigned to the authenticated technician."""
    sb = get_supabase()
    res = (
        sb.table("tickets")
        .select(
            "id, title, description, station_id, status, priority, anomaly_zone, "
            "anomaly_data, created_at, assigned_at, completed_at, updated_at"
        )
        .eq("technician_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/tickets/{ticket_id}")
@limiter.limit("60/minute")
def mobile_get_ticket(request: Request, ticket_id: str, user: dict = Depends(require_technician_mobile)):
    """Get a single ticket — only if it belongs to the technician."""
    sb = get_supabase()
    ticket = _one(
        sb.table("tickets")
        .select(
            "id, title, description, station_id, status, priority, anomaly_zone, "
            "anomaly_data, created_at, assigned_at, completed_at, updated_at"
        )
        .eq("id", ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
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
    """Update ticket status — technician can only set 'in-progress' or 'completed'."""
    allowed = {"in-progress", "completed"}
    if body.status not in allowed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Status must be one of: {allowed}")

    sb = get_supabase()

    existing = _one(
        sb.table("tickets")
        .select("id, technician_id, status")
        .eq("id", ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    now = datetime.now(timezone.utc).isoformat()
    patch = {"status": body.status, "updated_at": now}
    if body.status == "completed":
        patch["completed_at"] = now

    sb.table("tickets").update(patch).eq("id", ticket_id).execute()

    client_ip = request.client.host if request.client else "unknown"
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        client_ip = fwd.split(",")[0].strip()
    audit.ticket_status_changed(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        old_status=existing["status"],
        new_status=body.status,
        ip=client_ip,
    )
    return {"id": ticket_id, "status": body.status, "updated_at": now}


# ─── Reports ──────────────────────────────────────────────────────────────────

class ReportSubmit(BaseModel):
    ticket_id: str
    notes: str
    sensor_working: bool | None = None
    severity: str | None = None
    root_cause: str | None = None


@router.post("/reports", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def mobile_submit_report(
    request: Request,
    body: ReportSubmit,
    user: dict = Depends(require_technician_mobile),
):
    """Submit an inspection report for a ticket owned by this technician."""
    sb = get_supabase()

    ticket = _one(
        sb.table("tickets")
        .select("id, technician_id, status")
        .eq("id", body.ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found or not assigned to you")

    if body.severity and body.severity not in {"low", "medium", "high"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="severity must be low, medium, or high")

    now = datetime.now(timezone.utc).isoformat()

    # Return existing report if one already exists for this ticket
    existing_rows = (
        sb.table("inspection_reports")
        .select("id, ticket_id, submitted_at")
        .eq("ticket_id", body.ticket_id)
        .limit(1)
        .execute()
    )
    if existing_rows.data:
        return existing_rows.data[0]

    try:
        report_res = (
            sb.table("inspection_reports")
            .insert({
                "ticket_id": body.ticket_id,
                "technician_id": user["id"],
                "notes": body.notes,
                "sensor_working": body.sensor_working,
                "severity": body.severity,
                "root_cause": body.root_cause or None,
                "submitted_at": now,
            })
            .select("id, ticket_id, submitted_at")
            .execute()
        )
    except Exception as e:
        err = str(e)
        if "unique" in err.lower() or "duplicate" in err.lower():
            # Race condition — another request inserted first
            fallback = _one(
                sb.table("inspection_reports")
                .select("id, ticket_id, submitted_at")
                .eq("ticket_id", body.ticket_id)
                .limit(1)
                .execute()
            )
            if fallback:
                return fallback
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to submit report: {err}")

    if not report_res.data:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Report insert returned no data")

    sb.table("tickets").update({"status": "completed", "completed_at": now, "updated_at": now}).eq("id", body.ticket_id).execute()

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
    """Return the inspection report ID for a ticket (if one exists)."""
    sb = get_supabase()
    ticket = _one(
        sb.table("tickets")
        .select("id")
        .eq("id", ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    report = _one(
        sb.table("inspection_reports")
        .select(
            "id, ticket_id, submitted_at, notes, sensor_working, severity, root_cause, "
            "analyst_approved, analyst_approved_at, analyst_notes"
        )
        .eq("ticket_id", ticket_id)
        .limit(1)
        .execute()
    )
    return report  # None if no report yet — frontend handles this


@router.get("/tickets/{ticket_id}/attachments")
@limiter.limit("60/minute")
def mobile_get_ticket_attachments(
    request: Request,
    ticket_id: str,
    user: dict = Depends(require_technician_mobile),
):
    """Return CSV/file attachments for a ticket."""
    sb = get_supabase()
    ticket = _one(
        sb.table("tickets")
        .select("id")
        .eq("id", ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    res = (
        sb.table("ticket_attachments")
        .select("id, ticket_id, file_name, file_url, file_size, created_at")
        .eq("ticket_id", ticket_id)
        .order("created_at")
        .execute()
    )
    rows = res.data or []

    result = []
    for row in rows:
        bucket = "ticket-attachments"
        marker = f"/{bucket}/"
        path = row["file_url"].split(marker)[1].split("?")[0] if marker in row["file_url"] else None
        if path:
            fresh = _signed_url(sb, bucket, path, 3600)
            if fresh:
                row = {**row, "file_url": fresh}
        result.append(row)
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
    report = _one(
        sb.table("inspection_reports")
        .select("id, technician_id")
        .eq("id", report_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    res = (
        sb.table("inspection_photos")
        .select("id, photo_url")
        .eq("report_id", report_id)
        .order("uploaded_at")
        .execute()
    )
    rows = res.data or []

    bucket = "inspection-photos"
    result = []
    for row in rows:
        stored = row["photo_url"]
        # stored is either a plain path (new) or a full signed URL (legacy rows)
        if stored.startswith("http"):
            marker = f"/{bucket}/"
            storage_path = stored.split(marker)[1].split("?")[0] if marker in stored else None
        else:
            storage_path = stored or None
        if storage_path:
            fresh = _signed_url(sb, bucket, storage_path, 3600)
            if fresh:
                row = {**row, "photo_url": fresh}
        result.append(row)
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
        .select("id, technician_id")
        .eq("id", report_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found or not yours")

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

    ticket = _one(
        sb.table("tickets")
        .select(
            "id, title, description, station_id, status, priority, anomaly_zone, anomaly_data, "
            "analyst_id, technician_id, created_at, assigned_at, completed_at, verified_at, updated_at"
        )
        .eq("id", ticket_id)
        .eq("technician_id", user["id"])
        .limit(1)
        .execute()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found or not assigned to you")

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
