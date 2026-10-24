"use client";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronDown, ChevronUp, Compass, Download, LayoutGrid, Table2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Badge } from "@/components/ui/Badge";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/Tabs";
import { DataTable, type FilterField } from "@/components/zones/DataTable";
import { OverviewTab } from "@/components/zones/OverviewTab";
import { NeighborGroupsTab } from "@/components/zones/NeighborGroupsTab";
import { AnomalyReportTab } from "@/components/zones/AnomalyReportTab";
import { InfoTip } from "@/components/zones/InfoTip";
import { DECISION_LABEL, exportReviewedReadings, flaggedReadings, type AnomalyReview, type AnomalyReviews, type ReviewedReading } from "@/lib/anomalyReview";
import type { DailyReading, ProcessResult } from "@/types/zones";
import { cn } from "@/lib/cn";
function FullAnomalyTable({
  data,
  columns,
  searchKeys,
  filterFields,
  downloadReady,
}: {
  data: ReviewedReading[];
  columns: { key: keyof ReviewedReading & string; header: string; mono?: boolean; width?: string; align?: "left" | "right" | "center"; render?: (value: unknown) => React.ReactNode }[];
  searchKeys: (keyof ReviewedReading & string)[];
  filterFields: FilterField[];
  downloadReady: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (data.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: "var(--font-xs)", fontWeight: 500, color: "var(--text-secondary)",
          background: "var(--surface-sunken)", border: "1px solid var(--border)", borderRadius: "var(--r-full)",
          padding: "5px 12px", cursor: "pointer",
        }}
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? "Hide full table" : `View full table — ${data.length} rows`}
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <DataTable<ReviewedReading>
            data={data} columns={columns} pageSize={10}
            caption="System-flagged readings and analyst reviews" emptyMessage="No flagged readings to list."
            onDownload={downloadReady ? () => import("@/lib/csv").then((m) => m.downloadCsv("reviewed_anomalies.csv", data)) : undefined}
            downloadLabel="Download with reviews"
            searchKeys={searchKeys}
            filterFields={filterFields}
          />
        </div>
      )}
    </div>
  );
}

export function ZoneResults({ result, reviews = {}, onReview, onCreateTicket, defaultTab = "overview", reviewBusy = false, reviewsReady = true }: {
  result: ProcessResult; reviews?: AnomalyReviews;
  onReview?: (key: string, review: AnomalyReview | null) => void | Promise<AnomalyReview | null | void>;
  onCreateTicket?: (stationId: string, date?: string) => void;
  defaultTab?: string; reviewBusy?: boolean; reviewsReady?: boolean;
}) {
  const { user } = useAuth();
  const reviewedRows = useMemo(() => exportReviewedReadings(result.flagged_data, reviews), [result.flagged_data, reviews]);
  const reportRows = useMemo(() => exportReviewedReadings(flaggedReadings(result.flagged_data), reviews), [result.flagged_data, reviews]);
  const cleanedColumns = useMemo(() => [
    { key: "station_id" as const, header: "Station", mono: true, width: "20%" },
    { key: "date" as const, header: "Date", mono: true, width: "16%" },
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
    { key: "station_id" as const, header: "Station", mono: true, width: "16%" },
    { key: "date" as const, header: "Date", mono: true, width: "14%" },
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
      mono: true,
      align: typeof sample[k] === "number" ? ("right" as const) : ("left" as const),
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
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", padding: 4, boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
      <Tabs defaultValue={defaultTab}>
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
          <TabsList className="px-4 pt-3" style={{ borderBottom: "none" }}>
            <Tab value="overview" icon={<LayoutGrid size={13} strokeWidth={2.4} />}>Overview &amp; Map</Tab>
            <Tab value="raw" icon={<Table2 size={13} strokeWidth={2.4} />}>Raw Data</Tab>
            <Tab value="cleaned" icon={<Activity size={13} strokeWidth={2.4} />}>Cleaned Data</Tab>
            <Tab value="neighbors" icon={<Compass size={13} strokeWidth={2.4} />}>Neighbor Groups</Tab>
            <Tab value="anomalies" icon={<AlertTriangle size={13} strokeWidth={2.4} />}>Anomaly Report</Tab>
          </TabsList>
          {/* Export buttons — pushed right, never forcing tab overflow */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 8, marginLeft: "auto", flexShrink: 0 }}>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("cleaned_data.csv", result.cleaned_data as unknown as Record<string, unknown>[]))}
              className="export-btn"
            >
              <Download size={12} strokeWidth={2.2} />
              Cleaned CSV
            </button>
            <button
              onClick={() => import("@/lib/csv").then((m) => m.downloadCsv("reviewed_results.csv", reviewedRows))}
              disabled={!reviewsReady || reviewBusy}
              title="All daily readings, original system flags, and analyst review decisions"
              className="export-btn export-btn--primary"
            >
              <Download size={12} strokeWidth={2.2} />
              Results CSV
            </button>
          </div>
        </div>
        <div className={cn("px-5 pb-5")}>
          <TabPanel value="overview"><OverviewTab result={result} /></TabPanel>
          <TabPanel value="raw" className="pt-6">
            <DataTable data={result.raw_preview} columns={rawColumns} pageSize={10}
              caption={<>All <span className="font-mono tabular">{result.raw_total_rows.toLocaleString()}</span> uploaded rows</>}
              emptyMessage="No rows in the uploaded file."
              searchKeys={rawSearchKeys} />
          </TabPanel>
          <TabPanel value="cleaned" className="pt-6">
            <DataTable<DailyReading> data={result.cleaned_data} columns={cleanedColumns} pageSize={10}
              caption={`After Zone A — ${result.cleaned_data.length.toLocaleString()} validated daily readings`}
              searchKeys={["station_id", "date"]}
              filterFields={cleanedFilterFields} />
          </TabPanel>
          <TabPanel value="neighbors"><NeighborGroupsTab neighbors={result.neighbors} /></TabPanel>
          <TabPanel value="anomalies">
            <AnomalyReportTab key={result.run_id ?? result.processed_at} result={result} reviews={reviews} reviewer={user} onReview={onReview} reviewBusy={reviewBusy} onCreateTicket={onCreateTicket} renderTip={(text, label) => <InfoTip text={text} label={label} />} />
            <FullAnomalyTable data={reportRows} columns={flaggedColumns} searchKeys={["station_id", "date"]} filterFields={flaggedFilterFields} downloadReady={reviewsReady && !reviewBusy} />
          </TabPanel>
        </div>
      </Tabs>
    </section>
  );
}
