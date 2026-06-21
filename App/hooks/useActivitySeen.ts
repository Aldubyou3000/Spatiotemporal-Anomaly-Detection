import { useSyncExternalStore } from 'react';
import { getActivitySeenAt, subscribeActivitySeen } from '@/lib/activitySeen';

/**
 * Reactive read of the "last looked at Activity" timestamp. Re-renders the
 * caller whenever the value changes (e.g. when the user leaves the Activity tab).
 */
export function useActivitySeenAt(): number {
  return useSyncExternalStore(subscribeActivitySeen, getActivitySeenAt, getActivitySeenAt);
}
