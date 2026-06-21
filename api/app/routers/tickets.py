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
from ..core.dependencies import _client_ip, get_supabase, require_analyst
from ..services.audit_service import audit
from ..schemas.tickets import (
    CancelRequest,
    FollowUpRequest,
    TechnicianAssignRequest,
    TechnicianListItem,
    TicketCreate,
    TicketDetail,
    TicketListResponse,
    TicketUpdate,
)
from .mobile import _signed_url

from ..services.tickets_service import (
    assign_technicians,
    cancel_ticket,
    create_ticket,
    get_ticket,
    list_technicians,
    list_tickets,
    remove_technician,
    request_follow_up,
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
    offset: int = Query(0, ge=0, le=100_000),
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    return list_tickets(sb, status=status, priority=priority, station_id=station_id, limit=limit, offset=offset)


@router.get("/technicians", response_model=list[TechnicianListItem])
@limiter.limit("60/minute")
def list_technicians_endpoint(
    request: Request,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0, le=10_000),
    _user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    return list_technicians(sb, limit=limit, offset=offset)


@router.post("", response_model=TicketDetail, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_ticket_endpoint(
    request: Request,
    body: TicketCreate,
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = create_ticket(sb, user["id"], body)
    audit.ticket_created(
        actor_id=str(user["id"]),
        ticket_id=str(ticket["id"]),
        ip=_client_ip(request),
        meta={"title": ticket.get("title"), "priority": ticket.get("priority")},
    )
    return ticket


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
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    old = get_ticket(sb, ticket_id)
    ticket = update_ticket(sb, ticket_id, body)
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    old_snapshot = {k: old.get(k) for k in body.model_fields_set} if old else {}
    new_snapshot = {k: ticket.get(k) for k in body.model_fields_set}
    audit.ticket_updated(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        old=old_snapshot,
        new=new_snapshot,
        ip=_client_ip(request),
    )
    return ticket


@router.post("/{ticket_id}/technicians", response_model=TicketDetail)
@limiter.limit("30/minute")
def assign_technicians_endpoint(
    request: Request,
    ticket_id: str,
    body: TechnicianAssignRequest,
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = assign_technicians(sb, ticket_id, body.technician_ids, str(user["id"]))
    all_ids = [t["id"] for t in ticket.get("technicians", [])]
    audit.technician_assigned(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        added_ids=body.technician_ids,
        all_ids=all_ids,
        ip=_client_ip(request),
        reason=body.reason,
    )
    return ticket


@router.delete("/{ticket_id}/technicians/{user_id}", response_model=TicketDetail)
@limiter.limit("30/minute")
def remove_technician_endpoint(
    request: Request,
    ticket_id: str,
    user_id: str,
    reason: str | None = Query(None, max_length=512),
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = remove_technician(sb, ticket_id, user_id, removed_by=str(user["id"]))
    remaining_ids = [t["id"] for t in ticket.get("technicians", [])]
    clean_reason = reason.strip() if reason and reason.strip() else None
    audit.technician_removed(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        removed_id=user_id,
        remaining_ids=remaining_ids,
        ip=_client_ip(request),
        reason=clean_reason,
    )
    return ticket


@router.post("/{ticket_id}/follow-up", response_model=TicketDetail)
@limiter.limit("20/minute")
def request_follow_up_endpoint(
    request: Request,
    ticket_id: str,
    body: FollowUpRequest,
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = request_follow_up(sb, ticket_id, body.follow_up_notes, str(user["id"]))
    audit.follow_up_requested(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        notes=body.follow_up_notes,
        ip=_client_ip(request),
    )
    return ticket


@router.post("/{ticket_id}/cancel", response_model=TicketDetail)
@limiter.limit("20/minute")
def cancel_ticket_endpoint(
    request: Request,
    ticket_id: str,
    body: CancelRequest,
    user: dict = Depends(require_analyst),
):
    sb = get_supabase()
    ticket = cancel_ticket(sb, ticket_id, body.reason)
    audit.ticket_cancelled(
        actor_id=str(user["id"]),
        ticket_id=ticket_id,
        reason=body.reason,
        ip=_client_ip(request),
    )
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
    user: dict = Depends(require_analyst),
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
    audit.file_uploaded(
        actor_id=str(user["id"]),
        entity_type="ticket",
        entity_id=ticket_id,
        file_name=original_name,
        file_size=len(data),
        ip=_client_ip(request),
    )
    return {"file_url": signed_url, "file_name": original_name, "path": path}


def _fmt_date(val: str | None) -> str:
    if not val:
        return "—"
    try:
        return datetime.fromisoformat(val).strftime("%Y-%m-%d %H:%M UTC")
    except ValueError:
        return val


def _sign_inspection_photos(sb, rows: list[dict]) -> dict[str, list[dict]]:
    """Batch-fetch and sign photos for many report rounds in one DB round-trip.

    Returns a map of report_id -> [{id, photo_url}] with fresh signed URLs.
    Avoids an N+1 query when a ticket has multiple inspection rounds.
    """
    report_ids = [r["id"] for r in rows]
    if not report_ids:
        return {}

    photo_res = (
        sb.table("inspection_photos")
        .select("id, report_id, photo_url")
        .in_("report_id", report_ids)
        .order("uploaded_at")
        .execute()
    )

    bucket = "inspection-photos"
    grouped: dict[str, list[dict]] = {rid: [] for rid in report_ids}
    for p in (photo_res.data or []):
        stored = p["photo_url"]
        if stored.startswith("http"):
            marker = f"/{bucket}/"
            storage_path = stored.split(marker)[1].split("?")[0] if marker in stored else None
        else:
            storage_path = stored or None
        fresh_url = _signed_url(sb, bucket, storage_path, 3600) if storage_path else None
        grouped.setdefault(p["report_id"], []).append(
            {"id": p["id"], "photo_url": fresh_url or stored}
        )
    return grouped


@router.get("/{ticket_id}/report")
@limiter.limit("60/minute")
def get_ticket_report(
    request: Request,
    ticket_id: str,
    _user: dict = Depends(require_analyst),
):
    """Return the full inspection history for a ticket: the current (active) round
    plus every archived prior round, each with its own signed photos.

    Shape: { "current": <round|null>, "history": [<round>, ...] }  (history ascending by round)
    """
    sb = get_supabase()
    ticket_res = sb.table("tickets").select("id").eq("id", ticket_id).limit(1).execute()
    if not (ticket_res.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    res = (
        sb.table("inspection_reports")
        .select(
            "id, notes, severity, root_cause, corrective_action, issue_resolved, submitted_at, "
            "analyst_approved, analyst_approved_at, analyst_notes, follow_up_notes, round, is_active"
        )
        .eq("ticket_id", ticket_id)
        .order("round")
        .execute()
    )
    rows = res.data or []
    if not rows:
        return {"current": None, "history": []}

    photos_by_report = _sign_inspection_photos(sb, rows)
    for r in rows:
        r["photos"] = photos_by_report.get(r["id"], [])

    current = next((r for r in rows if r.get("is_active")), None)
    history = [r for r in rows if not r.get("is_active")]  # already ascending by round
    return {"current": current, "history": history}


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
      - pending_review/verified : inspection report always included
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
            "id, notes, severity, root_cause, corrective_action, issue_resolved, submitted_at, "
            "analyst_approved, analyst_approved_at, analyst_notes, technician_id, round, "
            "profiles!inspection_reports_technician_id_fkey(full_name)"
        )
        .eq("ticket_id", ticket_id)
        .eq("is_active", True)
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
    if ticket_status in ("pending_review", "verified"):
        meta_rows.append(("Pending Review", _fmt_date(ticket.get("completed_at"))))
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

        resolved_val = (
            "Yes" if report.get("issue_resolved") is True
            else "No" if report.get("issue_resolved") is False
            else "Not recorded"
        )
        report_meta: list[tuple[str, str]] = [
            ("Submitted",      _fmt_date(report.get("submitted_at"))),
            ("Submitted By",   report.get("technician_name") or "—"),
            ("Issue Resolved", resolved_val),
            ("Severity",       (report.get("severity") or "—").title()),
        ]
        story.append(_kv_table(report_meta))

        if report.get("notes"):
            story.append(Paragraph("FIELD OBSERVATIONS", section_style))
            story.append(Paragraph(report["notes"], body_style))

        if report.get("root_cause"):
            story.append(Paragraph("ROOT CAUSE", section_style))
            story.append(Paragraph(report["root_cause"], body_style))

        if report.get("corrective_action"):
            story.append(Paragraph("CORRECTIVE ACTION", section_style))
            story.append(Paragraph(report["corrective_action"], body_style))

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
