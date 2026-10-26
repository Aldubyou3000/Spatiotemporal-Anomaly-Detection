"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Database, AlertTriangle, Gauge, HelpCircle, MapPin, ChevronDown, ChevronUp, Layers, Flag } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InfoTip as HelpTip } from "@/components/zones/InfoTip";
import { NeighborGroupsTab } from "@/components/zones/NeighborGroupsTab";
import { Tabs, TabsList, Tab, TabPanel } from "@/components/ui/Tabs";
import { REVIEW_STATUS, overallReviewStatus, highReview, lowReview } from "@/lib/stationReview";
import type { ProcessResult, HealthStatus, QualityReport } from "@/types/zones";
import styles from "./OverviewTab.module.css";

const StationMap = dynamic(() => import("./StationMap").then((m) => m.StationMap), {
  ssr: false,
  loading: () => (
    <div style={{ flex: 1, borderRadius: "var(--r-lg)", background: "var(--surface-sunken)", display: "grid", placeItems: "center" }}>
      <p style={{ fontSize: "var(--font-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>Loading map…</p>
    </div>
  ),
});

// ─── Info Tooltip ─────────────────────────────────────────────────────────────
// Portalled + viewport-clamped so it never clips inside cards with overflow:hidden
// (Station Review Summary, Data Quality) or near the viewport edge (right-aligned help icons).
function InfoTip({ text }: { text: string }) {
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const tip = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 230;
    const half = W / 2;
    const margin = 10;
    // Clamp horizontal so 230px tooltip never spills off-screen; keeps right-edge
    // help icons (Station Review Summary > Key > ?) fully readable.
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    // Flip below the icon when there is no room above (e.g. sticky header)
    const estH = 76;
    const showBelow = pos.y < estH + 12;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-xs)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {text}
      </span>,
      document.body,
    );
  })();
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setPos(null)}
    >
      <HelpCircle size={12} strokeWidth={2} style={{ color: "var(--text-tertiary)", cursor: "help", flexShrink: 0 }} />
      {tip}
    </span>
  );
}

// Generic inline tip — any element (badge, dot+label) becomes the hover target.
function InlineTip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  function handleMouseEnter(e: React.MouseEvent<HTMLSpanElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, h: r.height });
  }
  const portal = (() => {
    if (!pos || typeof document === "undefined" || typeof window === "undefined") return null;
    const W = 230;
    const half = W / 2;
    const margin = 10;
    const minLeft = margin + half;
    const maxLeft = window.innerWidth - margin - half;
    const left = Math.max(minLeft, Math.min(pos.x, maxLeft));
    const estH = 56;
    const showBelow = pos.y < estH + 12;
    const top = showBelow ? pos.y + pos.h + 8 : pos.y - 8;
    const transform = showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)";
    return createPortal(
      <span
        style={{
          position: "fixed",
          left,
          top,
          transform,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: "8px 12px",
          fontSize: "var(--font-xs)",
          fontWeight: 400,
          color: "var(--text)",
          lineHeight: 1.6,
          whiteSpace: "normal",
          width: W,
          maxWidth: `calc(100vw - ${margin * 2}px)`,
          boxShadow: "var(--shadow-lg)",
          zIndex: 9999,
          pointerEvents: "none",
          letterSpacing: "0.01em",
        }}
      >
        {tip}
      </span>,
      document.body,
    );
  })();
  return (
    <span style={{ display: "inline-flex" }} onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {portal}
    </span>
  );
}

interface IssueRowProps {
  label: string;
  value: number;
  unit: "rows" | "stations";
  desc: string;
  tip: string;
}

