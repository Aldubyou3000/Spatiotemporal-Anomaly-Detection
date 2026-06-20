/**
 * FastAPI client for the Expo mobile app.
 *
 * Auth: Supabase tokens are stored in Expo SecureStore (native) or
 * localStorage (web fallback). Every authenticated request sends
 * Authorization: Bearer <access_token> — tokens never go to Supabase
 * from this client; the FastAPI backend owns all Supabase interaction.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

// Lets the in-app browser auto-close if the OS routes the redirect back through
// it (no-op on the openAuthSessionAsync path, but recommended by Expo).
WebBrowser.maybeCompleteAuthSession();

if (!process.env.EXPO_PUBLIC_API_URL) {
  console.warn('[api] EXPO_PUBLIC_API_URL is not set — defaulting to http://localhost:8000');
}
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

// Always surface the resolved base URL once at startup — the single most useful
// line for diagnosing "site can't be reached" issues from a phone.
console.log(`[api] API_URL = ${API_URL} (platform=${Platform.OS})`);

// A physical device can NEVER reach localhost/127.0.0.1 — that's the device
// itself. If the env var didn't load (Metro started before App/.env existed, or
// a cached bundle), the app silently falls back to localhost and every request
// fails with "connection refused". Make that failure mode loud instead of silent.
if (Platform.OS !== 'web' && /\/\/(localhost|127\.0\.0\.1)[:/]/.test(API_URL)) {
  console.error(
    '[api] FATAL CONFIG: running on a device but API_URL points at localhost — ' +
    'the phone cannot reach this. Set EXPO_PUBLIC_API_URL to your PC LAN IP in App/.env ' +
    'and restart Metro with a cleared cache: `npx expo start -c`.',
  );
}

/** URL of the technician real-time SSE stream (content-free nudges, Bearer auth). */
export const EVENTS_URL = `${API_URL}/api/mobile/events`;

const TOKEN_KEY   = 'app_access_token';
const REFRESH_KEY = 'app_refresh_token';

// ─── Token storage (SecureStore on native, localStorage on web) ──────────────

export async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(REFRESH_KEY);
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function saveTokens(access: string, refresh: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    return;
  }
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    return;
  }
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

// ─── Base fetch wrapper ───────────────────────────────────────────────────────

/**
 * Error thrown by `request()` for any non-OK HTTP response. Carries the status
 * so callers can tell a genuine 404 (resource really gone) apart from a
 * transient 5xx / network failure — critical for not flipping a valid ticket to
 * "not found" on a momentary blip.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let isRefreshing = false;

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (res.status === 401 && retry && !isRefreshing) {
    isRefreshing = true;
    try {
      const refreshed = await tryRefresh();
      isRefreshing = false;
      if (refreshed) return request<T>(path, init, false);
    } catch {
      isRefreshing = false;
    }
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body?.detail ?? detail;
    } catch { /* ignore parse errors */ }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function tryRefresh(): Promise<boolean> {
  const refresh = await getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/api/mobile/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) {
      await clearTokens();
      return false;
    }
    const data = await res.json();
    await saveTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: 'analyst' | 'technician';
  phone: string | null;
  station_ids: string[];
  is_active: boolean;
}

