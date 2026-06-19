"use client";

import useSWR from "swr";
import { reportsApi } from "@/lib/api/reports";
import type { InspectionReport } from "@/types/reports";

export function useReports() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["/api/reports"],
    () => reportsApi.list(),
    { keepPreviousData: true },
  );
  return {
    pending: data?.pending ?? [],
    followUp: data?.follow_up ?? [],
    approved: data?.approved ?? [],
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
    optimisticApprove: (updated: InspectionReport) =>
      mutate(
        (cur) =>
          cur
            ? {
                pending: cur.pending.filter((r) => r.id !== updated.id),
                follow_up: cur.follow_up ?? [],
                approved: [updated, ...cur.approved],
              }
            : cur,
        { revalidate: true },
      ),
    optimisticFollowUp: (ticketId: string) =>
      mutate(
        (cur) =>
          cur
            ? {
                pending: cur.pending.filter((r) => r.ticket_id !== ticketId),
                follow_up: [
                  ...(cur.follow_up ?? []),
                  ...(cur.pending.filter((r) => r.ticket_id === ticketId)),
                ],
                approved: cur.approved,
              }
            : cur,
        { revalidate: true },
      ),
  };
}
