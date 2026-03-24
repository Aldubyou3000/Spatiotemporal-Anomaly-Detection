import pandas as pd

def zone_a_linear_interpolation(raw_data):
    """
    Zone A: Cleans missing data using linear interpolation.
    Groups by station_id, sorts by date, interpolates NaN values.
    """
    cleaned_data = raw_data.copy()
    cleaned_data = cleaned_data.sort_values(['station_id', 'date'])

    # Interpolate within each station group
    cleaned_data['temperature'] = cleaned_data.groupby('station_id')['temperature'].transform(
        lambda x: x.interpolate(method='linear', limit_direction='both')
    )
    cleaned_data['humidity'] = cleaned_data.groupby('station_id')['humidity'].transform(
        lambda x: x.interpolate(method='linear', limit_direction='both')
    )

    return cleaned_data.reset_index(drop=True)