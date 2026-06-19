import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/context/AppContext';
import {
  fetchActivity,
  fetchAllTickets,
  fetchInspectionPhotos,
  fetchReportForTicket,
  fetchTicketAttachments,
  getTicketById,
  MaintenanceTicket,
} from '@/services/api';

export const TICKET_LIST_KEY = ['/api/mobile/tickets'] as const;
export const ticketDetailKey = (id: string) => ['/api/mobile/tickets', id] as const;
export const ACTIVITY_KEY = ['/api/mobile/activity'] as const;

// Detail sub-resource keys — all nested under the ticket prefix so a single
// prefix invalidation (`['/api/mobile/tickets']`) refreshes the list AND every
// open ticket's report/attachments at once. Photos hang off the report id.
export const ticketReportKey      = (dbId: string) => ['/api/mobile/tickets', dbId, 'report'] as const;
export const ticketAttachmentsKey = (dbId: string) => ['/api/mobile/tickets', dbId, 'attachments'] as const;
export const reportPhotosKey      = (reportId: string) => ['/api/mobile/reports', reportId, 'photos'] as const;

// Detail data is memory-only (never persisted to disk — see _layout.tsx
// dehydrateOptions). Keep it in memory for a full work shift so reopening a
// ticket is instant; unused entries are reclaimed after this window.
const DETAIL_GC = 30 * 60 * 1000; // 30 min

export function useTicketList() {
  const qc = useQueryClient();
  const { isLoggedIn } = useAppContext();
  const q = useQuery({
    queryKey: TICKET_LIST_KEY,
    queryFn: fetchAllTickets,
    staleTime: 30_000,
    enabled: isLoggedIn,
  });
  return {
    ...q,
    data: q.data ?? null,
    isValidating: q.isFetching && !q.isLoading,
    forceRefresh: () => qc.invalidateQueries({ queryKey: TICKET_LIST_KEY }),
  };
}

export function useTicketDetail(
  dbId: string | null,
  initialData?: MaintenanceTicket | null,
) {
  const q = useQuery<MaintenanceTicket | null>({
    queryKey: dbId ? ticketDetailKey(dbId) : ['noop'],
    queryFn: () => getTicketById(dbId!),
    staleTime: 60_000,
    enabled: !!dbId,
    initialData: initialData ?? undefined,
    // Treat seed data as immediately stale so background fetch runs to get
    // full detail (reports + photos) while seed renders instantly.
    initialDataUpdatedAt: initialData ? 0 : undefined,
    // A transient failure (network blip / 5xx / 401) now THROWS rather than
    // resolving to null (getTicketById only returns null on a real 404). On
    // such an error TanStack Query keeps the last-good data and retries, so a
    // valid ticket never flips to "not found" on a momentary blip.
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });
  return {
    ...q,
    // On a transient error, fall back to the seed so the screen never blanks.
    data: q.data ?? initialData ?? null,
    // Don't show loading spinner when seed data is already present.
    isLoading: q.isLoading && !initialData,
    // True only when the fetch genuinely failed (not a 404) AND we have nothing
    // to show — lets screens distinguish "couldn't load" from "doesn't exist".
    isError: q.isError,
  };
}

export function useActivityFeed() {
  const qc = useQueryClient();
  const { isLoggedIn } = useAppContext();
  const q = useQuery({
    queryKey: ACTIVITY_KEY,
    queryFn: fetchActivity,
    staleTime: 30_000,
    enabled: isLoggedIn,
  });
  return {
    ...q,
    data: q.data ?? null,
    isValidating: q.isFetching && !q.isLoading,
    forceRefresh: () => qc.invalidateQueries({ queryKey: ACTIVITY_KEY }),
  };
}

// ─── Ticket detail sub-resources ─────────────────────────────────────────────
// Used by <TicketDetailContent> (shared by the bottom sheet and the full-page
// route). Each is cached and served instantly on reopen; a stale entry quietly
// revalidates in the background (stale-while-revalidate) with no spinner.

export function useTicketReport(dbId: string | null) {
  return useQuery({
    queryKey: dbId ? ticketReportKey(dbId) : ['noop'],
    queryFn: () => fetchReportForTicket(dbId!),
    enabled: !!dbId,
    staleTime: 60_000,
    gcTime: DETAIL_GC,
  });
}

export function useTicketAttachments(dbId: string | null) {
  return useQuery({
    queryKey: dbId ? ticketAttachmentsKey(dbId) : ['noop'],
    queryFn: () => fetchTicketAttachments(dbId!),
    enabled: !!dbId,
    staleTime: 60_000,
    gcTime: DETAIL_GC,
  });
}

export function useReportPhotos(reportId: string | null) {
  return useQuery({
    queryKey: reportId ? reportPhotosKey(reportId) : ['noop'],
    queryFn: () => fetchInspectionPhotos(reportId!),
    enabled: !!reportId,
    staleTime: 60_000,
    gcTime: DETAIL_GC,
  });
}