export async function apiLogin(credential: string, password: string): Promise<UserProfile> {
  const data = await fetch(`${API_URL}/api/mobile/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential, password }),
  });
  if (!data.ok) {
    let detail = 'Login failed. Check your credentials.';
    try { detail = (await data.json())?.detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }
  const json = await data.json();
  await saveTokens(json.access_token, json.refresh_token);
  return json.user as UserProfile;
}

/** Thrown when the user dismisses/cancels the Google browser — callers should
 *  treat this as a no-op, not an error to surface. */
export class OAuthCancelled extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
    this.name = 'OAuthCancelled';
  }
}

/**
 * Technician Google sign-in via server-side PKCE.
 *
 * Opens the backend /start URL in the system browser; the backend drives the
 * Google + Supabase exchange and redirects back to our app scheme
 * (spatiotemporal://oauth-callback) with tokens in the URL fragment. We parse
 * them, store them in SecureStore (same as password login), and load the
 * profile. Throws OAuthCancelled if the user backs out, or Error with a friendly
 * message if the backend rejected the account (e.g. not an authorised technician).
 */
/** Parse the `spatiotemporal://oauth-callback#...` URL the backend redirects to,
 *  storing tokens + loading the profile. Shared by both the browser-result path
 *  and the deep-link-listener path. Returns the profile or throws a friendly error. */
async function _consumeOAuthCallbackUrl(url: string): Promise<UserProfile> {
  const hash = url.split('#')[1] ?? '';
  const params = new URLSearchParams(hash);

  const err = params.get('error');
  if (err) {
    const messages: Record<string, string> = {
      oauth_denied: 'This Google account is not an authorised technician. Contact your analyst.',
      oauth_cancelled: 'Google sign-in was cancelled.',
      oauth_disabled: 'Google sign-in is not enabled. Use your username and password.',
      oauth_unavailable: 'Google sign-in is temporarily unavailable. Use your username and password.',
    };
    throw new Error(messages[err] ?? 'Google sign-in failed. Please try again.');
  }

  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (!access || !refresh) {
    throw new Error('Google sign-in failed. Please try again.');
  }

  await saveTokens(access, refresh);
  const profile = await apiGetMe();
  if (!profile) {
    await clearTokens();
    throw new Error('Could not load your profile after sign-in. Please try again.');
  }
  return profile;
}

export async function apiLoginWithGoogle(): Promise<UserProfile> {
  const returnUrl = Linking.createURL('oauth-callback');
  const startUrl = `${API_URL}/api/mobile/auth/oauth/google/start?return_url=${encodeURIComponent(returnUrl)}`;

  // RACE two ways of capturing the spatiotemporal:// return, because Android's
  // openAuthSessionAsync has a documented bug where it sometimes never resolves
  // on a server 302→custom-scheme redirect (the in-app browser doesn't fire the
  // deep link). A standalone Linking 'url' listener catches the deep link even
  // when the browser session hangs. Whichever fires first wins.
  let resolved = false;
  const callbackPromise = new Promise<string>((resolve) => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith(returnUrl) || url.startsWith('spatiotemporal://oauth-callback')) {
        resolved = true;
        sub.remove();
        // Make sure the in-app browser tab is dismissed once we have the deep link.
        WebBrowser.dismissBrowser?.();
        resolve(url);
      }
    });
  });

  const browserPromise = WebBrowser.openAuthSessionAsync(startUrl, returnUrl).then((result) => {
    if (result.type === 'success' && result.url) return result.url;
    if ((result.type === 'cancel' || result.type === 'dismiss') && !resolved) {
      // Browser closed without a result AND the listener hasn't fired — treat as
      // cancel, but give the listener a brief grace window first (the dismiss can
      // arrive a tick before the deep link on Android).
      return new Promise<string>((_, reject) =>
        setTimeout(() => (resolved ? undefined : reject(new OAuthCancelled())), 1500),
      );
    }
    // type was success-without-url or other: let the listener win, else fail later.
    return new Promise<string>(() => {});
  });

  let callbackUrl: string;
  try {
    callbackUrl = await Promise.race([callbackPromise, browserPromise]);
  } finally {
    resolved = true;
  }

  return _consumeOAuthCallbackUrl(callbackUrl);
}

export async function apiLogout(): Promise<void> {
  // Always clear local tokens — even if the server call fails or the session
  // is already expired, the user must be able to log out from the app.
  try {
    await request('/api/mobile/auth/logout', { method: 'POST' });
  } catch {
    // Intentionally swallowed — expired/invalid token is not an error for logout
  } finally {
    await clearTokens();
  }
}

