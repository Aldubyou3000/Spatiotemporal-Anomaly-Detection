"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, CalendarDays, ChevronRight, Files, Search, Ticket, X } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/Button";
import { useHistoryList } from "@/hooks/useHistory";
import { HistoryPagination } from "@/components/history/HistoryPagination";
import styles from "@/components/history/History.module.css";

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [filters, setFilters] = useState({ search: "", start: "", end: "", offset: 0 });
  const { data, error, isLoading, isValidating, mutate } = useHistoryList(filters);
  return <div className={`${styles.page} ${styles.listPage}`}>
    <Header title="History" />
    <div className={`${styles.body} ${styles.listBody}`}>
      <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), start, end, offset: 0 }); }}>
        <div className={styles.searchField}>
          <Search size={18} aria-hidden="true" />
          <input aria-label="Search saved runs" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved runs…" />
        </div>
        <div className={styles.filters}>
          <div className={styles.dateRange} role="group" aria-label="Processing date range" title="Filter by processing date (Asia/Manila)">
            <CalendarDays size={15} aria-hidden="true" />
            <input aria-label="Processed from" type="date" value={start} max={end || undefined} onChange={(event) => setStart(event.target.value)} />
            <span aria-hidden="true">–</span>
            <input aria-label="Processed to" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} />
          </div>
          <Button type="submit" loading={isValidating && !isLoading}>Search</Button>
          {(filters.search || filters.start || filters.end) && <Button type="button" variant="ghost" onClick={() => {
            setSearch(""); setStart(""); setEnd(""); setFilters({ search: "", start: "", end: "", offset: 0 });
          }}><X size={14} /> Clear</Button>}
        </div>
      </form>
      <section className={`${styles.card} ${styles.inbox}`} aria-label="Processing history">
        <div className={styles.inboxHeading}>
          <h2 className={styles.listTitle}><Files size={17} aria-hidden="true" /> Saved runs <span>{data?.total ?? 0}</span></h2>
          <span className={styles.listOrder}><ArrowDownWideNarrow size={14} aria-hidden="true" /> Latest first</span>
        </div>
      {error ? <div className={styles.empty} role="alert"><p>Couldn't load History.</p><Button size="sm" onClick={() => void mutate()}>Retry</Button></div>
      : isLoading ? <div className={styles.empty} role="status">Loading saved runs…</div>
      : !data?.items.length ? <div className={styles.empty}><p>{filters.search || filters.start || filters.end ? "No saved runs match these filters." : "No saved runs yet. Runs you save from Zones will appear here."}</p><Link className={styles.back} href="/zones">Go to Zones →</Link></div>
      : <>
        <div className={styles.runColumns} aria-hidden="true"><span>Run</span><span>Processed by</span><span>Review</span><span>Tickets</span><span>Processed</span><span /></div>
        <ul className={styles.runList} aria-label="Saved processing runs">
          {data.items.map((run) => <li key={run.id}>
            <Link className={styles.runRow} href={`/history/${run.id}`} title={run.title || run.files[0]?.name || "Processing run"}>
              <div className={styles.runIdentity}>
                <span className={styles.runIcon}><Files size={18} aria-hidden="true" /></span>
                <div className={styles.runText}>
                  <strong>{run.title || run.files[0]?.name || "Processing run"}</strong>
                  <div className={styles.runMeta}>
                    <span>{run.summary.total_stations} stations · {run.files.length} {run.files.length === 1 ? "file" : "files"}</span>
                    <span>Rainfall: {run.summary.date_range_start ?? "—"} – {run.summary.date_range_end ?? "—"}</span>
                  </div>
                </div>
              </div>
              <div className={styles.runAuthor}><span className="sr-only">Processed by </span>{run.processed_by_name}</div>
              <div className={styles.runReview}>{run.flagged_count ? <>
                <span className={styles.reviewState} data-complete={run.reviewed_count >= run.flagged_count}>{run.reviewed_count === 0 ? "Not started" : run.reviewed_count >= run.flagged_count ? "Complete" : `${run.flagged_count - run.reviewed_count} remaining`}</span>
                <small>{run.reviewed_count} of {run.flagged_count} reviewed</small>
              </> : <small>No flags to review</small>}</div>
              <div className={styles.runTickets}>{run.open_tickets + run.verified_tickets + run.cancelled_tickets ? <>
                <span><Ticket size={13} aria-hidden="true" />{run.open_tickets} open</span>
                <small>{run.verified_tickets} verified{run.cancelled_tickets > 0 && ` · ${run.cancelled_tickets} cancelled`}</small>
              </> : <small>No tickets</small>}</div>
              <div className={styles.runProcessed}>
                <time dateTime={run.processed_at}>{new Date(run.processed_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}</time>
                <small>{new Date(run.processed_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" })}</small>
              </div>
              <ChevronRight className={styles.rowChevron} size={15} aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      </>}
        <HistoryPagination total={data?.total ?? 0} offset={filters.offset} onChange={(offset) => setFilters((current) => ({ ...current, offset }))} />
      </section>
    </div>
  </div>;
}
