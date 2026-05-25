import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium
import time

from zone.zone_a import zone_a_linear_interpolation
from zone.zone_b import zone_b_haversine_grouping
from zone.zone_c import zone_c_lof_anomaly_detection
from utils.supabase_client import (
    sign_in_analyst,
    fetch_all_tickets,
    create_ticket,
    update_ticket_status,
    fetch_all_reports,
    approve_report,
    fetch_technicians,
    create_technician_account,
    fetch_report_photos,
)


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
        padding-left: 2.5rem !important;
        padding-right: 2.5rem !important;
        margin-left: auto !important;
        margin-right: auto !important;
    }
    @media (max-width: 768px) {
        .block-container {
            padding-left: 1.25rem !important;
            padding-right: 1.25rem !important;
        }
    }

    /* ---- Sidebar background ---- */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0d1526 0%, #0a0f1e 100%);
        border-right: 1px solid rgba(56,189,248,0.12);
    }
    /* Fix sidebar height chain so the flex spacer actually works.
       Streamlit wraps stSidebarUserContent in a plain div that has no fixed
       height, so height:100% never resolves. We pin that wrapper to 100vh
       and propagate flex all the way down. */
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
    /* The spacer-marker wrapper is the ONLY thing that grows — it eats the
       leftover vertical space, pushing the sign-out button to the bottom. */
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

    /* ---- Sign-out button at the bottom of the sidebar (uses :has() on wrapper) ---- */
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


# ---- Auth gate — stops execution if not logged in -------------------------
if not st.session_state.authenticated:
    show_login_screen()
    st.stop()


# ============================================================================
# HELPER FUNCTIONS (Data / Charts)
# ============================================================================

def convert_df_to_csv(df):
    return df.to_csv(index=False).encode('utf-8')


def create_station_map(stations_df):
    if len(stations_df) == 0:
        return None
    valid_coords = stations_df[
        stations_df['latitude'].notna() & stations_df['longitude'].notna()
    ].copy()
    if len(valid_coords) == 0:
        return None

    center_lat = valid_coords['latitude'].mean()
    center_lon = valid_coords['longitude'].mean()
    lat_pad = max((valid_coords['latitude'].max() -
                  valid_coords['latitude'].min()) * 0.4, 0.03)
    lon_pad = max((valid_coords['longitude'].max() -
                  valid_coords['longitude'].min()) * 0.4, 0.03)
    bounds = [
        [valid_coords['latitude'].min() - lat_pad,
         valid_coords['longitude'].min() - lon_pad],
        [valid_coords['latitude'].max() + lat_pad,
         valid_coords['longitude'].max() + lon_pad]
    ]

    map_obj = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=12,
        tiles='CartoDB dark_matter',
        min_zoom=10, max_zoom=16
    )
    map_obj.fit_bounds(bounds, max_zoom=14)

    for idx, row in valid_coords.iterrows():
        station_id = row.get('station_id', f'Station {idx}')
        folium.CircleMarker(
            location=[row['latitude'], row['longitude']],
            radius=8,
            popup=folium.Popup(
                f"<b>Station ID:</b> {station_id}", max_width=300),
            tooltip=station_id,
            color='#38bdf8', fill=True, fillColor='#38bdf8',
            fillOpacity=0.75, weight=2
        ).add_to(map_obj)

    return map_obj


def create_station_chart(station_data, anomaly_dates, rain_col):
    colors = [
        '#FF4444' if d in anomaly_dates else '#4ECDC4' for d in station_data['date']]
    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=station_data['date'], y=station_data[rain_col],
        marker_color=colors, showlegend=False,
        hovertemplate='%{x|%b %d, %Y}<br>Rainfall: %{y:.1f} mm<extra></extra>'
    ))
    fig.add_trace(go.Bar(x=[None], y=[None],
                  name='Normal', marker_color='#4ECDC4'))
    fig.add_trace(go.Bar(x=[None], y=[None],
                  name='Anomaly', marker_color='#FF4444'))
    fig.update_layout(
        height=260,
        margin=dict(l=0, r=0, t=10, b=0),
        legend=dict(orientation='h', yanchor='bottom', y=1.02),
        xaxis=dict(title=''),
        yaxis=dict(title='Rainfall (mm)'),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(size=11),
        bargap=0.15
    )
    return fig


def paginate_dataframe(df, page_size, page_num):
    start_idx = (page_num - 1) * page_size
    end_idx = start_idx + page_size
    return df.iloc[start_idx:end_idx]


def prepare_display_data():
    raw = st.session_state.raw_data
    cleaned = st.session_state.cleaned_data if st.session_state.processed else None
    flagged = st.session_state.flagged_data if st.session_state.processed else None
    rain_col = 'rainfall'
    if raw is not None:
        rain_col = 'rainfall' if 'rainfall' in raw.columns else 'rainfall_mm'
    elif cleaned is not None:
        rain_col = 'rainfall' if 'rainfall' in cleaned.columns else 'rainfall_mm'
    return {
        'raw_data': raw,
        'cleaned_data': cleaned,
        'flagged_data': flagged,
        'rain_col': rain_col
    }


# ============================================================================
# TICKET-RELATED RENDER HELPERS
# ============================================================================

_STATUS_COLOR = {
    'created':     ('#fbbf24', '#1c1300'),
    'assigned':    ('#38bdf8', '#001c26'),
    'in-progress': ('#818cf8', '#0d0a2e'),
    'completed':   ('#10b981', '#011a0e'),
    'verified':    ('#6ee7b7', '#011a0e'),
}
_PRIORITY_COLOR = {'low': '#10b981', 'medium': '#f59e0b', 'high': '#ef4444'}


