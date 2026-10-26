"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, BarChart3, Check, Info, Plus, RotateCcw, Save, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { DECISION_LABEL, flaggedReadings, nextPendingReading, readingKey, type AnomalyReview, type AnomalyReviews, type ReviewDecision } from "@/lib/anomalyReview";
import type { UserProfile } from "@/types/auth";
import type { DailyReading, ProcessResult } from "@/types/zones";
import { StationChart } from "./StationChart";
import { DateComparisonChart, type DateComparisonBar } from "./DateComparisonChart";
import styles from "./AnomalyReportTab.module.css";

type Reviewer = Pick<UserProfile, "id" | "full_name" | "username">;
type ReviewFilter = "pending" | "reviewed" | "all";
const LOF_HELP = "LOF (Local Outlier Factor) compares same-day rainfall at nearby stations. Scores near -1 are typical. More negative means more unusual: -3 stands out more than -1. A high reading may be flagged at -2 or lower after other rainfall checks. This is not an accuracy percentage or proof of a faulty sensor.";
const AVERAGE_HELP = "Shows whether this station tends to record more or less rain than its group on checked rainy days. We compare each day, then average the comparisons. The group includes this station and nearby stations. This covers the uploaded period, not just the selected day. It is not an accuracy rating.";
const HIGHEST_HELP = "How often this station recorded more rain than every other station in its group on checked rainy days. Equal readings do not count. For example, 25% means it was highest on about 1 in 4 rainy days checked. Being highest does not automatically mean an anomaly.";
interface AnomalyReportTabProps {
  result: ProcessResult;
  reviews?: AnomalyReviews;
  reviewer?: Reviewer | null;
  onReview?: (key: string, review: AnomalyReview | null) => void | Promise<AnomalyReview | null | void>;
  onCreateTicket?: (stationId: string, date?: string) => void;
  onOpenData?: () => void;
  onSaveRun?: () => void;
  reviewBusy?: boolean;
  fillHeight?: boolean;
  renderTip?: (text: string, label?: string) => ReactNode;
}

function ReviewBadge({ review }: { review?: AnomalyReview }) {
  return <Badge tone={review?.status === "anomaly" ? "danger" : review ? "neutral" : "warning"}>
    {review ? DECISION_LABEL[review.status] : "Needs review"}
  </Badge>;
}

