"""
Temperature conversion and display utilities.

This module centralizes ALL temperature-related logic:
- Unit conversions (C ↔ F)
- Label generation (°C, °F, etc.)
- DataFrame preparation for display

Single source of truth for temperature handling.
"""

import pandas as pd
import numpy as np
from utils.unit_converter import convert_temperature


# ============================================================================
# SINGLE VALUE CONVERSIONS
# ============================================================================

def convert_temp(value, from_unit, to_unit):
    """Convert a single temperature value between units.
    
    Uses the existing convert_temperature() from unit_converter.py.
    Preserves NaN values.
    
    Args:
        value: Single numeric temperature value (or NaN)
        from_unit: 'C' or 'F'
        to_unit: 'C' or 'F'
    
    Returns:
        Converted float value, or NaN if input is NaN
        
    Example:
        >>> convert_temp(28.5, 'C', 'F')
        83.3
        >>> convert_temp(np.nan, 'C', 'F')
        nan
    """
    if pd.isna(value):
        return np.nan
    return convert_temperature(value, from_unit, to_unit)


# ============================================================================
# LABEL & SYMBOL GENERATION
# ============================================================================

def get_temp_label(display_unit, detected_unit='C'):
    """Get a standardized temperature label for charts and UI.
    
    Used for chart titles, axis labels, etc.
    
    Args:
        display_unit: 'Original', 'Celsius', or 'Fahrenheit'
        detected_unit: 'C' or 'F' (the original data unit)
    
    Returns:
        Formatted label string
        
    Example:
        >>> get_temp_label('Fahrenheit', 'C')
        'Temperature (°F)'
        >>> get_temp_label('Original', 'C')
        'Temperature (C)'
    """
    if display_unit == 'Original':
        return f"Temperature ({detected_unit})"
    elif display_unit == 'Celsius':
        return "Temperature (°C)"
    elif display_unit == 'Fahrenheit':
        return "Temperature (°F)"
    return "Temperature"


def get_temp_symbol(display_unit, detected_unit='C'):
    """Get a short temperature unit symbol for metrics and displays.
    
    Used for compact displays like "28.5 °C" or "83.3 °F".
    
    Args:
        display_unit: 'Original', 'Celsius', or 'Fahrenheit'
        detected_unit: 'C' or 'F'
    
    Returns:
        Short symbol string ('C', '°C', '°F', etc.)
        
    Example:
        >>> get_temp_symbol('Celsius')
        '°C'
        >>> get_temp_symbol('Original', 'F')
        'F'
    """
    if display_unit == 'Original':
        return detected_unit
    elif display_unit == 'Celsius':
        return '°C'
    elif display_unit == 'Fahrenheit':
        return '°F'
    return detected_unit


# ============================================================================
# SERIES CONVERSIONS
# ============================================================================

def convert_temp_series(series, detected_unit, display_unit):
    """Convert an entire pandas Series of temperature values.
    
    Safely handles NaN values, returns a copy of the original if no conversion needed.
    Use this for converting chart data, table columns, etc.
    
    Args:
        series: pd.Series with temperature values
        detected_unit: 'C' or 'F' (original data unit)
        display_unit: 'Original', 'Celsius', or 'Fahrenheit'
    
    Returns:
        pd.Series with converted values (or copy of original if no conversion)
        
    Example:
        >>> temps = pd.Series([28.5, 29.2, np.nan, 30.1])
        >>> converted = convert_temp_series(temps, 'C', 'Fahrenheit')
        >>> converted[0]
        83.3
        >>> pd.isna(converted[2])
        True
    """
    # No conversion needed if showing original or units match
    if display_unit == 'Original' or detected_unit == display_unit:
        return series.copy()
    
    # Determine conversion direction
    if display_unit == 'Celsius' and detected_unit == 'F':
        from_unit, to_unit = 'F', 'C'
    elif display_unit == 'Fahrenheit' and detected_unit == 'C':
        from_unit, to_unit = 'C', 'F'
    else:
        return series.copy()
    
    # Apply conversion, preserving NaN
    return series.apply(
        lambda x: convert_temperature(x, from_unit, to_unit) if pd.notna(x) else np.nan
    )


# ============================================================================
# DATAFRAME CONVERSION (for display)
# ============================================================================

def convert_dataframe_for_display(df, detected_unit, display_unit):
    """Convert temperature column in a DataFrame for display based on user preference.
    
    This is the SINGLE place where DataFrames are prepared for display.
    Handles the entire conversion process in one function.
    
    Args:
        df: pd.DataFrame with a 'temperature' column
        detected_unit: 'C' or 'F' (original data unit)
        display_unit: 'Original', 'Celsius', or 'Fahrenheit'
    
    Returns:
        pd.DataFrame (copy) with converted temperature column if applicable
        
    Example:
        >>> df = pd.DataFrame({'temperature': [28.5, 29.2, np.nan]})
        >>> df_display = convert_dataframe_for_display(df, 'C', 'Fahrenheit')
        >>> df_display['temperature'].tolist()
        [83.3, 84.56, nan]
    """
    df_display = df.copy()
    
    # Skip if no temperature column
    if 'temperature' not in df_display.columns:
        return df_display
    
    # Skip if no conversion needed
    if display_unit == 'Original' or detected_unit == display_unit:
        return df_display
    
    # Convert the temperature column
    df_display['temperature'] = convert_temp_series(
        df_display['temperature'], 
        detected_unit, 
        display_unit
    )
    
    return df_display
