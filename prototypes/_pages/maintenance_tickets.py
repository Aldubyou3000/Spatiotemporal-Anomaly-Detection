import streamlit as st

from utils.supabase_client import (
    fetch_all_tickets,
    update_ticket_status,
    fetch_all_reports,
    approve_report,
    fetch_technicians,
    create_technician_account,
    fetch_report_photos,
    fetch_ticket_attachments,
)
from utils.pdf_export import generate_ticket_pdf

# ---------------------------------------------------------------------------
# Constants — single source of truth for all status/priority colours
# ---------------------------------------------------------------------------

_STATUS_COLOR = {
    'created':     ('#fbbf24', '#1c1300'),
    'assigned':    ('#38bdf8', '#001c26'),
    'in-progress': ('#818cf8', '#0d0a2e'),
    'completed':   ('#10b981', '#011a0e'),
    'verified':    ('#6ee7b7', '#011a0e'),
}
_PRIORITY_COLOR = {'low': '#10b981', 'medium': '#f59e0b', 'high': '#ef4444'}
_SEVERITY_COLOR = {'low': '#10b981', 'medium': '#f59e0b', 'high': '#ef4444'}
_PAGE_SIZE = 10

# Bootstrap Icon names used throughout (no emoji)
_BI = {
    'paperclip':   'bi-paperclip',
    'check':       'bi-check-circle-fill',
    'x':           'bi-x-circle-fill',
    'hourglass':   'bi-hourglass-split',
    'dot':         'bi-circle-fill',
    'check_sm':    'bi-check2',
}


# ---------------------------------------------------------------------------
# Badge helpers
# ---------------------------------------------------------------------------

def _status_badge(status: str) -> str:
    bg, fg = _STATUS_COLOR.get(status, ('#64748b', '#fff'))
    return (
        f"<span style='background:{bg};color:{fg};padding:3px 12px;"
        f"border-radius:20px;font-size:0.78rem;font-weight:700;"
        f"text-transform:uppercase;letter-spacing:0.5px;'>{status}</span>"
    )


def _priority_badge(priority: str) -> str:
    color = _PRIORITY_COLOR.get(priority, '#64748b')
    label = (priority or 'medium').upper()
    return (
        f"<span style='color:{color};font-weight:700;font-size:0.78rem;'>"
        f"<i class='bi {_BI['dot']}' style='font-size:0.5rem;vertical-align:middle;"
        f"margin-right:4px;'></i>{label}</span>"
    )


# ---------------------------------------------------------------------------
# Pagination helpers
# ---------------------------------------------------------------------------

def _paginate(items: list, page_key: str, page_size: int = _PAGE_SIZE):
    total = len(items)
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = st.session_state.get(page_key, 1)
    page = max(1, min(page, total_pages))
    st.session_state[page_key] = page
    start = (page - 1) * page_size
    return items[start:start + page_size], total_pages, page


def _pagination_controls(page_key: str, total_pages: int, current_page: int, total_items: int):
    if total_pages <= 1:
        return
    c1, c2, c3 = st.columns([1, 3, 1])
    with c1:
        if st.button("Prev", key=f"{page_key}_prev", disabled=current_page <= 1,
                     use_container_width=True):
            st.session_state[page_key] = current_page - 1
            st.rerun()
    with c2:
        start = (current_page - 1) * _PAGE_SIZE + 1
        end = min(current_page * _PAGE_SIZE, total_items)
        st.markdown(
            f"<div style='text-align:center;color:#64748b;font-size:0.82rem;"
            f"padding-top:0.45rem;'>Showing {start}–{end} of {total_items} &nbsp;&middot;&nbsp; "
            f"Page {current_page}/{total_pages}</div>",
            unsafe_allow_html=True,
        )
    with c3:
        if st.button("Next", key=f"{page_key}_next", disabled=current_page >= total_pages,
                     use_container_width=True):
            st.session_state[page_key] = current_page + 1
            st.rerun()


# ---------------------------------------------------------------------------
# Photo lightbox via st.dialog
# ---------------------------------------------------------------------------

