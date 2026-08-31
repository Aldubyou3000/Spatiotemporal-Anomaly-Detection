"use client";

import useSWR from "swr";
import { reportsApi } from "@/lib/api/reports";
import type { InspectionReport } from "@/types/reports";

export function useReports() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["/api/reports"],
    () => reportsApi.list(),
    { keepPreviousData: true, dedupingInterval: 30_000 },
  );
  return {
    pending: data?.pending ?? [],
    followUp: data?.follow_up ?? [],
    approved: data?.approved ?? [],
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
  };
}