def _status_badge(status: str) -> str:
    bg, fg = _STATUS_COLOR.get(status, ('#64748b', '#fff'))
    return (
        f"<span style='background:{bg};color:{fg};padding:2px 10px;"
        f"border-radius:20px;font-size:0.72rem;font-weight:700;"
        f"text-transform:uppercase;letter-spacing:0.5px;'>{status}</span>"
    )


def _priority_badge(priority: str) -> str:
    color = _PRIORITY_COLOR.get(priority, '#64748b')
    return (
        f"<span style='color:{color};font-weight:700;"
        f"font-size:0.72rem;text-transform:uppercase;'>{priority}</span>"
    )


def _render_create_ticket(analyst_id: str, anomaly_summary):
    """Inline 'Create Ticket' section — lives inside the Zones Process tab."""
    if not anomaly_summary:
        st.markdown("""
        <div class="inline-notice">
            <i class="bi bi-info-circle"></i>
            <div>
                <strong>No anomalies detected in the current dataset.</strong><br>
                <span style="color:#cbd5e1;font-size:0.84rem;">
                    Run the pipeline first. Tickets should target stations flagged by Zone&nbsp;C.
                </span>
            </div>
        </div>
        """, unsafe_allow_html=True)
        return

    try:
        technicians = fetch_technicians()
    except Exception as e:
        st.error(f"Could not load technicians: {e}")
        technicians = []

    if not technicians:
        st.warning(
            "No technician accounts found. Create one from **Maintenance Tickets → "
            "Manage Technicians** before creating tickets."
        )
        return

    tech_options = {f"{t['full_name']} (@{t['username']})": t['id'] for t in technicians}
    anomaly_stations = list(anomaly_summary.keys())

    with st.form("create_ticket_form", clear_on_submit=True):
        selected_tech_label = st.selectbox(
            "Assign to technician", list(tech_options.keys()))
        technician_id = tech_options[selected_tech_label]

        col_a, col_b = st.columns(2)
        with col_a:
            station_id = st.selectbox("Station ID", options=anomaly_stations)
        with col_b:
            anomaly_zone = st.selectbox("Anomaly Zone", ['A', 'B', 'C', '—'])

        title = st.text_input(
            "Ticket title", placeholder="Brief summary of the issue")
        description = st.text_area(
            "Description", placeholder="Detailed inspection instructions for the technician...")
        priority = st.selectbox("Priority", ['high', 'medium', 'low'])

        submitted = st.form_submit_button(
            "Create Ticket", type="primary", use_container_width=True)

    if submitted:
        title_clean = title.strip()
        errors = []
        if not title_clean:
            errors.append("Ticket title is required.")
        elif len(title_clean) < 3:
            errors.append("Ticket title must be at least 3 characters.")
        elif len(title_clean) > 100:
            errors.append("Ticket title must be 100 characters or fewer.")

        if errors:
            for err in errors:
                st.error(err)
        else:
            zone_val = anomaly_zone if anomaly_zone != '—' else None
            try:
                result = create_ticket(
                    analyst_id=analyst_id,
                    technician_id=technician_id,
                    station_id=station_id,
                    title=title_clean,
                    description=description.strip() or None,
                    priority=priority,
                    anomaly_zone=zone_val,
                )
                st.success(f"Ticket created — ID: `{result.get('id', '')[:8].upper()}`")
            except Exception as e:
                st.error(f"Failed to create ticket: {e}")