@st.dialog("Photo Viewer")
def _photo_dialog():
    url  = st.session_state.get("_photo_dialog_url", "")
    name = st.session_state.get("_photo_dialog_name", "Attachment")
    if url:
        st.markdown(
            f"<p style='color:#94a3b8;font-size:0.82rem;margin-bottom:0.5rem;'>"
            f"<i class='bi {_BI['paperclip']}' style='margin-right:5px;'></i>{name}</p>",
            unsafe_allow_html=True,
        )
        try:
            st.image(url, use_container_width=True)
        except Exception:
            st.markdown(
                f"<a href='{url}' target='_blank' style='color:#38bdf8;'>Open in new tab</a>",
                unsafe_allow_html=True,
            )
    else:
        st.warning("Photo not available.")


def _render_photo_chips(report_id: str, key_prefix: str = ""):
    try:
        photos = fetch_report_photos(report_id)
    except Exception:
        photos = []

    st.markdown(
        "<div style='margin-top:0.9rem;'>"
        "<span style='font-size:0.75rem;font-weight:700;color:#38bdf8;"
        "text-transform:uppercase;letter-spacing:1px;'>Attachments</span>"
        "</div>",
        unsafe_allow_html=True,
    )

    if not photos:
        st.markdown(
            "<span style='color:#475569;font-size:0.82rem;'>No photos attached.</span>",
            unsafe_allow_html=True,
        )
        return

    for i, p in enumerate(photos):
        url = p.get("photo_url", "")
        if not url:
            continue
        raw_name = url.split("?")[0].split("/")[-1] or f"photo_{i + 1}"
        chip_key  = f"photo_chip_{key_prefix}{report_id}_{i}"

        if st.button(f"📎  {raw_name}", key=chip_key):
            st.session_state["_photo_dialog_url"]  = url
            st.session_state["_photo_dialog_name"] = raw_name
            st.session_state["_photo_dialog_open"] = True
            st.rerun()


# ---------------------------------------------------------------------------
# Shared ticket card
# ---------------------------------------------------------------------------

