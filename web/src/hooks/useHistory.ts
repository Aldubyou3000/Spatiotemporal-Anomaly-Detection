"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate as globalMutate, preload, unstable_serialize, useSWRConfig } from "swr";
import { historyApi, type HistoryFilters } from "@/lib/api/history";
import type { HistoryRun } from "@/types/history";
import { readingKey, type AnomalyReview, type AnomalyReviews } from "@/lib/anomalyReview";

export function invalidateHistory() {
  return globalMutate((key: unknown) => Array.isArray(key) && typeof key[0] === "string"
    && key[0].startsWith("/api/history") && !key[0].endsWith("/results") && !key[0].endsWith("/reviews"));
}

export function useHistoryList(filters: HistoryFilters) {
  const { mutate } = useSWRConfig();
  const state = useSWR(["/api/history", filters], () => historyApi.list(filters));
  function selectRun(run: HistoryRun) {
    // The list already contains the full summary; refresh it after navigation.
    void mutate([`/api/history/${run.id}`], (current: HistoryRun | undefined) => current ?? run, { revalidate: false });
  }
  return { ...state, selectRun };
}
export function useHistoryRun(id: string) {
  return useSWR([`/api/history/${id}`], () => historyApi.get(id), { keepPreviousData: false, revalidateOnMount: true });
}
export function useHistoryResults(id: string, enabled = true) {
  return useSWR(enabled ? [`/api/history/${id}/results`] : null, () => historyApi.results(id), { keepPreviousData: false, revalidateIfStale: false });
}
export function usePrefetchHistoryResults(id: string) {
  const { cache } = useSWRConfig();
  return () => {
    const key = [`/api/history/${id}/results`];
    const cached = cache.get(unstable_serialize(key))?.data;
    return cached !== undefined ? Promise.resolve(cached) : preload(key, () => historyApi.results(id));
  };
}
export function useHistoryTickets(id: string, offset: number, enabled = true) {
  return useSWR(enabled ? [`/api/history/${id}/tickets`, offset] : null, () => historyApi.tickets(id, offset), { keepPreviousData: false });
}

export function useSaveHistoryRun() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const clearError = useCallback(() => setError(null), []);
  async function save(id: string, title: string) {
    if (lock.current) throw new Error("Please wait for saving to finish.");
    lock.current = true; setSaving(true); setError(null);
    try {
      const result = await historyApi.saveRun(id, title.trim());
      if (!result.history_saved) throw new Error(result.history_error ?? "Couldn't save to History. Please try again.");
      void invalidateHistory();
      return result;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Couldn't save to History. Please try again.";
      setError(message);
      throw new Error(message);
    } finally { lock.current = false; setSaving(false); }
  }
  return { save, saving, error, clearError };
}

export function useHistoryReviews(runId: string | null) {
  const { data, error, isLoading, mutate } = useSWR(runId ? [`/api/history/${runId}/reviews`] : null,
    () => historyApi.reviews(runId!), { keepPreviousData: false, revalidateOnFocus: true });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const reviews = useMemo(() => {
    const out: AnomalyReviews = {};
    for (const row of data ?? []) if (row.status) out[readingKey(row)] = { ...row, status: row.status };
    return out;
  }, [data]);

  async function saveReview(key: string, review: AnomalyReview | null) {
    if (!runId || !data || error) throw new Error("Load the saved reviews before recording a decision.");
    if (lock.current) throw new Error("Please wait for the current decision to save.");
    const [station_id, date] = JSON.parse(key) as [string, string];
    lock.current = true; setSaving(true); setSaveError(null);
    try {
      const saved = await historyApi.review(runId, { station_id, date, status: review?.status ?? null,
        note: review?.note ?? "", expected_revision: data.find((row) => readingKey(row) === key)?.revision ?? 0 });
      await mutate((current) => [...(current ?? []).filter((row) => readingKey(row) !== key), saved], { revalidate: false });
      void invalidateHistory();
      return saved.status ? { ...saved, status: saved.status } : null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Couldn't save this review. Try again.";
      setSaveError(message);
      await mutate().catch(() => undefined);
      throw new Error(message);
    } finally {
      lock.current = false; setSaving(false);
    }
  }
  return { reviews, saveReview, saving, saveError, error, isLoading, ready: !!data && !error, retry: mutate };
}