function QualityReportCard({
  quality_report: qr,
}: {
  quality_report: QualityReport;
}) {
  const [showAllChecks, setShowAllChecks] = useState(false);

  const hourlyTotal =
    qr.exclusion_details.multi_hour_gaps +
    qr.exclusion_details.hourly_starts_with_nan +
    qr.exclusion_details.hourly_ends_with_nan +
    qr.exclusion_details.hourly_duplicates;
  const dailyTotal =
    (qr.exclusion_details.incomplete_days ?? 0) +
    qr.exclusion_details.multi_day_gaps +
    qr.exclusion_details.starts_with_nan +
    qr.exclusion_details.ends_with_nan +
    qr.exclusion_details.duplicates;
  const stationTotal =
    qr.exclusion_details.insufficient_readings_stations +
    qr.exclusion_details.zero_valid_stations;

  const hasExclusions = hourlyTotal > 0 || dailyTotal > 0 || stationTotal > 0 || qr.stations_excluded > 0;

  const issuesForExpand: { section: string; rows: IssueRowProps[] }[] = [
    {
      section: "Hourly readings",
      rows: [
        { label: "Missing 2+ hours", value: qr.exclusion_details.multi_hour_gaps, unit: "rows", desc: "Not used for daily total — gap too long", tip: "Readings during 2+ consecutive missing hours can't make a reliable daily total. Single missing hours are filled automatically." },
        { label: "Missing at start", value: qr.exclusion_details.hourly_starts_with_nan, unit: "rows", desc: "Missing at beginning — not totaled", tip: "Leading missing hourly readings can't be totaled into a daily value." },
        { label: "Missing at end", value: qr.exclusion_details.hourly_ends_with_nan, unit: "rows", desc: "Missing at end — not totaled", tip: "Trailing missing hourly readings can't be totaled." },
        { label: "Duplicate hour", value: qr.exclusion_details.hourly_duplicates, unit: "rows", desc: "Same hour listed twice — kept first", tip: "Same station + hour appeared more than once; extras were dropped." },
      ],
    },
    {
      section: "Daily readings",
      rows: [
        { label: "Incomplete day", value: qr.exclusion_details.incomplete_days ?? 0, unit: "rows", desc: "Not used — incomplete daily total", tip: "Hourly days need one usable reading for each of all 24 hours after allowed single-hour interpolation. Partial daily totals are excluded before detection." },
        { label: "Missing 2+ days", value: qr.exclusion_details.multi_day_gaps, unit: "rows", desc: "Additional daily gaps removed", tip: "Additional daily rows removed after hourly cleaning. Fully missing days can already have disappeared during hourly cleaning; zero here does not mean all calendar days were recorded." },
        { label: "Missing at start", value: qr.exclusion_details.starts_with_nan, unit: "rows", desc: "Missing at beginning", tip: "Leading missing daily rows are not used." },
        { label: "Missing at end", value: qr.exclusion_details.ends_with_nan, unit: "rows", desc: "Missing at end", tip: "Trailing missing daily rows are not used." },
        { label: "Duplicate day", value: qr.exclusion_details.duplicates, unit: "rows", desc: "Same station + day twice — kept first", tip: "Extra entries for the same station on the same day were removed." },
      ],
    },
    {
      section: "Stations",
      rows: [
        { label: "Less than 2 usable days", value: qr.exclusion_details.insufficient_readings_stations, unit: "stations", desc: "Too few usable days — station not included", tip: "This station had fewer than 2 usable daily readings after cleaning." },
        { label: "No usable readings", value: qr.exclusion_details.zero_valid_stations, unit: "stations", desc: "No usable daily data — station not included", tip: "This station had no usable daily totals after completeness checks." },
      ],
    },
  ];
  const zeroChecks = issuesForExpand.flatMap(group => group.rows).filter(row => row.value === 0).length;

  function IssueRow({ label, value, unit, desc, tip }: IssueRowProps) {
    return (
      <div className={styles.qualityRow} data-empty={value === 0}>
        <div className={styles.rowBody}>
          <div className={styles.rowTitle}>
            {label}<HelpTip label={`About ${label.toLowerCase()}`} text={`${desc}. ${tip}`} />
          </div>
        </div>
        <span className={styles.rowValue}>
          {value.toLocaleString()} <span>{unit}</span>
        </span>
      </div>
    );
  }

  return (
    <section className={styles.qualityCard} aria-label="Data quality checks">
      <div className={styles.reviewHeader}>
        <Database size={15} aria-hidden="true" />
        <h3>Data quality</h3>
        <HelpTip text="Cleaning before detection. Hourly daily totals need all 24 hours after allowed interpolation. Exclusions are grouped by hourly readings, daily readings and stations; these are different units and should not be added together." />
      </div>
      <p className={styles.sectionIntro}>{hasExclusions ? "Exclusions before detection, grouped by check." : "No exclusions recorded."}</p>
      <dl className={styles.qualityTotals}>
        <div><dt>Hourly rows excluded</dt><dd>{hourlyTotal.toLocaleString()}</dd></div>
        <div><dt>Daily rows excluded</dt><dd>{dailyTotal.toLocaleString()}</dd></div>
        <div><dt>Stations excluded</dt><dd>{(qr.stations_excluded || stationTotal).toLocaleString()}</dd></div>
      </dl>
      {qr.rows_filled > 0 && <p className={styles.fillNote}>{qr.rows_filled.toLocaleString()} hourly gaps filled<HelpTip text="Single missing hours were estimated. This count includes estimates in days that were later excluded." /></p>}
      {issuesForExpand.map(({ section, rows }) => {
        const visible = showAllChecks ? rows : rows.filter(row => row.value > 0);
        return visible.length > 0 && <div key={section} className={styles.qualityGroup}>
          <h4>{section}</h4>
          {visible.map(row => <IssueRow key={row.label} {...row} />)}
        </div>;
      })}
      {zeroChecks > 0 && <div className={styles.reviewFooter}>
        <Button variant="ghost" size="sm" aria-expanded={showAllChecks} onClick={() => setShowAllChecks(value => !value)}>
          {showAllChecks ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showAllChecks ? "Show affected checks only" : `Show ${zeroChecks} checks with no findings`}
        </Button>
      </div>}
    </section>
  );
}