def _render_tickets_board():
    """Tickets board — list, filter, update status."""
    col_filter, col_refresh = st.columns([3, 1])
    with col_filter:
        status_options = ['all', 'assigned',
                          'in-progress', 'completed', 'verified']
        status_filter = st.selectbox(
            "Filter by status", status_options, key="board_status_filter")
    with col_refresh:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("Refresh", key="board_refresh", use_container_width=True):
            st.rerun()

    try:
        filter_list = None if status_filter == 'all' else [status_filter]
        tickets = fetch_all_tickets(filter_list)
    except Exception as e:
        st.error(f"Could not load tickets: {e}")
        tickets = []

    if not tickets:
        st.markdown("""
        <div class="empty-state">
            <i class="bi bi-ticket-detailed empty-state-icon"></i>
            <div class="empty-state-title">No tickets found</div>
            <div class="empty-state-sub">Create tickets from the <strong>Zones Process</strong> tab when anomalies appear.</div>
        </div>
        """, unsafe_allow_html=True)
        return

    for t in tickets:
        tech_name = (t.get('technician') or {}).get('full_name', 'Unassigned')
        with st.expander(
            f"{t['station_id']} · {t['title']} — {tech_name}",
            expanded=False
        ):
            c1, c2, c3, c4 = st.columns(4)
            c1.markdown(_status_badge(t['status']), unsafe_allow_html=True)
            c2.markdown(_priority_badge(
                t.get('priority', 'medium')), unsafe_allow_html=True)
            c3.markdown(
                f"<span style='color:#94a3b8;font-size:0.8rem;'>Zone {t.get('anomaly_zone') or '—'}</span>",
                unsafe_allow_html=True
            )
            c4.markdown(
                f"<span style='color:#64748b;font-size:0.75rem;'>{t['created_at'][:10]}</span>",
                unsafe_allow_html=True
            )

            if t.get('description'):
                st.markdown(
                    f"<div style='color:#cbd5e1;font-size:0.88rem;margin-top:0.6rem;'>{t['description']}</div>",
                    unsafe_allow_html=True
                )

            # Show inspection report details if a report has been submitted
            report = t.get('report') or {}
            if report:
                st.markdown(
                    "<div style='border-top:1px solid rgba(255,255,255,0.07);margin-top:0.7rem;padding-top:0.7rem;'>",
                    unsafe_allow_html=True
                )
                st.markdown(
                    "<span style='font-size:0.7rem;font-weight:700;color:#38bdf8;"
                    "text-transform:uppercase;letter-spacing:1px;'>Field Report</span>",
                    unsafe_allow_html=True
                )
                if report.get('notes'):
                    st.markdown(
                        f"<div style='color:#cbd5e1;font-size:0.85rem;margin-top:0.4rem;'>"
                        f"<strong>Notes:</strong> {report['notes']}</div>",
                        unsafe_allow_html=True
                    )
                rdet_cols = st.columns(3)
                if report.get('sensor_working') is not None:
                    rdet_cols[0].markdown(
                        f"<span style='color:#94a3b8;font-size:0.8rem;'>Sensor: "
                        f"<strong style='color:#e2e8f0;'>{'Working' if report['sensor_working'] else 'Faulty'}</strong></span>",
                        unsafe_allow_html=True
                    )
                if report.get('severity'):
                    rdet_cols[1].markdown(
                        f"<span style='color:#94a3b8;font-size:0.8rem;'>Severity: "
                        f"<strong style='color:#e2e8f0;'>{report['severity'].capitalize()}</strong></span>",
                        unsafe_allow_html=True
                    )
                if report.get('root_cause'):
                    st.markdown(
                        f"<div style='color:#94a3b8;font-size:0.8rem;margin-top:0.3rem;'>"
                        f"Root cause: {report['root_cause']}</div>",
                        unsafe_allow_html=True
                    )
                if report.get('analyst_notes'):
                    st.markdown(
                        f"<div style='color:#94a3b8;font-size:0.8rem;margin-top:0.3rem;'>"
                        f"Analyst notes: {report['analyst_notes']}</div>",
                        unsafe_allow_html=True
                    )
                st.markdown("</div>", unsafe_allow_html=True)

            # Valid forward transitions only; 'verified' is set only via report approval
            _next_statuses = {
                'assigned':    ['assigned', 'in-progress'],
                'in-progress': ['in-progress', 'completed'],
            }
            if t['status'] in _next_statuses:
                choices = _next_statuses[t['status']]
                new_status = st.selectbox(
                    "Update status", choices,
                    index=0, key=f"status_{t['id']}"
                )
                if st.button("Save", key=f"save_{t['id']}"):
                    if new_status == t['status']:
                        st.info("Status unchanged.")
                    else:
                        try:
                            update_ticket_status(t['id'], new_status)
                            st.success("Status updated.")
                            st.rerun()
                        except Exception as e:
                            st.error(str(e))
            elif t['status'] == 'completed':
                st.markdown(
                    "<span style='color:#64748b;font-size:0.8rem;'>"
                    "Awaiting analyst approval in <strong>Inspection Reports</strong>.</span>",
                    unsafe_allow_html=True
                )
            elif t['status'] == 'verified':
                st.markdown(
                    "<span style='color:#6ee7b7;font-size:0.8rem;'>✓ Verified and closed.</span>",
                    unsafe_allow_html=True
                )


def _render_report_photos(report_id: str):
    """Display photos attached by the technician. Analyst view is read-only."""
    import urllib.request
    try:
        photos = fetch_report_photos(report_id)
    except Exception:
        photos = []

    st.markdown(
        "<span style='font-size:0.72rem;font-weight:700;color:#38bdf8;"
        "text-transform:uppercase;letter-spacing:1px;'>Photos</span>",
        unsafe_allow_html=True
    )
    if not photos:
        st.markdown(
            "<span style='color:#475569;font-size:0.8rem;'>No photos attached.</span>",
            unsafe_allow_html=True
        )
        return

    # Cap at 2 columns so photos don't blow up on wide screens
    n_cols = min(len(photos), 2)
    _, *mid_cols, _ = st.columns([1] + [2] * n_cols + [1])
    photo_cols = mid_cols[:n_cols]
    for i, p in enumerate(photos):
        url = p.get('photo_url', '')
        if not url:
            continue
        with photo_cols[i % n_cols]:
            try:
                st.image(url, width=340)
            except Exception:
                st.markdown(
                    f"<a href='{url}' target='_blank' style='color:#38bdf8;font-size:0.82rem;'>"
                    f"View photo {i + 1}</a>",
                    unsafe_allow_html=True
                )


