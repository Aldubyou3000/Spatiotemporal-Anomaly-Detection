"use client";

import { useEffect, useRef, useState } from "react";
import { mutate as globalMutate } from "swr";

/**
 * Real-time sync — opens ONE EventSource to the FastAPI SSE endpoint and routes
 * server "something changed" signals to SWR cache revalidations.
 *
 * The browser never talks to Supabase; it connects only to ``/api/events`` on
 * the FastAPI backend (cookie-authenticated via ``withCredentials``). Each signal
 * is a tiny ``{ resource, action, id }`` payload; we react by revalidating the
 * matching SWR keys, which refetch through the normal authenticated apiClient
 * path (inheriting cookie auth + 401-refresh). Because ``globalMutate(predicate)``
 * only refetches *currently-subscribed* keys, the open ticket detail revalidates
 * automatically while closed views are skipped — no need to track selection here.
 *
 * Mounted once at the dashboard root (see RealtimeProvider) so there is exactly
 * one connection per tab, updating every page and the always-mounted sidebar.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// Audit events fire on EVERY mutation (and on auth/security events), so the
// audit-page revalidation is coalesced to avoid refetch storms during bulk ops.
const AUDIT_DEBOUNCE_MS = 1500;

interface RealtimeSignal {
  resource: "tickets" | "reports" | "technicians" | "audit";
  action?: string;
  id?: string | null;
  ts?: number;
}

type KeyMatcher = (key: unknown) => boolean;

// Match any SWR array-key whose first element STARTS WITH one of the given path
// prefixes. Prefix (not exact) matching is essential: list keys look like
// ["/api/tickets", {filters}] but the open detail / report / attachments keys
// look like ["/api/tickets/<id>"], ["/api/tickets/<id>/report"], etc. An exact
// match would invalidate the list but leave the OPEN detail panel stale — which
// is exactly the "I still have to refresh to see the update" symptom.
const isArrayKeyWithPrefix =
  (...prefixes: string[]): KeyMatcher =>
  (key: unknown) =>
    Array.isArray(key) &&
    typeof key[0] === "string" &&
    prefixes.some((p) => (key[0] as string).startsWith(p));

// Maps a signal resource → which SWR keys to revalidate. Mirrors the existing
// key conventions (e.g. invalidateTicketLists in useTickets.ts).
const RESOURCE_MATCHERS: Record<RealtimeSignal["resource"], KeyMatcher> = {
  // "/api/tickets" prefix covers ticket lists ["/api/tickets",{…}], the open
  // detail ["/api/tickets/<id>"], its /report + /attachments, and the
  // technicians summary ["/api/tickets/technicians"].
  tickets: isArrayKeyWithPrefix("/api/tickets"),
  // useReports() key ["/api/reports"] also drives the sidebar pending badge.
  reports: isArrayKeyWithPrefix("/api/reports"),
  technicians: isArrayKeyWithPrefix("/api/technicians", "/api/tickets/technicians"),
  audit: isArrayKeyWithPrefix("/api/audit"),
};

export function useRealtimeSync(): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  const auditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource(`${BASE_URL}/api/events`, { withCredentials: true });

    es.onopen = () => setConnected(true);

    es.onerror = () => {
      // EventSource auto-reconnects (honoring the server's retry interval). We
      // surface no intrusive UI; if the session expired, normal apiClient calls
      // refresh the cookies and the next reconnect succeeds. Just reflect state.
      setConnected(false);
    };

    es.onmessage = (e: MessageEvent) => {
      let signal: RealtimeSignal;
      try {
        signal = JSON.parse(e.data);
      } catch {
        return; // ignore malformed payloads
      }
      const matcher = RESOURCE_MATCHERS[signal.resource];
      if (!matcher) return;

      if (signal.resource === "audit") {
        // Coalesce bursts of audit signals into a single revalidation.
        if (auditTimer.current) clearTimeout(auditTimer.current);
        auditTimer.current = setTimeout(() => {
          globalMutate(matcher);
          auditTimer.current = null;
        }, AUDIT_DEBOUNCE_MS);
        return;
      }

      // Revalidate immediately. revalidate defaults to true → background refetch
      // (isValidating), which never shows a full-page spinner per our convention.
      globalMutate(matcher);
    };

    return () => {
      if (auditTimer.current) clearTimeout(auditTimer.current);
      es.close();
    };
  }, []);

  return { connected };
}
