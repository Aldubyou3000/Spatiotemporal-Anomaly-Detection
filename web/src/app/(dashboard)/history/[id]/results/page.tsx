"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/Button";
import { ZoneResults } from "@/components/zones/ZoneResults";
import { CreateTicketModal } from "@/components/zones/CreateTicketModal";
import { ReviewSaveStatus } from "@/components/history/ReviewSaveStatus";
import { useHistoryResults, useHistoryReviews } from "@/hooks/useHistory";
import { useTicketTechnicians } from "@/hooks/useTechnicians";
import styles from "@/components/history/History.module.css";

export default function SavedResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: result, error, isLoading, mutate } = useHistoryResults(id);
  const state = useHistoryReviews(id);
  const { technicians } = useTicketTechnicians();
  const [ticket, setTicket] = useState<{ station: string; date?: string } | null>(null);
  return <div className={`${styles.page} ${styles.resultsPage}`}><Header
    title={result?.history_title || `Saved run ${id.slice(0, 8)}`}
    parent={<Link href="/history" className="hover:text-text">History</Link>}
    leading={
    <Link className="topbar-btn" href={`/history/${id}`} aria-label="Back to run summary" title="Back to run summary"><ArrowLeft size={14} /></Link>
  } />
    <div className={`dashboard-content ${styles.body} ${styles.resultsBody}`}>
      {!error && !isLoading && result && <ReviewSaveStatus state={state} />}
      {error ? <div className={styles.empty} role="alert"><p>Couldn't load saved results.</p><Button size="sm" onClick={() => void mutate()}>Retry</Button></div>
      : isLoading || !result ? <div className={styles.empty} role="status">Loading saved results…</div> :
        <ZoneResults key={id} result={result} reviews={state.reviews} defaultTab="anomalies" fitViewport
          onReview={state.ready ? state.saveReview : undefined} reviewBusy={state.saving} reviewsReady={state.ready}
          onCreateTicket={(station, date) => setTicket({ station, date })} />}
    </div>
    {ticket && <CreateTicketModal stationId={ticket.station} readingDate={ticket.date} runId={id}
      technicians={technicians} file={null} onClose={() => setTicket(null)} />}
  </div>;
}