export async function apiGetMe(): Promise<UserProfile | null> {
  try {
    return await request<UserProfile>('/api/mobile/auth/me');
  } catch {
    return null;
  }
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export interface MaintenanceTicket {
  ticketId: string;
  // Clean, unmashed fields (mirror the web row). stationName/location/etc. are
  // kept below for backward compatibility with report.tsx + the PDF flow.
  ticketNumber: number;
  stationId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  stationName: string;
  location: string;
  coordinates: string;
  flaggedAnomaly: string;
  scheduledTime: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  dbStatus: string;
  priority: 'low' | 'medium' | 'high' | null;
  anomalyZone: string | null;
  verificationStatus?: 'Pending Verification' | 'Approved by Analyst';
  notes?: string;
  imageUri?: string | null;
  _dbId?: string;
  _technicianId?: string;
  // Follow-up fields
  isFollowUp?: boolean;
  followUpCount?: number;
  followUpNotes?: string | null;
  // Cancellation fields
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  // All report rounds (populated by detail endpoint)
  reports?: TicketReportSummary[];
}

interface ApiTicket {
  id: string;
  ticket_number: number;
  station_id: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | null;
  anomaly_zone: string | null;
  anomaly_data: Record<string, unknown> | null;
  title: string;
  description: string | null;
  created_at: string;
  assigned_at: string | null;
  completed_at: string | null;
  follow_up_count?: number;
  follow_up_notes?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  reports?: TicketReportSummary[];
}

function mapTicket(row: ApiTicket): MaintenanceTicket {
  const isPending = ['created', 'assigned', 'in-progress', 'follow_up'].includes(row.status);
  const isCancelled = row.status === 'cancelled';
  return {
    ticketId: String(row.ticket_number),
    ticketNumber: row.ticket_number,
    stationId: row.station_id,
    title: row.title,
    createdAt: row.created_at,
    // Mobile API has no true updated_at — best-available recency proxy.
    updatedAt: row.completed_at ?? row.assigned_at ?? row.created_at,
    stationName: `${row.station_id} — ${row.title}`,
    location: row.station_id,
    coordinates: (row.anomaly_data as { coordinates?: string } | null)?.coordinates ?? '',
    flaggedAnomaly: row.description ?? row.title,
    scheduledTime: row.assigned_at ?? row.created_at,
    status: isCancelled ? 'Cancelled' : isPending ? 'Pending' : 'Completed',
    dbStatus: row.status,
    priority: row.priority ?? null,
    anomalyZone: row.anomaly_zone ?? null,
    verificationStatus:
      row.status === 'verified' ? 'Approved by Analyst'
      : row.status === 'pending_review' ? 'Pending Verification'
      : undefined,
    _dbId: row.id,
    isFollowUp: row.status === 'follow_up',
    followUpCount: row.follow_up_count ?? 0,
    followUpNotes: row.follow_up_notes ?? null,
    cancellationReason: row.cancellation_reason ?? null,
    cancelledAt: row.cancelled_at ?? null,
    reports: row.reports ?? [],
  };
}

/**
 * All of the technician's tickets (every status). The endpoint is already
 * per-technician filtered server-side; the dashboard buckets them into the
 * 5 status tabs client-side. Replaces the old active/in-progress/history
 * fetchers, which mis-routed pending_review into "history".
 */
export async function fetchAllTickets(): Promise<MaintenanceTicket[]> {
  const all = await request<ApiTicket[]>('/api/mobile/tickets');
  return all.map(mapTicket);
}

export async function getTicketById(ticketId: string): Promise<MaintenanceTicket | null> {
  try {
    const ticket = await request<ApiTicket>(`/api/mobile/tickets/${ticketId}`);
    return mapTicket(ticket);
  } catch (err) {
    // Only a genuine 404 means the ticket is gone → return null so the screen
    // shows "not found". Any other failure (network blip, 401, 5xx) is transient:
    // re-throw so TanStack Query keeps the last-good/seed data and retries,
    // instead of silently replacing a valid ticket with null.
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ─── Activity feed ─────────────────────────────────────────────────────────
// A sanitised, technician-scoped slice of the server audit log. The backend
// strips IP / user-agent / other-user identity before this ever reaches us.

export interface ActivityItem {
  id: number;
  event: string;                 // audit event name, e.g. 'report_approved'
  ticketId: string;              // db UUID — used to open the ticket detail
  ticketNumber: number | null;   // human ticket number (TKT-N)
  ticketTitle: string | null;
  actor: 'you' | 'analyst' | 'system';
  createdAt: string;             // ISO timestamp
}

interface ApiActivityItem {
  id: number;
  event: string;
  ticket_id: string;
  ticket_number: number | null;
  ticket_title: string | null;
  actor: 'you' | 'analyst' | 'system';
  created_at: string;
}

/** Recent lifecycle events across all of the technician's tickets, newest first. */
export async function fetchActivity(): Promise<ActivityItem[]> {
  const rows = await request<ApiActivityItem[]>('/api/mobile/activity');
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    ticketId: r.ticket_id,
    ticketNumber: r.ticket_number,
    ticketTitle: r.ticket_title,
    actor: r.actor,
    createdAt: r.created_at,
  }));
}

