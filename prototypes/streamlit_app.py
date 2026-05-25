import streamlit as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from _pages import zones_process, maintenance_tickets
from utils.supabase_client import sign_in_analyst


# ============================================================================
# PAGE CONFIGURATION
# ============================================================================

st.set_page_config(
    page_title="AWS QC Pipeline",
    page_icon="🌤️",
    layout="wide",
    initial_sidebar_state="expanded"
)


# ============================================================================
# CUSTOM CSS
# ============================================================================

st.markdown("""
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

    /* ---- Page background ---- */
    .stApp { background-color: #0f172a; }

    /* ---- Main content max-width + horizontal padding ---- */
    .block-container {
        max-width: 960px !important;
        padding-left: 0.75rem !important;
        padding-right: 0.75rem !important;
        margin-left: auto !important;
        margin-right: auto !important;
    }
    @media (max-width: 768px) {
        .block-container {
            padding-left: 0.4rem !important;
            padding-right: 0.4rem !important;
        }
    }

    /* ---- Sidebar background ---- */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0d1526 0%, #0a0f1e 100%);
        border-right: 1px solid rgba(56,189,248,0.12);
    }
    [data-testid="stSidebar"] > div:first-child {
        height: 100vh !important;
        overflow: hidden !important;
        display: flex !important;
        flex-direction: column !important;
    }
    section[data-testid="stSidebar"] [data-testid="stSidebarUserContent"] {
        display: flex !important;
        flex-direction: column !important;
        flex: 1 !important;
        height: 100% !important;
        padding-bottom: 1rem;
        overflow: hidden !important;
    }
    section[data-testid="stSidebar"] [data-testid="stSidebarUserContent"] > div:first-child {
        display: flex !important;
        flex-direction: column !important;
        flex-grow: 1;
        overflow: hidden !important;
    }
    section[data-testid="stSidebar"] [data-testid="stElementContainer"]:has(.sidebar-flex-spacer) {
        flex-grow: 1 !important;
        min-height: 20px;
    }
    [data-testid="stSidebar"] .stMarkdown p,
    [data-testid="stSidebar"] label { color: #94a3b8 !important; }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 { color: #e2e8f0 !important; }

    /* ---- Sidebar brand ---- */
    .sidebar-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0.5rem 0 1rem 0;
    }
    .sidebar-brand-icon {
        background: rgba(56,189,248,0.12);
        border: 1px solid rgba(56,189,248,0.22);
        border-radius: 10px;
        width: 38px; height: 38px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .sidebar-brand-icon i { font-size: 1.1rem; color: #38bdf8; }
    .sidebar-brand-title {
        font-size: 0.95rem; font-weight: 700; color: #e2e8f0;
        line-height: 1.2; letter-spacing: -0.2px;
    }
    .sidebar-brand-sub {
        font-size: 0.65rem; color: #475569; letter-spacing: 0.5px;
        text-transform: uppercase; margin-top: 2px;
    }

    /* ---- Profile card ---- */
    .profile-card {
        background: linear-gradient(135deg, rgba(56,189,248,0.07) 0%, rgba(99,102,241,0.04) 100%);
        border: 1px solid rgba(56,189,248,0.18);
        border-radius: 12px;
        padding: 0.85rem 1rem;
        margin: 0.25rem 0 0.75rem 0;
        display: flex;
        align-items: center;
        gap: 0.7rem;
    }
    .profile-avatar {
        width: 40px; height: 40px;
        border-radius: 50%;
        background: rgba(56,189,248,0.15);
        border: 1px solid rgba(56,189,248,0.3);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .profile-avatar i { font-size: 1.2rem; color: #38bdf8; }
    .profile-info { min-width: 0; flex: 1; }
    .profile-name {
        font-size: 0.88rem; font-weight: 600; color: #f1f5f9; line-height: 1.2;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .profile-role {
        font-size: 0.66rem; color: #64748b; letter-spacing: 0.5px;
        text-transform: uppercase; margin-top: 3px;
    }

    /* ---- Section / nav label ---- */
    .nav-label {
        font-size: 0.66rem; font-weight: 700; color: #475569;
        letter-spacing: 1.2px; text-transform: uppercase;
        margin: 0.4rem 0 0.4rem 0;
    }

    /* ---- Sidebar nav buttons ---- */
    [data-testid="stSidebar"] .nav-btn button {
        background: transparent !important;
        border: none !important;
        border-radius: 9px !important;
        color: #94a3b8 !important;
        font-family: 'Inter', sans-serif !important;
        font-size: 0.87rem !important;
        font-weight: 500 !important;
        text-align: left !important;
        padding: 0.55rem 0.85rem !important;
        width: 100% !important;
        transition: background 0.15s ease, color 0.15s ease !important;
        box-shadow: none !important;
    }
    [data-testid="stSidebar"] .nav-btn button:hover {
        background: rgba(56,189,248,0.07) !important;
        color: #cbd5e1 !important;
    }
    [data-testid="stSidebar"] .nav-btn-active button {
        background: linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(14,165,233,0.1) 100%) !important;
        border: 1px solid rgba(56,189,248,0.4) !important;
        border-radius: 9px !important;
        color: #38bdf8 !important;
        font-weight: 600 !important;
        box-shadow: 0 2px 10px rgba(56,189,248,0.15) !important;
    }

    /* ---- Sign-out button at the bottom of the sidebar ---- */
    [data-testid="stSidebar"] [data-testid="stElementContainer"]:has(.sidebar-signout-marker) + [data-testid="stElementContainer"] button {
        background: rgba(239, 68, 68, 0.06) !important;
        border: 1px solid rgba(239, 68, 68, 0.22) !important;
        color: #fca5a5 !important;
        border-radius: 9px !important;
        font-weight: 500 !important;
        transition: all 0.2s ease !important;
        padding: 0.55rem 0.9rem !important;
        font-size: 0.88rem !important;
    }
    [data-testid="stSidebar"] [data-testid="stElementContainer"]:has(.sidebar-signout-marker) + [data-testid="stElementContainer"] button:hover {
        background: rgba(239, 68, 68, 0.12) !important;
        border-color: rgba(239, 68, 68, 0.4) !important;
        color: #fecaca !important;
    }

    /* ---- Hero banner ---- */
    .hero-banner {
        background: linear-gradient(135deg, #0b1929 0%, #0f2744 60%, #0d1f35 100%);
        border: 1px solid rgba(56,189,248,0.18);
        border-radius: 16px;
        padding: 1.5rem 2rem;
        margin-bottom: 1.5rem;
    }
    .hero-icon { font-size: 1.6rem; color: #38bdf8; margin-bottom: 0.5rem; display: block; }
    .hero-title {
        font-size: 1.5rem; font-weight: 700;
        color: #f1f5f9; margin: 0 0 0.3rem 0; letter-spacing: -0.4px;
    }
    .hero-sub {
        font-size: 0.88rem; color: #64748b; margin: 0;
    }

    /* ---- Section labels ---- */
    .section-label {
        font-size: 0.7rem; font-weight: 600; color: #38bdf8;
        text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.4rem;
    }
    .section-title {
        font-size: 1.15rem; font-weight: 600; color: #e2e8f0; margin-bottom: 1rem;
    }

    /* ---- Upload card ---- */
    .upload-hint {
        background: rgba(56,189,248,0.06);
        border: 1px dashed rgba(56,189,248,0.3);
        border-radius: 12px;
        padding: 1.2rem 1.5rem;
        color: #94a3b8;
        font-size: 0.85rem;
        margin-bottom: 0.8rem;
    }
    .upload-hint code {
        background: rgba(255,255,255,0.07);
        border-radius: 4px;
        padding: 1px 5px;
        color: #38bdf8;
        font-size: 0.82rem;
    }

    /* ---- Tabs ---- */
    .stTabs [data-baseweb="tab-list"] {
        gap: 4px;
        background: transparent;
        border-radius: 10px;
        padding: 4px;
    }
    .stTabs [data-baseweb="tab"] {
        border-radius: 7px;
        padding: 8px 18px;
        color: #64748b;
        font-weight: 500;
        font-size: 0.85rem;
        letter-spacing: 0.2px;
    }
    .stTabs [aria-selected="true"] {
        background: rgba(56,189,248,0.15) !important;
        color: #38bdf8 !important;
    }

    /* ---- Export banner ---- */
    .export-banner {
        background: linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(14,165,233,0.06) 100%);
        border: 1px solid rgba(56,189,248,0.25);
        border-radius: 14px;
        padding: 1.1rem 1.4rem;
        margin-bottom: 1.4rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
    }
    .export-banner-text { display: flex; align-items: center; gap: 10px; }
    .export-banner-title { font-size: 0.9rem; font-weight: 600; color: #e2e8f0; display: block; }
    .export-banner-sub { font-size: 0.75rem; color: #64748b; display: block; }
    .export-icon { font-size: 1.3rem; color: #38bdf8; }

    /* ---- Stats grid ---- */
    .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1.2rem;
        margin-bottom: 1.4rem;
    }
    .stats-panel {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 12px;
        padding: 1rem 1.2rem;
    }
    .stats-panel-title {
        font-size: 0.68rem; font-weight: 700; letter-spacing: 1px;
        text-transform: uppercase; color: #38bdf8; margin-bottom: 0.8rem;
        display: flex; align-items: center; gap: 6px;
    }
    .stats-row { display: flex; gap: 0.8rem; flex-wrap: wrap; }
    .stat-card {
        flex: 1; min-width: 80px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 0.7rem 0.9rem;
        text-align: center;
    }
    .stat-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .stat-value { font-size: 1.6rem; font-weight: 700; color: #f1f5f9; line-height: 1; }
    .stat-value.danger { color: #ef4444; }
    .stat-value.warn   { color: #f59e0b; }
    .stat-value.ok     { color: #10b981; }

    /* ---- Expanders ---- */
    [data-testid="stExpander"] {
        border: 1px solid rgba(255,255,255,0.07) !important;
        border-radius: 10px !important;
        background: rgba(255,255,255,0.02) !important;
    }

    /* ---- Divider ---- */
    hr { border-color: rgba(255,255,255,0.07) !important; }

    /* ---- Empty state ---- */
    .empty-state {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 14px;
        padding: 2.8rem 2rem;
        text-align: center;
        margin-top: 1rem;
    }
    .empty-state-icon { font-size: 2.4rem; color: #475569; margin-bottom: 0.9rem; display: block; }
    .empty-state-title { font-size: 1.05rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.4rem; }
    .empty-state-sub { font-size: 0.85rem; color: #64748b; }

    /* ---- Inline notice for "anomaly required to create ticket" ---- */
    .inline-notice {
        background: rgba(245,158,11,0.07);
        border: 1px dashed rgba(245,158,11,0.32);
        border-radius: 12px;
        padding: 1.2rem 1.4rem;
        color: #fcd34d;
        font-size: 0.88rem;
        margin: 0.4rem 0 0.8rem 0;
        display: flex;
        align-items: center;
        gap: 12px;
    }
    .inline-notice i { font-size: 1.4rem; color: #f59e0b; flex-shrink: 0; }
    .inline-notice strong { color: #fde68a; }

    /* ---- Page header (for Tickets page) ---- */
    .page-header {
        display: flex; align-items: center; gap: 14px;
        padding: 0.8rem 0 1.3rem 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        margin-bottom: 1.4rem;
    }
    .page-header-icon {
        background: rgba(56,189,248,0.12);
        border: 1px solid rgba(56,189,248,0.22);
        border-radius: 12px;
        width: 44px; height: 44px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
    }
    .page-header-icon i { font-size: 1.3rem; color: #38bdf8; }
    .page-header-text { line-height: 1.3; }
    .page-header-title { font-size: 1.35rem; font-weight: 700; color: #f1f5f9; margin: 0; letter-spacing: -0.3px; }
    .page-header-sub { font-size: 0.82rem; color: #64748b; margin: 3px 0 0 0; }

    /* ---- Call-to-Action Button (active) ---- */
    [data-testid="baseButton-primary"]:not(:disabled) {
        background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%) !important;
        border: none !important;
        border-radius: 10px !important;
        padding: 0.85rem 2.5rem !important;
        font-weight: 600 !important;
        font-size: 0.95rem !important;
        letter-spacing: 0.3px !important;
        transition: all 0.3s ease !important;
        box-shadow: 0 4px 15px rgba(56, 189, 248, 0.25) !important;
    }
    [data-testid="baseButton-primary"]:not(:disabled):hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 25px rgba(56, 189, 248, 0.4) !important;
    }
    [data-testid="baseButton-primary"]:not(:disabled):active {
        transform: translateY(0) !important;
        box-shadow: 0 2px 10px rgba(56, 189, 248, 0.3) !important;
    }
    [data-testid="baseButton-primary"]:disabled {
        background: rgba(30, 41, 59, 0.7) !important;
        border: 1px solid rgba(100, 116, 139, 0.3) !important;
        border-radius: 10px !important;
        padding: 0.85rem 2.5rem !important;
        font-weight: 600 !important;
        font-size: 0.95rem !important;
        letter-spacing: 0.3px !important;
        color: #475569 !important;
        box-shadow: none !important;
        cursor: default !important;
        opacity: 1 !important;
    }
</style>
""", unsafe_allow_html=True)


