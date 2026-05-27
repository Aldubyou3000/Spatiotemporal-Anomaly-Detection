from datetime import datetime, timezone
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..core.config import settings
from ..core.dependencies import get_supabase, require_analyst
from ..schemas.tickets import TicketCreate, TicketDetail, TicketListResponse, TicketUpdate
from .mobile import _signed_url

from ..services.tickets_service import (
    create_ticket,
    get_ticket,
    list_technicians,
    list_tickets,
    update_ticket,
)

router = APIRouter(prefix="/api/tickets", tags=["tickets"])
limiter = Limiter(key_func=get_remote_address)


@router.get("", response_model=TicketListResponse)
@limiter.limit("60/minute")
def list_tickets_endpoint(
    request: Request,
    status: str | None = Query(None),
    priority: str | None = Query(None),
    station_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    return list_tickets(sb, status=status, priority=priority, station_id=station_id, limit=limit, offset=offset)


@router.get("/technicians")
@limiter.limit("60/minute")
def list_technicians_endpoint(
    request: Request,
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    return list_technicians(sb)


@router.post("", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_ticket_endpoint(
    request: Request,
    body: TicketCreate,
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    return create_ticket(sb, user["id"], body)


@router.get("/{ticket_id}", response_model=TicketDetail)
@limiter.limit("60/minute")
def get_ticket_endpoint(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


@router.patch("/{ticket_id}", response_model=TicketDetail)
@limiter.limit("30/minute")
def update_ticket_endpoint(
    request: Request,
    ticket_id: str,
    body: TicketUpdate,
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = update_ticket(sb, ticket_id, body)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


@router.get("/{ticket_id}/attachments")
@limiter.limit("60/minute")
def get_ticket_attachments(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    """Return file attachments for a ticket with fresh signed URLs."""
    sb = get_supabase()
    # Verify ticket exists and analyst has access
    ticket_res = sb.table("tickets").select("id").eq("id", ticket_id).limit(1).execute()
    if not (ticket_res.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    res = (
        sb.table("ticket_attachments")
        .select("id, ticket_id, file_name, file_url, file_size, created_at")
        .eq("ticket_id", ticket_id)
        .order("created_at")
        .execute()
    )
    rows = res.data or []

    bucket = "ticket-attachments"
    result = []
    for row in rows:
        marker = f"/{bucket}/"
        path = row["file_url"].split(marker)[1].split("?")[0] if marker in row["file_url"] else None
        if path:
            fresh = _signed_url(sb, bucket, path, 3600)
            if fresh:
                row = {**row, "file_url": fresh}
        result.append(row)
    return result


@router.post("/{ticket_id}/attachments", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_ticket_attachment(
    request: Request,
    ticket_id: str,
    file: UploadFile = File(...),
    _user: dict = Depends(require_analyst),
):
    """Upload a file attachment for a ticket (CSV, PDF, etc.)."""
    sb = get_supabase()
    ticket_res = sb.table("tickets").select("id").eq("id", ticket_id).limit(1).execute()
    if not (ticket_res.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    MAX_SIZE = 20 * 1024 * 1024  # 20 MB
    data = await file.read(MAX_SIZE + 1)
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File must be under 20 MB")

    content_type = file.content_type or "application/octet-stream"
    original_name = file.filename or "attachment"
    ts = int(datetime.now(timezone.utc).timestamp() * 1000)
    ext = original_name.rsplit(".", 1)[-1] if "." in original_name else "bin"
    path = f"{ticket_id}/{ts}.{ext}"

    bucket = "ticket-attachments"
    sb.storage.from_(bucket).upload(path, data, {"content-type": content_type, "upsert": "true"})

    # Store the storage path so we can regenerate signed URLs on fetch
    storage_url = f"{settings.supabase_url.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"

    sb.table("ticket_attachments").insert({
        "ticket_id": ticket_id,
        "file_name": original_name,
        "file_url": storage_url,
        "file_size": len(data),
    }).execute()

    signed_url = _signed_url(sb, bucket, path, 3600)
    return {"file_url": signed_url, "file_name": original_name, "path": path}


def _fmt_date(val: str | None) -> str:
    if not val:
        return "—"
    try:
        return datetime.fromisoformat(val).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return val


@router.get("/{ticket_id}/report")
@limiter.limit("60/minute")
def get_ticket_report(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    """Return the inspection report (with photos) for a ticket, or null if none exists."""
    sb = get_supabase()
    ticket_res = sb.table("tickets").select("id").eq("id", ticket_id).limit(1).execute()
    if not (ticket_res.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    res = (
        sb.table("inspection_reports")
        .select(
            "id, notes, sensor_working, severity, root_cause, submitted_at, "
            "analyst_approved, analyst_approved_at, analyst_notes"
        )
        .eq("ticket_id", ticket_id)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None

    report = rows[0]
    report_id = report["id"]

    photo_res = (
        sb.table("inspection_photos")
        .select("id, photo_url")
        .eq("report_id", report_id)
        .order("uploaded_at")
        .execute()
    )
    photo_rows = photo_res.data or []

    bucket = "inspection-photos"
    photos = []
    for p in photo_rows:
        stored = p["photo_url"]
        if stored.startswith("http"):
            marker = f"/{bucket}/"
            storage_path = stored.split(marker)[1].split("?")[0] if marker in stored else None
        else:
            storage_path = stored or None
        fresh_url = _signed_url(sb, bucket, storage_path, 3600) if storage_path else None
        photos.append({"id": p["id"], "photo_url": fresh_url or stored})

    report["photos"] = photos
    return report


@router.get("/{ticket_id}/pdf")
@limiter.limit("20/minute")
def download_ticket_pdf(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    """Generate and stream a PDF report for a single ticket.

    Sections rendered depend on ticket status:
      - All statuses : ticket metadata, description, anomaly data
      - in-progress+ : inspection report (if submitted) — field observations, sensor, severity, root cause
      - completed/verified : inspection report always included
      - verified only : analyst remarks section
    """
    sb = get_supabase()
    ticket = get_ticket(sb, ticket_id)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    # Fetch inspection report if one exists
    report_res = (
        sb.table("inspection_reports")
        .select(
            "id, notes, sensor_working, severity, root_cause, submitted_at, "
            "analyst_approved, analyst_approved_at, analyst_notes, technician_id, "
            "profiles!inspection_reports_technician_id_fkey(full_name)"
        )
        .eq("ticket_id", ticket_id)
        .limit(1)
        .execute()
    )
    report_rows = report_res.data or []
    report = report_rows[0] if report_rows else None
    if report:
        tech_profile = report.pop("profiles", None)
        report["technician_name"] = (tech_profile or {}).get("full_name") or "—"

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

    # ── Shared styles ─────────────────────────────────────────────────────────
    title_style = ParagraphStyle(
        "TicketTitle",
        parent=styles["Title"],
        fontSize=18,
        leading=22,
        spaceAfter=4,
        textColor=colors.HexColor("#111827"),
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=12,
        leading=16,
        spaceAfter=12,
        textColor=colors.HexColor("#374151"),
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Normal"],
        fontSize=8,
        fontName="Helvetica-Bold",
        textColor=colors.HexColor("#6B7280"),
        spaceBefore=16,
        spaceAfter=5,
        letterSpacing=0.8,
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
        fontSize=10,
        textColor=colors.HexColor("#111827"),
        spaceAfter=8,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=15,
        spaceAfter=8,
        textColor=colors.HexColor("#374151"),
    )
    footer_style = ParagraphStyle(
        "Footer",
        parent=styles["Normal"],
        fontSize=8,
        textColor=colors.HexColor("#9CA3AF"),
    )

    def _kv_table(rows: list[tuple[str, str]], col_widths=(4 * cm, 12 * cm)) -> Table:
        t = Table(
            [[Paragraph(k, label_style), Paragraph(v, value_style)] for k, v in rows],
            colWidths=list(col_widths),
        )
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS",(0, 0), (-1, -1), [colors.HexColor("#F9FAFB"), colors.white]),
            ("GRID",          (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    def _highlight_table(rows: list[tuple[str, str]], bg: str, border: str) -> Table:
        t = Table(
            [[Paragraph(k, label_style), Paragraph(v, value_style)] for k, v in rows],
            colWidths=[4 * cm, 12 * cm],
        )
        t.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor(bg)),
            ("BOX",           (0, 0), (-1, -1), 0.5, colors.HexColor(border)),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    ticket_status = ticket["status"]
    tech = ticket.get("technician") or {}
    tech_name = tech.get("full_name") or "Unassigned"

    story: list = [
        Paragraph("Maintenance Ticket Report", title_style),
        Paragraph(ticket["title"], subtitle_style),
    ]

    # ── Section 1: Ticket details (always) ───────────────────────────────────
    story.append(Paragraph("TICKET DETAILS", section_style))

    meta_rows: list[tuple[str, str]] = [
        ("Ticket ID",    ticket["id"]),
        ("Station",      ticket["station_id"]),
        ("Status",       ticket_status.replace("-", " ").title()),
        ("Priority",     (ticket.get("priority") or "—").title()),
        ("Anomaly Zone", ticket.get("anomaly_zone") or "—"),
        ("Assigned To",  tech_name),
        ("Created",      _fmt_date(ticket.get("created_at"))),
        ("Assigned",     _fmt_date(ticket.get("assigned_at"))),
    ]
    if ticket_status in ("completed", "verified"):
        meta_rows.append(("Completed", _fmt_date(ticket.get("completed_at"))))
    if ticket_status == "verified":
        meta_rows.append(("Verified",  _fmt_date(ticket.get("verified_at"))))

    story.append(_kv_table(meta_rows))

    # ── Section 2: Description (always if present) ────────────────────────────
    if ticket.get("description"):
        story.append(Paragraph("DESCRIPTION", section_style))
        story.append(Paragraph(ticket["description"], body_style))

    # ── Section 3: Anomaly data (always if present) ───────────────────────────
    anomaly = ticket.get("anomaly_data") or {}
    if anomaly:
        story.append(Paragraph("ANOMALY DATA", section_style))
        anomaly_rows_kv: list[tuple[str, str]] = []
        for k, v in anomaly.items():
            display_val = f"{v:.4f}" if isinstance(v, float) else str(v)
            anomaly_rows_kv.append((k, display_val))
        story.append(_kv_table(anomaly_rows_kv, col_widths=(6 * cm, 10 * cm)))

    # ── Section 4: Inspection report (when submitted) ─────────────────────────
    if report:
        story.append(Paragraph("INSPECTION REPORT", section_style))

        sensor_val = (
            "Yes" if report.get("sensor_working") is True
            else "No" if report.get("sensor_working") is False
            else "Not recorded"
        )
        report_meta: list[tuple[str, str]] = [
            ("Submitted",      _fmt_date(report.get("submitted_at"))),
            ("Submitted By",   report.get("technician_name") or "—"),
            ("Sensor Working", sensor_val),
            ("Severity",       (report.get("severity") or "—").title()),
        ]
        story.append(_kv_table(report_meta))

        if report.get("notes"):
            story.append(Paragraph("FIELD OBSERVATIONS", section_style))
            story.append(Paragraph(report["notes"], body_style))

        if report.get("root_cause"):
            story.append(Paragraph("ROOT CAUSE", section_style))
            story.append(Paragraph(report["root_cause"], body_style))

    # ── Section 5: Analyst remarks (verified tickets) ─────────────────────────
    if ticket_status == "verified" and report:
        story.append(Paragraph("ANALYST REMARKS", section_style))
        analyst_name_res = (
            sb.table("profiles")
            .select("full_name")
            .eq("id", ticket.get("analyst_id", ""))
            .limit(1)
            .execute()
        )
        analyst_rows = analyst_name_res.data or []
        analyst_name = (analyst_rows[0].get("full_name") or "—") if analyst_rows else "—"

        remarks_rows: list[tuple[str, str]] = [
            ("Approved By", analyst_name),
            ("Approved At", _fmt_date(report.get("analyst_approved_at"))),
            ("Remarks",     report.get("analyst_notes") or "No remarks added."),
        ]
        story.append(_highlight_table(remarks_rows, bg="#F0FDF4", border="#86EFAC"))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 0.8 * cm))
    story.append(Paragraph(
        f"Generated on {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} "
        f"— Spatiotemporal Anomaly Detection System",
        footer_style,
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
