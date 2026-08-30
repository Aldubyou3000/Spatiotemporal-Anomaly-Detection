"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { ticketsApi } from "@/lib/api/tickets";
import type { TicketAttachment, TicketDetail } from "@/types/tickets";

export function useTicketList(params: { status?: string; priority?: string; station_id?: string }) {
  const key = ["/api/tickets", {
    status: params.status ?? null,
    priority: params.priority ?? null,
    station_id: params.station_id ?? null,
  }];
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    () => ticketsApi.list({
      status: params.status || undefined,
      priority: params.priority || undefined,
      station_id: params.station_id || undefined,
      limit: 50,
    }),
    { dedupingInterval: 8_000 },
  );
  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
  };
}

export function useTicketDetail(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? [`/api/tickets/${id}`] : null,
    () => ticketsApi.get(id!),
    { dedupingInterval: 10_000, revalidateOnFocus: false },
  );
  return {
    // When no ticket is selected (id === null) SWR retains the last `data`, so
    // we must explicitly null it out — otherwise deselecting leaves the detail
    // panel showing the previously-opened ticket.
    ticket: id ? (data ?? null) : null,
    isLoading: id ? isLoading : false,
    error: id ? (error as Error | undefined) : undefined,
    updateCache: (updated: TicketDetail) => mutate(updated, { revalidate: false }),
  };
}

export function useTicketReport(ticketId: string | null) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ticketId ? [`/api/tickets/${ticketId}/report`] : null,
    () => ticketsApi.report(ticketId!),
    { dedupingInterval: 30_000, revalidateOnFocus: false },
  );
  return {
    // `report` stays the active round so the approval flow (report.id) is unchanged.
    report: data?.current ?? null,
    priorRounds: data?.history ?? [], // archived rounds, oldest-first
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
  };
}

export function useTicketAttachments(ticketId: string | null) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ticketId ? [`/api/tickets/${ticketId}/attachments`] : null,
    () => ticketsApi.attachments(ticketId!),
    { dedupingInterval: 30_000, revalidateOnFocus: false },
  );
  return { attachments: (data ?? []) as TicketAttachment[], isLoading, isValidating, error: error as Error | undefined, refresh: mutate };
}

export function invalidateTicketLists() {
  // Prefix match — covers list ["/api/tickets",{…}], detail ["/api/tickets/<id>"],
  // report/attachments, and technicians summary.
  return globalMutate((key: unknown) => Array.isArray(key) && typeof key[0] === "string" && (key[0] as string).startsWith("/api/tickets"));
}

export function invalidateReports() {
  return globalMutate((key: unknown) => Array.isArray(key) && typeof key[0] === "string" && (key[0] as string).startsWith("/api/reports"));
}

export function invalidateTechnicians() {
  return globalMutate((key: unknown) => Array.isArray(key) && typeof key[0] === "string" && ((key[0] as string).startsWith("/api/technicians") || (key[0] as string).startsWith("/api/tickets/technicians")));
}
