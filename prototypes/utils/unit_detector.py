import pandas as pd
import numpy as np


def detect_temperature_format(temp_series):
    """
    Auto-detect temperature format from value ranges.

    Args:
        temp_series: Pandas Series of temperature values

    Returns:
        'C' if detected as Celsius (0-50 range typical for tropics)
        'F' if detected as Fahrenheit (32-122 range)
        None if ambiguous/cannot determine
    """
    # Remove NaN values for analysis
    temps = temp_series.dropna()

    if len(temps) == 0:
        return None

    min_temp = temps.min()
    max_temp = temps.max()

    # Celsius: typical weather range 0-50 (Philippines tropics: 20-35)
    # Fahrenheit: typical weather range 0-120 (but 32-122 more common)

    # If all values are in typical Celsius range
    if min_temp >= 0 and max_temp <= 50:
        return 'C'

    # If all values are in typical Fahrenheit range
    if min_temp >= 32 and max_temp <= 122:
        return 'F'

    # If we have negative values or very high values, likely Celsius
    if min_temp < 0:
        return 'C'

    # If values exceed 50 but below 32 (ambiguous)
    if max_temp > 50 and min_temp < 32:
        return None  # Ambiguous - ask user

    # For values > 122, likely Fahrenheit with extreme values
    if max_temp > 122:
        return 'F'

    return None


def validate_humidity_range(humidity_series):
    """
    Validate humidity values are in valid range (0-100%).

    Args:
        humidity_series: Pandas Series of humidity values

    Returns:
        dict with 'is_valid': bool, 'outliers': list of invalid row indices
    """
    humidity = humidity_series.dropna()

    if len(humidity) == 0:
        return {'is_valid': True, 'outliers': []}

    outlier_indices = []

    # Find values outside 0-100 range
    for idx, val in humidity.items():
        if val < 0 or val > 100:
            outlier_indices.append(idx)

    is_valid = len(outlier_indices) == 0

    return {
        'is_valid': is_valid,
        'outliers': outlier_indices,
        'invalid_count': len(outlier_indices)
    }


def detect_csv_units(csv_data):
    """
    Complete unit detection for uploaded CSV.

    Args:
        csv_data: Pandas DataFrame with temperature and humidity columns

    Returns:
        dict with detected units and confidence info
        {
            'temperature': 'C' or 'F' or None,
            'humidity': '%',
            'temp_detection_confidence': float (0.0-1.0),
            'humidity_valid': bool,
            'messages': list of warnings/info
        }
    """
    messages = []

    # Detect temperature format
    temp_detected = detect_temperature_format(csv_data['temperature'])

    if temp_detected is None:
        messages.append(
            "Temperature format is ambiguous. Please confirm if values are in Celsius or Fahrenheit.")
        temp_confidence = 0.0
    else:
        temp_confidence = 1.0
        messages.append(f"Temperature detected as {temp_detected}elsius.")

    # Validate humidity
    humidity_validation = validate_humidity_range(csv_data['humidity'])

    if not humidity_validation['is_valid']:
        messages.append(
            f"WARNING: {humidity_validation['invalid_count']} humidity value(s) outside 0-100% range detected."
        )
    else:
        messages.append("Humidity values valid (0-100%).")

    return {
        'temperature': temp_detected,
        'humidity': '%',
        'temp_detection_confidence': temp_confidence,
        'humidity_valid': humidity_validation['is_valid'],
        'messages': messages
    }