// ── Station review: keep daily flags separate from the overall warning ──────
function StationReviewCard({ result, selectedStationId, onSelectStation }: {
  result: ProcessResult;
  selectedStationId?: string;
  onSelectStation?: (stationId: string) => void;
}) {
  const rows = useMemo(() => {
    const highs = new Map((result.station_health ?? []).map((h) => [h.station_id, h]));
    const lows = new Map((result.station_stuck_health ?? []).map((h) => [h.station_id, h]));
    const highCounts = new Map((result.anomaly_summary ?? []).map((s) => [s.station_id, s.events.filter((e) => !e.is_low).length]));
    const lowCounts = new Map((result.dry_stuck_summary ?? []).map((s) => [s.station_id, s.stuck_count]));
    const ids = new Set(result.flagged_data.map((r) => r.station_id));
    for (const id of highs.keys()) ids.add(id);
    for (const id of lows.keys()) ids.add(id);
    const order = { suspect: 0, watch: 1, insufficient_data: 2, normal: 3 };
    return [...ids].map((id) => {
      const high = highs.get(id);
      const low = lows.get(id);
      const status = overallReviewStatus(high?.status, low?.status);
      return { id, high, low, status, highCount: highCounts.get(id) ?? high?.times_flagged ?? 0, lowCount: lowCounts.get(id) ?? low?.events.length ?? 0 };
    }).sort((a, b) => order[a.status] - order[b.status] || a.id.localeCompare(b.id));
  }, [result]);
  const warnings = rows.filter((r) => r.status === "watch" || r.status === "suspect").length;
  const limited = rows.filter((r) => r.status === "insufficient_data").length;

  return (
    <section aria-label="Station Review Summary" className={styles.reviewCard}>
      <div className={styles.reviewHeader}>
        <Gauge size={15} aria-hidden="true" />
        <h3>Station summary</h3>
        <HelpTip label="About station summary" text="Select a station name to locate it on the map. Checks highlight repeated high or low readings and large flagged readings; these are reasons to review a station, not proof of a sensor fault. Flagged days still need review in Review Readings." />
        <span className={styles.headerMeta}>{warnings} warnings{limited > 0 ? ` · ${limited} with limited data` : ""}</span>
      </div>
      {rows.length === 0 && <p style={{ margin: "var(--pad-y) 0", fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>No stations to assess.</p>}
      <div className={styles.reviewList}>{rows.map((r) => {
        const badge = REVIEW_STATUS[r.status];
        const high = highReview(r.high);
        const low = lowReview(r.low);
        const highWarning = r.high?.status === "suspect" || r.high?.status === "watch";
        const lowWarning = r.low?.status === "suspect" || r.low?.status === "watch";
        const detail = [highWarning ? high.detail : "", lowWarning ? low.detail : ""].filter(Boolean).join(" ")
          || (r.status === "insufficient_data" ? "More rainy-day readings are needed to assess this station." : "No repeated warning found. Review any flagged days.");
        return (
          <div key={r.id} title={`${high.tip} ${low.tip}`} className={styles.reviewRow} data-selected={selectedStationId === r.id}>
            <div className={styles.rowBody}>
              <div className={styles.rowTitle}>
                <button type="button" className={styles.stationLink} aria-pressed={selectedStationId === r.id}
                  disabled={!result.flagged_data.some(row => row.station_id === r.id && Number.isFinite(row.latitude) && Number.isFinite(row.longitude))}
                  aria-label={`Locate ${r.id} on map`} onClick={() => onSelectStation?.(r.id)}>{r.id}</button>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </div>
              <p className={styles.stationCounts}>Flagged days: {r.highCount} high · {r.lowCount} low</p>
              <p className={styles.rowDescription}>{detail}</p>
            </div>
          </div>
        );
      })}</div>
    </section>
  );
}

interface OverviewTabProps {
  result: ProcessResult;
  fillHeight?: boolean;
  onReviewReadings?: () => void;
  defaultSection?: string;
}

export function OverviewTab({ result, fillHeight = false, onReviewReadings, defaultSection = "overview" }: OverviewTabProps) {
  const { summary, flagged_data, quality_report } = result;
  const [section, setSection] = useState(defaultSection);
  const [selectedStationId, setSelectedStationId] = useState<string>();
  const neighborStationIds = Object.keys(result.neighbors).sort((a, b) => a.localeCompare(b));
  const neighborStation = selectedStationId && neighborStationIds.includes(selectedStationId) ? selectedStationId : neighborStationIds[0];
  const highlightedStationIds = useMemo(() => section === "neighbors" && neighborStation
    ? (result.neighbors[neighborStation] ?? []).map(row => row.neighbor_id) : [], [section, neighborStation, result.neighbors]);
  const warningCount = useMemo(() => {
    const high = new Map((result.station_health ?? []).map(row => [row.station_id, row.status]));
    const low = new Map((result.station_stuck_health ?? []).map(row => [row.station_id, row.status]));
    return [...new Set([...high.keys(), ...low.keys()])].filter(id => {
      const status = overallReviewStatus(high.get(id), low.get(id));
      return status === "watch" || status === "suspect";
    }).length;
  }, [result.station_health, result.station_stuck_health]);

  const stationPoints = useMemo(() => {
    // Sensor status per station — same rule as the card, so dot + badge share one hue.
    const healthById = new Map<string, HealthStatus>();
    for (const h of result.station_health ?? []) healthById.set(h.station_id, h.status);
    const stuckById = new Map<string, HealthStatus>();
    for (const s of result.station_stuck_health ?? []) stuckById.set(s.station_id, s.status);
    function gaugeFor(id: string): "suspect" | "watch" | "normal" | "insufficient_data" {
      return overallReviewStatus(healthById.get(id), stuckById.get(id));
    }
    const totals = new Map<string, { lat: number; lon: number; readings: number; anomalies: number }>();
    for (const row of flagged_data) {
      if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue;
      const t = totals.get(row.station_id) ?? { lat: row.latitude, lon: row.longitude, readings: 0, anomalies: 0 };
      t.readings += 1;
      if (row.is_anomaly || (row as any).is_low_anomaly) t.anomalies += 1;
      totals.set(row.station_id, t);
    }
    return Array.from(totals, ([station_id, v]) => ({
      station_id, latitude: v.lat, longitude: v.lon,
      total_readings: v.readings, anomaly_count: v.anomalies,
      gaugeStatus: gaugeFor(station_id),
    }));
  }, [flagged_data, result.station_health, result.station_stuck_health]);

  const statCards: {
    label: string;
    value: string;
    hint: string;
    tip: string;
    Icon: typeof Database;
  }[] = [
    {
      label: "Rows processed",
      value: summary.total_rows.toLocaleString(),
      hint: `of ${quality_report.total_input_rows.toLocaleString()} input`,
      tip: "Daily readings used after all quality checks. Failed rows aren't counted.",
      Icon: Layers,
    },
    {
      label: "Stations",
      value: String(summary.total_stations),
      hint: `${quality_report.stations_excluded} excluded`,
      tip: "Stations included. Those with too little usable data are excluded first.",
      Icon: MapPin,
    },
    {
      label: "Anomalies",
      value: summary.total_anomalies.toLocaleString(),
      hint: `${summary.anomaly_rate}% of readings`,
      tip: "Readings flagged as notably high vs neighbors that same day.",
      Icon: AlertTriangle,
    },
    {
      label: "Stations flagged",
      value: String(summary.anomalous_stations),
      hint: `${summary.processing_time_seconds.toFixed(1)}s runtime`,
      tip: "Distinct stations with at least one flagged day.",
      Icon: Flag,
    },
  ];

  return (
    <div className={`${styles.workspace}${fillHeight ? ` ${styles.fillHeight}` : ""}`}>
        <section className={styles.mapPanel} aria-label="Station map">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={14} strokeWidth={2.2} style={{ color: "var(--text-secondary)" }} />
              <span style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)" }}>Station Map</span>
              <span style={{ color: "var(--text-tertiary)" }}>·</span>
              <span style={{ fontSize: "var(--font-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{stationPoints.length} stations</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--font-xs)", color: "var(--text-secondary)" }}>
              <InlineTip tip="No flagged days — this station tracked its 3 nearest neighbors. Dots are green; station review summary in the popup may still show Monitor/Needs attention.">
                <span style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
                  <span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--success)", flexShrink: 0 }} />
                  Typical
                </span>
              </InlineTip>
              <InlineTip tip="At least one flagged day vs neighbors on that day — red dot with halo. Check Station summary and Review Readings for details.">
                <span style={{ display: "flex", alignItems: "center", gap: 4, cursor: "help" }}>
                  <span style={{ height: 7, width: 7, borderRadius: "50%", background: "var(--danger)", flexShrink: 0 }} />
                  Flagged
                </span>
              </InlineTip>
            </div>
          </div>
          <div style={{ padding: 10, flex: 1, display: "flex", minHeight: 0 }}>
            <StationMap stations={stationPoints} selectedStationId={section === "neighbors" ? neighborStation : selectedStationId} highlightedStationIds={highlightedStationIds} height="100%" style={{ flex: 1 }} />
          </div>
        </section>

        <Tabs defaultValue="overview" value={section} onValueChange={setSection} className={styles.details}>
          <div className={styles.sectionNavigation} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
            const index = tabs.indexOf(event.target as HTMLButtonElement);
            if (index < 0) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            tabs[next].focus(); tabs[next].click();
          }}>
            <TabsList className={styles.sectionTabs}>
              <Tab value="overview">Overview</Tab>
              <Tab value="stations">Station summary <span className={styles.warningCount} aria-label={`${warningCount} station warnings`}>{warningCount}</span></Tab>
              <Tab value="neighbors">Nearby stations</Tab>
              <Tab value="quality">Data quality</Tab>
            </TabsList>
          </div>
          <TabPanel value="overview" keepMounted className={styles.sectionContent}>
          <div className={styles.summary}>
          <dl className={styles.metrics}>
            {statCards.map(({ label, value, hint, tip, Icon }) => (
              <div key={label}>
                <dt>
                  <span className="stat-watermark" aria-hidden="true"><Icon size={64} strokeWidth={2.35} /></span>
                  <span className={styles.metricLabel}>{label}<InfoTip text={tip} /></span>
                </dt>
                <dd>{value}<small>{hint}</small></dd>
              </div>
            ))}
          </dl>

          <section className={styles.runDetails} aria-label="Run details">
          <div className={styles.dateRange}>
            <div className={styles.sectionLabel}><Clock size={14} aria-hidden="true" />Date range<InfoTip text="Earliest and latest dates in your cleaned CSV." /></div>
            <p>
              <time dateTime={summary.date_range_start ?? undefined}>{summary.date_range_start ?? "—"}</time>
              <span aria-hidden="true">–</span><span className="sr-only">to</span>
              <time dateTime={summary.date_range_end ?? undefined}>{summary.date_range_end ?? "—"}</time>
            </p>
          </div>

          <div className={styles.qualityOverview}>
            <div className={styles.sectionLabel}><Database size={14} aria-hidden="true" />Data quality</div>
            <p>{quality_report.rows_excluded.toLocaleString()} rows excluded · {quality_report.rows_filled.toLocaleString()} hourly gaps filled{quality_report.stations_excluded > 0 ? ` · ${quality_report.stations_excluded} stations excluded` : ""}</p>
          </div>
          <div className={styles.nextSteps}>
            <p>{warningCount > 0 ? `${warningCount} station ${warningCount === 1 ? "warning" : "warnings"}. See Station summary for details.` : "Review flagged readings to confirm the findings."}</p>
            {onReviewReadings && <Button variant="secondary" size="sm" onClick={onReviewReadings}>Review flagged readings →</Button>}
          </div>
          </section>
          </div>
          </TabPanel>
          <TabPanel value="stations" keepMounted className={styles.sectionContent}>
            <StationReviewCard result={result} selectedStationId={selectedStationId} onSelectStation={setSelectedStationId} />
          </TabPanel>
          <TabPanel value="neighbors" keepMounted className={styles.sectionContent}>
            <NeighborGroupsTab neighbors={result.neighbors} selectedStationId={neighborStation} onSelectStation={setSelectedStationId} />
          </TabPanel>
          <TabPanel value="quality" keepMounted className={styles.sectionContent}>
            <QualityReportCard quality_report={quality_report} />
          </TabPanel>
        </Tabs>
    </div>
  );
}