# ============================================================================
# SESSION STATE INITIALIZATION
# ============================================================================

if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'analyst_id' not in st.session_state:
    st.session_state.analyst_id = None
if 'analyst_name' not in st.session_state:
    st.session_state.analyst_name = None

if 'current_page' not in st.session_state:
    st.session_state.current_page = "Zones Process"
if 'page_transitioning' not in st.session_state:
    st.session_state.page_transitioning = False

if 'raw_data' not in st.session_state:
    st.session_state.raw_data = None
if 'processed' not in st.session_state:
    st.session_state.processed = False
if 'current_file_name' not in st.session_state:
    st.session_state.current_file_name = None
if 'processed_file_name' not in st.session_state:
    st.session_state.processed_file_name = None
if 'file_was_loaded' not in st.session_state:
    st.session_state.file_was_loaded = False
if 'last_contamination' not in st.session_state:
    st.session_state.last_contamination = None


# ============================================================================
# LOGIN SCREEN
# ============================================================================

def show_login_screen():
    st.markdown("""
    <style>
    [data-testid="stSidebar"],
    [data-testid="stSidebarCollapsedControl"] { display: none !important; }

    div[data-testid="stTextInput"] label {
        font-size: 0.78rem !important;
        font-weight: 600 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.7px !important;
        color: #94a3b8 !important;
        margin-bottom: 4px !important;
    }
    div[data-testid="stTextInput"] input {
        background: rgba(2, 6, 23, 0.6) !important;
        border: 1px solid rgba(56,189,248,0.18) !important;
        border-radius: 10px !important;
        color: #f1f5f9 !important;
        font-size: 0.95rem !important;
        padding: 12px 14px !important;
    }
    div[data-testid="stTextInput"] input:focus {
        border-color: #38bdf8 !important;
        box-shadow: 0 0 0 3px rgba(56,189,248,0.1) !important;
        outline: none !important;
    }
    div[data-testid="stTextInput"] input::placeholder { color: #334155 !important; }
    </style>
    """, unsafe_allow_html=True)

    st.markdown("<div style='height:5vh'></div>", unsafe_allow_html=True)

    _, col, _ = st.columns([1, 1.1, 1])
    with col:
        st.markdown("""
        <div style="
            background: linear-gradient(145deg, rgba(13,31,53,0.98), rgba(9,18,36,0.99));
            border: 1px solid rgba(56,189,248,0.18);
            border-radius: 20px 20px 0 0;
            padding: 2rem 2rem 1.75rem 2rem;
        ">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:1.25rem;">
                <div style="
                    background: rgba(56,189,248,0.12);
                    border: 1px solid rgba(56,189,248,0.2);
                    border-radius: 14px;
                    width: 48px; height: 48px;
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                ">
                    <i class="bi bi-radar" style="font-size:1.4rem;color:#38bdf8;"></i>
                </div>
                <div>
                    <div style="font-size:1.1rem;font-weight:700;color:#f1f5f9;line-height:1.2;letter-spacing:-0.3px;">
                        Spatiotemporal QC
                    </div>
                    <div style="font-size:0.72rem;color:#475569;margin-top:3px;letter-spacing:0.4px;text-transform:uppercase;">
                        Analyst Portal
                    </div>
                </div>
            </div>
            <p style="font-size:0.85rem;color:#64748b;margin:0;line-height:1.55;">
                Sign in with your analyst credentials to access the quality control pipeline.
            </p>
        </div>
        <div style="
            background: rgba(11,25,45,0.97);
            border: 1px solid rgba(56,189,248,0.18);
            border-top: none;
            border-radius: 0 0 20px 20px;
            padding: 1.5rem 2rem 2rem 2rem;
        ">
        """, unsafe_allow_html=True)

        username = st.text_input(
            "Username", placeholder="e.g. spatiotemporal", key="login_username")
        password = st.text_input(
            "Password", type="password", placeholder="••••••••", key="login_password")

        if st.button("Sign In →", type="primary", use_container_width=True, key="login_btn"):
            if not username.strip() or not password:
                st.error("Enter your username and password.")
            else:
                try:
                    profile = sign_in_analyst(username.strip(), password)
                    st.session_state.authenticated = True
                    st.session_state.analyst_id = profile['id']
                    st.session_state.analyst_name = profile['full_name']
                    st.rerun()
                except Exception as e:
                    st.error(str(e))

        st.markdown("</div>", unsafe_allow_html=True)


