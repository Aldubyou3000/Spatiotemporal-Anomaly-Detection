import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import folium
from streamlit_folium import st_folium
import time

from zone.zone_a import zone_a_linear_interpolation
from zone.zone_b import zone_b_haversine_grouping
from zone.zone_c import zone_c_lof_anomaly_detection
from utils.unit_detector import detect_csv_units
from utils.unit_converter import convert_temperature, format_temperature, format_humidity
from utils.temperature import (
    convert_temp,
    convert_temp_series,
    convert_dataframe_for_display,
    get_temp_label,
    get_temp_symbol,
)


# ============================================================================
# PAGE CONFIGURATION
# ============================================================================

st.set_page_config(
    page_title="AWS Quality Control Pipeline",
    page_icon="🌤️",
    layout="wide",
    initial_sidebar_state="expanded"
)


# ============================================================================
# CUSTOM CSS FOR CLEAN STYLING
# ============================================================================

st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
    }
    .sub-header {
        font-size: 1.1rem;
        color: #888;
        margin-bottom: 2rem;
    }
    .stTabs [data-baseweb="tab-list"] {
        gap: 8px;
    }
    .stTabs [data-baseweb="tab"] {
        padding: 10px 20px;
        border-radius: 8px 8px 0 0;
    }
</style>
""", unsafe_allow_html=True)


# ============================================================================
# SESSION STATE INITIALIZATION (MUST RUN BEFORE SIDEBAR)
# ============================================================================

if 'raw_data' not in st.session_state:
    st.session_state.raw_data = None
if 'detected_units' not in st.session_state:
    st.session_state.detected_units = {'temperature': 'C', 'humidity': '%'}
if 'display_temp_unit' not in st.session_state:
    st.session_state.display_temp_unit = 'Original'
if 'processed' not in st.session_state:
    st.session_state.processed = False
if 'current_file_name' not in st.session_state:
    st.session_state.current_file_name = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def convert_df_to_csv(df):
    """Convert DataFrame to CSV bytes for download."""
    return df.to_csv(index=False).encode('utf-8')


def create_station_map(stations_df):
    """Create a Folium map with station markers.

    Parameters:
    -----------
    stations_df : pd.DataFrame
        DataFrame with 'latitude' and 'longitude' columns

    Returns:
    --------
    folium.Map
        A Folium map object with markers for each station
    """
    if len(stations_df) == 0:
        return None

    # Filter to keep only rows with valid coordinates (no NaN)
    valid_coords = stations_df[
        stations_df['latitude'].notna() & stations_df['longitude'].notna()
    ].copy()

    if len(valid_coords) == 0:
        # If no valid coordinates, return None (no map can be displayed)
        return None

    # Calculate map center using only valid coordinates
    center_lat = valid_coords['latitude'].mean()
    center_lon = valid_coords['longitude'].mean()

    # Create map
    map_obj = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=11,
        tiles="OpenStreetMap"
    )

    # Add markers for each station with valid coordinates
    for idx, row in valid_coords.iterrows():
        station_id = row.get('station_id', f'Station {idx}')
        folium.CircleMarker(
            location=[row['latitude'], row['longitude']],
            radius=8,
            popup=folium.Popup(
                f"<b>Station ID:</b> {station_id}", max_width=300),
            tooltip=station_id,
            color='#0066FF',
            fill=True,
            fillColor='#0066FF',
            fillOpacity=0.7,
            weight=2
        ).add_to(map_obj)

    return map_obj


def create_station_chart(station_data, anomaly_dates, detected_unit='C', display_unit='Original'):
    """Create a line chart with anomaly markers for a station.

    Parameters:
    -----------
    station_data : pd.DataFrame
        DataFrame with temperature, humidity, and date columns
    anomaly_dates : list
        List of dates marked as anomalies
    detected_unit : str
        Original detected unit ('C' or 'F')
    display_unit : str
        Display unit preference ('Original', 'Celsius', 'Fahrenheit')
    """
    fig = go.Figure()

    # Convert temperature and get label using centralized functions
    temp_values = convert_temp_series(
        station_data['temperature'], detected_unit, display_unit)
    temp_label = get_temp_label(display_unit, detected_unit)

    # Temperature line
    fig.add_trace(go.Scatter(
        x=station_data['date'],
        y=temp_values,
        mode='lines',
        name='Temperature',
        line=dict(color='#4ECDC4', width=2)
    ))

    # Humidity line
    fig.add_trace(go.Scatter(
        x=station_data['date'],
        y=station_data['humidity'],
        mode='lines',
        name='Humidity',
        line=dict(color='#45B7D1', width=2),
        yaxis='y2'
    ))

    # Anomaly markers for temperature
    anomaly_data = station_data[station_data['date'].isin(
        anomaly_dates)].copy()
    if len(anomaly_data) > 0:
        anomaly_temp = convert_temp_series(
            anomaly_data['temperature'], detected_unit, display_unit)

        fig.add_trace(go.Scatter(
            x=anomaly_data['date'],
            y=anomaly_temp,
            mode='markers',
            name='Anomaly',
            marker=dict(color='#FF6B6B', size=12, symbol='x'),
            showlegend=True
        ))

    fig.update_layout(
        height=250,
        margin=dict(l=0, r=0, t=30, b=0),
        legend=dict(orientation='h', yanchor='bottom', y=1.02),
        xaxis=dict(title=''),
        yaxis=dict(title=temp_label, side='left', color='#4ECDC4'),
        yaxis2=dict(title='Humidity (%)', side='right',
                    overlaying='y', color='#45B7D1'),
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(0,0,0,0)',
        font=dict(size=11)
    )

    return fig


def paginate_dataframe(df, page_size, page_num):
    """Return a slice of the dataframe for the given page."""
    start_idx = (page_num - 1) * page_size
    end_idx = start_idx + page_size
    return df.iloc[start_idx:end_idx]


@st.cache_data
def prepare_display_data(display_unit):
    """Prepare all display data with temperature conversions applied.

    This function reads from session state once and returns all necessary
    prepared data for display. Single entry point for all converted data.

    Args:
        display_unit: 'Original', 'Celsius', or 'Fahrenheit'

    Returns:
        dict with keys:
        - 'raw_data': converted raw data (if loaded)
        - 'cleaned_data': converted cleaned data (if processed)
        - 'flagged_data': converted flagged data (if processed)
        - 'detected_unit': the detected unit ('C' or 'F')
        - 'display_unit': the display unit
        - 'temp_label': full label like "Temperature (°F)"
        - 'temp_symbol': short symbol like "°F"
    """
    detected_unit = st.session_state.detected_units['temperature']
    raw = st.session_state.raw_data
    cleaned = st.session_state.cleaned_data if st.session_state.processed else None
    flagged = st.session_state.flagged_data if st.session_state.processed else None

    return {
        'raw_data': convert_dataframe_for_display(raw, detected_unit, display_unit) if raw is not None else None,
        'cleaned_data': convert_dataframe_for_display(cleaned, detected_unit, display_unit) if cleaned is not None else None,
        'flagged_data': convert_dataframe_for_display(flagged, detected_unit, display_unit) if flagged is not None else None,
        'detected_unit': detected_unit,
        'display_unit': display_unit,
        'temp_label': get_temp_label(display_unit, detected_unit),
        'temp_symbol': get_temp_symbol(display_unit, detected_unit),
    }


# ============================================================================
# SIDEBAR
# ============================================================================

with st.sidebar:
    st.markdown("### Pipeline Parameters")
    st.markdown("---")

    distance_threshold = st.slider(
        "Distance Threshold (km)",
        min_value=1,
        max_value=50,
        value=5,
        help="Maximum distance to consider stations as neighbors"
    )

    contamination = st.slider(
        "Contamination",
        min_value=0.01,
        max_value=0.5,
        value=0.1,
        step=0.01,
        help="Expected proportion of outliers in the data"
    )

    n_neighbors = st.slider(
        "N Neighbors (LOF)",
        min_value=5,
        max_value=50,
        value=20,
        help="Number of neighbors for LOF algorithm"
    )

    st.markdown("---")
    st.markdown("### Display Format")

    options = ['Original', 'Celsius', 'Fahrenheit']

    st.radio(
        "Show temperature in:",
        options=options,
        key='display_temp_unit',
        help="Choose how to display temperature values"
    )

    st.markdown("---")
    st.markdown("### About")
    st.markdown("""
    This pipeline processes AWS data through three zones:
    - **Zone A**: Linear interpolation
    - **Zone B**: Haversine grouping
    - **Zone C**: LOF anomaly detection
    """)


# ============================================================================
# MAIN CONTENT
# ============================================================================

st.markdown('<p class="main-header">AWS Quality Control Pipeline</p>',
            unsafe_allow_html=True)
st.markdown('<p class="sub-header">Automated Weather Station Data Processing & Anomaly Detection</p>',
            unsafe_allow_html=True)

# Data loading section
st.markdown("### Data Input")

uploaded_file = st.file_uploader(
    "Upload your CSV file",
    type=['csv'],
    help="CSV must contain: station_id, date, latitude (decimal), longitude (decimal), temperature (Celsius or Fahrenheit), humidity (%).\nSystem auto-detects temperature format."
)

# Load data (only reset when NEW file is uploaded)
if uploaded_file is not None:
    if st.session_state.current_file_name != uploaded_file.name:
        st.session_state.raw_data = pd.read_csv(uploaded_file)
        st.session_state.raw_data['date'] = pd.to_datetime(
            st.session_state.raw_data['date'])
        st.session_state.current_file_name = uploaded_file.name
        st.session_state.processed = False

        # Auto-detect temperature format
        detection_result = detect_csv_units(st.session_state.raw_data)

        # Show detection messages
        st.info("\n".join(detection_result['messages']))

        # If temperature detection is ambiguous, show fallback selector
        if detection_result['temperature'] is None:
            st.warning(
                "Temperature format is ambiguous. Please confirm the format:")
            confirmed_unit = st.radio(
                "Temperature is in:",
                options=['Celsius (°C)', 'Fahrenheit (°F)'],
                key="temp_format_confirm"
            )
            st.session_state.detected_units['temperature'] = 'C' if confirmed_unit.startswith(
                'Celsius') else 'F'
        else:
            st.session_state.detected_units['temperature'] = detection_result['temperature']

# Display and process data
if st.session_state.raw_data is not None:
    raw_data = st.session_state.raw_data

    # Data info
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Rows", len(raw_data))
    with col2:
        st.metric("Stations", raw_data['station_id'].nunique())
    with col3:
        missing = raw_data['temperature'].isna().sum() + \
            raw_data['humidity'].isna().sum()
        st.metric("Missing Values", missing)

    st.markdown("---")

    # Run pipeline button
    run_pipeline = st.button(
        "Run Pipeline", type="primary", use_container_width=True)

    if run_pipeline:
        start_time = time.time()

        with st.spinner("Processing data through Zone A -> Zone B -> Zone C..."):
            # Zone A: Linear Interpolation
            cleaned_data = zone_a_linear_interpolation(raw_data)

            # Zone B: Haversine Grouping
            neighbors = zone_b_haversine_grouping(
                cleaned_data, distance_threshold)

            # Zone C: LOF Anomaly Detection
            flagged_data, anomaly_summary = zone_c_lof_anomaly_detection(
                cleaned_data,
                neighbors=neighbors,
                contamination=contamination,
                n_neighbors=n_neighbors
            )

            # Store results in session state
            st.session_state.cleaned_data = cleaned_data
            st.session_state.neighbors = neighbors
            st.session_state.flagged_data = flagged_data
            st.session_state.anomaly_summary = anomaly_summary
            st.session_state.processed = True
            st.session_state.processing_time = time.time() - start_time

        st.success("Pipeline completed successfully!")

        # Display total processing time
        elapsed = st.session_state.processing_time
        st.metric("Total Processing Time", f"{elapsed:.2f}s")

    # Show results if processed
    if st.session_state.processed:
        cleaned_data = st.session_state.cleaned_data
        neighbors = st.session_state.neighbors
        flagged_data = st.session_state.flagged_data
        anomaly_summary = st.session_state.anomaly_summary

        # Prepare all display data once
        display_data = prepare_display_data(st.session_state.display_temp_unit)

        # Summary metrics
        st.markdown("### Results Summary")

        total_anomalies = flagged_data['is_anomaly'].sum()
        anomaly_pct = 100 * total_anomalies / len(flagged_data)

        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Records", len(flagged_data))
        with col2:
            st.metric("Total Stations", len(neighbors))
        with col3:
            st.metric("Anomalies Found", int(total_anomalies))
        with col4:
            st.metric("Anomaly Rate", f"{anomaly_pct:.1f}%")

        # Download buttons
        st.markdown("### Download Results")

        # Option 1: Always available - Original format
        col1, col2 = st.columns(2)
        with col1:
            st.download_button(
                label="Download Cleaned Data (Original Format)",
                data=convert_df_to_csv(cleaned_data),
                file_name="cleaned_data_original.csv",
                mime="text/csv",
                use_container_width=True
            )

        with col2:
            st.download_button(
                label="Download Flagged Data (Zone C)",
                data=convert_df_to_csv(flagged_data),
                file_name="flagged_data_zone_c.csv",
                mime="text/csv",
                use_container_width=True
            )

        # Option 2: If user selected different display format, offer converted version
        if display_data['display_unit'] != 'Original':
            st.markdown("---")
            st.markdown("#### Alternative Format Downloads")

            col1, col2 = st.columns(2)
            with col1:
                st.download_button(
                    label=f"Download Cleaned Data ({display_data['display_unit']})",
                    data=convert_df_to_csv(display_data['cleaned_data']),
                    file_name=f"cleaned_data_{display_data['display_unit'].lower()}.csv",
                    mime="text/csv",
                    use_container_width=True
                )

            with col2:
                st.download_button(
                    label=f"Download Flagged Data ({display_data['display_unit']})",
                    data=convert_df_to_csv(display_data['flagged_data']),
                    file_name=f"flagged_data_{display_data['display_unit'].lower()}.csv",
                    mime="text/csv",
                    use_container_width=True
                )

        st.markdown("---")

        # Station map
        st.markdown("### Station Locations")
        stations = flagged_data[['station_id',
                                 'latitude', 'longitude']].drop_duplicates()

        if len(stations) > 0:
            station_map = create_station_map(stations)
            st_folium(station_map, width=1300, height=500)
        else:
            st.warning("No station data available for map visualization.")

        st.markdown("---")

        # Tabs for detailed view
        tab1, tab2, tab3, tab4 = st.tabs([
            "Raw Data",
            "Cleaned Data",
            "Neighbor Groups",
            "Anomalies"
        ])

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
            col1, col2 = st.columns(2)
            with col1:
                st.metric("Missing Temperature",
                          raw_data['temperature'].isna().sum())
            with col2:
                st.metric("Missing Humidity",
                          raw_data['humidity'].isna().sum())

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
            col1, col2 = st.columns(2)
            with col1:
                st.metric("Missing Temperature",
                          cleaned_data['temperature'].isna().sum())
            with col2:
                st.metric("Missing Humidity",
                          cleaned_data['humidity'].isna().sum())

        # Tab 3: Neighbor Groups
        with tab3:
            st.markdown("#### Station Neighbor Groups")
            st.markdown(
                f"*Stations within {distance_threshold} km of each other*")

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
                            # Create map with current station and neighbors
                            center_lat = map_data['latitude'].mean()
                            center_lon = map_data['longitude'].mean()

                            neighbor_map = folium.Map(
                                location=[center_lat, center_lon],
                                zoom_start=12,
                                tiles="OpenStreetMap"
                            )

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
            st.markdown("#### Detected Anomalies by Station")

            if not anomaly_summary:
                st.info("No anomalies detected with current parameters.")
            else:
                for station_id in sorted(anomaly_summary.keys()):
                    anomalies = anomaly_summary[station_id]

                    with st.expander(f"{station_id} - {len(anomalies)} anomalies detected"):
                        # Summary
                        st.warning(
                            f"**{len(anomalies)} anomalies detected** in this station")

                        # Anomaly table
                        anomaly_df = pd.DataFrame(anomalies)
                        anomaly_df['date'] = pd.to_datetime(anomaly_df['date'])
                        anomaly_df['lof_score'] = anomaly_df['lof_score'].round(
                            3)

                        st.markdown("##### Anomalous Records")
                        st.dataframe(
                            anomaly_df[['date', 'temperature',
                                        'humidity', 'lof_score']],
                            hide_index=True,
                            use_container_width=True
                        )

                        # Chart
                        st.markdown("##### Temperature & Humidity Timeline")
                        station_data = flagged_data[flagged_data['station_id'] == station_id].copy(
                        )
                        anomaly_dates = anomaly_df['date'].tolist()

                        fig = create_station_chart(
                            station_data, anomaly_dates, display_data['detected_unit'], display_data['display_unit'])
                        st.plotly_chart(fig, use_container_width=True)

                        # Anomaly vs Normal Comparison
                        st.markdown(
                            "##### Anomaly vs Normal Comparison (Justification)")

                        # Separate normal and anomaly data for this station
                        normal_data = station_data[station_data['is_anomaly'] == False]
                        anomaly_data_scatter = station_data[station_data['is_anomaly'] == True]

                        # Convert temperatures using centralized function
                        normal_temp = convert_temp_series(
                            normal_data['temperature'], display_data['detected_unit'], display_data['display_unit'])
                        anomaly_temp = convert_temp_series(
                            anomaly_data_scatter['temperature'], display_data['detected_unit'], display_data['display_unit'])

                        # Scatter plot
                        fig_scatter = go.Figure()

                        # Normal points (gray)
                        fig_scatter.add_trace(go.Scatter(
                            x=normal_temp,
                            y=normal_data['humidity'],
                            mode='markers',
                            name='Normal',
                            marker=dict(color='#888888', size=8, opacity=0.6)
                        ))

                        # Anomaly points (red)
                        fig_scatter.add_trace(go.Scatter(
                            x=anomaly_temp,
                            y=anomaly_data_scatter['humidity'],
                            mode='markers',
                            name='Anomaly',
                            marker=dict(color='#FF4444', size=12, symbol='x')
                        ))

                        fig_scatter.update_layout(
                            height=280,
                            margin=dict(l=0, r=0, t=30, b=0),
                            xaxis=dict(title=display_data['temp_label']),
                            yaxis=dict(title='Humidity (%)'),
                            legend=dict(orientation='h',
                                        yanchor='bottom', y=1.02),
                            paper_bgcolor='rgba(0,0,0,0)',
                            plot_bgcolor='rgba(0,0,0,0)',
                            font=dict(size=11)
                        )

                        st.plotly_chart(fig_scatter, use_container_width=True)

                        # Comparison metrics
                        col1, col2 = st.columns(2)

                        with col1:
                            st.markdown("**Anomaly Days**")
                            if len(anomaly_data_scatter) > 0:
                                avg_temp = anomaly_data_scatter['temperature'].mean(
                                )
                                avg_temp = convert_temp(
                                    avg_temp, display_data['detected_unit'], display_data['display_unit'])
                                st.metric(
                                    "Avg Temperature", f"{avg_temp:.1f} {display_data['temp_symbol']}")
                                st.metric(
                                    "Avg Humidity", f"{anomaly_data_scatter['humidity'].mean():.1f} %")
                            else:
                                st.write("N/A")

                        with col2:
                            st.markdown("**Normal Days**")
                            if len(normal_data) > 0:
                                avg_temp = normal_data['temperature'].mean()
                                avg_temp = convert_temp(
                                    avg_temp, display_data['detected_unit'], display_data['display_unit'])
                                st.metric(
                                    "Avg Temperature", f"{avg_temp:.1f} {display_data['temp_symbol']}")
                                st.metric(
                                    "Avg Humidity", f"{normal_data['humidity'].mean():.1f} %")
                            else:
                                st.write("N/A")

else:
    # No data loaded
    st.info("Please upload a CSV file to begin.")

    st.markdown("#### Expected CSV Format")
    st.code("""
station_id,date,latitude,longitude,temperature,humidity
QC_AWS_001,2025-01-01,14.651,121.0495,28.5,85.2
QC_AWS_001,2025-01-02,14.651,121.0495,,82.1
...
    """)


# ============================================================================
# FOOTER
# ============================================================================

st.markdown("---")
st.markdown(
    "<p style='text-align: center; color: #666; font-size: 0.85rem;'>"
    "AWS Quality Control Pipeline | Zone A (Interpolation) -> Zone B (Grouping) -> Zone C (Anomaly Detection)"
    "</p>",
    unsafe_allow_html=True
)
