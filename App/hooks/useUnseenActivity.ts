import { useActivityFeed } from '@/hooks/useTickets';
import { useActivitySeenAt } from '@/hooks/useActivitySeen';

/**
 * True when the Activity feed has any item newer than the last time the user
 * looked at it — drives the red "new activity" dot on the bottom-nav tab.
 *
 * Uses the shared, cached activity query (same one the Activity screen uses), so
 * it costs no extra network: it rides the existing fetch + the real-time SSE
 * invalidations, so the dot appears as soon as new activity arrives and clears
 * when the user visits the tab.
 */
export function useUnseenActivity(): boolean {
  const { data } = useActivityFeed();
  const seenAt = useActivitySeenAt();
  if (!data || data.length === 0) return false;
  return data.some((it) => new Date(it.createdAt).getTime() > seenAt);
}
