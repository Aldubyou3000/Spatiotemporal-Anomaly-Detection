import * as FileSystem from 'expo-file-system';
import { supabase } from './supabase';

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

interface DbTicket {
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
  technician_id: string;
}

function mapDbTicket(row: DbTicket): MaintenanceTicket {
  const isPending = row.status === 'assigned' || row.status === 'in-progress' || row.status === 'created';
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
    verificationStatus: row.status === 'verified' ? 'Approved by Analyst' : row.status === 'completed' ? 'Pending Verification' : undefined,
    _dbId: row.id,
    _technicianId: row.technician_id,
  };
}

export async function fetchActiveTickets(): Promise<MaintenanceTicket[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('technician_id', user.id)
    .in('status', ['created', 'assigned'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as DbTicket[]).map(mapDbTicket);
}

export async function fetchInProgressTickets(): Promise<MaintenanceTicket[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('technician_id', user.id)
    .in('status', ['in-progress'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as DbTicket[]).map(mapDbTicket);
}

export async function fetchTicketHistory(): Promise<MaintenanceTicket[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('technician_id', user.id)
    .in('status', ['completed', 'verified'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data as DbTicket[]).map(mapDbTicket);
}

export async function getTicketById(ticketId: string): Promise<MaintenanceTicket | null> {
  const { data, error } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (error || !data) return null;
  return mapDbTicket(data as DbTicket);
}

export async function submitInspectionReport(
  dbTicketId: string,
  notes: string,
  sensorWorking: boolean | null,
  severity: 'low' | 'medium' | 'high' | null,
  rootCause: string | null
): Promise<{ success: true; reportId: string; ticketId: string; submittedAt: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const submittedAt = new Date().toISOString();

  const { data: reportData, error: reportError } = await supabase
    .from('inspection_reports')
    .insert({
      ticket_id: dbTicketId,
      technician_id: user.id,
      notes,
      sensor_working: sensorWorking,
      severity,
      root_cause: rootCause || null,
      submitted_at: submittedAt,
    })
    .select('id')
    .single();

  if (reportError) throw new Error(reportError.message);

  const { error: ticketError } = await supabase
    .from('tickets')
    .update({ status: 'completed', completed_at: submittedAt, updated_at: submittedAt })
    .eq('id', dbTicketId);

  if (ticketError) throw new Error(ticketError.message);

  return { success: true, reportId: reportData.id, ticketId: dbTicketId, submittedAt };
}

export async function uploadInspectionPhoto(
  reportId: string,
  photoUri: string,
  mimeType = 'image/jpeg'
): Promise<string> {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
  const path = `${reportId}/${Date.now()}.${ext}`;

  // FileSystem.readAsStringAsync reliably handles both file:// and content:// URIs
  const base64 = await FileSystem.readAsStringAsync(photoUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Decode base64 → Uint8Array (atob available in React Native 0.78+)
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const { error: storageError } = await supabase.storage
    .from('inspection-photos')
    .upload(path, bytes, { contentType: mimeType, upsert: true });

  if (storageError) throw new Error(storageError.message);

  const { data: urlData } = supabase.storage
    .from('inspection-photos')
    .getPublicUrl(path);

  const { error: dbError } = await supabase
    .from('inspection_photos')
    .insert({ report_id: reportId, photo_url: urlData.publicUrl });

  if (dbError) throw new Error(dbError.message);

  return urlData.publicUrl;
}

export async function fetchReportIdForTicket(ticketId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('inspection_reports')
    .select('id')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (error || !data) return null;
  return (data as { id: string }).id;
}

export async function fetchInspectionPhotos(
  reportId: string
): Promise<{ id: string; photo_url: string }[]> {
  const { data, error } = await supabase
    .from('inspection_photos')
    .select('id, photo_url')
    .eq('report_id', reportId)
    .order('uploaded_at', { ascending: true });

  if (error || !data) return [];

  const BUCKET = 'inspection-photos';
  const rows = data as { id: string; photo_url: string }[];

  const signed = await Promise.all(
    rows.map(async (row) => {
      // Extract the storage path from the stored URL (after the bucket name)
      const marker = `/${BUCKET}/`;
      const path = row.photo_url.includes(marker)
        ? row.photo_url.split(marker)[1].split('?')[0]
        : null;

      if (!path) return row;

      const { data: signedData, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);

      if (signErr || !signedData?.signedUrl) return row;
      return { ...row, photo_url: signedData.signedUrl };
    })
  );

  return signed;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  created_at: string;
}

export async function fetchTicketAttachments(
  ticketId: string
): Promise<TicketAttachment[]> {
  const BUCKET = 'ticket-attachments';

  const { data, error } = await supabase
    .from('ticket_attachments')
    .select('id, ticket_id, file_name, file_url, file_size, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  const rows = data as TicketAttachment[];

  const signed = await Promise.all(
    rows.map(async (row) => {
      const marker = `/${BUCKET}/`;
      const path = row.file_url.includes(marker)
        ? row.file_url.split(marker)[1].split('?')[0]
        : null;

      if (!path) return row;

      const { data: signedData, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 3600);

      if (signErr || !signedData?.signedUrl) return row;
      return { ...row, file_url: signedData.signedUrl };
    })
  );

  return signed;
}

export async function updateTicketStatus(
  dbTicketId: string,
  status: 'in-progress'
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('tickets')
    .update({ status, updated_at: now })
    .eq('id', dbTicketId);

  if (error) throw new Error(error.message);
}
