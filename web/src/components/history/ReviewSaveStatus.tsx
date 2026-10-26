"use client";
import { Button } from "@/components/ui/Button";
import type { useHistoryReviews } from "@/hooks/useHistory";
import styles from "./History.module.css";

export function ReviewSaveStatus({ state }: { state: ReturnType<typeof useHistoryReviews> }) {
  return <div className={state.error || state.saveError ? styles.saveWarning : "sr-only"} role="status">
    <span>{state.error ? "Couldn't load saved reviews." : state.saveError ?? (state.saving ? "Saving review…" : state.ready ? "Reviews saved" : "Loading saved reviews…")}</span>
    {state.error && <Button size="sm" onClick={() => void state.retry()}>Retry</Button>}
  </div>;
}
