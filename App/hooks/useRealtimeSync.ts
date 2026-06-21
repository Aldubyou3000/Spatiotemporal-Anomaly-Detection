/**
 * Real-time sync for the technician app.
 *
 * Opens ONE SSE connection to the backend's content-free nudge stream
 * (`GET /api/mobile/events`) and calls `onNudge()` whenever the technician's
 * ticket world may have changed. The screen reacts by refetching through the
 * already-authorized `/api/mobile/tickets` endpoint — the stream itself carries
 * no ticket data and no IDs, so it can never leak another technician's info.
 *
 * Auth: the token is sent in the `Authorization` header (react-native-sse
 * supports custom headers) — never in the URL. On a 401/403 we refresh the
 * session and reconnect.
 *
 * Native uses react-native-sse. On web, native browser EventSource cannot set
 * an Authorization header and we never put tokens in URLs, so web relies on the
 * screen's focus + AppState refetch instead (this hook is a no-op there).
 */

import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import RNEventSource from 'react-native-sse';
import { EVENTS_URL, getAccessToken, tryRefresh } from '@/services/api';

interface Options {
  enabled: boolean;          // true only when logged in
  onNudge: () => void;       // called on each relevant signal (and on foreground)
}

export function useRealtimeSync({ enabled, onNudge }: Options): void {
  // Keep the latest callback without resubscribing the stream.
  const onNudgeRef = useRef(onNudge);
  onNudgeRef.current = onNudge;

  useEffect(() => {
    // Web: no header-capable EventSource; rely on focus/AppState refetch.
    if (!enabled || Platform.OS === 'web') return;

    let es: RNEventSource | null = null;
    let cancelled = false;
    let refreshing = false;

    const close = () => {
      if (es) {
        es.removeAllEventListeners();
        es.close();
        es = null;
      }
    };

    const connect = async () => {
      if (cancelled) return;
      const token = await getAccessToken();
      if (!token || cancelled) return;

      close(); // ensure only one live connection

      es = new RNEventSource(EVENTS_URL, {
        headers: { Authorization: `Bearer ${token}` },
        // react-native-sse auto-reconnects on transient drops at this interval.
        // Live nudges still arrive instantly over the open connection; this only
        // governs how often a DROPPED connection retries. Kept calm (30s) so an
        // idle session doesn't churn through reconnect → invalidate → refetch
        // cycles every few seconds. Foreground resync (AppState) catches up
        // immediately when the user returns, so a longer retry costs nothing.
        pollingInterval: 30000,
      });

      es.addEventListener('message', (event) => {
        if (!event.data) return;
        try {
          const sig = JSON.parse(event.data) as { resource?: string };
          // Both tickets and reports affect the technician's ticket views.
          if (sig.resource === 'tickets' || sig.resource === 'reports') {
            onNudgeRef.current();
          }
        } catch {
          /* ignore malformed payloads */
        }
      });

      es.addEventListener('error', async (event) => {
        // On auth failure, refresh the session once and reconnect with the new
        // token. Other errors are left to react-native-sse's auto-reconnect.
        const status = (event as { xhrStatus?: number }).xhrStatus;
        if ((status === 401 || status === 403) && !refreshing) {
          refreshing = true;
          const ok = await tryRefresh();
          refreshing = false;
          if (ok && !cancelled) {
            await connect();
          }
        }
      });
    };

    connect();

    // Foreground resync: catch up immediately when the app returns to the
    // foreground (the stream may have been throttled/closed while backgrounded).
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active' && !cancelled) {
        onNudgeRef.current();
        connect(); // reconnect if the connection was dropped while backgrounded
      } else if (state === 'background') {
        close(); // save battery; foreground resync will catch up
      }
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      close();
    };
  }, [enabled]);
}