def _render_report_body(r: dict, submitted: str):
    """Render the technician-submitted fields common to both pending and approved reports."""
    if r.get('notes'):
        st.markdown(
            f"<div style='color:#cbd5e1;font-size:0.9rem;margin-bottom:0.6rem;'>"
            f"<strong style='color:#e2e8f0;'>Field notes:</strong> {r['notes']}</div>",
            unsafe_allow_html=True
        )

    det_c1, det_c2, det_c3 = st.columns(3)
    sw = r.get('sensor_working')
    sw_label = 'Yes' if sw is True else ('No' if sw is False else '—')
    sw_color = '#10b981' if sw is True else ('#ef4444' if sw is False else '#64748b')
    det_c1.markdown(
        f"<span style='color:#94a3b8;font-size:0.8rem;'>Sensor working<br>"
        f"<strong style='color:{sw_color};font-size:1rem;'>{sw_label}</strong></span>",
        unsafe_allow_html=True
    )
    sev = r.get('severity') or '—'
    sev_color = {'low': '#10b981', 'medium': '#f59e0b', 'high': '#ef4444'}.get(sev, '#64748b')
    det_c2.markdown(
        f"<span style='color:#94a3b8;font-size:0.8rem;'>Severity<br>"
        f"<strong style='color:{sev_color};font-size:1rem;text-transform:capitalize;'>{sev}</strong></span>",
        unsafe_allow_html=True
    )
    det_c3.markdown(
        f"<span style='color:#94a3b8;font-size:0.8rem;'>Submitted<br>"
        f"<strong style='color:#e2e8f0;font-size:0.9rem;'>{submitted}</strong></span>",
        unsafe_allow_html=True
    )

    if r.get('root_cause'):
        st.markdown(
            f"<div style='color:#94a3b8;font-size:0.82rem;margin-top:0.5rem;'>"
            f"Root cause: <span style='color:#cbd5e1;'>{r['root_cause']}</span></div>",
            unsafe_allow_html=True
        )

    if r.get('analyst_notes'):
        st.markdown(
            f"<div style='color:#94a3b8;font-size:0.82rem;margin-top:0.4rem;'>"
            f"Analyst notes: <span style='color:#cbd5e1;'>{r['analyst_notes']}</span></div>",
            unsafe_allow_html=True
        )

    st.markdown("<div style='margin-top:0.8rem;'>", unsafe_allow_html=True)
    _render_report_photos(r['id'])
    st.markdown("</div>", unsafe_allow_html=True)


def _render_inspection_reports():
    """Inspection reports tab — pending approval + already-approved."""
    if st.button("Refresh reports", key="reports_refresh"):
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
            <div class="empty-state-sub">Reports submitted by technicians from the field app will appear here.</div>
        </div>
        """, unsafe_allow_html=True)
        return

    pending = [r for r in reports if not r.get('analyst_approved')]
    approved = [r for r in reports if r.get('analyst_approved')]

    if pending:
        st.markdown(f"##### Pending Approval ({len(pending)})")
        for r in pending:
            ticket_info = r.get('ticket') or {}
            tech_info = r.get('technician') or {}
            submitted = (r.get('submitted_at') or r.get('created_at') or '')[:10]
            with st.expander(
                f"{ticket_info.get('station_id', '?')} · {ticket_info.get('title', '?')} "
                f"— {tech_info.get('full_name', '?')} · {submitted}",
                expanded=True
            ):
                _render_report_body(r, submitted)
                st.markdown("---")
                analyst_notes = st.text_area(
                    "Analyst notes (optional)", key=f"anotes_{r['id']}"
                )
                if st.button("Approve & Mark Verified", key=f"approve_{r['id']}", type="primary"):
                    try:
                        approve_report(r['id'], r['ticket_id'], analyst_notes)
                        st.success("Report approved — ticket marked Verified.")
                        st.rerun()
                    except Exception as e:
                        st.error(str(e))

    if approved:
        st.markdown(f"##### Approved ({len(approved)})")
        for r in approved:
            ticket_info = r.get('ticket') or {}
            tech_info = r.get('technician') or {}
            approved_date = (r.get('analyst_approved_at') or '')[:10]
            submitted = (r.get('submitted_at') or r.get('created_at') or '')[:10]
            with st.expander(
                f"{ticket_info.get('station_id', '?')} · {ticket_info.get('title', '?')} "
                f"— {tech_info.get('full_name', '?')} · approved {approved_date}",
                expanded=False
            ):
                _render_report_body(r, submitted)


def _render_manage_technicians():
    """Technician account management (lives inside Maintenance Tickets page)."""
    try:
        technicians = fetch_technicians(active_only=False)
    except Exception as e:
        st.error(f"Could not load technicians: {e}")
        technicians = []

    col_l, col_r = st.columns([1, 1], gap="large")

    with col_l:
        st.markdown("##### Existing Accounts")
        if not technicians:
            st.caption("No technician accounts yet — create one on the right.")
        else:
            for t in technicians:
                status_color = "#10b981" if t.get('is_active') else "#ef4444"
                st.markdown(
                    f"<div style='display:flex;align-items:center;gap:8px;"
                    f"padding:0.55rem 0.8rem;background:rgba(255,255,255,0.03);"
                    f"border:1px solid rgba(255,255,255,0.06);border-radius:9px;margin-bottom:6px;'>"
                    f"<i class='bi bi-person-circle' style='color:#64748b;font-size:1.1rem;'></i>"
                    f"<div style='flex:1;min-width:0;'>"
                    f"<div style='color:#e2e8f0;font-weight:600;font-size:0.88rem;'>{t['full_name']}</div>"
                    f"<div style='color:#64748b;font-size:0.74rem;'>@{t['username']}</div>"
                    f"</div>"
                    f"<span style='color:{status_color};font-size:0.85rem;'>●</span>"
                    f"</div>",
                    unsafe_allow_html=True
                )

    with col_r:
        st.markdown("##### Create New Account")
        with st.form("manage_create_tech_form", clear_on_submit=True):
            s_full_name = st.text_input("Full name", key="m_full_name")
            s_username = st.text_input(
                "Username", placeholder="e.g. john_doe", key="m_username")
            s_email = st.text_input("Email", key="m_email")
            s_phone = st.text_input("Phone (optional)", key="m_phone")
            s_password = st.text_input(
                "Temporary password", type="password", key="m_password")
            s_submitted = st.form_submit_button(
                "Create Account", type="primary", use_container_width=True)

        if s_submitted:
            if not all([s_full_name, s_username, s_email, s_password]):
                st.error("Full name, username, email, and password are required.")
            else:
                try:
                    result = create_technician_account(
                        email=s_email,
                        password=s_password,
                        full_name=s_full_name,
                        username=s_username,
                        phone=s_phone or None,
                    )
                    st.success(
                        f"Created **{result['username']}** — share username & password with them.")
                    st.rerun()
                except Exception as e:
                    st.error(str(e))


# ============================================================================
# SIDEBAR (Profile · Navigation · Context controls · Sign-out at bottom)
# ============================================================================

with st.sidebar:
    # ── Brand ─────────────────────────────────────────────────────────────
    st.markdown("""
    <div class="sidebar-brand">
        <div class="sidebar-brand-icon"><i class="bi bi-radar"></i></div>
        <div>
            <div class="sidebar-brand-title">Spatiotemporal</div>
            <div class="sidebar-brand-sub">Anomaly Detection</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ── Profile card ──────────────────────────────────────────────────────
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

    # ── Navigation (plain buttons, no third-party component) ─────────────────
    pages = [
        ("broadcast", "Zones Process"),
        ("ticket-detailed", "Maintenance Tickets"),
    ]
    for icon, label in pages:
        active = st.session_state.current_page == label
        css_class = "nav-btn-active" if active else "nav-btn"
        st.markdown(f'<div class="{css_class}">', unsafe_allow_html=True)
        if st.button(f"  {label}", key=f"nav_{label}", use_container_width=True):
            st.session_state.current_page = label
            st.rerun()
        st.markdown('</div>', unsafe_allow_html=True)

    current_page = st.session_state.current_page

    st.markdown("---")

    # ── Context controls (only what's relevant to the active page) ────────
    if current_page == "Zones Process":
        st.markdown(
            '<div class="nav-label">Zone C — Anomaly Detection</div>', unsafe_allow_html=True)
        contamination = st.slider(
            "Contamination",
            min_value=0.01, max_value=0.5, value=0.05, step=0.01,
            help="Expected proportion of anomalies in the data"
        )

        with st.expander("Pipeline Overview", expanded=False):
            st.markdown("""
            **Zone A** — Downmapping & interpolation (single-day gaps)
            **Zone B** — Haversine neighbor grouping
            **Zone C** — LOF anomaly detection (RobustScaler)
            """)
    else:
        # Keep contamination defined so the main branch can still read it
        contamination = st.session_state.get('last_contamination') or 0.05
        st.markdown(
            "<div style='color:#64748b;font-size:0.82rem;line-height:1.55;'>"
            "Manage maintenance tickets, review field inspection reports, "
            "and administer technician accounts here."
            "</div>",
            unsafe_allow_html=True
        )

    # ── Flex spacer pushes the sign-out below to the bottom ──────────────
    st.markdown('<div class="sidebar-flex-spacer"></div>',
                unsafe_allow_html=True)

    # ── Sign-out marker (paired with the actual button via :has() CSS) ────
    st.markdown('<div class="sidebar-signout-marker"></div>',
                unsafe_allow_html=True)

    # ── Sign out (must be the LAST sidebar widget) ────────────────────────
    if st.button("⏻  Sign out", key="sidebar_logout", use_container_width=True):
        for key in ['authenticated', 'analyst_id', 'analyst_name']:
            st.session_state[key] = None if key != 'authenticated' else False
        st.rerun()


