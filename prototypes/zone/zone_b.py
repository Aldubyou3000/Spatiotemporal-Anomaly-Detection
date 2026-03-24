import math

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two coordinates."""
    R = 6371  # Earth radius in km

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def zone_b_haversine_grouping(cleaned_data, distance_threshold_km):
    """
    Zone B: Groups stations by proximity using Haversine distance.
    Returns dict with neighbor info including distances.
    """
    # Extract unique stations
    stations = cleaned_data[['station_id', 'latitude', 'longitude']].drop_duplicates()
    station_list = stations.values.tolist()

    neighbors = {}

    for i, (station_id, lat, lon) in enumerate(station_list):
        neighbors[station_id] = []

        for j, (other_id, other_lat, other_lon) in enumerate(station_list):
            if i != j:
                distance = haversine_distance(lat, lon, other_lat, other_lon)
                if distance <= distance_threshold_km:
                    neighbors[station_id].append({
                        'neighbor_id': other_id,
                        'distance_km': round(distance, 2)
                    })

        # Sort by distance (closest first)
        neighbors[station_id].sort(key=lambda x: x['distance_km'])

    return neighbors