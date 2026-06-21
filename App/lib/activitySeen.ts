/**
 * Shared "when did the technician last look at the Activity tab" timestamp.
 *
 * Two things read it: the Activity feed (to mark rows as new/unseen) and the
 * bottom-nav badge (to show a dot when there's new activity). Keeping it in one
 * tiny external store — rather than local state in the feed — lets the nav badge
 * update the moment the value changes, even though it lives in a different screen.
 *
 * Persisted with the same platform-branched pattern used elsewhere (SecureStore
 * native / localStorage web). The value is epoch-ms; 0 means "never looked", so
 * everything counts as new for a brand-new user.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'activity_last_seen';

let seenAt = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

async function persist(ms: number) {
  const val = String(ms);
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(KEY, val);
    } else {
      await SecureStore.setItemAsync(KEY, val);
    }
  } catch {
    // Best-effort — a failed write just means the badge may linger one extra visit.
  }
}

// Load the saved value once at startup, then notify so the badge re-evaluates.
(async () => {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      raw = window.localStorage.getItem(KEY);
    } else {
      raw = await SecureStore.getItemAsync(KEY);
    }
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      seenAt = n;
      emit();
    }
  } catch {
    // keep default 0
  }
})();

export function getActivitySeenAt(): number {
  return seenAt;
}

/** Stamp "seen up to now". Called when the user leaves the Activity tab. */
export function markActivitySeen(ms: number = Date.now()): void {
  if (ms <= seenAt) return; // never move the marker backwards
  seenAt = ms;
  emit();
  persist(ms);
}

export function subscribeActivitySeen(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