export function AnomalyReportTab({ result, reviews = {}, reviewer, onReview, onCreateTicket, onOpenData, onSaveRun, renderTip, reviewBusy = false, fillHeight = false }: AnomalyReportTabProps) {
  const toast = useToast();
  const events = useMemo(() => flaggedReadings(result.flagged_data), [result.flagged_data]);
  const [mode, setMode] = useState<"high" | "low">(() => events.some((row) => row.is_anomaly) ? "high" : "low");
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("pending");
  const [station, setStation] = useState("");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ row: DailyReading; previous: AnomalyReview | null; applied: AnomalyReview } | null>(null);
  const [compareNeighbors, setCompareNeighbors] = useState(false);
  const [evidenceView, setEvidenceView] = useState<"bar" | "history" | "details">("bar");
  const highCount = events.filter((row) => row.is_anomaly).length;
  const lowCount = events.length - highCount;
  const reviewedCount = events.filter((row) => !!reviews[readingKey(row)]).length;
  const remaining = events.find((row) => !reviews[readingKey(row)]);
  const scoped = events.filter((row) => (mode === "high" ? row.is_anomaly : !row.is_anomaly)
    && (!station || row.station_id === station)
    && (!query.trim() || `${row.station_id} ${row.date}`.toLowerCase().includes(query.trim().toLowerCase())));
  const pendingCount = scoped.filter((row) => !reviews[readingKey(row)]).length;
  const visible = scoped.filter((row) => reviewFilter === "all" || (reviewFilter === "pending" ? !reviews[readingKey(row)] : !!reviews[readingKey(row)]));
  const selected = selectedKey === "" ? undefined : scoped.find((row) => readingKey(row) === selectedKey)
    ?? visible[0];
  const currentKey = selected ? readingKey(selected) : "";
  const queueRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Pin the initial choice before live reviews change the filtered queue.
    if (selectedKey === null && currentKey) setSelectedKey(currentKey);
    const queue = queueRef.current;
    const item = queue?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!queue || !item) return;
    const bounds = queue.getBoundingClientRect();
    const reading = item.getBoundingClientRect();
    if (reading.top < bounds.top) queue.scrollTop += reading.top - bounds.top;
    else if (reading.bottom > bounds.bottom) queue.scrollTop += reading.bottom - bounds.bottom;
  }, [currentKey, selectedKey]);
  const nextKey = nextPendingReading(scoped, reviews, currentKey);
  const undoControl = undo && onReview ? <Button size="sm" variant="ghost"
    disabled={reviewBusy}
    title={`Undo review for ${undo.row.station_id} · ${undo.row.date}`}
    aria-label={`Undo last review for ${undo.row.station_id} on ${undo.row.date}`}
    onClick={async () => {
      const latest = reviews[readingKey(undo.row)];
      if (latest?.reviewed_at !== undo.applied.reviewed_at || latest?.reviewer_id !== undo.applied.reviewer_id || latest?.revision !== undo.applied.revision) {
        toast.error("This decision has changed", { description: "Open the reading to check its latest review." }); setUndo(null); return;
      }
      try { await onReview(readingKey(undo.row), undo.previous); }
      catch (error) { toast.error("Couldn't undo review", { description: error instanceof Error ? error.message : "Try again." }); return; }
      setMode(undo.row.is_anomaly ? "high" : "low");
      setReviewFilter(undo.previous ? "reviewed" : "pending");
      setStation(""); setQuery(""); setSelectedKey(readingKey(undo.row)); setUndo(null);
    }}><RotateCcw size={12} /> Undo</Button> : null;
  const byStation = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    for (const row of result.flagged_data) {
      const days = map.get(row.station_id) ?? {};
      days[row.date] = row.rainfall;
      map.set(row.station_id, days);
    }
    return map;
  }, [result.flagged_data]);
  const neighbors = selected ? result.neighbors?.[selected.station_id] ?? [] : [];
  const bars: DateComparisonBar[] = selected ? [
    { stationId: selected.station_id, rainfall: selected.rainfall, isSelected: true, isAnomaly: true },
    ...neighbors.map((neighbor) => ({ stationId: neighbor.neighbor_id, rainfall: byStation.get(neighbor.neighbor_id)?.[selected.date] ?? null, isSelected: false, isAnomaly: false })),
  ] : [];
  const neighborValues = bars.slice(1).map((bar) => bar.rainfall).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const middle = Math.floor(neighborValues.length / 2);
  const median = neighborValues.length ? (neighborValues.length % 2 ? neighborValues[middle] : (neighborValues[middle - 1] + neighborValues[middle]) / 2) : null;
  const highPattern = result.station_health?.find((row) => row.station_id === selected?.station_id);
  const lowPattern = result.station_stuck_health?.find((row) => row.station_id === selected?.station_id);
  const pattern = mode === "high" ? highPattern : lowPattern;
  const averageDifference = pattern?.bias_ratio != null ? Math.round((pattern.bias_ratio - 1) * 100) : null;
  const history = useMemo(() => result.flagged_data.filter((row) => row.station_id === selected?.station_id)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ date: row.date, rainfall: row.rainfall, is_anomaly: mode === "high" && row.is_anomaly, is_low_anomaly: mode === "low" && !!(row.is_low_anomaly || row.is_dry_stuck) })), [result.flagged_data, selected?.station_id, mode]);

  if (!events.length) return <div className={styles.empty}>
    <p>No flagged readings to review.</p>
    <span>Days without enough nearby readings could not be assessed.</span>
  </div>;

  return <div className={`${styles.report}${fillHeight ? ` ${styles.fit}` : ''}`} style={{ '--review-count-width': `${String(events.length).length}ch` } as CSSProperties}>
    <div className={styles.toolbar}>
      <input data-search-field aria-label="Search station or date" placeholder="Search station or date…" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedKey(null); }} className={styles.search} />
      <div className={styles.reportFilters}>
        <div className={styles.filters} role="group" aria-label="Review status">
          {([['pending', 'Needs review', pendingCount], ['reviewed', 'Reviewed', scoped.length - pendingCount], ['all', 'All', scoped.length]] as const).map(([value, label, count]) =>
            <button key={value} type="button" className={styles.filter} aria-pressed={reviewFilter === value} onClick={() => { setReviewFilter(value); setSelectedKey(null); }}>
              {label} <span>{count}</span>
            </button>)}
        </div>
        {onOpenData && <button type="button" className={styles.openData} onClick={onOpenData}>Open in Data <ArrowRight size={12} /></button>}
        <div className={styles.progress}>
          <span><strong>{reviewedCount}</strong> of {events.length} readings reviewed</span>
          <progress value={reviewedCount} max={events.length} aria-label={`${reviewedCount} of ${events.length} readings reviewed`} />
        </div>
        <div className={`${styles.filters} ${styles.flagFilters}`} role="group" aria-label="System flag type">
          {([['high', 'High', highCount], ['low', 'Low', lowCount]] as const).map(([value, label, count]) =>
            <button key={value} type="button" className={styles.filter} aria-pressed={mode === value} onClick={() => { setMode(value); setSelectedKey(null); }}>
              {label} <span>{count}</span>
            </button>)}
        </div>
        </div>
    </div>
    <div className={styles.workspace}>
      <aside className={styles.queue} aria-label="Flagged readings">
        <div className={styles.queueFilters}>
          <h3>Flagged readings</h3>
          <Select value={station} onChange={(value) => { setStation(value); setSelectedKey(null); }} ariaLabel="Filter by station" width="100%"
            options={[{ value: "", label: "All stations" }, ...Array.from(new Set(events.map((row) => row.station_id))).sort().map((id) => ({ value: id, label: id }))]} />
        </div>
        <div className={styles.queueList} ref={queueRef}>
          {visible.map((row) => {
            const key = readingKey(row);
            return <button key={key} type="button" className={styles.reading} aria-pressed={key === currentKey} onClick={() => setSelectedKey(key)}>
              <span className={styles.station}>{row.station_id}</span>
              <span className={styles.readingMeta}><span>{row.date}</span><span>{row.rainfall.toFixed(1)} mm</span></span>
              {reviewFilter === "pending" ? <span className="sr-only">Needs review</span> : <ReviewBadge review={reviews[key]} />}
            </button>;
          })}
          {!visible.length && <div className={styles.empty}>
            <p>{!scoped.length ? "No matching readings." : reviewFilter === "pending" ? "No pending readings." : "No reviewed readings yet."}</p>
            <Button size="sm" variant="ghost" onClick={() => { setStation(""); setQuery(""); setReviewFilter("all"); setSelectedKey(null); }}>Show all readings</Button>
          </div>}
        </div>
      </aside>
      {selected ? <section className={styles.detail} aria-label="Selected reading">
        <div className={styles.detailHeader}>
          <div className={styles.heading}>
            <h3>{selected.station_id}</h3>
            <div className={styles.readingContext}>
              <time className={styles.readingDate} dateTime={selected.date}>{selected.date}</time>
              <span className={styles.systemFlag}>System flag: <strong>{mode === "high" ? "High reading" : "Low reading"}</strong></span>
            </div>
          </div>
          {onCreateTicket && <Button size="sm" variant="ghost" onClick={() => onCreateTicket(selected.station_id, selected.date)}><Plus size={13} /> Create ticket</Button>}
        </div>
        <div className={styles.comparison}>
          <div className={styles.chartToolbar}>
            <p className={styles.chartTitle}>{evidenceView === "details" ? "Detection details" : <>{evidenceView === "history" ? "Rainfall history" : "Same-day rainfall"} <span>· mm</span></>}</p>
              <div className={styles.filters} role="group" aria-label="Reading evidence view">
                <Button size="sm" variant={evidenceView === "bar" ? "secondary" : "ghost"} aria-label="Show bar graph" aria-pressed={evidenceView === "bar"} onClick={() => setEvidenceView("bar")}><BarChart3 size={13} /> Bar graph</Button>
                <Button size="sm" variant={evidenceView === "history" ? "secondary" : "ghost"} aria-label="Show rainfall history" aria-pressed={evidenceView === "history"} onClick={() => setEvidenceView("history")}><TrendingUp size={13} /> History</Button>
                <Button size="sm" variant={evidenceView === "details" ? "secondary" : "ghost"} aria-label="Show detection details" aria-pressed={evidenceView === "details"} onClick={() => setEvidenceView("details")}><Info size={13} /> Detection details</Button>
              </div>
          </div>
          <div className={styles.evidenceView}>
          {evidenceView !== "details" && <>
          <div className={styles.measurements}><strong>{selected.rainfall.toFixed(1)} <span>mm recorded</span></strong>
            <div className={styles.neighborControls}>
              <span>{median === null ? "Nearby comparison unavailable" : `Nearby typical rainfall: ${Number(median.toFixed(1))} mm`}</span>
              {evidenceView === "history" && <Button size="sm" variant="secondary" aria-pressed={compareNeighbors} disabled={!neighbors.length} onClick={() => setCompareNeighbors((value) => !value)}>
                {compareNeighbors ? <Check size={13} /> : <Users size={13} />} Compare neighbors
              </Button>}
            </div>
          </div>
          {evidenceView === "history" ? <div className={styles.chart}><div className={styles.chartContent}><StationChart data={history} neighbors={compareNeighbors ? neighbors.map((neighbor) => ({ stationId: neighbor.neighbor_id, byDate: byStation.get(neighbor.neighbor_id) ?? {} })) : []}
            height="100%" anomalyColor={mode === "low" ? "var(--teal)" : undefined} anomalyLabel={mode === "low" ? "Low readings" : "High readings"} /></div></div>
          : <div className={`${styles.chart} ${styles.barChart}`} tabIndex={0} role="region" aria-label="Nearby station comparison; scroll horizontally on small screens">
            <div className={styles.chartContent}><DateComparisonChart bars={bars} height="100%" mode={mode} /></div>
          </div>}
          {evidenceView === "bar" && neighborValues.length < neighbors.length && <p className={styles.hint}>Some nearby stations have no reading on this date.</p>}
          </>}
          <div hidden={evidenceView !== "details"}>
          <div className={styles.detectionDetails}>
            <section className={styles.detectionGroup} aria-label="Selected-day evidence">
              <h4>Selected day · {selected.date}</h4>
              <dl className={styles.detectionFacts}>
                <div className={styles.fullFact}><dt>Why flagged</dt><dd>{mode === "high" ? "High reading that stood out from nearby stations." : "Very little rain recorded while nearby stations reported rain."}</dd></div>
                {mode === "high" && <div><dt className={styles.helpLabel} title={renderTip ? undefined : LOF_HELP}>Detection score (LOF){renderTip?.(LOF_HELP, "Explain LOF and the detection score")}</dt><dd>{selected.lof_score?.toFixed(3) ?? "Unavailable"}</dd></div>}
              </dl>
            </section>
            <section className={styles.detectionGroup} aria-label="Station pattern across uploaded dates">
              <h4>Station pattern · all uploaded dates</h4>
              <dl className={styles.detectionFacts}>
                <div><dt>Rainy days checked</dt><dd>{pattern?.rain_days ?? "Unavailable"}</dd></div>
                <div><dt className={styles.helpLabel} title={renderTip ? undefined : AVERAGE_HELP}>Average vs group{renderTip?.(AVERAGE_HELP, "Explain average vs group")}</dt><dd>{averageDifference === null ? "Not enough data" : averageDifference === 0 ? "About the same" : `About ${Math.abs(averageDifference)}% ${averageDifference > 0 ? "higher" : "lower"}`}</dd></div>
                {mode === "high" ? <>
                  <div><dt className={styles.helpLabel} title={renderTip ? undefined : HIGHEST_HELP}>Highest in group{renderTip?.(HIGHEST_HELP, "Explain highest in group")}</dt><dd>{highPattern?.top_rate != null ? <>{Math.round(highPattern.top_rate * 100)}%<span className={styles.valueMeta}> of checked rainy days</span></> : "Not enough data"}</dd></div>
                  <div><dt>Largest flagged reading</dt><dd>{highPattern?.peak_rainfall != null ? <>{highPattern.peak_rainfall.toFixed(1)} mm{highPattern.peak_date && <span className={styles.valueMeta}> · {highPattern.peak_date}</span>}</> : "Unavailable"}</dd></div>
                </> : <>
                  <div><dt>Days with 0–1 mm</dt><dd>{lowPattern && lowPattern.rain_days > 0 ? `${lowPattern.events.length} of ${lowPattern.rain_days} checked rainy days` : "Not enough data"}</dd></div>
                  <div><dt title="Successive assessed rainy days, which may be separated by dry days or gaps. This is not necessarily a run of consecutive calendar days.">Longest low-reading run</dt><dd>{lowPattern?.max_zero_streak != null ? `${lowPattern.max_zero_streak} rainy checks in a row` : "Not enough data"}</dd></div>
                </>}
              </dl>
            </section>
            <p className={styles.detectionNote}>A flag needs review. It does not confirm a sensor fault.</p>
          </div>
          </div>
          </div>
        </div>
        <ReviewActions key={currentKey} row={selected} review={reviews[currentKey]} reviewer={reviewer}
          busy={reviewBusy} onSaveRun={onSaveRun}
          requiresSave={!!result.run_id && result.history_saved === false}
          undoControl={undoControl}
          onSkip={nextKey ? () => { setReviewFilter("pending"); setSelectedKey(nextKey); } : undefined}
          onReview={onReview ? async (key, review) => {
            if (!review) return;
            const applied = await onReview(key, review);
            setUndo({ row: selected, previous: reviews[key] ?? null, applied: applied ?? review });
            setReviewFilter("pending");
            setSelectedKey(nextPendingReading(scoped, { ...reviews, [key]: review }, key) ?? "");
          } : undefined} />
      </section> : <section className={styles.detail}><div className={styles.empty}>
        <p>{scoped.length && !pendingCount ? "All readings in this selection have been reviewed." : "No readings in this view."}</p>
        <div className={styles.completionActions}>
        {remaining && (!pendingCount || selectedKey === "")
          ? <Button size="sm" onClick={() => { setMode(remaining.is_anomaly ? "high" : "low"); setReviewFilter("pending"); setStation(""); setQuery(""); setSelectedKey(readingKey(remaining)); }}>Review remaining readings <ArrowRight size={13} /></Button>
          : <span>{reviewedCount === events.length ? "Open Reviewed to check your decisions, or export results from Data." : "Choose another review tab, station, or search to continue."}</span>}
          {undoControl}
        </div>
      </div></section>}
    </div>
  </div>;
}