export async function updateTicketStatus(dbTicketId: string, ticketStatus: 'in-progress'): Promise<void> {
  await request(`/api/mobile/tickets/${dbTicketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: ticketStatus }),
  });
}

export async function downloadTicketPdf(dbTicketId: string, fileName: string): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${API_URL}/api/mobile/tickets/${dbTicketId}/pdf`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let detail = 'PDF download failed';
    try { detail = (await res.json())?.detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const blob = await res.blob();

  // Web: use DOM to trigger download
  if (Platform.OS === 'web') {
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(href);
    return;
  }

  // Native (Android/iOS): save to cache and share
  const localUri = `${FileSystem.cacheDirectory}${fileName}`;
  await new Promise<void>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          await FileSystem.writeAsStringAsync(localUri, base64, { encoding: 'base64' });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(localUri, { mimeType: 'application/pdf', dialogTitle: fileName });
          }
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read PDF blob'));
    reader.readAsDataURL(blob);
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function submitInspectionReport(
  dbTicketId: string,
  notes: string,
  severity: 'low' | 'medium' | 'high' | null,
  rootCause: string | null,
  correctiveAction: string | null,
  issueResolved: boolean | null,
): Promise<{ success: true; reportId: string; ticketId: string; submittedAt: string }> {
  const data = await request<{ id: string; ticket_id: string; submitted_at: string }>(
    '/api/mobile/reports',
    {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: dbTicketId,
        notes,
        severity,
        root_cause: rootCause || null,
        corrective_action: correctiveAction || null,
        issue_resolved: issueResolved,
      }),
    },
  );
  return { success: true, reportId: data.id, ticketId: data.ticket_id, submittedAt: data.submitted_at };
}

export interface ReportPhoto {
  id: string;
  photo_url: string;
}

export interface TicketReportSummary {
  id: string;
  ticket_id: string;
  submitted_at: string;
  notes: string | null;
  severity: 'low' | 'medium' | 'high' | null;
  root_cause: string | null;
  corrective_action: string | null;
  issue_resolved: boolean | null;
  analyst_approved: boolean;
  analyst_approved_at: string | null;
  analyst_notes: string | null;
  /** Analyst note that sent THIS round back (mirrors web PriorRound.followUpNotes). */
  follow_up_notes?: string | null;
  /** Signed photo URLs for this round (populated by the detail endpoint). */
  photos?: ReportPhoto[];
  round?: number;
  is_active?: boolean;
}

export async function fetchReportForTicket(ticketId: string): Promise<TicketReportSummary | null> {
  try {
    return await request<TicketReportSummary | null>(
      `/api/mobile/tickets/${ticketId}/report-id`,
    );
  } catch {
    return null;
  }
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export async function fetchTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
  try {
    return await request<TicketAttachment[]>(`/api/mobile/tickets/${ticketId}/attachments`);
  } catch {
    return [];
  }
}

export async function fetchInspectionPhotos(
  reportId: string,
): Promise<{ id: string; photo_url: string }[]> {
  try {
    return await request<{ id: string; photo_url: string }[]>(`/api/mobile/reports/${reportId}/photos`);
  } catch {
    return [];
  }
}

export async function uploadInspectionPhoto(
  reportId: string,
  photoUri: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
  const fileName = `photo.${ext}`;
  const formData = new FormData();

  if (Platform.OS === 'web') {
    // Web: fetch the object/blob URL to get a real Blob
    const blob = await fetch(photoUri).then((r) => r.blob());
    formData.append('photo', blob, fileName);
  } else {
    // Native Android/iOS: React Native's fetch handles file:// URIs natively —
    // no FileSystem read needed, and avoids content:// permission errors on Android
    formData.append('photo', { uri: photoUri, name: fileName, type: mimeType } as any);
  }

  const res = await fetch(`${API_URL}/api/mobile/reports/${reportId}/photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    let detail = 'Photo upload failed';
    try { detail = (await res.json())?.detail ?? detail; } catch { /* ignore */ }
    throw new Error(detail);
  }

  const data = await res.json();
  return data.photo_url as string;
}