def _render_ticket_card(t: dict, show_status_controls: bool = True, card_key_prefix: str = ""):
    tech_name = (t.get("technician") or {}).get("full_name", "Unassigned")
    report    = t.get("report") or {}
    priority  = t.get("priority", "medium")
    zone      = t.get("anomaly_zone") or "—"
    created   = (t.get("created_at") or "")[:10]
    station   = t.get("station_id", "?")
    title     = t.get("title", "Untitled")
    status    = t.get("status", "created")

    # --- Header: station chip + title / status badge ---
    header_col, badge_col = st.columns([4, 1])
    with header_col:
        st.markdown(
            f"<div style='display:flex;align-items:center;gap:8px;flex-wrap:wrap;'>"
            f"<span style='background:rgba(56,189,248,0.12);color:#38bdf8;"
            f"font-size:0.72rem;font-weight:700;text-transform:uppercase;"
            f"letter-spacing:1px;padding:2px 8px;border-radius:6px;'>{station}</span>"
            f"<span style='color:#f1f5f9;font-size:1rem;font-weight:600;'>{title}</span>"
            f"</div>",
            unsafe_allow_html=True,
        )
    with badge_col:
        st.markdown(
            f"<div style='text-align:right;'>{_status_badge(status)}</div>",
            unsafe_allow_html=True,
        )

    # --- Meta row ---
    st.markdown(
        f"<div style='color:#64748b;font-size:0.82rem;margin-top:0.35rem;margin-bottom:0.6rem;"
        f"display:flex;gap:1rem;flex-wrap:wrap;align-items:center;'>"
        f"<span>{_priority_badge(priority)}</span>"
        f"<span>Zone&nbsp;<strong style='color:#94a3b8;'>{zone}</strong></span>"
        f"<span>Created&nbsp;<strong style='color:#94a3b8;'>{created}</strong></span>"
        f"<span>Technician:&nbsp;<strong style='color:#94a3b8;'>{tech_name}</strong></span>"
        f"</div>",
        unsafe_allow_html=True,
    )

    # --- Description ---
    if t.get("description"):
        st.markdown(
            f"<div style='color:#cbd5e1;font-size:0.9rem;line-height:1.55;"
            f"padding:0.6rem 0.8rem;background:rgba(255,255,255,0.03);"
            f"border-radius:8px;margin-bottom:0.6rem;'>"
            f"{t['description']}</div>",
            unsafe_allow_html=True,
        )

    # --- CSV Attachments ---
    try:
        csv_attachments = fetch_ticket_attachments(t.get('id', ''))
    except Exception:
        csv_attachments = []

    if csv_attachments:
        st.markdown(
            "<div style='margin-top:0.6rem;margin-bottom:0.25rem;'>"
            "<span style='font-size:0.75rem;font-weight:700;color:#38bdf8;"
            "text-transform:uppercase;letter-spacing:1px;'>Data Attachments</span>"
            "</div>",
            unsafe_allow_html=True,
        )
        for i, att in enumerate(csv_attachments):
            fname = att.get('file_name', f'attachment_{i+1}.csv')
            fsize = att.get('file_size') or 0
            size_label = f"{fsize // 1024} KB" if fsize >= 1024 else f"{fsize} B"
            url = att.get('file_url', '')
            st.markdown(
                f"<a href='{url}' target='_blank' download style='"
                f"display:inline-flex;align-items:center;gap:6px;"
                f"background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);"
                f"border-radius:8px;padding:6px 12px;color:#38bdf8;"
                f"font-size:0.83rem;font-weight:600;text-decoration:none;margin-bottom:4px;'>"
                f"<i class='bi bi-file-earmark-spreadsheet'></i>"
                f"{fname} <span style='color:#64748b;font-weight:400;font-size:0.78rem;'>({size_label})</span>"
                f"</a>",
                unsafe_allow_html=True,
            )

    # --- Field Report section ---
    if report:
        submitted = (report.get("submitted_at") or report.get("created_at") or "")[:10]
        st.markdown(
            "<div style='border-top:1px solid rgba(56,189,248,0.18);"
            "margin-top:0.5rem;padding-top:0.75rem;'>"
            "<span style='font-size:0.75rem;font-weight:700;color:#38bdf8;"
            "text-transform:uppercase;letter-spacing:1px;'>Field Report</span>"
            "</div>",
            unsafe_allow_html=True,
        )

        if report.get("notes"):
            st.markdown(
                f"<div style='color:#cbd5e1;font-size:0.9rem;line-height:1.55;"
                f"margin-top:0.5rem;margin-bottom:0.6rem;'>"
                f"<strong style='color:#94a3b8;'>Notes:</strong> {report['notes']}</div>",
                unsafe_allow_html=True,
            )

        # Metrics row — sensor, severity, submitted
        m1, m2, m3 = st.columns(3)
        sw = report.get("sensor_working")
        if sw is True:
            sw_label, sw_icon, sw_color = "Working", _BI['check'], "#10b981"
        elif sw is False:
            sw_label, sw_icon, sw_color = "Faulty",  _BI['x'],     "#ef4444"
        else:
            sw_label, sw_icon, sw_color = "Unknown", "",            "#64748b"

        sensor_icon_html = (
            f"<i class='bi {sw_icon}' style='margin-right:5px;'></i>"
            if sw_icon else ""
        )
        m1.markdown(
            f"<div style='background:rgba(255,255,255,0.03);border-radius:8px;"
            f"padding:0.6rem 0.75rem;'>"
            f"<div style='color:#64748b;font-size:0.75rem;margin-bottom:3px;'>Sensor</div>"
            f"<div style='color:{sw_color};font-size:1rem;font-weight:700;'>"
            f"{sensor_icon_html}{sw_label}</div></div>",
            unsafe_allow_html=True,
        )

        sev       = report.get("severity") or "—"
        sev_color = _SEVERITY_COLOR.get(sev, "#64748b")
        m2.markdown(
            f"<div style='background:rgba(255,255,255,0.03);border-radius:8px;"
            f"padding:0.6rem 0.75rem;'>"
            f"<div style='color:#64748b;font-size:0.75rem;margin-bottom:3px;'>Severity</div>"
            f"<div style='color:{sev_color};font-size:1rem;font-weight:700;"
            f"text-transform:capitalize;'>{sev}</div></div>",
            unsafe_allow_html=True,
        )

        m3.markdown(
            f"<div style='background:rgba(255,255,255,0.03);border-radius:8px;"
            f"padding:0.6rem 0.75rem;'>"
            f"<div style='color:#64748b;font-size:0.75rem;margin-bottom:3px;'>Submitted</div>"
            f"<div style='color:#e2e8f0;font-size:0.92rem;font-weight:600;'>{submitted}</div></div>",
            unsafe_allow_html=True,
        )

        if report.get("root_cause"):
            st.markdown(
                f"<div style='color:#94a3b8;font-size:0.85rem;margin-top:0.6rem;'>"
                f"<strong>Root cause:</strong> "
                f"<span style='color:#cbd5e1;'>{report['root_cause']}</span></div>",
                unsafe_allow_html=True,
            )

        if report.get("analyst_notes"):
            st.markdown(
                f"<div style='color:#94a3b8;font-size:0.85rem;margin-top:0.4rem;"
                f"padding:0.5rem 0.75rem;background:rgba(56,189,248,0.06);"
                f"border-left:3px solid #38bdf8;border-radius:0 6px 6px 0;'>"
                f"<strong>Analyst notes:</strong> "
                f"<span style='color:#cbd5e1;'>{report['analyst_notes']}</span></div>",
                unsafe_allow_html=True,
            )

        report_id = report.get("id")
        if report_id:
            _render_photo_chips(report_id, key_prefix=card_key_prefix)

    # --- Status controls (Board only) ---
    if show_status_controls:
        _next_statuses = {
            "assigned":    ["assigned", "in-progress"],
            "in-progress": ["in-progress", "completed"],
        }
        if status in _next_statuses:
            st.markdown(
                "<div style='border-top:1px solid rgba(255,255,255,0.06);"
                "margin-top:0.8rem;padding-top:0.75rem;'>",
                unsafe_allow_html=True,
            )
            choices = _next_statuses[status]
            sc1, sc2 = st.columns([3, 1])
            with sc1:
                new_status = st.selectbox(
                    "Update status", choices, index=0,
                    key=f"{card_key_prefix}status_{t['id']}",
                    label_visibility="collapsed",
                )
            with sc2:
                if st.button("Save", key=f"{card_key_prefix}save_{t['id']}",
                             use_container_width=True):
                    if new_status == status:
                        st.info("Status unchanged.")
                    else:
                        try:
                            update_ticket_status(t["id"], new_status)
                            st.success("Status updated.")
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))
            st.markdown("</div>", unsafe_allow_html=True)

        elif status == "completed":
            completed_bg, _ = _STATUS_COLOR["completed"]
            st.markdown(
                f"<div style='border-top:1px solid rgba(255,255,255,0.06);"
                f"margin-top:0.8rem;padding-top:0.6rem;'>"
                f"<span style='color:{completed_bg};font-size:0.85rem;'>"
                f"<i class='bi {_BI['hourglass']}' style='margin-right:6px;'></i>"
                f"Awaiting analyst approval in <strong>Inspection Reports</strong>.</span>"
                f"</div>",
                unsafe_allow_html=True,
            )
        elif status == "verified":
            verified_bg, _ = _STATUS_COLOR["verified"]
            st.markdown(
                f"<div style='border-top:1px solid rgba(255,255,255,0.06);"
                f"margin-top:0.8rem;padding-top:0.6rem;'>"
                f"<span style='color:{verified_bg};font-size:0.85rem;font-weight:600;'>"
                f"<i class='bi {_BI['check']}' style='margin-right:6px;'></i>"
                f"Verified and closed.</span>"
                f"</div>",
                unsafe_allow_html=True,
            )

    # --- PDF Export ---
    st.markdown(
        "<div style='border-top:1px solid rgba(255,255,255,0.04);"
        "margin-top:0.8rem;padding-top:0.75rem;'>",
        unsafe_allow_html=True,
    )
    export_key = f"{card_key_prefix}pdf_{t['id']}"
    try:
        pdf_bytes = generate_ticket_pdf(t)
        fname = f"ticket_{t.get('id', 'unknown')[:8].upper()}_{t.get('station_id', 'station')}.pdf"
        st.download_button(
            label="Export PDF",
            data=pdf_bytes,
            file_name=fname,
            mime="application/pdf",
            key=export_key,
            use_container_width=False,
        )
    except ImportError:
        st.caption("Install `fpdf2` to enable PDF export: `pip install fpdf2`")
    except Exception as e:
        st.caption(f"PDF export unavailable: {e}")
    st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Ticket Board
