"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, LayoutGrid, Table2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/Tabs";
import { DataTable, type FilterField } from "@/components/zones/DataTable";
import { AnomalyReportTab } from "@/components/zones/AnomalyReportTab";
import { InfoTip } from "@/components/zones/InfoTip";
import { DECISION_LABEL, exportReviewedReadings, flaggedReadings, omitLofScores, type AnomalyReview, type AnomalyReviews } from "@/lib/anomalyReview";
import type { ProcessResult } from "@/types/zones";
import styles from './ZoneResults.module.css';

const OverviewTab = dynamic(() => import("@/components/zones/OverviewTab").then(module => module.OverviewTab), {
  loading: () => <div role="status">Loading overview…</div>,
});

export function ZoneResults({ result, reviews = {}, onReview, onCreateTicket, onSaveRun, defaultTab = "overview", reviewBusy = false, reviewsReady = true, fitViewport = false }: {
  result: ProcessResult; reviews?: AnomalyReviews;
  onReview?: (key: string, review: AnomalyReview | null) => void | Promise<AnomalyReview | null | void>;
  onCreateTicket?: (stationId: string, date?: string) => void;
  onSaveRun?: () => void;
  defaultTab?: string; reviewBusy?: boolean; reviewsReady?: boolean;
  fitViewport?: boolean;
}) {
  const { user } = useAuth();
  const [activeTab, setTab] = useState(defaultTab === "raw" || defaultTab === "cleaned" ? "data" : defaultTab === "neighbors" ? "overview" : defaultTab);
  const [dataVisited, setDataVisited] = useState(activeTab === "data");
  function setActiveTab(tab: string) {
    if (tab === "data") setDataVisited(true);
    setTab(tab);
  }
  const [dataView, setDataView] = useState<"raw" | "cleaned" | "flagged">(defaultTab === "raw" ? "raw" : "cleaned");
  const reportRows = useMemo(() => dataVisited && dataView === "flagged"
    ? exportReviewedReadings(flaggedReadings(result.flagged_data), reviews) : [], [result.flagged_data, reviews, dataVisited, dataView]);
  const rawRows = useMemo(() => dataVisited && dataView === "raw"
    ? result.raw_preview.map(omitLofScores) : [], [result.raw_preview, dataVisited, dataView]);
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
      key: "is_anomaly" as const, header: "System flag", align: "center" as const,
      render: (v: unknown) => v
        ? <Badge tone="danger">High</Badge>
        : <Badge tone="teal">Low</Badge>,
    },
    { key: "review_status" as const, header: "Analyst review", render: (value: unknown) => <Badge tone={value === "anomaly" ? "danger" : value === "needs_review" ? "warning" : "neutral"}>{value === "needs_review" ? "Needs review" : DECISION_LABEL[value as keyof typeof DECISION_LABEL]}</Badge> },
  ], []);

  const rawColumns = useMemo(() => {
    if (rawRows.length === 0) return [];
    const sample = rawRows[0];
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
  }, [rawRows]);

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
          <TabPanel value="data" className={styles.panel} keepMounted={dataVisited}>
            <div className={styles.dataToolbar}>
              <div className={styles.dataSwitch} role="group" aria-label="Data version">
                {(["raw", "cleaned", "flagged"] as const).map(view => <button key={view} type="button" aria-pressed={dataView === view} onClick={() => setDataView(view)}>
                  {view === "raw" ? "Raw" : view === "cleaned" ? "Cleaned" : "Flagged readings"}
                </button>)}
              </div>
              <p>{dataView === "raw" ? "Uploaded readings before cleaning." : dataView === "cleaned" ? "Validated daily readings used for detection." : "System-flagged readings and analyst decisions."}</p>
            </div>
            <DataTable<Record<string, unknown>>
              data={(dataView === "raw" ? rawRows : dataView === "cleaned" ? result.cleaned_data : reportRows) as unknown as Record<string, unknown>[]}
              columns={dataView === "raw" ? rawColumns : dataView === "cleaned" ? cleanedColumns : flaggedColumns} pageSize={10}
              onDownload={activeTab === "data" ? rows => import("@/lib/csv").then(m => m.downloadCsv(
                dataView === "raw" ? "raw_preview.csv" : dataView === "cleaned" ? "cleaned_data.csv" : "flagged_readings.csv",
                dataView === "cleaned" ? rows.map(omitLofScores) : rows,
              )) : undefined}
              downloadLabel={`Export ${dataView === "raw" ? "raw preview" : dataView === "cleaned" ? "cleaned" : "flagged readings"} CSV`}
              downloadDisabled={dataView === "flagged" && (!reviewsReady || reviewBusy)}
              caption={dataView === "raw"
                ? `${result.raw_preview.length.toLocaleString()} of ${result.raw_total_rows.toLocaleString()} uploaded rows (preview only)`
                : dataView === "cleaned" ? `After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`
                : `${reportRows.length.toLocaleString()} flagged readings · ${!reviewsReady ? "Loading reviews…" : reviewBusy ? "Saving reviews…" : "Includes high and low flags"}`}
              emptyMessage={dataView === "raw" ? "No rows in the uploaded file." : dataView === "cleaned" ? "No validated daily readings." : "No flagged readings to list."}
              searchPlaceholder={dataView === "raw" ? "Search preview rows…" : "Search readings…"}
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