if not st.session_state.authenticated:
    show_login_screen()
    st.stop()


# ============================================================================
# SIDEBAR
# ============================================================================

with st.sidebar:
    st.markdown("""
    <div class="sidebar-brand">
        <div class="sidebar-brand-icon"><i class="bi bi-radar"></i></div>
        <div>
            <div class="sidebar-brand-title">Spatiotemporal</div>
            <div class="sidebar-brand-sub">Anomaly Detection</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    analyst_name = st.session_state.get('analyst_name', 'Analyst')
    st.markdown(f"""
    <div class="profile-card">
        <div class="profile-avatar"><i class="bi bi-person-circle"></i></div>
        <div class="profile-info">
            <div class="profile-name">{analyst_name}</div>
            <div class="profile-role">Data Analyst</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    pages = [
        ("broadcast", "Zones Process"),
        ("ticket-detailed", "Maintenance Tickets"),
    ]
    for icon, label in pages:
        active = st.session_state.current_page == label
        css_class = "nav-btn-active" if active else "nav-btn"
        st.markdown(f'<div class="{css_class}">', unsafe_allow_html=True)
        if st.button(f"  {label}", key=f"nav_{label}", use_container_width=True):
            if st.session_state.current_page != label:
                st.session_state.current_page = label
                st.session_state.page_transitioning = True
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    current_page = st.session_state.current_page

    st.markdown("---")

    if current_page == "Zones Process":
        st.markdown(
            '<div class="nav-label">Zone C — Anomaly Detection</div>', unsafe_allow_html=True)
        contamination = st.slider(
            "Contamination",
            min_value=0.01, max_value=0.5, value=0.05, step=0.01,
            help="Expected proportion of anomalies in the data",
            key="contamination_slider"
        )

        with st.expander("Pipeline Overview", expanded=False):
            st.markdown("""
            **Zone A** — Downmapping & interpolation (single-day gaps)
            **Zone B** — Haversine neighbor grouping
            **Zone C** — LOF anomaly detection (RobustScaler)
            """)
    else:
        contamination = st.session_state.get('last_contamination') or 0.05
        st.markdown(
            "<div style='color:#64748b;font-size:0.82rem;line-height:1.55;'>"
            "Manage maintenance tickets, review field inspection reports, "
            "and administer technician accounts here."
            "</div>",
            unsafe_allow_html=True
        )

    st.markdown('<div class="sidebar-flex-spacer"></div>',
                unsafe_allow_html=True)

    st.markdown('<div class="sidebar-signout-marker"></div>',
                unsafe_allow_html=True)

    if st.button("⏻  Sign out", key="sidebar_logout", use_container_width=True):
        for key in ['authenticated', 'analyst_id', 'analyst_name']:
            st.session_state[key] = None if key != 'authenticated' else False
        st.rerun()


# ============================================================================
# MAIN CONTENT
# ============================================================================

# Two-phase transition: blank first, then new page.
# This ensures old page DOM is fully cleared before new page renders.
if st.session_state.page_transitioning:
    st.session_state.page_transitioning = False
    st.rerun()
elif current_page == "Zones Process":
    zones_process.render(contamination)
else:
    maintenance_tickets.render()


# ============================================================================
# FOOTER
# ============================================================================

st.markdown("---")
st.markdown(
    "<p style='text-align:center;color:#334155;font-size:0.8rem;'>"
    "AWS QC Pipeline &nbsp;·&nbsp; Zone A → Zone B → Zone C &nbsp;·&nbsp; Rainfall Anomaly Detection"
    "</p>",
    unsafe_allow_html=True
)
