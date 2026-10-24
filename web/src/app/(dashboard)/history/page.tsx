"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
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
  return <div className={styles.page}>
    <Header title="History" />
    <div className={styles.body}><section className={styles.card} aria-label="Processing history">
      <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); setFilters({ search: search.trim(), start, end, offset: 0 }); }}>
        <h2 className={styles.listTitle}>Saved runs <span>{data?.total ?? 0}</span></h2>
        <div className={styles.filters}>
        <div className={styles.searchField}>
          <Search size={13} aria-hidden="true" />
          <input aria-label="Search saved runs" value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} placeholder="Search runs…" />
        </div>
        <div className={styles.dateRange} role="group" aria-label="Processing date range" title="Filter by processing date">
          <input aria-label="Processed from" type="date" value={start} max={end || undefined} onChange={(event) => setStart(event.target.value)} />
          <span aria-hidden="true">–</span>
          <input aria-label="Processed to" type="date" value={end} min={start || undefined} onChange={(event) => setEnd(event.target.value)} />
        </div>
        <Button type="submit" size="sm" style={{ height: 30 }} loading={isValidating && !isLoading}>Search</Button>
        {(filters.search || filters.start || filters.end) && <Button type="button" variant="ghost" size="sm" onClick={() => {
          setSearch(""); setStart(""); setEnd(""); setFilters({ search: "", start: "", end: "", offset: 0 });
        }}><X size={12} /> Clear</Button>}
        </div>
      </form>
      {error ? <div className={styles.empty} role="alert"><p>Couldn't load History.</p><Button size="sm" onClick={() => void mutate()}>Retry</Button></div>
      : isLoading ? <div className={styles.empty} role="status">Loading saved runs…</div>
      : !data?.items.length ? <div className={styles.empty}><p>{filters.search || filters.start || filters.end ? "No saved runs match these filters." : "No saved runs yet. Runs you save from Zones will appear here."}</p><Link className={styles.back} href="/zones">Go to Zones →</Link></div>
      : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.runTable}`}>
        <colgroup><col style={{ width: "36%" }} /><col style={{ width: "15%" }} /><col style={{ width: "13%" }} /><col style={{ width: "14%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /></colgroup>
        <thead><tr><th scope="col">Run</th><th scope="col">Processed</th><th scope="col">Processed by</th><th scope="col">Review</th><th scope="col">Tickets</th><th scope="col"><span className="sr-only">Open run</span></th></tr></thead>
        <tbody>{data.items.map((run) => <tr key={run.id}>
          <td>
            <Link className={styles.runLink} href={`/history/${run.id}`} title={run.title || run.files[0]?.name || "Processing run"}>
              {run.title || run.files[0]?.name || "Processing run"}
            </Link>
            <small>{run.summary.total_stations} stations · {run.files.length} {run.files.length === 1 ? "file" : "files"}</small>
            <small>Rainfall: {run.summary.date_range_start ?? "—"} – {run.summary.date_range_end ?? "—"}</small>
          </td>
          <td className={styles.nowrap}><time dateTime={run.processed_at}>{new Date(run.processed_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}</time><small>{new Date(run.processed_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" })}</small></td>
          <td>{run.processed_by_name}</td>
          <td>{run.flagged_count ? <><strong>{run.reviewed_count} of {run.flagged_count}</strong><small>{run.reviewed_count === 0 ? "Not started" : run.reviewed_count >= run.flagged_count ? "Complete" : `${run.flagged_count - run.reviewed_count} remaining`}</small></> : <span className={styles.muted}>No flags to review</span>}</td>
          <td className={styles.nowrap}>{run.open_tickets + run.verified_tickets + run.cancelled_tickets ? <>{run.open_tickets} open<small>{run.verified_tickets} verified{run.cancelled_tickets > 0 && ` · ${run.cancelled_tickets} cancelled`}</small></> : <span className={styles.muted}>No tickets</span>}</td>
          <td className={styles.nowrap}><Link className={styles.openLink} href={`/history/${run.id}`} aria-label={`View run for ${run.title || run.files[0]?.name || "dataset"}, processed ${run.processed_at}`}>Open <ChevronRight size={13} aria-hidden="true" /></Link></td>
        </tr>)}</tbody>
      </table></div>}
      <HistoryPagination total={data?.total ?? 0} offset={filters.offset} onChange={(offset) => setFilters((current) => ({ ...current, offset }))} />
    </section></div>
  </div>;
}
