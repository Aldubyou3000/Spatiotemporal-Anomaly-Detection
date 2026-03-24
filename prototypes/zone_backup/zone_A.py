import pandas as pd
import numpy as np


df = pd.read_csv('prototypes/pagasa.csv')


column_mapping = {
    'AirTemp': 'Temperature',
    'Date': 'Timestamp',
    'RH': 'Humidity'
}


df = df.rename(columns=column_mapping)


df['Timestamp'] = pd.to_datetime(df['Timestamp'], dayfirst=True, errors='coerce')




df = df.dropna(subset=['Timestamp'])




df = df.sort_values('Timestamp')


perfect_timeline = pd.date_range(
    start=df['Timestamp'].min(),
    end=df['Timestamp'].max(),
    freq='D'   # Daily frequency
)


skeleton_df = pd.DataFrame({'Timestamp': perfect_timeline})


# ==============================
# 5. Merge to Fill Missing Hours
# ==============================
clean_df = pd.merge(skeleton_df, df, on='Timestamp', how='left')


# ==============================
# 6. Interpolate Missing Values
# ==============================
clean_df['Temperature'] = clean_df['Temperature'].interpolate(
    method='linear',
    limit=2
).round(2)

clean_df['Humidity'] = clean_df['Humidity'].interpolate(
    method='linear',
    limit=2
).round(1)


# ==============================
# 7. Save Cleaned File
# ==============================
clean_df.to_csv('pagasa_cleaned_zoneA.csv', index=False)


print("✅ Zone A Complete! Data is clean and synchronized.")

