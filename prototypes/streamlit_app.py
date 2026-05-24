import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium
import time

from zone.zone_a import zone_a_linear_interpolation
from zone.zone_b import zone_b_haversine_grouping
from zone.zone_c import zone_c_lof_anomaly_detection


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
# CUSTOM CSS FOR CLEAN STYLING
# ============================================================================

st.markdown("""
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] { font-family: 'Inter', sans-serif; }

    /* ---- Page background ---- */
    .stApp { background-color: #0f172a; }

    /* ---- Sidebar ---- */
    [data-testid="stSidebar"] {
        background: linear-gradient(180deg, #0d1526 0%, #0a0f1e 100%);
        border-right: 1px solid rgba(56,189,248,0.12);
    }
    [data-testid="stSidebar"] .stMarkdown p,
    [data-testid="stSidebar"] label { color: #94a3b8 !important; }
    [data-testid="stSidebar"] h1,
    [data-testid="stSidebar"] h2,
    [data-testid="stSidebar"] h3 { color: #e2e8f0 !important; }

    /* ---- Hero banner ---- */
    .hero-banner {
        background: linear-gradient(135deg, #0b1929 0%, #0f2744 60%, #0d1f35 100%);
        border: 1px solid rgba(56,189,248,0.18);
        border-radius: 16px;
        padding: 2rem 2.5rem;
        margin-bottom: 1.5rem;
    }
    .hero-icon { font-size: 2rem; color: #38bdf8; margin-bottom: 0.6rem; display: block; }
    .hero-title {
        font-size: 1.75rem; font-weight: 700;
        color: #f1f5f9; margin: 0 0 0.3rem 0; letter-spacing: -0.4px;
    }
    .hero-sub {
        font-size: 0.9rem; color: #64748b; margin: 0;
    }

    /* ---- Stat cards ---- */
    .stat-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 1rem 1.2rem;
        text-align: center;
    }
    .stat-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #f1f5f9; line-height: 1; }
    .stat-value.danger { color: #ef4444; }
    .stat-value.warn   { color: #f59e0b; }
    .stat-value.ok     { color: #10b981; }

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
        background: rgba(255,255,255,0.03);
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
    .export-banner-text {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .export-banner-title {
        font-size: 0.9rem;
        font-weight: 600;
        color: #e2e8f0;
        display: block;
    }
    .export-banner-sub {
        font-size: 0.75rem;
        color: #64748b;
        display: block;
    }
    .export-icon {
        font-size: 1.3rem;
        color: #38bdf8;
    }

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
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        color: #38bdf8;
        margin-bottom: 0.8rem;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .stats-row {
        display: flex;
        gap: 0.8rem;
        flex-wrap: wrap;
    }
    .stat-card {
        flex: 1;
        min-width: 80px;
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

    /* ---- Ticket placeholder ---- */
    .ticket-placeholder {
        background: rgba(99,102,241,0.08);
        border: 1px dashed rgba(99,102,241,0.35);
        border-radius: 14px;
        padding: 3rem 2rem;
        text-align: center;
        margin-top: 1rem;
    }
    .ticket-placeholder h3 { color: #a5b4fc; font-size: 1.2rem; margin-bottom: 0.5rem; }
    .ticket-placeholder p  { color: #64748b; font-size: 0.9rem; margin: 0; }
    .coming-soon-badge {
        display: inline-block;
        background: rgba(99,102,241,0.2);
        color: #a5b4fc;
        font-size: 0.7rem; font-weight: 700;
        padding: 3px 12px; border-radius: 20px;
        text-transform: uppercase; letter-spacing: 1px;
        margin-bottom: 1rem;
    }

    /* ---- Call-to-Action Button (active) ---- */
    .cta-button-wrapper {
        display: flex;
        justify-content: center;
        margin: 1.5rem 0;
    }
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

    /* ---- Analyze button — completed / disabled state ---- */
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
# SESSION STATE INITIALIZATION (MUST RUN BEFORE SIDEBAR)
# ============================================================================

if 'raw_data' not in st.session_state:
    st.session_state.raw_data = None
if 'processed' not in st.session_state:
    st.session_state.processed = False
if 'current_file_name' not in st.session_state:
    st.session_state.current_file_name = None
if 'processed_file_name' not in st.session_state:
    st.session_state.processed_file_name = None
# Tracks whether a file was ever successfully loaded this session
# (used to distinguish "never uploaded" from "file removed")
if 'file_was_loaded' not in st.session_state:
    st.session_state.file_was_loaded = False
# Track slider parameters to detect when they change
if 'last_contamination' not in st.session_state:
    st.session_state.last_contamination = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def convert_df_to_csv(df):
    """Convert DataFrame to CSV bytes for download."""
    return df.to_csv(index=False).encode('utf-8')


def create_station_map(stations_df):
    """Create a Folium map fitted to station bounds with zoom constraints."""
    if len(stations_df) == 0:
        return None

    valid_coords = stations_df[
        stations_df['latitude'].notna() & stations_df['longitude'].notna()
    ].copy()

    if len(valid_coords) == 0:
        return None

    center_lat = valid_coords['latitude'].mean()
    center_lon = valid_coords['longitude'].mean()

    # Compute padded bounds so all stations are clearly visible
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
        min_zoom=10,
        max_zoom=16
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
            color='#38bdf8',
            fill=True,
            fillColor='#38bdf8',
            fillOpacity=0.75,
            weight=2
        ).add_to(map_obj)

    return map_obj


def create_station_chart(station_data, anomaly_dates, rain_col):
    """Create a bar chart where anomaly bars are coloured red directly."""
    colors = [
        '#FF4444' if d in anomaly_dates else '#4ECDC4'
        for d in station_data['date']
    ]

    fig = go.Figure()
    fig.add_trace(go.Bar(
        x=station_data['date'],
        y=station_data[rain_col],
        marker_color=colors,
        showlegend=False,
        hovertemplate='%{x|%b %d, %Y}<br>Rainfall: %{y:.1f} mm<extra></extra>'
    ))

    # Invisible legend proxies
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
    """Return a slice of the dataframe for the given page."""
    start_idx = (page_num - 1) * page_size
    end_idx = start_idx + page_size
    return df.iloc[start_idx:end_idx]


def prepare_display_data():
    """Prepare display data by identifying the active rainfall column.

    NOTE: This function intentionally does NOT use @st.cache_data because it
    reads from st.session_state. Caching would cause stale results after the
    pipeline re-runs with new slider parameters.
    """
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
# SIDEBAR
# ============================================================================

with st.sidebar:
    st.markdown("""
    <div style="padding:1rem 0 0.5rem 0;display:flex;align-items:center;gap:10px;">
        <i class="bi bi-radar" style="font-size:1.5rem;color:#38bdf8;"></i>
        <div>
            <div style="font-size:1rem;font-weight:700;color:#e2e8f0;line-height:1.2;">Spatiotemporal</div>
            <div style="font-size:0.7rem;color:#475569;letter-spacing:0.3px;">Anomaly Detection</div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown("---")

    st.markdown('<p class="section-label" style="margin-top:1rem;">Zone C - Anomaly Detection</p>',
                unsafe_allow_html=True)
    contamination = st.slider(
        "Contamination",
        min_value=0.01, max_value=0.5, value=0.05, step=0.01,
        help="Expected proportion of anomalies in the data"
    )

    st.markdown("---")
    with st.expander("Pipeline Overview", expanded=False):
        st.markdown("""
        **Zone A** - Downmapping & interpolation (single-day gaps)  
        **Zone B** - Haversine neighbor grouping  
        **Zone C** - LOF anomaly detection (RobustScaler)
        """)


# ============================================================================
# MAIN CONTENT
# ============================================================================

st.markdown("""
<div class="hero-banner">
    <i class="bi bi-broadcast hero-icon"></i>
    <p class="hero-title">Spatiotemporal Anomaly Detection</p>
    <p class="hero-sub">Uncover hidden rainfall anomalies in your AWS station network &mdash; upload a CSV to begin.</p>
</div>
""", unsafe_allow_html=True)

# Data loading section
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

# Load data (only reset when NEW file is uploaded)
# NOTE: uploaded_file is None on every re-run until the user picks a file.
# We must NOT wipe state just because uploaded_file is momentarily None;
# only reset when the user actively removes a previously loaded file.
if uploaded_file is not None:
    if st.session_state.current_file_name != uploaded_file.name:
        # New file uploaded — parse and reset pipeline results
        st.session_state.raw_data = pd.read_csv(uploaded_file)
        st.session_state.raw_data['date'] = pd.to_datetime(
            st.session_state.raw_data['date'])
        st.session_state.current_file_name = uploaded_file.name
        st.session_state.processed = False
        st.session_state.processed_file_name = None
    st.session_state.file_was_loaded = True
elif st.session_state.file_was_loaded:
    # A file was previously loaded but the widget is now empty — user removed it
    st.session_state.raw_data = None
    st.session_state.current_file_name = None
    st.session_state.processed = False
    st.session_state.processed_file_name = None
    st.session_state.file_was_loaded = False

# Display and process data
if st.session_state.raw_data is not None:
    raw_data = st.session_state.raw_data
    rain_col = 'rainfall' if 'rainfall' in raw_data.columns else 'rainfall_mm'

    # Run pipeline button (centered with call-to-action styling)
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        # Button is grayed out once this specific file has been analysed;
        # resets automatically when a new file is attached.
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
            # Zone A: Downmapping & Linear Interpolation
            cleaned_data = zone_a_linear_interpolation(raw_data)

            # Zone B: K-Nearest Neighbors (K=3)
            neighbors = zone_b_haversine_grouping(cleaned_data)

            # Zone C: LOF Anomaly Detection (n_neighbors=3, spatial-context mode)
            flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
                cleaned_data,
                neighbors=neighbors,
                contamination=contamination,
                n_neighbors=3
            )

            # Store results in session state
            st.session_state.cleaned_data = cleaned_data
            st.session_state.neighbors = neighbors
            st.session_state.flagged_data = flagged_data
            st.session_state.anomaly_summary = anomaly_summary
            st.session_state.processed = True
            st.session_state.processed_file_name = st.session_state.current_file_name
            st.session_state.processing_time = time.time() - start_time
            # Store current slider value
            st.session_state.last_contamination = contamination

        # Immediately re-render so the button updates to "Analysis Complete"
        # and results tabs appear without waiting for the next user interaction.
        st.rerun()

    # Auto-rerun pipeline if contamination slider has changed and data has been processed
    if (st.session_state.processed
        and st.session_state.processed_file_name == st.session_state.current_file_name
            and st.session_state.last_contamination != contamination):

        with st.spinner("Updating results with new parameters..."):
            cleaned_data = st.session_state.cleaned_data

            # Zone B: K-Nearest Neighbors (K=3)
            neighbors = zone_b_haversine_grouping(cleaned_data)

            # Zone C: LOF Anomaly Detection (n_neighbors=3, spatial-context mode)
            flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
                cleaned_data,
                neighbors=neighbors,
                contamination=contamination,
                n_neighbors=3
            )

            # Update session state
            st.session_state.neighbors = neighbors
            st.session_state.flagged_data = flagged_data
            st.session_state.anomaly_summary = anomaly_summary
            st.session_state.last_contamination = contamination

        st.rerun()

    # Show results if processed
    if st.session_state.processed:
        elapsed = st.session_state.get('processing_time', 0)
        st.success(f"Pipeline completed — processed in {elapsed:.2f}s")
        cleaned_data = st.session_state.cleaned_data
        neighbors = st.session_state.neighbors
        flagged_data = st.session_state.flagged_data
        anomaly_summary = st.session_state.anomaly_summary

        # Prepare display data
        display_data = prepare_display_data()
        rain_col = display_data['rain_col']

        stations = flagged_data[['station_id',
                                 'latitude', 'longitude']].drop_duplicates()

        # ── Tabs appear immediately below ──────────────────────────────────────
        tab0, tab1, tab2, tab3, tab4, tab5 = st.tabs([
            "Overview & Map", "Raw Data", "Cleaned Data",
            "Neighbor Groups", "Anomaly Report", "Maintenance Tickets"
        ])

        with tab0:
            # ── Export Banner (top, always visible) ───────────────────────────
            total_anomalies = int(flagged_data['is_anomaly'].sum())
            anomaly_pct = round(100 * total_anomalies / len(flagged_data), 1)
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

            # ── Stats: Before vs After ─────────────────────────────────────────
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

            # ── Station Map ────────────────────────────────────────────────────
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

        # Tab 1: Raw Data
        with tab1:
            st.markdown("#### Raw Data Preview")

            # Pagination
            page_size = 10
            total_pages = max(1, (len(raw_data) + page_size - 1) // page_size)

            col1, col2 = st.columns([1, 4])
            with col1:
                raw_page = st.selectbox("Page", options=range(
                    1, total_pages + 1), key="raw_page")
            with col2:
                st.markdown(
                    f"<br>*Showing rows {(raw_page-1)*page_size + 1} - {min(raw_page*page_size, len(raw_data))} of {len(raw_data)}*", unsafe_allow_html=True)

            st.dataframe(paginate_dataframe(display_data['raw_data'], page_size,
                         raw_page), hide_index=True, use_container_width=True)

            st.markdown("#### Missing Value Statistics")
            st.metric("Missing Rainfall", raw_data[rain_col].isna().sum())

        # Tab 2: Cleaned Data
        with tab2:
            st.markdown("#### Cleaned Data Preview")

            # Pagination
            page_size = 10
            total_pages_cleaned = max(
                1, (len(cleaned_data) + page_size - 1) // page_size)

            col1, col2 = st.columns([1, 4])
            with col1:
                cleaned_page = st.selectbox("Page", options=range(
                    1, total_pages_cleaned + 1), key="cleaned_page")
            with col2:
                st.markdown(
                    f"<br>*Showing rows {(cleaned_page-1)*page_size + 1} - {min(cleaned_page*page_size, len(cleaned_data))} of {len(cleaned_data)}*", unsafe_allow_html=True)

            st.dataframe(paginate_dataframe(display_data['cleaned_data'], page_size,
                         cleaned_page), hide_index=True, use_container_width=True)

            st.markdown("#### After Zone A Processing")
            st.metric("Missing Rainfall", cleaned_data[rain_col].isna().sum())

        # Tab 3: Neighbor Groups
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

                        # Per-group map visualization
                        st.markdown("##### Neighbor Visualization")

                        # Get current station and neighbor coordinates
                        neighbor_ids = [n['neighbor_id']
                                        for n in neighbor_list]
                        map_data = stations[stations['station_id'].isin(
                            [station_id] + neighbor_ids)].copy()

                        if len(map_data) > 0:
                            # Create map
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
                                min_zoom=9,
                                max_zoom=16
                            )
                            neighbor_map.fit_bounds(n_bounds, max_zoom=14)

                            # Add marker for current station (blue)
                            current_station_row = map_data[map_data['station_id']
                                                           == station_id]
                            if len(current_station_row) > 0:
                                for idx, row in current_station_row.iterrows():
                                    folium.CircleMarker(
                                        location=[row['latitude'],
                                                  row['longitude']],
                                        radius=10,
                                        popup=folium.Popup(
                                            f"<b>{row['station_id']}</b><br><i>Current Station</i>", max_width=300),
                                        tooltip=f"{row['station_id']} (Current)",
                                        color='#0066FF',
                                        fill=True,
                                        fillColor='#0066FF',
                                        fillOpacity=0.8,
                                        weight=3
                                    ).add_to(neighbor_map)

                            # Add markers for neighbors (red)
                            neighbor_stations_rows = map_data[map_data['station_id'].isin(
                                neighbor_ids)]
                            for idx, row in neighbor_stations_rows.iterrows():
                                folium.CircleMarker(
                                    location=[row['latitude'],
                                              row['longitude']],
                                    radius=7,
                                    popup=folium.Popup(
                                        f"<b>{row['station_id']}</b><br><i>Neighbor</i>", max_width=300),
                                    tooltip=f"{row['station_id']} (Neighbor)",
                                    color='#FF4444',
                                    fill=True,
                                    fillColor='#FF4444',
                                    fillOpacity=0.7,
                                    weight=2
                                ).add_to(neighbor_map)

                            st_folium(neighbor_map, width=1300, height=400)
                    else:
                        st.info("No neighbors within threshold distance")

        # Tab 4: Anomalies
        with tab4:
            stations_with_anomalies = list(
                anomaly_summary.keys()) if anomaly_summary else []
            total_anomaly_count = sum(
                len(v) for v in anomaly_summary.values()) if anomaly_summary else 0

            # Top summary bar
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
                    normal_data = station_data[station_data['is_anomaly'] == False]
                    anomaly_points = station_data[station_data['is_anomaly'] == True]

                    station_avg = station_data[rain_col].mean()

                    with st.expander(f"{station_id} — {len(anomalies)} anomalous reading{'s' if len(anomalies) != 1 else ''}", expanded=False):

                        # Plain-language stats
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
                                st.metric("Anomalous Dates",
                                          f"{len(anomaly_dates)} date{'s' if len(anomaly_dates) != 1 else ''}")

                        # Timeline — anomaly bars are red, normal bars are teal
                        fig = create_station_chart(
                            station_data, anomaly_dates, rain_col)
                        st.plotly_chart(fig, use_container_width=True)

                        # Simple readable table — no LOF score exposed
                        st.markdown("**Flagged Records**")
                        display_df = anomaly_df[['date', rain_col]].copy()
                        display_df['date'] = display_df['date'].dt.strftime(
                            "%Y-%m-%d")
                        display_df.columns = ['Date', 'Rainfall (mm)']

                        # Pagination for flagged records
                        page_size = 10
                        total_pages_anom = max(
                            1, (len(display_df) + page_size - 1) // page_size)

                        if total_pages_anom > 1:
                            col_p1, col_p2 = st.columns([1, 4])
                            with col_p1:
                                anom_page = st.selectbox("Page", options=range(
                                    1, total_pages_anom + 1), key=f"anom_page_{station_id}")
                            with col_p2:
                                st.markdown(
                                    f"<br>*Showing rows {(anom_page-1)*page_size + 1} - {min(anom_page*page_size, len(display_df))} of {len(display_df)}*", unsafe_allow_html=True)
                        else:
                            anom_page = 1

                        st.dataframe(paginate_dataframe(display_df, page_size, anom_page),
                                     hide_index=True, use_container_width=True)

        # Tab 5: Maintenance Tickets (placeholder)
        with tab5:
            st.markdown("""
            <div class="ticket-placeholder">
                <div class="coming-soon-badge">Coming Soon</div>
                <h3><i class="bi bi-ticket-perforated" style="margin-right:8px;"></i>Maintenance Tickets</h3>
                <p>
                    The data analyst will be able to create maintenance tickets directly from
                    anomaly results and assign them to field technicians.<br><br>
                    Technicians receive and manage their tickets via the mobile app.
                </p>
            </div>
            """, unsafe_allow_html=True)

else:
    # No data loaded — styled empty state
    st.markdown("""
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
                border-radius:14px;padding:3rem 2rem;text-align:center;margin-top:1rem;">
        <i class="bi bi-folder2-open" style="font-size:2.5rem;color:#475569;margin-bottom:1rem;display:block;"></i>
        <div style="font-size:1.1rem;font-weight:600;color:#e2e8f0;margin-bottom:0.5rem;">No data loaded</div>
        <div style="font-size:0.88rem;color:#64748b;">Upload a CSV file above to get started.</div>
    </div>
    """, unsafe_allow_html=True)
    st.markdown("<br>", unsafe_allow_html=True)
    with st.expander("Expected CSV Format"):
        st.code("station_id,date,latitude,longitude,rainfall\nQC_AWS_001,2025-01-01,14.651,121.0495,15.4\nQC_AWS_001,2025-01-02,14.651,121.0495,0.0")


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
