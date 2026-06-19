"use client";

import useSWR from "swr";
import { ticketsApi } from "@/lib/api/tickets";
import { techniciansApi } from "@/lib/api/technicians";

export function useTicketTechnicians() {
  const { data, error, isLoading } = useSWR(
    ["/api/tickets/technicians"],
    () => ticketsApi.listTechnicians(),
    { dedupingInterval: 30_000 },
  );
  return { technicians: data ?? [], isLoading, error: error as Error | undefined };
}

export function useTechnicianProfiles() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["/api/technicians"],
    () => techniciansApi.list(),
    { dedupingInterval: 30_000 },
  );
  return {
    technicians: data ?? [],
    isLoading,
    isValidating,
    error: error as Error | undefined,
    mutate,
  };
}
