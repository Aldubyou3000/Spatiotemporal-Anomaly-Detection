"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Download, LayoutGrid, Table2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createPortal } from "react-dom";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/Tabs";
import { DataTable, type FilterField } from "@/components/zones/DataTable";
import { OverviewTab } from "@/components/zones/OverviewTab";
import { AnomalyReportTab } from "@/components/zones/AnomalyReportTab";
import { InfoTip } from "@/components/zones/InfoTip";
import { DECISION_LABEL, exportReviewedReadings, flaggedReadings, type AnomalyReview, type AnomalyReviews } from "@/lib/anomalyReview";
import type { ProcessResult } from "@/types/zones";
import styles from './ZoneResults.module.css';

function ExportMenu({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!position) return;
    popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    function outside(event: Event) {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setPosition(null); trigger.current?.focus(); }
    }
    function close() { setPosition(null); }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position]);
  return <div className={styles.exportControl}>
    <Button ref={trigger} type="button" variant="secondary" size="md" aria-expanded={!!position} aria-controls={position ? id : undefined}
      onClick={() => {
        const rect = trigger.current!.getBoundingClientRect();
        setPosition(position ? null : { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
      }}><Download size={16} aria-hidden="true" /><span>Export</span><ChevronDown size={14} aria-hidden="true" /></Button>
    {position && createPortal(<div ref={popup} id={id} role="group" aria-label="CSV exports" className={styles.exportMenu} style={position}
      onClick={event => {
        if ((event.target as HTMLElement).closest('button:not(:disabled)')) { setPosition(null); trigger.current?.focus(); }
      }}>{children}</div>, document.body)}
  </div>;
}

export function ZoneResults({ result, reviews = {}, onReview, onCreateTicket, onSaveRun, defaultTab = "overview", reviewBusy = false, reviewsReady = true, fitViewport = false }: {
  result: ProcessResult; reviews?: AnomalyReviews;
  onReview?: (key: string, review: AnomalyReview | null) => void | Promise<AnomalyReview | null | void>;
  onCreateTicket?: (stationId: string, date?: string) => void;
  onSaveRun?: () => void;
  defaultTab?: string; reviewBusy?: boolean; reviewsReady?: boolean;
  fitViewport?: boolean;
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(defaultTab === "raw" || defaultTab === "cleaned" ? "data" : defaultTab === "neighbors" ? "overview" : defaultTab);
  const [dataView, setDataView] = useState<"raw" | "cleaned" | "flagged">(defaultTab === "raw" ? "raw" : "cleaned");
  const reviewedRows = useMemo(() => exportReviewedReadings(result.flagged_data, reviews), [result.flagged_data, reviews]);
  const reportRows = useMemo(() => exportReviewedReadings(flaggedReadings(result.flagged_data), reviews), [result.flagged_data, reviews]);
  const cleanedColumns = useMemo(() => [
    { key: "station_id" as const, header: "Station", width: "20%" },
    { key: "date" as const, header: "Date", width: "16%" },
    { key: "latitude" as const, header: "Latitude", mono: true, align: "right" as const, width: "14%" },
    { key: "longitude" as const, header: "Longitude", mono: true, align: "right" as const, width: "14%" },
    { key: "rainfall" as const, header: "Rainfall (mm)", mono: true, align: "right" as const, width: "14%" },
    {
      key: "interpolated_flag" as const, header: "Gap filled", align: "center" as const,
      render: (value: unknown) => value
        ? <Badge tone="warning">Filled</Badge>
        : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
  ], []);

  const flaggedColumns = useMemo(() => [
    { key: "station_id" as const, header: "Station", width: "16%" },
    { key: "date" as const, header: "Date", width: "14%" },
    { key: "rainfall" as const, header: "Rainfall (mm)", mono: true, align: "right" as const, width: "14%" },
    {
      key: "lof_score" as const, header: "LOF score", mono: true, align: "right" as const,
      render: (v: unknown) => typeof v === "number" ? v.toFixed(3) : <span style={{ color: "var(--text-tertiary)" }}>—</span>,
    },
    {
      key: "is_anomaly" as const, header: "System flag", align: "center" as const,
      render: (v: unknown) => v
        ? <Badge tone="danger">High</Badge>
        : <Badge tone="teal">Low</Badge>,
    },
    { key: "review_status" as const, header: "Analyst review", render: (value: unknown) => <Badge tone={value === "anomaly" ? "danger" : value === "needs_review" ? "warning" : "neutral"}>{value === "needs_review" ? "Needs review" : DECISION_LABEL[value as keyof typeof DECISION_LABEL]}</Badge> },
  ], []);

  const rawColumns = useMemo(() => {
    if (result.raw_preview.length === 0) return [];
    const sample = result.raw_preview[0];
    const HEADER_MAP: Record<string, string> = {
      station_id: "Station",
      date: "Date",
      latitude: "Latitude",
      longitude: "Longitude",
      rainfall: "Rainfall (mm)",
      rainfall_mm: "Rainfall (mm)",
    };
    return Object.keys(sample).map((k) => ({
      key: k as keyof typeof sample & string,
      header: HEADER_MAP[k] ?? k,
      align: ["latitude", "longitude", "rainfall", "rainfall_mm"].includes(k) || typeof sample[k] === "number" ? ("right" as const) : ("left" as const),
    }));
  }, [result.raw_preview]);

  // Raw table: prefer station/date columns; fall back to all string-valued columns
  const rawSearchKeys = useMemo(() => {
    if (result.raw_preview.length === 0) return undefined;
    const sample = result.raw_preview[0];
    const keys = Object.keys(sample);
    const preferred = keys.filter(
      (k) => k === "station_id" || k === "date" ||
             k.toLowerCase().includes("station") ||
             k.toLowerCase().includes("date"),
    );
    if (preferred.length > 0) return preferred as (keyof Record<string, unknown> & string)[];
    // Fall back to columns whose values are strings
    return keys.filter((k) => typeof sample[k] === "string") as (keyof Record<string, unknown> & string)[];
  }, [result.raw_preview]);

  const cleanedFilterFields = useMemo<FilterField[]>(() => [
    {
      key: "interpolated_flag",
      label: "All readings",
      type: "select",
      options: [
        { value: "true",  label: "Gap filled" },
        { value: "false", label: "As recorded" },
      ],
    },
  ], []);

  const flaggedFilterFields = useMemo<FilterField[]>(() => [
    {
      key: "review_status",
      label: "All reviews",
      type: "select",
      options: [
        { value: "needs_review", label: "Needs review" },
        { value: "anomaly", label: "Anomaly" },
        { value: "not_anomaly", label: "Not anomaly" },
      ],
    },
  ], []);


  return (
    <section className={`results-workspace${fitViewport ? ` ${styles.viewport}` : ''}`}>
      <Tabs defaultValue={defaultTab} value={activeTab} onValueChange={setActiveTab} className={fitViewport ? styles.tabs : undefined}>
        <div className={styles.navigation}>
          <TabsList className={styles.tabList}>
            <Tab value="overview" icon={<LayoutGrid size={13} strokeWidth={2.4} />}>Overview</Tab>
            <Tab value="data" icon={<Table2 size={13} strokeWidth={2.4} />}>Data</Tab>
            <Tab value="anomalies" icon={<AlertTriangle size={13} strokeWidth={2.4} />}>Review Readings</Tab>
          </TabsList>
        </div>
        <div className={styles.content}>
          <TabPanel value="overview" className={`${styles.panel} ${styles.overview}`}><OverviewTab key={result.run_id ?? result.processed_at} result={result} fillHeight={fitViewport} defaultSection={defaultTab === "neighbors" ? "neighbors" : "overview"} onReviewReadings={() => setActiveTab("anomalies")} /></TabPanel>
          <TabPanel value="data" className={styles.panel} keepMounted>
            <div className={styles.dataToolbar}>
              <div className={styles.dataSwitch} role="group" aria-label="Data version">
                {(["raw", "cleaned", "flagged"] as const).map(view => <button key={view} type="button" aria-pressed={dataView === view} onClick={() => setDataView(view)}>
                  {view === "raw" ? "Raw" : view === "cleaned" ? "Cleaned" : "Flagged readings"}
                </button>)}
              </div>
              <p>{dataView === "raw" ? "Uploaded readings before cleaning." : dataView === "cleaned" ? "Validated daily readings used for detection." : "System-flagged readings and analyst decisions."}</p>
              {activeTab === "data" && <ExportMenu>
                <button type="button" className="menu-item" onClick={() => import("@/lib/csv").then(m => m.downloadCsv("cleaned_data.csv", result.cleaned_data as unknown as Record<string, unknown>[]))}>Cleaned data CSV</button>
                <button type="button" className="menu-item" disabled={!reviewsReady || reviewBusy}
                  title="All daily readings, original system flags, and analyst review decisions"
                  onClick={() => import("@/lib/csv").then(m => m.downloadCsv("reviewed_results.csv", reviewedRows))}>Results with reviews CSV</button>
              </ExportMenu>}
            </div>
            <DataTable<Record<string, unknown>>
              data={(dataView === "raw" ? result.raw_preview : dataView === "cleaned" ? result.cleaned_data : reportRows) as unknown as Record<string, unknown>[]}
              columns={dataView === "raw" ? rawColumns : dataView === "cleaned" ? cleanedColumns : flaggedColumns} pageSize={10}
              caption={dataView === "raw"
                ? `${result.raw_preview.length.toLocaleString()} of ${result.raw_total_rows.toLocaleString()} uploaded rows`
                : dataView === "cleaned" ? `After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`
                : `${reportRows.length.toLocaleString()} flagged readings · ${!reviewsReady ? "Loading reviews…" : reviewBusy ? "Saving reviews…" : "Includes high and low flags"}`}
              emptyMessage={dataView === "raw" ? "No rows in the uploaded file." : dataView === "cleaned" ? "No validated daily readings." : "No flagged readings to list."}
              searchKeys={dataView === "raw" ? rawSearchKeys : ["station_id", "date"]}
              filterFields={dataView === "cleaned" ? cleanedFilterFields : dataView === "flagged" ? flaggedFilterFields : undefined} />
          </TabPanel>
          <TabPanel value="anomalies" className={styles.anomalies}>
            <AnomalyReportTab key={result.run_id ?? result.processed_at} result={result} reviews={reviews} reviewer={user} onReview={onReview} onSaveRun={onSaveRun} reviewBusy={reviewBusy} onCreateTicket={onCreateTicket} fillHeight={fitViewport} renderTip={(text, label) => <InfoTip text={text} label={label} />}
              onOpenData={() => { setDataView("flagged"); setActiveTab("data"); }} />

          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}
