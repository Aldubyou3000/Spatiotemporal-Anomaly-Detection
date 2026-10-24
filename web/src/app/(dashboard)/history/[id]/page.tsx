"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useHistoryRun, useHistoryTickets } from "@/hooks/useHistory";
import { historyApi } from "@/lib/api/history";
import { exportReviewedReadings, readingKey, type AnomalyReviews } from "@/lib/anomalyReview";
import { downloadCsv } from "@/lib/csv";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/ticketStatus";
import { HistoryPagination } from "@/components/history/HistoryPagination";
import styles from "@/components/history/History.module.css";

function displayDate(value: string) {
  return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: run, error, isLoading, mutate } = useHistoryRun(id);
  const [offset, setOffset] = useState(0);
  const tickets = useHistoryTickets(id, offset);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();
  async function download() {
    setDownloading(true);
    try {
      const [result, rows] = await Promise.all([historyApi.results(id), historyApi.reviews(id)]);
      const reviews: AnomalyReviews = {};
      for (const row of rows) if (row.status) reviews[readingKey(row)] = { ...row, status: row.status };
      downloadCsv(`results_${id}.csv`, exportReviewedReadings(result.flagged_data, reviews));
    } catch (cause) { toast.error("Couldn't download results", { description: cause instanceof Error ? cause.message : "Please try again." }); }
    finally { setDownloading(false); }
  }
  return <div className={styles.page}><Header title="History" />
    <div className={styles.body}>
      <Link className={styles.back} href="/history"><ArrowLeft size={14} /> All runs</Link>
      {error ? <div className={styles.empty} role="alert"><p>Couldn't load this saved run.</p><Button size="sm" onClick={() => void mutate()}>Retry</Button></div>
      : isLoading || !run ? <div className={styles.empty} role="status">Loading saved run…</div> : <>
        <section className={styles.card}>
          <div className={styles.heading}><div>
            <h2>{run.title || <>{run.files[0]?.name ?? "Processing run"}{run.files.length > 1 && ` +${run.files.length - 1} files`}</>}</h2>
            <p>Processed by <strong>{run.processed_by_name}</strong> · {displayDate(run.processed_at)}</p>
            <p>Rainfall dates: {run.summary.date_range_start ?? "—"} – {run.summary.date_range_end ?? "—"}</p>
          </div><div className={styles.actions}>
            <Button size="sm" loading={downloading} onClick={download}><Download size={14} /> Results CSV</Button>
            <Link className="export-btn export-btn--primary" href={`/history/${id}/results`}>Open results →</Link>
          </div></div>
          <dl className={styles.metrics}>
            <div><dt>Stations</dt><dd>{run.summary.total_stations}</dd></div>
            <div><dt>Usable daily readings</dt><dd>{run.summary.total_rows.toLocaleString()}</dd></div>
            <div><dt>High flags</dt><dd>{run.summary.total_high_anomalies}</dd></div>
            <div><dt>Low flags</dt><dd>{run.summary.total_low_anomalies}</dd></div>
          </dl>
          <div className={styles.section}>
            <h3>Analyst review · {run.reviewed_count} of {run.flagged_count}</h3>
            {run.flagged_count > 0 ? <><progress value={run.reviewed_count} max={run.flagged_count} aria-label="Reviewed readings" />
              <p>{run.confirmed_count} marked anomaly · {run.dismissed_count} marked not anomaly · {Math.max(0, run.flagged_count - run.reviewed_count)} need review</p></>
              : <p>No flagged readings to review. Days without enough nearby readings may be unassessed.</p>}
          </div>
          <details className={styles.disclosure}><summary>Files and processing details</summary>
            {run.files.map((file, index) => <p className={styles.file} key={`${index}-${file.sha256}`}><strong>{file.name}</strong> · {Math.max(1, Math.round(file.size / 1024))} KB</p>)}
            <dl><dt>Stations</dt><dd>{run.station_ids.join(", ")}</dd>
              <dt>Excluded stations</dt><dd>{run.quality_report.stations_excluded}</dd>
              <dt>Excluded rows</dt><dd>{run.quality_report.rows_excluded.toLocaleString()}</dd>
              <dt>Estimated hours</dt><dd>{run.quality_report.rows_filled.toLocaleString()}</dd>
              <dt>Cleaning summary</dt><dd>{run.quality_report.summary_text}</dd>
              <dt>Processing version</dt><dd>{run.algorithm_version}</dd>
            </dl>
          </details>
        </section>
        <section className={styles.card} aria-label="Related tickets">
          <div className={styles.heading}><div><h2>Related tickets</h2><p>{run.open_tickets} open · {run.verified_tickets} verified{run.cancelled_tickets > 0 && ` · ${run.cancelled_tickets} cancelled`}</p></div></div>
          {tickets.error ? <div className={styles.empty} role="alert"><p>Couldn't load related tickets.</p><Button size="sm" onClick={() => void tickets.mutate()}>Retry</Button></div>
          : tickets.isLoading ? <div className={styles.empty}>Loading tickets…</div>
          : !tickets.data?.items.length ? <div className={styles.empty}>No tickets linked to this run. You can create one while reviewing its results.</div>
          : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Ticket / station</th><th scope="col">Assigned technicians</th><th scope="col">Inspection report</th><th scope="col">Status</th></tr></thead>
            <tbody>{tickets.data.items.map((ticket) => <tr key={ticket.id}>
              <td><Link href={`/tickets?ticket=${ticket.id}`}>TKT-{ticket.ticket_number} · {ticket.title}</Link><small>{ticket.station_id}{ticket.reading_date && ` · ${ticket.reading_date}`}</small></td>
              <td>{ticket.technicians.map((tech) => tech.full_name || tech.username).join(", ") || "Unassigned"}</td>
              <td>{ticket.inspection?.submitted_at ? <>
                {ticket.inspection.profiles?.full_name || ticket.inspection.profiles?.username || "Technician"}
                <small>Submitted {displayDate(ticket.inspection.submitted_at)} · Round {ticket.inspection.round}</small>
                {ticket.inspection.analyst_approved_at && <small>Approved{ticket.inspection.approver && ` by ${ticket.inspection.approver.full_name || ticket.inspection.approver.username}`} · {displayDate(ticket.inspection.analyst_approved_at)}</small>}
              </> : <span className={styles.muted}>No report submitted</span>}</td>
              <td><Badge tone={STATUS_TONE[ticket.status]}>{STATUS_LABEL[ticket.status]}</Badge></td>
            </tr>)}</tbody>
          </table></div>}
          <HistoryPagination total={tickets.data?.total ?? 0} offset={offset} onChange={setOffset} />
        </section>
      </>}
    </div>
  </div>;
}