# ============================================================================
# MAIN CONTENT — branches on the selected page
# ============================================================================

if current_page == "Zones Process":
    # ────────────────────────────────────────────────────────────────────────
    #  ZONES PROCESS PAGE
    # ────────────────────────────────────────────────────────────────────────
    st.markdown("""
    <div class="hero-banner">
        <i class="bi bi-broadcast hero-icon"></i>
        <p class="hero-title">Zones Process · Anomaly Detection</p>
        <p class="hero-sub">Upload an AWS station CSV to run it through Zone&nbsp;A → B → C and create maintenance tickets from any anomalies detected.</p>
    </div>
    """, unsafe_allow_html=True)

    # Upload section
    st.markdown('<p class="section-title">Upload Station Data</p>',
                unsafe_allow_html=True)
    st.markdown("""
    <div class="upload-hint">
        <i class="bi bi-file-earmark-spreadsheet" style="color:#38bdf8;margin-right:6px;"></i>
        Upload a <code>.csv</code> file with columns:
        <code>station_id</code>, <code>date</code>, <code>latitude</code>, <code>longitude</code>, <code>rainfall</code> (or <code>rainfall_mm</code>).<br>
        Hourly data is auto-detected and aggregated to daily totals.
    </div>
    """, unsafe_allow_html=True)

    uploaded_file = st.file_uploader(
        "Choose CSV file",
        type=['csv'],
        label_visibility="collapsed"
    )

    # Load data (only reset when a NEW file is uploaded)
    if uploaded_file is not None:
        if st.session_state.current_file_name != uploaded_file.name:
            st.session_state.raw_data = pd.read_csv(uploaded_file)
            st.session_state.raw_data['date'] = pd.to_datetime(
                st.session_state.raw_data['date'])
            st.session_state.current_file_name = uploaded_file.name
            st.session_state.processed = False
            st.session_state.processed_file_name = None
        st.session_state.file_was_loaded = True
    elif st.session_state.file_was_loaded:
        st.session_state.raw_data = None
        st.session_state.current_file_name = None
        st.session_state.processed = False
        st.session_state.processed_file_name = None
        st.session_state.file_was_loaded = False

    # Display and process data
    if st.session_state.raw_data is not None:
        raw_data = st.session_state.raw_data
        rain_col = 'rainfall' if 'rainfall' in raw_data.columns else 'rainfall_mm'

        col1, col2, col3 = st.columns([1, 1, 1])
        with col2:
            already_run = (
                st.session_state.processed_file_name is not None
                and st.session_state.processed_file_name == st.session_state.current_file_name
            )
            btn_label = "Analysis Complete" if already_run else "Analyze Station Data"
            run_pipeline = st.button(
                btn_label, type="primary", use_container_width=True,
                disabled=already_run
            )

        if run_pipeline:
            start_time = time.time()
            with st.spinner("Processing data through Zone A -> Zone B -> Zone C..."):
                cleaned_data = zone_a_linear_interpolation(raw_data)
                neighbors = zone_b_haversine_grouping(cleaned_data)
                flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
                    cleaned_data, neighbors=neighbors,
                    contamination=contamination, n_neighbors=3
                )
                st.session_state.cleaned_data = cleaned_data
                st.session_state.neighbors = neighbors
                st.session_state.flagged_data = flagged_data
                st.session_state.anomaly_summary = anomaly_summary
                st.session_state.processed = True
                st.session_state.processed_file_name = st.session_state.current_file_name
                st.session_state.processing_time = time.time() - start_time
                st.session_state.last_contamination = contamination
            st.rerun()

        # Re-run if contamination slider changed
        if (st.session_state.processed
            and st.session_state.processed_file_name == st.session_state.current_file_name
                and st.session_state.last_contamination != contamination):

            with st.spinner("Updating results with new parameters..."):
                cleaned_data = st.session_state.cleaned_data
                neighbors = zone_b_haversine_grouping(cleaned_data)
                flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
                    cleaned_data, neighbors=neighbors,
                    contamination=contamination, n_neighbors=3
                )
                st.session_state.neighbors = neighbors
                st.session_state.flagged_data = flagged_data
                st.session_state.anomaly_summary = anomaly_summary
                st.session_state.last_contamination = contamination
            st.rerun()

        # Show results
        if st.session_state.processed:
            elapsed = st.session_state.get('processing_time', 0)
            st.success(f"Pipeline completed — processed in {elapsed:.2f}s")
            cleaned_data = st.session_state.cleaned_data
            neighbors = st.session_state.neighbors
            flagged_data = st.session_state.flagged_data
            anomaly_summary = st.session_state.anomaly_summary

            display_data = prepare_display_data()
            rain_col = display_data['rain_col']
            stations = flagged_data[['station_id',
                                     'latitude', 'longitude']].drop_duplicates()

            # ── 6 sub-tabs — note: last one is now "Create Ticket" ────────
            tab0, tab1, tab2, tab3, tab4, tab5 = st.tabs([
                "Overview & Map", "Raw Data", "Cleaned Data",
                "Neighbor Groups", "Anomaly Report", "Create Ticket"
            ])

            # ── Tab 0: Overview ───────────────────────────────────────────
            with tab0:
                total_anomalies = int(flagged_data['is_anomaly'].sum())
                anomaly_pct = round(
                    100 * total_anomalies / len(flagged_data), 1)
                anom_cls = 'danger' if total_anomalies > 0 else 'ok'
                missing = raw_data[rain_col].isna().sum()
                missing_cls = 'danger' if missing > 0 else 'ok'

                st.markdown("""
                <div class="export-banner">
                    <div class="export-banner-text">
                        <i class="bi bi-download export-icon"></i>
                        <div>
                            <span class="export-banner-title">Export Pipeline Results</span>
                            <span class="export-banner-sub">Download the processed datasets generated by the QC pipeline.</span>
                        </div>
                    </div>
                </div>
                """, unsafe_allow_html=True)

                dl_col1, dl_col2 = st.columns(2)
                with dl_col1:
                    st.download_button(
                        label="Download Cleaned Data",
                        data=convert_df_to_csv(cleaned_data),
                        file_name="cleaned_data.csv",
                        mime="text/csv",
                        use_container_width=True,
                        type="primary"
                    )
                with dl_col2:
                    st.download_button(
                        label="Download Flagged Data",
                        data=convert_df_to_csv(flagged_data),
                        file_name="flagged_data.csv",
                        mime="text/csv",
                        use_container_width=True
                    )

                st.markdown("<hr style='margin:1.4rem 0;'>",
                            unsafe_allow_html=True)

                st.markdown("""
                <div class="stats-grid">
                    <div class="stats-panel">
                        <div class="stats-panel-title">
                            <i class="bi bi-upload"></i> Input Data
                        </div>
                        <div class="stats-row">
                            <div class="stat-card">
                                <div class="stat-label">Total Rows</div>
                                <div class="stat-value">{total_rows}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Stations</div>
                                <div class="stat-value">{stations_in}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Missing</div>
                                <div class="stat-value {missing_cls}">{missing}</div>
                            </div>
                        </div>
                    </div>
                    <div class="stats-panel">
                        <div class="stats-panel-title">
                            <i class="bi bi-check2-circle"></i> Pipeline Output
                        </div>
                        <div class="stats-row">
                            <div class="stat-card">
                                <div class="stat-label">Records</div>
                                <div class="stat-value">{records_out}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Neighbor Groups</div>
                                <div class="stat-value">{n_groups}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Anomalies</div>
                                <div class="stat-value {anom_cls}">{total_anomalies}</div>
                            </div>
                            <div class="stat-card">
                                <div class="stat-label">Rate</div>
                                <div class="stat-value {anom_cls}">{anomaly_pct}%</div>
                            </div>
                        </div>
                    </div>
                </div>
                """.format(
                    total_rows=f"{len(raw_data):,}",
                    stations_in=raw_data["station_id"].nunique(),
                    missing=missing,
                    missing_cls=missing_cls,
                    records_out=f"{len(flagged_data):,}",
                    n_groups=len(neighbors),
                    total_anomalies=total_anomalies,
                    anom_cls=anom_cls,
                    anomaly_pct=anomaly_pct
                ), unsafe_allow_html=True)

                st.markdown("""
                <div class="section-label" style="margin-bottom:0.6rem;">
                    <i class="bi bi-map" style="margin-right:5px;"></i>Station Distribution
                </div>
                """, unsafe_allow_html=True)
                if len(stations) > 0:
                    st_folium(create_station_map(stations), width=None,
                              height=460, returned_objects=[])
                else:
                    st.warning("No station coordinate data available.")

            # ── Tab 1: Raw Data ──────────────────────────────────────────
            with tab1:
                st.markdown("#### Raw Data Preview")
                page_size = 10
                total_pages = max(
                    1, (len(raw_data) + page_size - 1) // page_size)

                col1, col2 = st.columns([1, 4])
                with col1:
                    raw_page = st.selectbox("Page", options=range(
                        1, total_pages + 1), key="raw_page")
                with col2:
                    st.markdown(
                        f"<br>*Showing rows {(raw_page-1)*page_size + 1} - "
                        f"{min(raw_page*page_size, len(raw_data))} of {len(raw_data)}*",
                        unsafe_allow_html=True
                    )

                st.dataframe(
                    paginate_dataframe(
                        display_data['raw_data'], page_size, raw_page),
                    hide_index=True, use_container_width=True
                )
                st.markdown("#### Missing Value Statistics")
                st.metric("Missing Rainfall", raw_data[rain_col].isna().sum())

            # ── Tab 2: Cleaned Data ──────────────────────────────────────
            with tab2:
                st.markdown("#### Cleaned Data Preview")
                page_size = 10
                total_pages_cleaned = max(
                    1, (len(cleaned_data) + page_size - 1) // page_size)

                col1, col2 = st.columns([1, 4])
                with col1:
                    cleaned_page = st.selectbox("Page", options=range(
                        1, total_pages_cleaned + 1), key="cleaned_page")
                with col2:
                    st.markdown(
                        f"<br>*Showing rows {(cleaned_page-1)*page_size + 1} - "
                        f"{min(cleaned_page*page_size, len(cleaned_data))} of {len(cleaned_data)}*",
                        unsafe_allow_html=True
                    )

                st.dataframe(
                    paginate_dataframe(
                        display_data['cleaned_data'], page_size, cleaned_page),
                    hide_index=True, use_container_width=True
                )
                st.markdown("#### After Zone A Processing")
                st.metric("Missing Rainfall",
                          cleaned_data[rain_col].isna().sum())

            # ── Tab 3: Neighbor Groups ───────────────────────────────────
            with tab3:
                st.markdown("#### Station Neighbor Groups")
                st.markdown("*3 nearest stations by Haversine distance*")

                for station_id in sorted(neighbors.keys()):
                    neighbor_list = neighbors[station_id]
                    with st.expander(f"{station_id} ({len(neighbor_list)} neighbors)"):
                        if neighbor_list:
                            for n in neighbor_list:
                                st.markdown(
                                    f"- **{n['neighbor_id']}** - {n['distance_km']} km")

                            st.markdown("##### Neighbor Visualization")
                            neighbor_ids = [n['neighbor_id']
                                            for n in neighbor_list]
                            map_data = stations[stations['station_id'].isin(
                                [station_id] + neighbor_ids)].copy()

                            if len(map_data) > 0:
                                center_lat = map_data['latitude'].mean()
                                center_lon = map_data['longitude'].mean()
                                n_lat_pad = max(
                                    (map_data['latitude'].max() - map_data['latitude'].min()) * 0.5, 0.02)
                                n_lon_pad = max(
                                    (map_data['longitude'].max() - map_data['longitude'].min()) * 0.5, 0.02)
                                n_bounds = [
                                    [map_data['latitude'].min() - n_lat_pad,
                                     map_data['longitude'].min() - n_lon_pad],
                                    [map_data['latitude'].max() + n_lat_pad,
                                     map_data['longitude'].max() + n_lon_pad]
                                ]
                                neighbor_map = folium.Map(
                                    location=[center_lat, center_lon],
                                    zoom_start=12,
                                    tiles='CartoDB dark_matter',
                                    min_zoom=9, max_zoom=16
                                )
                                neighbor_map.fit_bounds(n_bounds, max_zoom=14)

                                current_station_row = map_data[map_data['station_id']
                                                               == station_id]
                                if len(current_station_row) > 0:
                                    for idx, row in current_station_row.iterrows():
                                        folium.CircleMarker(
                                            location=[row['latitude'],
                                                      row['longitude']],
                                            radius=10,
                                            popup=folium.Popup(
                                                f"<b>{row['station_id']}</b><br><i>Current Station</i>",
                                                max_width=300),
                                            tooltip=f"{row['station_id']} (Current)",
                                            color='#0066FF', fill=True, fillColor='#0066FF',
                                            fillOpacity=0.8, weight=3
                                        ).add_to(neighbor_map)

                                neighbor_stations_rows = map_data[map_data['station_id'].isin(
                                    neighbor_ids)]
                                for idx, row in neighbor_stations_rows.iterrows():
                                    folium.CircleMarker(
                                        location=[row['latitude'],
                                                  row['longitude']],
                                        radius=7,
                                        popup=folium.Popup(
                                            f"<b>{row['station_id']}</b><br><i>Neighbor</i>",
                                            max_width=300),
                                        tooltip=f"{row['station_id']} (Neighbor)",
                                        color='#FF4444', fill=True, fillColor='#FF4444',
                                        fillOpacity=0.7, weight=2
                                    ).add_to(neighbor_map)

                                st_folium(neighbor_map, width=1300, height=400)
                        else:
                            st.info("No neighbors within threshold distance")

            # ── Tab 4: Anomaly Report ────────────────────────────────────
            with tab4:
                stations_with_anomalies = list(
                    anomaly_summary.keys()) if anomaly_summary else []
                total_anomaly_count = sum(
                    len(v) for v in anomaly_summary.values()) if anomaly_summary else 0

                if not anomaly_summary:
                    st.info("No anomalies detected with current parameters.")
                else:
                    col_a, col_b, col_c = st.columns(3)
                    with col_a:
                        st.metric("Anomalous Readings", total_anomaly_count)
                    with col_b:
                        st.metric("Affected Stations", len(
                            stations_with_anomalies))
                    with col_c:
                        clean_stations = len(neighbors) - \
                            len(stations_with_anomalies)
                        st.metric("Clean Stations", clean_stations)

                    st.markdown("---")

                    for station_id in sorted(anomaly_summary.keys()):
                        anomalies = anomaly_summary[station_id]
                        anomaly_df = pd.DataFrame(anomalies)
                        anomaly_df['date'] = pd.to_datetime(anomaly_df['date'])

                        station_data = flagged_data[flagged_data['station_id'] == station_id].copy(
                        )
                        anomaly_dates = anomaly_df['date'].tolist()
                        anomaly_points = station_data[station_data['is_anomaly'] == True]
                        station_avg = station_data[rain_col].mean()

                        with st.expander(
                            f"{station_id} — {len(anomalies)} anomalous reading"
                            f"{'s' if len(anomalies) != 1 else ''}",
                            expanded=False
                        ):
                            c1, c2, c3 = st.columns(3)
                            with c1:
                                st.metric("Station Average",
                                          f"{station_avg:.1f} mm")
                            with c2:
                                if len(anomaly_points) > 0:
                                    anom_avg = anomaly_points[rain_col].mean()
                                    delta = anom_avg - station_avg
                                    st.metric(
                                        "Anomaly Avg",
                                        f"{anom_avg:.1f} mm",
                                        delta=f"{delta:+.1f} mm vs station avg",
                                        delta_color="inverse"
                                    )
                            with c3:
                                if len(anomaly_points) > 0:
                                    st.metric(
                                        "Anomalous Dates",
                                        f"{len(anomaly_dates)} date"
                                        f"{'s' if len(anomaly_dates) != 1 else ''}"
                                    )

                            fig = create_station_chart(
                                station_data, anomaly_dates, rain_col)
                            st.plotly_chart(fig, use_container_width=True)

                            st.markdown("**Flagged Records**")
                            display_df = anomaly_df[['date', rain_col]].copy()
                            display_df['date'] = display_df['date'].dt.strftime(
                                "%Y-%m-%d")
                            display_df.columns = ['Date', 'Rainfall (mm)']

                            page_size = 10
                            total_pages_anom = max(
                                1, (len(display_df) + page_size - 1) // page_size)

                            if total_pages_anom > 1:
                                col_p1, col_p2 = st.columns([1, 4])
                                with col_p1:
                                    anom_page = st.selectbox(
                                        "Page",
                                        options=range(1, total_pages_anom + 1),
                                        key=f"anom_page_{station_id}"
                                    )
                                with col_p2:
                                    st.markdown(
                                        f"<br>*Showing rows {(anom_page-1)*page_size + 1} - "
                                        f"{min(anom_page*page_size, len(display_df))} of {len(display_df)}*",
                                        unsafe_allow_html=True
                                    )
                            else:
                                anom_page = 1

                            st.dataframe(
                                paginate_dataframe(
                                    display_df, page_size, anom_page),
                                hide_index=True, use_container_width=True
                            )

            # ── Tab 5: Create Ticket (replaces old "Maintenance Tickets") ─
            with tab5:
                st.markdown("#### Create Maintenance Ticket")
                st.markdown(
                    "<p style='color:#94a3b8;font-size:0.88rem;margin-top:-0.5rem;'>"
                    "Dispatch a field technician to investigate anomalies found in this dataset. "
                    "Tickets and inspection reports are managed in the "
                    "<strong style='color:#38bdf8;'>Maintenance Tickets</strong> page."
                    "</p>",
                    unsafe_allow_html=True
                )
                _render_create_ticket(
                    analyst_id=st.session_state.analyst_id,
                    anomaly_summary=anomaly_summary if st.session_state.processed else None,
                )

    else:
        # No data loaded — empty state
        st.markdown("""
        <div class="empty-state">
            <i class="bi bi-folder2-open empty-state-icon"></i>
            <div class="empty-state-title">No data loaded</div>
            <div class="empty-state-sub">Upload a CSV file above to begin Zone A → B → C analysis.</div>
        </div>
        """, unsafe_allow_html=True)
        st.markdown("<br>", unsafe_allow_html=True)
        with st.expander("Expected CSV Format"):
            st.code(
                "station_id,date,latitude,longitude,rainfall\n"
                "QC_AWS_001,2025-01-01,14.651,121.0495,15.4\n"
                "QC_AWS_001,2025-01-02,14.651,121.0495,0.0"
            )


else:
    # ────────────────────────────────────────────────────────────────────────
    #  MAINTENANCE TICKETS PAGE
    # ────────────────────────────────────────────────────────────────────────
    st.markdown("""
    <div class="page-header">
        <div class="page-header-icon"><i class="bi bi-ticket-detailed"></i></div>
        <div class="page-header-text">
            <p class="page-header-title">Maintenance Tickets</p>
            <p class="page-header-sub">Track dispatched tickets, review field reports, and manage technician accounts.</p>
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
