def convert_temperature(celsius, from_unit='C', to_unit='F'):
    """
    Convert temperature between Celsius and Fahrenheit.

    Args:
        celsius: temperature value
        from_unit: 'C' for Celsius, 'F' for Fahrenheit (input unit)
        to_unit: 'C' for Celsius, 'F' for Fahrenheit (output unit)

    Returns:
        float: converted temperature value rounded to 1 decimal place

    Examples:
        convert_temperature(28.5, 'C', 'F') → 83.3
        convert_temperature(83.3, 'F', 'C') → 28.5
    """
    # No conversion needed if same unit
    if from_unit == to_unit:
        return round(celsius, 1)

    # Convert from Celsius to Fahrenheit
    if from_unit == 'C' and to_unit == 'F':
        fahrenheit = (celsius * 1.8) + 32
        return round(fahrenheit, 1)

    # Convert from Fahrenheit to Celsius
    if from_unit == 'F' and to_unit == 'C':
        celsius_val = (celsius - 32) * (5 / 9)
        return round(celsius_val, 1)

    # Invalid conversion
    raise ValueError(
        f"Invalid units: from_unit={from_unit}, to_unit={to_unit}. Use 'C' or 'F'.")


def format_temperature(value, unit):
    """
    Format temperature value with appropriate unit symbol.

    Args:
        value: temperature numeric value
        unit: 'C' for Celsius, 'F' for Fahrenheit, or 'Original'

    Returns:
        str: formatted temperature string

    Examples:
        format_temperature(28.5, 'C') → '28.5 °C'
        format_temperature(83.3, 'F') → '83.3 °F'
        format_temperature(28.5, 'Original') → '28.5°'
    """
    if unit == 'C':
        return f"{value} °C"
    elif unit == 'F':
        return f"{value} °F"
    elif unit == 'Original':
        return f"{value}°"
    else:
        return str(value)


def format_humidity(value):
    """
    Format humidity value with percentage symbol.

    Args:
        value: humidity numeric value (0-100)

    Returns:
        str: formatted humidity string

    Examples:
        format_humidity(85.2) → '85.2%'
    """
    return f"{value}%"


def apply_temperature_conversion(df, from_unit, to_unit, column_name='temperature'):
    """
    Apply temperature conversion to a DataFrame column.

    Args:
        df: Pandas DataFrame
        from_unit: source unit ('C' or 'F')
        to_unit: target unit ('C' or 'F')
        column_name: name of temperature column to convert

    Returns:
        Pandas Series: converted temperature values (rounded to 1 decimal)
    """
    if from_unit == to_unit:
        return df[column_name].round(1)

    return df[column_name].apply(
        lambda x: convert_temperature(
            x, from_unit, to_unit) if pd.notna(x) else None
    )


# Import pandas only when needed for apply_temperature_conversion
try:
    import pandas as pd
except ImportError:
    pd = None
