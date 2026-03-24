import pandas as pd
import numpy as np

qc_stations = {
    'Science Garden': {'lat': 14.6507, 'lon': 121.0431},
    'Novaliches': {'lat': 14.7351, 'lon': 121.0573},
    'Diliman': {'lat': 14.6495, 'lon': 121.0685}
}

def apply_spatial_data(df):
 
    df['lat'] = df['Station_ID'].map(lambda x: qc_stations.get(x, {}).get('lat'))
    df['lon'] = df['Station_ID'].map(lambda x: qc_stations.get(x, {}).get('lon'))
    return df

def add_daily_delta(df):
 
    df = df.sort_values(['Station_ID', 'Timestamp'])
  
    df['Temp_Diff'] = df.groupby('Station_ID')['Temperature'].diff()
    return df