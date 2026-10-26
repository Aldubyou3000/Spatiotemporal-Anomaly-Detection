"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Files, Search, Ticket, X } from "lucide-react";
import { Header } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import type { HistoryFilters } from "@/lib/api/history";
import { useHistoryList } from "@/hooks/useHistory";
import { HistoryPagination } from "@/components/history/HistoryPagination";
import styles from "@/components/history/History.module.css";

export default function HistoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<HistoryFilters>({ search: "", start: "", end: "", offset: 0, sort: "latest" });
  const { start, end } = filters;
  useEffect(() => {
    const timer = setTimeout(() => setFilters(current => current.search === search.trim()
      ? current : { ...current, search: search.trim(), offset: 0 }), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, error, isLoading, isValidating, mutate, selectRun } = useHistoryList(filters);
  return <div className={`${styles.page} ${styles.listPage}`}>
    <Header title="History" />
    <div className={`dashboard-content ${styles.body} ${styles.listBody}`}>

      <section className={`${styles.card} ${styles.inbox}`} aria-label="Processing history" aria-busy={isValidating}>
        <div className={styles.inboxHeading}>
          <h2 className={styles.listTitle}><Files size={17} aria-hidden="true" /> Saved runs <span>{data?.total ?? 0}</span></h2>

        </div>
      <div className={styles.toolbar} role="search" aria-label="Filter saved runs">
        <div className={styles.searchField} data-search-field>
          <Search size={16} aria-hidden="true" />
          <input type="search" aria-label="Search saved runs" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved runs…" />
        </div>
        <div className={styles.filters}>
          <div className={styles.dateRange} role="group" aria-label="Processing date range" title="Filter by processing date (Asia/Manila)">
            <label data-filter-field><span>From</span><input aria-label="Processed from" type="date" value={start} max={end || undefined} onChange={(event) => setFilters(current => ({ ...current, start: event.target.value, offset: 0 }))} /></label>
            <label data-filter-field><span>To</span><input aria-label="Processed to" type="date" value={end} min={start || undefined} onChange={(event) => setFilters(current => ({ ...current, end: event.target.value, offset: 0 }))} /></label>
          </div>
          {(search || filters.start || filters.end) && <Button type="button" variant="ghost" onClick={() => {
            setSearch(""); setFilters(current => ({ ...current, search: "", start: "", end: "", offset: 0 }));
          }}><X size={14} /> Clear</Button>}
        </div>
          <div className={styles.listOrder}>
            <Select ariaLabel="Sort saved runs" value={filters.sort} width={140}
              options={[{ value: "latest", label: "Latest first" }, { value: "oldest", label: "Oldest first" }]}
              onChange={value => setFilters(current => ({ ...current, sort: value === "oldest" ? "oldest" : "latest", offset: 0 }))} />
          </div>
      </div>
      {error ? <div className={styles.empty} role="alert"><p>Couldn't load History.</p><Button size="sm" onClick={() => void mutate()}>Retry</Button></div>
      : isLoading && !data ? <div className={styles.empty} role="status">Loading saved runs…</div>
      : !data?.items.length ? <div className={styles.empty}><p>{filters.search || filters.start || filters.end ? "No saved runs match these filters." : "No saved runs yet. Runs you save from Zones will appear here."}</p><Link className={styles.back} href="/zones">Go to Zones →</Link></div>
      : <>
        <div className={`table-heading ${styles.runColumns}`} aria-hidden="true"><span>Run</span><span>Processed by</span><span>Review</span><span>Tickets</span><span>Processed</span><span /></div>
        <ul className={styles.runList} aria-label="Saved processing runs">
          {data.items.map((run) => <li key={run.id}>
            <Link className={styles.runRow} href={`/history/${run.id}`} onClick={() => selectRun(run)}
              onMouseEnter={() => router.prefetch(`/history/${run.id}`)} onFocus={() => router.prefetch(`/history/${run.id}`)}
              title={run.title || run.files[0]?.name || "Processing run"}>
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
                <progress value={run.reviewed_count} max={run.flagged_count} aria-label={`${run.reviewed_count} of ${run.flagged_count} readings reviewed`} />
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