# ---------------------------------------------------------------------------

def _render_tickets_board():
    col_filter, col_refresh = st.columns([3, 1])
    with col_filter:
        status_options = ["all", "assigned", "in-progress", "completed", "verified"]
        prev_filter    = st.session_state.get("_board_filter_prev", "all")
        status_filter  = st.selectbox(
            "Filter by status", status_options, key="board_status_filter"
        )
        if status_filter != prev_filter:
            st.session_state["board_page"]         = 1
            st.session_state["_board_filter_prev"] = status_filter
    with col_refresh:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("Refresh", key="board_refresh", use_container_width=True):
            st.rerun()

    try:
        filter_list = None if status_filter == "all" else [status_filter]
        tickets = fetch_all_tickets(filter_list)
    except Exception as e:
        st.error(f"Could not load tickets: {e}")
        tickets = []

    if not tickets:
        st.markdown("""
        <div class="empty-state">
            <i class="bi bi-ticket-detailed empty-state-icon"></i>
            <div class="empty-state-title">No tickets found</div>
            <div class="empty-state-sub">Create tickets from the <strong>Zones Process</strong>
            tab when anomalies appear.</div>
        </div>
        """, unsafe_allow_html=True)
        return

    page_tickets, total_pages, current_page = _paginate(tickets, "board_page")

    for t in page_tickets:
        tech_name = (t.get("technician") or {}).get("full_name", "Unassigned")
        status    = t.get("status", "created").replace("-", " ").title()
        with st.expander(
            f"**[{status}]**  ·  **{t['station_id']}**  —  {t['title']}  ·  {tech_name}",
            expanded=False,
        ):
            _render_ticket_card(t, show_status_controls=True, card_key_prefix="board_")

    st.markdown("<div style='margin-top:1rem;'>", unsafe_allow_html=True)
    _pagination_controls("board_page", total_pages, current_page, len(tickets))
    st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Inspection Reports — pending (unapproved) only
