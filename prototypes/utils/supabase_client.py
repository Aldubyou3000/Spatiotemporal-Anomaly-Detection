"""
Supabase client for the Streamlit analyst dashboard.
- service_role client: DB operations (bypasses RLS — server-side only)
- anon client: user auth (sign_in_with_password)
"""
import os
from functools import lru_cache
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Service-role client for DB operations."""
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise RuntimeError(
            'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in prototypes/.env')
    return create_client(url, key)


@lru_cache(maxsize=1)
def get_anon_client() -> Client:
    """Anon client — used only for user sign_in_with_password."""
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_ANON_KEY')
    if not url or not key:
        raise RuntimeError(
            'Missing SUPABASE_URL or SUPABASE_ANON_KEY in prototypes/.env')
    return create_client(url, key)


# ---------------------------------------------------------------------------
# Auth Helpers
# ---------------------------------------------------------------------------

def _is_email(credential: str) -> bool:
    """Check if credential is an email address."""
    return '@' in credential.strip()


def _resolve_credential_to_email(sb: Client, credential: str) -> str:
    """Resolve credential (email or username) to email address.

    If credential contains @, treat it as email.
    Otherwise, resolve username to email via RPC.
    """
    credential = credential.strip().lower()

    if _is_email(credential):
        return credential

    # Resolve username → email
    res = sb.rpc('get_email_by_username', {'p_username': credential}).execute()
    email = res.data
    if not email:
        raise ValueError('Username not found. Ask your administrator.')

    return email


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def sign_in_analyst(credential: str, password: str) -> dict:
    """Authenticate an analyst by username or email + password.

    Args:
        credential: Email address or username
        password: Account password

    Returns:
        Profile dict for authenticated analyst
    """
    sb = get_supabase()

    # Resolve credential (email or username) to email
    email = _resolve_credential_to_email(sb, credential)

    # Authenticate via anon client (user-level auth)
    anon = get_anon_client()
    auth_res = anon.auth.sign_in_with_password(
        {'email': email, 'password': password})
    if not auth_res.user:
        raise ValueError('Invalid password.')

    # Load profile and verify analyst role
    profile_res = sb.table('profiles').select(
        '*').eq('id', auth_res.user.id).single().execute()
    profile = profile_res.data
    if not profile or profile.get('role') != 'analyst':
        anon.auth.sign_out()
        raise ValueError('Access denied: analyst accounts only.')

    return profile


# ---------------------------------------------------------------------------
# Ticket helpers
# ---------------------------------------------------------------------------

def fetch_all_tickets(status_filter: list[str] | None = None) -> list[dict]:
    sb = get_supabase()
    query = (
        sb.table('tickets')
        .select(
            '*, '
            'technician:profiles!tickets_technician_id_fkey(full_name, username), '
            'report:inspection_reports!inspection_reports_ticket_id_fkey'
            '(notes, sensor_working, severity, root_cause, analyst_approved, analyst_notes, submitted_at)'
        )
    )
    if status_filter:
        query = query.in_('status', status_filter)
    return query.order('created_at', desc=True).execute().data or []


def create_ticket(
    analyst_id: str,
    technician_id: str,
    station_id: str,
    title: str,
    description: str,
    priority: str = 'medium',
    anomaly_zone: str | None = None,
    anomaly_data: dict | None = None,
) -> dict:
    sb = get_supabase()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    payload: dict = {
        'analyst_id': analyst_id,
        'technician_id': technician_id,
        'station_id': station_id,
        'title': title,
        'description': description,
        'priority': priority,
        'status': 'assigned',
        'assigned_at': now,
        'updated_at': now,
    }
    if anomaly_zone:
        payload['anomaly_zone'] = anomaly_zone
    if anomaly_data:
        payload['anomaly_data'] = anomaly_data

    res = sb.table('tickets').insert(payload).execute()
    return res.data[0] if res.data else {}


def update_ticket_status(ticket_id: str, status: str) -> dict:
    sb = get_supabase()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    update_data: dict = {'status': status, 'updated_at': now}
    if status == 'completed':
        update_data['completed_at'] = now
    res = (
        sb.table('tickets')
        .update(update_data)
        .eq('id', ticket_id)
        .execute()
    )
    return res.data[0] if res.data else {}


# ---------------------------------------------------------------------------
# Report helpers
# ---------------------------------------------------------------------------

def fetch_all_reports() -> list[dict]:
    sb = get_supabase()
    return (
        sb.table('inspection_reports')
        .select('*, ticket:tickets(station_id, title), technician:profiles!inspection_reports_technician_id_fkey(full_name)')
        .order('created_at', desc=True)
        .execute()
        .data or []
    )


def approve_report(report_id: str, ticket_id: str, analyst_notes: str = '') -> dict:
    sb = get_supabase()
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()

    sb.table('inspection_reports').update({
        'analyst_approved': True,
        'analyst_approved_at': now,
        'analyst_notes': analyst_notes,
    }).eq('id', report_id).execute()

    sb.table('tickets').update({
        'status': 'verified',
        'verified_at': now,
        'updated_at': now,
    }).eq('id', ticket_id).execute()

    return {'approved': True}


# ---------------------------------------------------------------------------
# Technician helpers
# ---------------------------------------------------------------------------

def fetch_technicians(active_only: bool = True) -> list[dict]:
    sb = get_supabase()
    query = sb.table('profiles').select('*').eq('role', 'technician')
    if active_only:
        query = query.eq('is_active', True)
    return query.order('full_name').execute().data or []


def create_technician_account(
    email: str,
    password: str,
    full_name: str,
    username: str,
    phone: str | None = None,
    station_ids: list[str] | None = None,
) -> dict:
    """Creates a Supabase Auth user + profiles row for a new technician."""
    sb = get_supabase()

    auth_res = sb.auth.admin.create_user({
        'email': email,
        'password': password,
        'email_confirm': True,
    })
    user_id = auth_res.user.id

    sb.table('profiles').insert({
        'id': user_id,
        'email': email,
        'full_name': full_name,
        'username': username.strip().lower(),
        'role': 'technician',
        'phone': phone,
        'station_ids': station_ids or [],
    }).execute()

    return {'id': user_id, 'email': email, 'username': username.strip().lower()}


# ---------------------------------------------------------------------------
# Photo helpers
# ---------------------------------------------------------------------------

def get_stations_with_open_tickets() -> set:
    """Returns station IDs that already have a non-closed ticket (assigned or in-progress)."""
    sb = get_supabase()
    data = (
        sb.table('tickets')
        .select('station_id')
        .in_('status', ['assigned', 'in-progress'])
        .execute()
        .data or []
    )
    return {r['station_id'] for r in data}


def fetch_report_photos(report_id: str) -> list[dict]:
    """Fetch photos for a report, generating fresh signed URLs for private bucket access."""
    sb = get_supabase()
    rows = (
        sb.table('inspection_photos')
        .select('*')
        .eq('report_id', report_id)
        .order('uploaded_at')
        .execute()
        .data or []
    )

    bucket = 'inspection-photos'
    result = []
    for row in rows:
        url = row.get('photo_url', '')
        # Extract the storage path from the stored URL so we can generate a signed URL.
        # Stored URLs look like: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
        # or: https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>
        # We need just the <path> part after the bucket name.
        if url and f'/{bucket}/' in url:
            path = url.split(f'/{bucket}/')[-1]
            try:
                signed = sb.storage.from_(bucket).create_signed_url(path, expires_in=3600)
                row = {**row, 'photo_url': signed.get('signedURL') or signed.get('signed_url') or url}
            except Exception:
                pass  # Fall back to stored URL; st.image will show an error or blank
        result.append(row)

    return result


def upload_inspection_photo(
    report_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> str:
    """Upload a photo to Supabase Storage and record it in inspection_photos. Returns public URL."""
    sb = get_supabase()
    bucket = 'inspection-photos'
    path = f"{report_id}/{filename}"
    sb.storage.from_(bucket).upload(
        path, file_bytes,
        file_options={'content-type': content_type, 'upsert': 'true'},
    )
    public_url = sb.storage.from_(bucket).get_public_url(path)
    sb.table('inspection_photos').insert({
        'report_id': report_id,
        'photo_url': public_url,
    }).execute()
    return public_url
