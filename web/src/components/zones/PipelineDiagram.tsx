"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Clock, HelpCircle, MapPin } from "lucide-react";
import type { ProcessResult } from "@/types/zones";

export function PipelineDiagram({ running, result, renderTip }: { running: boolean; result: ProcessResult | null; renderTip?: (text: string) => ReactNode }) {
  const [activeStage, setActiveStage] = useState(0);
  useEffect(() => {
    setActiveStage(0);
    if (!running) return;
    // Visual sequence only: the API reports final completion, not individual steps.
    const zoneB = setTimeout(() => setActiveStage(1), 3000);
    const zoneC = setTimeout(() => setActiveStage(2), 6000);
    return () => {
      clearTimeout(zoneB);
      clearTimeout(zoneC);
    };
  }, [running]);
  const complete = !running && result !== null;
  const stages = [
    { title: "Zone A", subtitle: "Data Cleaning", description: "Validation & daily totals", tip: "Prepares your CSV: checks dates and rainfall, builds daily totals, and handles tiny gaps automatically.", icon: CheckCircle2, color: "var(--success)", soft: "var(--success-soft)", on: "var(--success-on)", count: result?.cleaned_data.length, unit: "daily readings" },
    { title: "Zone B", subtitle: "Spatial Grouping", description: "Nearby station groups", tip: "Stations are grouped so each reading is compared to nearby stations on the same day.", icon: Clock, color: "var(--warning)", soft: "var(--warning-soft)", on: "var(--warning-on)", count: result ? Object.keys(result.neighbors).length : undefined, unit: "station groups" },
    { title: "Zone C", subtitle: "Anomaly Detection", description: "Per-day comparison", tip: "Compares each day's readings with nearby stations and flags unusual rainfall for review.", icon: MapPin, color: "var(--danger)", soft: "var(--danger-soft)", on: "var(--danger-on)", count: result?.flagged_data.filter((r) => r.is_anomaly || r.is_low_anomaly).length, unit: "flagged readings" },
  ];

  return (
    <div aria-busy={running} style={{ padding: "20px 24px 24px" }}>
      <style>{`
        @keyframes pipeline-sweep {
          from { transform: translateX(-100%); }
          to { transform: translateX(250%); }
        }
        @keyframes pipeline-spin { to { transform: rotate(360deg); } }
        @keyframes pipeline-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 1; }
        }
        .pipeline-activity { animation: pipeline-sweep 1.6s linear infinite; }
        .pipeline-spinner { animation: pipeline-spin 900ms linear infinite; }
        @media (max-width: 760px) {
          .pipeline-stages { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pipeline-spinner {
            animation: pipeline-pulse 1.4s ease-in-out infinite;
          }
        }
      `}</style>
      <span role="status" aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" }}>
        {running ? `Running Zone ${["A", "B", "C"][activeStage]}.` : complete ? "All three steps are complete." : "Ready to process."}
      </span>
      <div className="pipeline-stages" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {stages.map((stage, index) => {
          const isActive = running && activeStage === index;
          const isDone = complete || (running && activeStage > index);
          const Icon = isDone ? CheckCircle2 : stage.icon;
          return (
            <div key={stage.title} style={{ padding: "16px 18px", borderRadius: "var(--r-lg)", background: isDone ? stage.soft : isActive ? "var(--surface-sunken)" : "var(--surface-alt)", border: `1px solid ${isActive || isDone ? stage.color : "var(--border)"}`, position: "relative", overflow: "hidden", transition: "background .25s ease, border-color .25s ease" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "var(--r-md)", background: isActive || isDone ? stage.color : "var(--surface-sunken)", color: isActive || isDone ? "var(--brand-fg)" : "var(--text-muted)", display: "grid", placeItems: "center", flexShrink: 0, transition: "background .25s ease, color .25s ease" }}>
                    <Icon size={isDone ? 14 : 16} strokeWidth={isDone ? 2.5 : 1.75} />
                  </div>
                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontSize: "var(--font-sm)", fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 5 }}>{stage.title}{renderTip ? renderTip(stage.tip) : <span title={stage.tip}><HelpCircle size={13} style={{ color: "var(--text-tertiary)" }} /></span>}</div>
                    <div style={{ fontSize: "var(--font-xs)", color: isActive || isDone ? stage.color : "var(--text-muted)" }}>{stage.subtitle}</div>
                  </div>
                </div>
                <span title={complete ? `${stage.count?.toLocaleString()} ${stage.unit}` : undefined} style={{ fontSize: "var(--font-xs)", fontWeight: 500, color: isDone ? stage.on : "var(--text-tertiary)", background: isDone ? stage.soft : "transparent", padding: isDone ? "1px 7px" : "0", borderRadius: "var(--r-sm)", fontVariantNumeric: "tabular-nums", transition: "color .25s ease, background .25s ease", border: "1px solid transparent" }}>
                  {complete && stage.count != null ? stage.count.toLocaleString() : "—"}
                </span>
              </div>
              <div style={{ fontSize: "var(--font-sm)", color: !running && !complete ? "var(--text-tertiary)" : "var(--text-secondary)", lineHeight: 1.4, transition: "color .25s ease" }}>{stage.description}</div>
              {isActive && <div aria-hidden="true" className="pipeline-activity" style={{ position: "absolute", left: 0, bottom: 0, height: 2, width: "40%", background: stage.color, animation: "pipeline-sweep 1.6s linear infinite", willChange: "transform" }} />}
              {isDone && <div aria-hidden="true" style={{ position: "absolute", insetInline: 0, bottom: 0, height: 2, background: stage.color }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