# ---------------------------------------------------------------------------

def _render_inspection_reports():
    col_hdr, col_refresh = st.columns([4, 1])
    with col_refresh:
        if st.button("Refresh", key="reports_refresh", use_container_width=True):
            st.rerun()

    try:
        reports = fetch_all_reports()
    except Exception as e:
        st.error(f"Could not load reports: {e}")
        reports = []

    if not reports:
        st.markdown("""
        <div class="empty-state">
            <i class="bi bi-clipboard-check empty-state-icon"></i>
            <div class="empty-state-title">No inspection reports yet</div>
            <div class="empty-state-sub">Reports submitted by technicians from the field app
            will appear here for review.</div>
        </div>
        """, unsafe_allow_html=True)
        return

    pending = [r for r in reports if not r.get("analyst_approved")]

    with col_hdr:
        count_label = f"{len(pending)} report{'s' if len(pending) != 1 else ''} awaiting review"
        st.markdown(
            f"<div style='color:#94a3b8;font-size:0.85rem;padding-top:0.3rem;'>"
            f"<strong style='color:#f1f5f9;'>{count_label}</strong></div>",
            unsafe_allow_html=True,
        )

    if not pending:
        verified_bg, _ = _STATUS_COLOR["verified"]
        st.markdown(
            f"<div style='color:#475569;font-size:0.88rem;margin-top:1rem;text-align:center;"
            f"padding:1.5rem;background:rgba(255,255,255,0.02);border-radius:10px;'>"
            f"<i class='bi {_BI['check']}' style='color:{verified_bg};margin-right:6px;'></i>"
            f"All reports have been reviewed. Verified tickets are visible on the Ticket Board."
            f"</div>",
            unsafe_allow_html=True,
        )
        return

    page_reports, total_pages, current_page = _paginate(pending, "reports_page")

    for r in page_reports:
        ticket_info = r.get("ticket") or {}
        tech_info   = r.get("technician") or {}
        submitted   = (r.get("submitted_at") or r.get("created_at") or "")[:10]
        station     = ticket_info.get("station_id", "?")
        title       = ticket_info.get("title", "?")
        tech_name   = tech_info.get("full_name", "?")

        ticket_view = {
            "id":          r.get("ticket_id", ""),
            "station_id":  station,
            "title":       title,
            "status":      "completed",
            "priority":    ticket_info.get("priority", "medium"),
            "anomaly_zone": ticket_info.get("anomaly_zone"),
            "created_at":  ticket_info.get("created_at", ""),
            "description": ticket_info.get("description", ""),
            "technician":  {"full_name": tech_name},
            "report": {
                "id":             r["id"],
                "notes":          r.get("notes"),
                "sensor_working": r.get("sensor_working"),
                "severity":       r.get("severity"),
                "root_cause":     r.get("root_cause"),
                "analyst_notes":  r.get("analyst_notes"),
                "submitted_at":   r.get("submitted_at"),
                "created_at":     r.get("created_at"),
            },
        }

        with st.expander(
            f"{station} · {title} — {tech_name} · submitted {submitted}",
            expanded=True,
        ):
            _render_ticket_card(ticket_view, show_status_controls=False,
                                card_key_prefix=f"rpt_{r['id']}_")

            st.markdown(
                "<div style='border-top:1px solid rgba(255,255,255,0.08);"
                "margin-top:1rem;padding-top:0.9rem;'>",
                unsafe_allow_html=True,
            )
            analyst_notes = st.text_area(
                "Analyst notes (optional)",
                placeholder="Add your observations, findings, or feedback…",
                key=f"anotes_{r['id']}",
            )
            if st.button("Approve & Mark Verified", key=f"approve_{r['id']}",
                         type="primary", use_container_width=True):
                try:
                    approve_report(r["id"], r["ticket_id"], analyst_notes)
                    st.success("Report approved — ticket marked Verified.")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))
            st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("<div style='margin-top:1rem;'>", unsafe_allow_html=True)
    _pagination_controls("reports_page", total_pages, current_page, len(pending))
    st.markdown("</div>", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Manage Technicians
# ---------------------------------------------------------------------------

def _render_manage_technicians():
    try:
        technicians = fetch_technicians(active_only=False)
    except Exception as e:
        st.error(f"Could not load technicians: {e}")
        technicians = []

    col_l, col_r = st.columns([1, 1], gap="large")

    with col_l:
        count = len(technicians)
        st.markdown(
            f"<div style='margin-bottom:0.6rem;'>"
            f"<span style='color:#f1f5f9;font-weight:600;font-size:0.95rem;'>Existing Accounts</span>"
            f"<span style='color:#475569;font-size:0.82rem;margin-left:8px;'>({count})</span>"
            f"</div>",
            unsafe_allow_html=True,
        )

        if not technicians:
            st.caption("No technician accounts yet — create one on the right.")
        else:
            page_techs, total_pages, current_page = _paginate(technicians, "tech_page")

            # Table header
            st.markdown(
                "<div style='display:grid;grid-template-columns:1fr 1fr auto;"
                "gap:0 0.5rem;padding:0.4rem 0.75rem;"
                "background:rgba(255,255,255,0.05);border-radius:8px 8px 0 0;"
                "border:1px solid rgba(255,255,255,0.08);border-bottom:none;'>"
                "<span style='color:#64748b;font-size:0.72rem;font-weight:700;"
                "text-transform:uppercase;letter-spacing:0.8px;'>Name</span>"
                "<span style='color:#64748b;font-size:0.72rem;font-weight:700;"
                "text-transform:uppercase;letter-spacing:0.8px;'>Username</span>"
                "<span style='color:#64748b;font-size:0.72rem;font-weight:700;"
                "text-transform:uppercase;letter-spacing:0.8px;'>Status</span>"
                "</div>",
                unsafe_allow_html=True,
            )

            rows_html = ""
            for i, t in enumerate(page_techs):
                is_last      = i == len(page_techs) - 1
                br           = "0 0 8px 8px" if is_last else "0"
                status_color = "#10b981" if t.get("is_active") else "#ef4444"
                status_label = "Active"   if t.get("is_active") else "Inactive"
                dot_html = (
                    f"<i class='bi {_BI['dot']}' style='font-size:0.55rem;"
                    f"color:{status_color};margin-right:5px;vertical-align:middle;'></i>"
                )
                rows_html += (
                    f"<div style='display:grid;grid-template-columns:1fr 1fr auto;"
                    f"gap:0 0.5rem;padding:0.55rem 0.75rem;"
                    f"background:rgba(255,255,255,0.02);"
                    f"border:1px solid rgba(255,255,255,0.06);border-top:none;"
                    f"border-radius:{br};align-items:center;'>"
                    f"<span style='color:#e2e8f0;font-size:0.88rem;font-weight:500;"
                    f"overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>"
                    f"{t['full_name']}</span>"
                    f"<span style='color:#64748b;font-size:0.82rem;'>@{t['username']}</span>"
                    f"<span style='color:{status_color};font-size:0.78rem;font-weight:600;"
                    f"white-space:nowrap;'>{dot_html}{status_label}</span>"
                    f"</div>"
                )
            st.markdown(rows_html, unsafe_allow_html=True)

            _pagination_controls("tech_page", total_pages, current_page, len(technicians))

    with col_r:
        st.markdown(
            "<span style='color:#f1f5f9;font-weight:600;font-size:0.95rem;'>"
            "Create New Account</span>",
            unsafe_allow_html=True,
        )
        st.markdown("<div style='height:0.4rem;'></div>", unsafe_allow_html=True)
        with st.form("manage_create_tech_form", clear_on_submit=True):
            s_full_name = st.text_input("Full name",    key="m_full_name")
            s_username  = st.text_input("Username",     placeholder="e.g. john_doe", key="m_username")
            s_email     = st.text_input("Email",        key="m_email")
            s_phone     = st.text_input("Phone (optional)", key="m_phone")
            s_password  = st.text_input("Temporary password", type="password", key="m_password")
            s_submitted = st.form_submit_button(
                "Create Account", type="primary", use_container_width=True
            )

        if s_submitted:
            if not all([s_full_name, s_username, s_email, s_password]):
                st.error("Full name, username, email, and password are required.")
            else:
                try:
                    result = create_technician_account(
                        email=s_email, password=s_password,
                        full_name=s_full_name, username=s_username,
                        phone=s_phone or None,
                    )
                    st.success(
                        f"Created **{result['username']}** — share username & password with them."
                    )
                    st.rerun()
                except Exception as e:
                    st.error(str(e))


# ---------------------------------------------------------------------------
# Page entry point
# ---------------------------------------------------------------------------

def render():
    if st.session_state.get("_photo_dialog_open"):
        st.session_state["_photo_dialog_open"] = False
        _photo_dialog()

    st.markdown("""
    <div class="page-header">
        <div class="page-header-icon"><i class="bi bi-ticket-detailed"></i></div>
        <div class="page-header-text">
            <p class="page-header-title">Maintenance Tickets</p>
            <p class="page-header-sub">Track dispatched tickets, review field reports,
            and manage technician accounts.</p>
        </div>
    </div>
    """, unsafe_allow_html=True)

    board_tab, reports_tab, techs_tab = st.tabs([
        "Tickets Board", "Inspection Reports", "Manage Technicians"
    ])

    with board_tab:
        _render_tickets_board()

    with reports_tab:
        _render_inspection_reports()

    with techs_tab:
        _render_manage_technicians()
