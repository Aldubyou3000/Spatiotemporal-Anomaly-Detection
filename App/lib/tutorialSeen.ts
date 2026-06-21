/**
 * "Has the technician seen the guided tour?" flag — persisted on device so the
 * spotlight tour auto-shows only on the FIRST launch. Replaying via the ? button
 * ignores this flag.
 *
 * Same platform-branched pattern the app uses elsewhere (theme in AppContext,
 * activity_last_seen in activity.tsx): SecureStore on native, localStorage on web.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TUTORIAL_SEEN_KEY = 'tutorial_seen';

export async function readTutorialSeen(): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(TUTORIAL_SEEN_KEY) === 'true';
    }
    return (await SecureStore.getItemAsync(TUTORIAL_SEEN_KEY)) === 'true';
  } catch {
    // On any read error, treat as "not seen" is risky (re-shows every launch);
    // treat as "seen" so a storage failure never traps the user in the tour.
    return true;
  }
}

export async function writeTutorialSeen(seen: boolean): Promise<void> {
  const val = seen ? 'true' : 'false';
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(TUTORIAL_SEEN_KEY, val);
      return;
    }
    await SecureStore.setItemAsync(TUTORIAL_SEEN_KEY, val);
  } catch {
    // Best-effort — a failed write just means the tour may show again next launch.
  }
}
