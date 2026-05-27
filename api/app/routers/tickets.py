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


@router.get("/{ticket_id}/pdf")
@limiter.limit("20/minute")
def download_ticket_pdf(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    """Generate and stream a PDF report for a single ticket."""
    sb = get_supabase()
    ticket = get_ticket(sb, ticket_id)
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
        borderPad=2,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=10,
        leading=14,
        spaceAfter=8,
    )

    tech = ticket.get("technician") or {}
    tech_name = tech.get("full_name") or "Unassigned"

    story = [
        Paragraph("Maintenance Ticket Report", title_style),
        Paragraph(ticket["title"], styles["Heading2"]),
        Spacer(1, 0.4 * cm),
    ]

    # ── Meta table ────────────────────────────────────────────────────────────
    meta_data = [
        ["Ticket ID", ticket["id"]],
        ["Station", ticket["station_id"]],
        ["Status", ticket["status"].replace("-", " ").title()],
        ["Priority", ticket["priority"].title()],
        ["Anomaly Zone", ticket.get("anomaly_zone") or "—"],
        ["Assigned To", tech_name],
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

    # ── Description ───────────────────────────────────────────────────────────
    if ticket.get("description"):
        story.append(Paragraph("DESCRIPTION", section_style))
        story.append(Paragraph(ticket["description"], body_style))

    # ── Anomaly data ──────────────────────────────────────────────────────────
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

    # ── Footer note ───────────────────────────────────────────────────────────
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
