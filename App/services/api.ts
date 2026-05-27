/**
 * FastAPI client for the Expo mobile app.
 *
 * Auth: Supabase tokens are stored in Expo SecureStore (native) or
 * localStorage (web fallback). Every authenticated request sends
 * Authorization: Bearer <access_token> — tokens never go to Supabase
 * from this client; the FastAPI backend owns all Supabase interaction.
 */

import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

if (!process.env.EXPO_PUBLIC_API_URL) {
  console.warn('[api] EXPO_PUBLIC_API_URL is not set — defaulting to http://localhost:8000');
}
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '');

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
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
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

export async function apiLogout(): Promise<void> {
  try {
    await request('/api/mobile/auth/logout', { method: 'POST' });
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
  stationName: string;
  location: string;
  coordinates: string;
  flaggedAnomaly: string;
  scheduledTime: string;
  status: 'Pending' | 'Completed';
  dbStatus: string;
  priority: 'low' | 'medium' | 'high' | null;
  anomalyZone: string | null;
  verificationStatus?: 'Pending Verification' | 'Approved by Analyst';
  notes?: string;
  imageUri?: string | null;
  _dbId?: string;
  _technicianId?: string;
}

interface ApiTicket {
  id: string;
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
}

function mapTicket(row: ApiTicket): MaintenanceTicket {
  const isPending = ['created', 'assigned', 'in-progress'].includes(row.status);
  return {
    ticketId: row.id.slice(0, 8).toUpperCase(),
    stationName: `${row.station_id} — ${row.title}`,
    location: row.station_id,
    coordinates: (row.anomaly_data as { coordinates?: string } | null)?.coordinates ?? '',
    flaggedAnomaly: row.description ?? row.title,
    scheduledTime: row.assigned_at ?? row.created_at,
    status: isPending ? 'Pending' : 'Completed',
    dbStatus: row.status,
    priority: row.priority ?? null,
    anomalyZone: row.anomaly_zone ?? null,
    verificationStatus:
      row.status === 'verified' ? 'Approved by Analyst'
      : row.status === 'completed' ? 'Pending Verification'
      : undefined,
    _dbId: row.id,
  };
}

export async function fetchActiveTickets(): Promise<MaintenanceTicket[]> {
  const all = await request<ApiTicket[]>('/api/mobile/tickets');
  return all.filter((t) => ['created', 'assigned'].includes(t.status)).map(mapTicket);
}

export async function fetchInProgressTickets(): Promise<MaintenanceTicket[]> {
  const all = await request<ApiTicket[]>('/api/mobile/tickets');
  return all.filter((t) => t.status === 'in-progress').map(mapTicket);
}

export async function fetchTicketHistory(): Promise<MaintenanceTicket[]> {
  const all = await request<ApiTicket[]>('/api/mobile/tickets');
  return all.filter((t) => ['completed', 'verified'].includes(t.status)).map(mapTicket);
}

export async function getTicketById(ticketId: string): Promise<MaintenanceTicket | null> {
  try {
    const ticket = await request<ApiTicket>(`/api/mobile/tickets/${ticketId}`);
    return mapTicket(ticket);
  } catch {
    return null;
  }
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
  sensorWorking: boolean | null,
  severity: 'low' | 'medium' | 'high' | null,
  rootCause: string | null,
): Promise<{ success: true; reportId: string; ticketId: string; submittedAt: string }> {
  const data = await request<{ id: string; ticket_id: string; submitted_at: string }>(
    '/api/mobile/reports',
    {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: dbTicketId,
        notes,
        sensor_working: sensorWorking,
        severity,
        root_cause: rootCause || null,
      }),
    },
  );
  return { success: true, reportId: data.id, ticketId: data.ticket_id, submittedAt: data.submitted_at };
}

export interface TicketReportSummary {
  id: string;
  ticket_id: string;
  submitted_at: string;
  notes: string | null;
  sensor_working: boolean | null;
  severity: 'low' | 'medium' | 'high' | null;
  root_cause: string | null;
  analyst_approved: boolean;
  analyst_approved_at: string | null;
  analyst_notes: string | null;
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

/** @deprecated use fetchReportForTicket */
export async function fetchReportIdForTicket(ticketId: string): Promise<string | null> {
  const report = await fetchReportForTicket(ticketId);
  return report?.id ?? null;
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
