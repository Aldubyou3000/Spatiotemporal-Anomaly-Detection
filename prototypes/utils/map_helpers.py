import folium


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