function ReviewActions({ row, review, reviewer, onReview, onSkip, onSaveRun, undoControl, busy = false, requiresSave = false }: {
  row: DailyReading;
  review?: AnomalyReview;
  reviewer?: Reviewer | null;
  onReview?: (key: string, review: AnomalyReview | null) => void | Promise<void>;
  busy?: boolean;
  requiresSave?: boolean;
  onSkip?: () => void;
  onSaveRun?: () => void;
  undoControl?: ReactNode;
}) {
  const toast = useToast();
  const [note, setNote] = useState(review?.note ?? "");
  const lastSavedNote = useRef(review?.note ?? "");
  const [decision, setDecision] = useState<{ status: ReviewDecision; note: string; save: NonNullable<typeof onReview> } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const previous = lastSavedNote.current;
    const next = review?.note ?? "";
    lastSavedNote.current = next;
    setNote((draft) => draft === previous ? next : draft);
  }, [review?.note]);
  function confirmDecision(status: ReviewDecision) {
    // Retain the handler's revision snapshot when opening confirmation; SSE must not change its base.
    if (onReview) setDecision({ status, note: note.trim(), save: onReview });
  }
  const enabled = !!(onReview && reviewer?.id) && !requiresSave && !busy && !saving;
  const status = requiresSave ? "Save this run to enable reviews."
    : saving || busy ? "Saving review…"
    : review ? `Reviewed by ${review.reviewed_by} · ${new Date(review.reviewed_at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}`
    : onReview ? "Choose a decision, then confirm." : "Review decisions are unavailable.";
  return <div className={styles.review}>
    <div className={styles.reviewHeading}>
      <h4>Review decision</h4><ReviewBadge review={review} />
      <div className={styles.reviewContext}>
        <p className={styles.hint} role="status" title={status}>{status}</p>
        {requiresSave && onSaveRun && <Button size="sm" variant="primary" onClick={onSaveRun} disabled={busy || saving}><Save size={14} /> Save to History</Button>}
      </div>
    </div>
    <div className={styles.reviewFooter}>
      <div className={styles.note}>
        <label><span className="sr-only">Review note (optional)</span>
          <textarea aria-label="Review note" aria-description="Your note is included when you mark this reading." rows={2} value={note} maxLength={1000} disabled={!enabled} onChange={(event) => setNote(event.target.value)} placeholder="Review note (optional)…" />
        </label>
      </div>
      <div className={styles.actions}>
        <Button className={styles.decisionButton} variant="secondary" size="md" disabled={!enabled || (review?.status === "anomaly" && note.trim() === review.note)} onClick={() => confirmDecision("anomaly")}><AlertTriangle size={16} /> Anomaly</Button>
        <Button className={styles.decisionButton} variant="secondary" size="md" disabled={!enabled || (review?.status === "not_anomaly" && note.trim() === review.note)} onClick={() => confirmDecision("not_anomaly")}><Check size={16} /> Not anomaly</Button>
        <span className={styles.undoSlot}>{undoControl}</span>
        <Button size="sm" variant="ghost" disabled={!onSkip || saving || busy} onClick={onSkip}>{review ? "Next to review" : "Skip for now"} <ArrowRight size={13} /></Button>
      </div>
    </div>
    {decision && <ConfirmDialog title={decision.status === "anomaly" ? "Mark as anomaly?" : "Mark as not anomaly?"}
      message={<>{row.station_id} · {row.date}<br />{row.rainfall.toFixed(1)} mm. Your decision will be included in downloads; the system flag will remain recorded.</>}
      confirmLabel={decision.status === "anomaly" ? "Mark as anomaly" : "Mark as not anomaly"} onCancel={() => setDecision(null)}
      onConfirm={async () => {
        if (!reviewer || !onReview) return;
        setDecision(null);
        setSaving(true);
        try {
          await decision.save(readingKey(row), { status: decision.status, note: decision.note, reviewed_by: reviewer.full_name || reviewer.username, reviewer_id: reviewer.id, reviewed_at: new Date().toISOString() });
          toast.success(`Marked as ${DECISION_LABEL[decision.status].toLowerCase()}`, { description: `${row.station_id} · ${row.date}` });
        } catch (error) {
          toast.error("Couldn't save review", { description: error instanceof Error ? error.message : "Try again." });
        } finally { setSaving(false); }
      }} />}
  </div>;
}
