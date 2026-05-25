import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium
import time

from zone.zone_a import zone_a_linear_interpolation
from zone.zone_b import zone_b_haversine_grouping
from zone.zone_c import zone_c_lof_anomaly_detection
from utils.supabase_client import fetch_technicians, create_ticket, upload_ticket_attachment
from utils.map_helpers import create_station_map
from utils.data_helpers import paginate_dataframe, prepare_display_data


def convert_df_to_csv(df):
    return df.to_csv(index=False).encode('utf-8')


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
        csv_attachment = st.file_uploader(
            "Attach anomaly data CSV (optional, max 5 MB)",
            type=['csv'],
            key="ticket_csv_attachment",
            help="Attach the sensor/anomaly CSV so the technician can review the raw data.",
        )

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
        if csv_attachment and csv_attachment.size > 5 * 1024 * 1024:
            errors.append("Attached CSV exceeds the 5 MB limit.")

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
                ticket_id = result.get('id', '')
                if csv_attachment and ticket_id:
                    try:
                        upload_ticket_attachment(
                            ticket_id=ticket_id,
                            uploaded_by=analyst_id,
                            file_bytes=csv_attachment.read(),
                            filename=csv_attachment.name,
                        )
                    except Exception as attach_err:
                        st.warning(f"Ticket created but CSV upload failed: {attach_err}")
                st.success(f"Ticket created — ID: `{ticket_id[:8].upper()}`")
            except Exception as e:
                st.error(f"Failed to create ticket: {e}")


def render(contamination: float):
    st.markdown("""
    <div class="hero-banner">
        <i class="bi bi-broadcast hero-icon"></i>
        <p class="hero-title">Zones Process · Anomaly Detection</p>
        <p class="hero-sub">Upload an AWS station CSV to run it through Zone&nbsp;A → B → C and create maintenance tickets from any anomalies detected.</p>
    </div>
    """, unsafe_allow_html=True)

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
        label_visibility="collapsed",
        key="csv_uploader"
    )

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

            tab0, tab1, tab2, tab3, tab4, tab5 = st.tabs([
                "Overview & Map", "Raw Data", "Cleaned Data",
                "Neighbor Groups", "Anomaly Report", "Create Ticket"
            ])

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
                    st_folium(create_station_map(stations), use_container_width=True,
                              height=460, returned_objects=[])
                else:
                    st.warning("No station coordinate data available.")

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

                                st_folium(neighbor_map, use_container_width=True, height=400)
                        else:
                            st.info("No neighbors within threshold distance")

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
