"use client";

import type { ReactNode } from "react";
import { Check, HelpCircle, Loader2 } from "lucide-react";
import type { ProcessResult, PipelineProgress } from "@/types/zones";
import styles from "./PipelineDiagram.module.css";

export function PipelineDiagram({ running, result, progress, renderTip }: { running: boolean; result: ProcessResult | null; progress?: PipelineProgress | null; renderTip?: (text: string) => ReactNode }) {
  const complete = !running && result !== null;
  const stages = [
    { title: "Zone A", subtitle: "Data cleaning", description: "Validation & daily totals", tip: "Prepares your CSV: checks dates and rainfall, builds daily totals, and handles tiny gaps automatically.", count: result?.cleaned_data.length, unit: "daily readings" },
    { title: "Zone B", subtitle: "Spatial grouping", description: "Nearby station groups", tip: "Stations are grouped so each reading is compared to nearby stations on the same day.", count: result ? Object.keys(result.neighbors).length : undefined, unit: "station groups" },
    { title: "Zone C", subtitle: "Anomaly detection", description: "Per-day comparison", tip: "Compares each day's readings with nearby stations and flags unusual rainfall for review.", count: result?.flagged_data.filter((r) => r.is_anomaly || r.is_low_anomaly).length, unit: "flagged readings" },
  ];
  const stageIds = ["zone_a", "zone_b", "zone_c"];
  const activeIndex = progress?.stage === "finalizing" ? 3 : stageIds.indexOf(progress?.stage ?? "preparing");
  const stationIds = progress?.station_ids ?? [];
  const activity = activeIndex === 3 ? "Preparing your results…" : activeIndex < 0 ? "Reading station files…" : `${stages[activeIndex].title} · ${stages[activeIndex].subtitle}`;

  return <div>
    {running && <p className={styles.activity} role="status" aria-live="polite">{activity}</p>}
    {running && <div className={styles.progress} role="progressbar" aria-label="Rainfall detection in progress"><span /></div>}
    {complete && <p className={styles.status} role="status">All three steps are complete.</p>}
    <ol className={styles.summary} aria-label="Detection steps" role="list" aria-busy={running}>
      {stages.map((stage, index) => {
        const state = complete || (running && index < activeIndex) ? "done" : running && index === activeIndex ? "active" : running ? "pending" : undefined;
        return <li key={stage.title} data-state={state} aria-current={state === "active" ? "step" : undefined}>
        <span className={styles.zone} data-zone={stage.title}>{stage.title}</span>
        <div className={styles.stepTitle}>{stage.subtitle}{renderTip ? renderTip(stage.tip) : <span title={stage.tip}><HelpCircle size={13} /></span>}
          {state && <span className={styles.stepState}>
            {state === "done" ? <Check size={14} aria-hidden="true" /> : state === "active" ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : null}
            {state === "done" ? "Complete" : state === "active" ? "In progress" : "Waiting"}
          </span>}
        </div>
        <p>{complete && stage.count != null ? `${stage.count.toLocaleString()} ${stage.unit}` : stage.description}</p>
        {state === "active" && stationIds.length > 0 && <div className={styles.stationList} aria-label="Stations being processed">
          {stationIds.slice(0, 6).map(station => <span key={station} title={station}>{station}</span>)}
          {stationIds.length > 6 && <span>+{stationIds.length - 6} more</span>}
        </div>}
      </li>; })}
    </ol>
  </div>;
}
