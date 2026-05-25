"""
PDF export for maintenance tickets.
Uses fpdf2 (pip install fpdf2) -- pure-Python, no system dependencies.
"""
from __future__ import annotations
from datetime import datetime

_REPLACEMENTS = [
    ("—", "-"),    # em dash
    ("–", "-"),    # en dash
    ("‘", "'"),    # left single quote
    ("’", "'"),    # right single quote
    ("“", '"'),    # left double quote
    ("”", '"'),    # right double quote
    ("•", "*"),    # bullet
    ("°", " deg"), # degree sign
    ("µ", "u"),    # micro sign
    ("×", "x"),    # multiplication sign
    ("…", "..."),  # ellipsis
    ("·", "."),    # middle dot
]


def _sanitize(text: str) -> str:
    """Replace non-Latin-1 characters so fpdf built-in fonts don't choke."""
    for src, dst in _REPLACEMENTS:
        text = text.replace(src, dst)
    return text.encode("latin-1", errors="ignore").decode("latin-1")


def _fmt(value: object, fallback: str = "-") -> str:
    if value is None or value == "":
        return fallback
    return _sanitize(str(value))


def generate_ticket_pdf(ticket: dict) -> bytes:
    """
    Generate a single-ticket PDF report.

    Args:
        ticket: Full ticket dict as returned by fetch_all_tickets()
                (includes nested 'technician', 'report' keys).

    Returns:
        Raw PDF bytes suitable for st.download_button().
    """
    try:
        from fpdf import FPDF
    except ImportError as e:
        raise ImportError(
            "fpdf2 is required for PDF export. Install it with: pip install fpdf2"
        ) from e

    # ---------------------------------------------------------------------------
    # Colour palette
    # ---------------------------------------------------------------------------
    C_PRIMARY  = (30,  111, 217)
    C_ACCENT   = (56,  189, 248)
    C_DARK     = (13,  27,  62)
    C_MID      = (100, 116, 139)
    C_LIGHT    = (241, 245, 249)
    C_WHITE    = (255, 255, 255)
    C_PRIORITY = {
        "high":   (239, 68,  68),
        "medium": (245, 158, 11),
        "low":    (16,  185, 118),
    }
    C_STATUS = {
        "created":     (251, 191, 36),
        "assigned":    (56,  189, 248),
        "in-progress": (129, 140, 248),
        "completed":   (16,  185, 118),
        "verified":    (110, 231, 183),
    }

    # ---------------------------------------------------------------------------
    # Extract fields
    # ---------------------------------------------------------------------------
    ticket_id   = _fmt(ticket.get("id", ""))[:8].upper()
    station     = _fmt(ticket.get("station_id"))
    title       = _fmt(ticket.get("title"))
    description = _fmt(ticket.get("description"), fallback="No description provided.")
    status      = _fmt(ticket.get("status", "created"))
    priority    = _fmt(ticket.get("priority", "medium"))
    zone        = _fmt(ticket.get("anomaly_zone"), fallback="")
    created     = (_fmt(ticket.get("created_at", "")) or "")[:10]
    assigned    = (_fmt(ticket.get("assigned_at", "")) or "")[:10] or "-"
    completed   = (_fmt(ticket.get("completed_at", "")) or "")[:10] or "-"
    verified    = (_fmt(ticket.get("verified_at",  "")) or "")[:10] or "-"

    tech       = ticket.get("technician") or {}
    tech_name  = _fmt(tech.get("full_name"), fallback="Unassigned")
    tech_user  = _fmt(tech.get("username"),  fallback="")

    report     = ticket.get("report") or {}
    has_report = bool(report)
    rep_notes  = _fmt(report.get("notes"),       fallback="-")
    rep_sensor_raw = report.get("sensor_working")
    rep_sensor = (
        "Working" if rep_sensor_raw is True
        else "Faulty" if rep_sensor_raw is False
        else "-"
    )
    rep_severity       = _fmt(report.get("severity"),      fallback="-")
    rep_root           = _fmt(report.get("root_cause"),    fallback="-")
    rep_submitted      = (_fmt(report.get("submitted_at", "")) or "")[:10] or "-"
    rep_analyst_notes  = _fmt(report.get("analyst_notes"), fallback="-")
    rep_approved       = report.get("analyst_approved", False)

    generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    # ---------------------------------------------------------------------------
    # Build PDF
    # ---------------------------------------------------------------------------
    pdf = FPDF()
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    PAGE_W = pdf.w - 36

    # Header bar
    pdf.set_fill_color(*C_PRIMARY)
    pdf.rect(0, 0, pdf.w, 22, "F")
    pdf.set_xy(18, 5)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*C_WHITE)
    pdf.cell(0, 12, "Maintenance Ticket Report", ln=True)
    pdf.set_xy(18, 5)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(200, 220, 255)
    pdf.cell(PAGE_W, 12, f"Generated: {generated_at}", align="R")
    pdf.ln(10)

    # Ticket ID + station
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*C_DARK)
    pdf.cell(0, 10, f"#{ticket_id}  {station}", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(*C_MID)
    pdf.cell(0, 6, title, ln=True)
    pdf.ln(4)

    # Status / priority / zone pills
    def pill(text: str, fg: tuple, bg: tuple, x: float, y: float, w: float = 30):
        pdf.set_xy(x, y)
        pdf.set_fill_color(*bg)
        pdf.set_draw_color(*bg)
        pdf.set_text_color(*fg)
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(w, 6, _sanitize(text.upper()), border=0, fill=True, align="C")

    cur_x = 18
    cur_y = pdf.get_y()
    st_color = C_STATUS.get(status, C_MID)
    st_bg    = tuple(min(255, c + 200) for c in st_color)
    pill(status, st_color, st_bg, cur_x, cur_y, 32)
    cur_x += 36
    pr_color = C_PRIORITY.get(priority, C_MID)
    pr_bg    = tuple(min(255, c + 190) for c in pr_color)
    pill(f"{priority} priority", pr_color, pr_bg, cur_x, cur_y, 44)
    cur_x += 48
    if zone:
        pill(f"Zone {zone}", C_PRIMARY, (220, 235, 255), cur_x, cur_y, 24)

    pdf.ln(10)
    pdf.set_draw_color(*C_LIGHT)
    pdf.line(18, pdf.get_y(), pdf.w - 18, pdf.get_y())
    pdf.ln(4)

    # Helpers
    def section(label: str):
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*C_ACCENT)
        pdf.cell(0, 5, _sanitize(label.upper()), ln=True)
        pdf.set_draw_color(*C_ACCENT)
        pdf.line(18, pdf.get_y(), pdf.w - 18, pdf.get_y())
        pdf.ln(3)
        pdf.set_text_color(*C_DARK)

    def kv(label: str, value: str, col_w: float = 50):
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*C_MID)
        pdf.cell(col_w, 5, _sanitize(label + ":"), ln=False)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*C_DARK)
        pdf.cell(PAGE_W - col_w, 5, _sanitize(value), ln=True)

    def multiline(label: str, value: str, col_w: float = 50):
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*C_MID)
        pdf.cell(col_w, 5, _sanitize(label + ":"), ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*C_DARK)
        pdf.set_x(18)
        pdf.multi_cell(PAGE_W, 5, _sanitize(value))
        pdf.ln(1)

    # Details section
    section("Ticket Details")
    kv("Station ID", station)
    kv("Assigned To", f"{tech_name} (@{tech_user})" if tech_user else tech_name)
    kv("Priority", priority.capitalize())
    kv("Status", status.replace("-", " ").title())
    kv("Anomaly Zone", f"Zone {zone}" if zone else "-")
    kv("Created", created)
    kv("Assigned", assigned)
    if completed != "-":
        kv("Completed", completed)
    if verified != "-":
        kv("Verified", verified)
    pdf.ln(4)

    # Description section
    section("Description")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*C_DARK)
    pdf.set_x(18)
    pdf.multi_cell(PAGE_W, 5, description)
    pdf.ln(4)

    # Field Report section
    if has_report:
        section("Field Report")
        kv("Submitted", rep_submitted)
        kv("Sensor Status", rep_sensor)
        kv("Severity", rep_severity.capitalize() if rep_severity != "-" else "-")
        pdf.ln(2)
        multiline("Field Notes", rep_notes)
        if rep_root != "-":
            multiline("Root Cause", rep_root)
        if rep_analyst_notes != "-":
            multiline("Analyst Notes", rep_analyst_notes)
        kv("Analyst Approved", "Yes" if rep_approved else "No")
        pdf.ln(4)
    else:
        section("Field Report")
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*C_MID)
        pdf.cell(0, 5, "No field report submitted yet.", ln=True)
        pdf.ln(4)

    # Footer
    pdf.set_y(-20)
    pdf.set_draw_color(*C_LIGHT)
    pdf.line(18, pdf.get_y(), pdf.w - 18, pdf.get_y())
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*C_MID)
    pdf.ln(2)
    pdf.cell(PAGE_W / 2, 4, f"Ticket #{ticket_id} - {station}", ln=False)
    pdf.cell(PAGE_W / 2, 4, "Spatiotemporal Anomaly Detection System", align="R", ln=True)

    return bytes(pdf.output())
