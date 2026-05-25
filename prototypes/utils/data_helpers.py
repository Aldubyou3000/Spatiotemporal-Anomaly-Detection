import streamlit as st


def paginate_dataframe(df, page_size, page_num):
    start_idx = (page_num - 1) * page_size
    end_idx = start_idx + page_size
    return df.iloc[start_idx:end_idx]


def prepare_display_data():
    raw = st.session_state.raw_data
    cleaned = st.session_state.cleaned_data if st.session_state.processed else None
    flagged = st.session_state.flagged_data if st.session_state.processed else None
    rain_col = 'rainfall'
    if raw is not None:
        rain_col = 'rainfall' if 'rainfall' in raw.columns else 'rainfall_mm'
    elif cleaned is not None:
        rain_col = 'rainfall' if 'rainfall' in cleaned.columns else 'rainfall_mm'
    return {
        'raw_data': raw,
        'cleaned_data': cleaned,
        'flagged_data': flagged,
        'rain_col': rain_col
    }
