"use client";

import useSWR from "swr";
import { auditApi } from "@/lib/api/audit";
import type { AuditFilters } from "@/lib/api/audit";

export function useAuditLogs(filters: AuditFilters, limit: number, offset: number) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["/api/audit", { ...filters, limit, offset }],
    () => auditApi.list(filters, limit, offset),
    { keepPreviousData: true, revalidateOnFocus: false },
  );
  return {
    entries: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isValidating,
    error: error as Error | undefined,
    refresh: mutate,
  };
}

export function useAuditStats() {
  const { data, isLoading } = useSWR(
    ["/api/audit/stats"],
    () => auditApi.stats(),
    { dedupingInterval: 120_000, revalidateOnFocus: false },
  );
  return { stats: data?.slice(0, 6) ?? [], isLoading };
}
