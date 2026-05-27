"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/dashboard/Header";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportCardSkeleton } from "@/components/ui/Skeleton";
import { reportsApi } from "@/lib/api/reports";
import { cn } from "@/lib/cn";
import type { InspectionReport } from "@/types/reports";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<string, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Photo Gallery ────────────────────────────────────────────────────────────

function PhotoGallery({ reportId }: { reportId: string }) {
  const [photos, setPhotos] = useState<{ id: string; photo_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    reportsApi.photos(reportId)
      .then(setPhotos)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return (
    <div className="flex items-center gap-2 text-[12px] text-text-tertiary py-1">
      <Camera size={13} strokeWidth={2} className="animate-pulse" />
      Loading photos…
    </div>
  );
  if (photos.length === 0) return (
    <p className="text-[12px] text-text-tertiary italic">No photos attached.</p>
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setLightbox(p.photo_url)}
            className="rounded-lg overflow-hidden border border-border hover:border-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.photo_url} alt="Inspection photo" className="w-24 h-20 object-cover" />
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-100 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors grid place-items-center"
          >
            <X size={18} className="text-white" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Inspection photo"
            className="max-w-full max-h-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

// ─── Pending Report Card ──────────────────────────────────────────────────────

function PendingReportCard({
  report,
  onApproved,
}: {
  report: InspectionReport;
  onApproved: (r: InspectionReport) => void;
}) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleApprove() {
    setSaving(true);
    setError("");
    try {
      const updated = await reportsApi.approve(report.id, {
        analyst_notes: notes.trim() || undefined,
      });
      onApproved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="bg-surface border border-border rounded-2xl overflow-hidden"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      {/* Card header */}
      <div className="px-5 py-4 border-b border-border bg-warning-soft/30 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge tone="warning" dot>Pending Review</Badge>
            {report.ticket?.anomaly_zone && (
              <Badge tone="info">Zone {report.ticket.anomaly_zone}</Badge>
            )}
            {report.severity && (
              <Badge tone={SEVERITY_TONE[report.severity]}>
                {report.severity} severity
              </Badge>
            )}
          </div>
          <p className="text-[15px] font-semibold text-text truncate">
            {report.ticket?.title ?? "Untitled ticket"}
          </p>
          <p className="text-[12px] text-text-tertiary mt-0.5 font-mono">
            {report.ticket?.station_id}
            {report.technician && (
              <span className="font-sans ml-2 text-text-secondary">
                · {report.technician.full_name}
              </span>
            )}
            <span className="font-sans ml-2">· Submitted {fmt(report.submitted_at)}</span>
          </p>
        </div>
      </div>

      {/* Report body */}
      <div className="px-5 py-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <ReportField label="Sensor Working">
            {report.sensor_working === null ? (
              <span className="text-text-tertiary">Not recorded</span>
            ) : report.sensor_working ? (
              <span className="flex items-center gap-1.5 text-success">
                <Wifi size={13} strokeWidth={2.4} /> Yes
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-danger">
                <WifiOff size={13} strokeWidth={2.4} /> No
              </span>
            )}
          </ReportField>
          <ReportField label="Severity">
            {report.severity ? (
              <Badge tone={SEVERITY_TONE[report.severity]}>
                {report.severity}
              </Badge>
            ) : (
              <span className="text-text-tertiary">—</span>
            )}
          </ReportField>
          <ReportField label="Submitted">
            <span>{fmt(report.submitted_at)}</span>
          </ReportField>
        </div>

        {report.notes && (
          <ReportField label="Field Observations">
            <p className="text-[13px] text-text leading-relaxed">{report.notes}</p>
          </ReportField>
        )}

        {report.root_cause && (
          <ReportField label="Root Cause">
            <p className="text-[13px] text-text leading-relaxed">{report.root_cause}</p>
          </ReportField>
        )}

        <ReportField label="Photos">
          <PhotoGallery reportId={report.id} />
        </ReportField>

        {/* Analyst Remarks + approve */}
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
              Analyst Remarks
            </label>
            <p className="text-[11px] text-text-tertiary -mt-0.5">
              These remarks will be visible to the technician and stored with the ticket.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add remarks before approving (optional)…"
              rows={3}
              disabled={saving}
              className={cn(
                "px-3.5 py-2.5 rounded-lg bg-surface-alt text-text text-[13px] resize-none",
                "border border-border-strong placeholder:text-text-tertiary",
                "focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft",
                "disabled:opacity-60",
              )}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-danger-soft border border-danger/20">
              <AlertTriangle size={12} className="text-danger shrink-0 mt-0.5" strokeWidth={2.4} />
              <p className="text-[12px] text-danger">{error}</p>
            </div>
          )}

          <Button onClick={handleApprove} loading={saving} className="w-full sm:w-auto">
            <CheckCircle2 size={14} strokeWidth={2.4} />
            {saving ? "Approving…" : "Approve & Mark Verified"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Approved Report Row ──────────────────────────────────────────────────────

function ApprovedReportRow({ report }: { report: InspectionReport }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3.5 hover:bg-surface-muted transition-colors flex items-center justify-between gap-4 group"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Badge tone="success" dot>Verified</Badge>
            {report.ticket?.anomaly_zone && (
              <Badge tone="info">Zone {report.ticket.anomaly_zone}</Badge>
            )}
            {report.severity && (
              <Badge tone={SEVERITY_TONE[report.severity]}>{report.severity}</Badge>
            )}
          </div>
          <p className="text-[14px] font-medium text-text truncate group-hover:text-brand transition-colors">
            {report.ticket?.title ?? "Untitled ticket"}
          </p>
          <p className="text-[12px] text-text-tertiary mt-0.5 font-mono">
            {report.ticket?.station_id}
            {report.technician && (
              <span className="font-sans ml-2 text-text-secondary">
                · {report.technician.full_name}
              </span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[11px] text-text-tertiary">{fmt(report.analyst_approved_at)}</p>
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cn(
              "text-text-tertiary mt-1 ml-auto transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border bg-surface-muted/30 animate-fade-in">
          {/* Meta row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3">
            <ReportField label="Sensor Working">
              {report.sensor_working === null ? (
                <span className="text-text-tertiary">—</span>
              ) : report.sensor_working ? (
                <span className="flex items-center gap-1.5 text-success">
                  <Wifi size={13} strokeWidth={2.4} /> Yes
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-danger">
                  <WifiOff size={13} strokeWidth={2.4} /> No
                </span>
              )}
            </ReportField>
            <ReportField label="Submitted">{fmt(report.submitted_at)}</ReportField>
            <ReportField label="Approved">{fmt(report.analyst_approved_at)}</ReportField>
          </div>

          {report.notes && (
            <ReportField label="Field Observations">
              <p className="text-[13px] text-text-secondary leading-relaxed">{report.notes}</p>
            </ReportField>
          )}
          {report.root_cause && (
            <ReportField label="Root Cause">
              <p className="text-[13px] text-text-secondary leading-relaxed">{report.root_cause}</p>
            </ReportField>
          )}

          {/* Analyst Remarks — always shown for approved, matches tickets panel style */}
          <div className="rounded-lg p-3 border bg-success/5 border-success/20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
              Analyst Remarks
            </p>
            {report.analyst_notes ? (
              <p className="text-[13px] text-text-secondary leading-relaxed">{report.analyst_notes}</p>
            ) : (
              <p className="text-[12px] text-text-tertiary italic">No remarks added.</p>
            )}
          </div>

          <ReportField label="Photos">
            <PhotoGallery reportId={report.id} />
          </ReportField>
        </div>
      )}
    </div>
  );
}

function ReportField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary mb-1">
        {label}
      </p>
      <div className="text-[13px] text-text">{children}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { loading: authLoading } = useAuth();
  const [pending, setPending] = useState<InspectionReport[]>([]);
  const [approved, setApproved] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await reportsApi.list();
      setPending(res.pending);
      setApproved(res.approved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  function handleApproved(updated: InspectionReport) {
    setPending((prev) => prev.filter((r) => r.id !== updated.id));
    setApproved((prev) => [updated, ...prev]);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-text-tertiary text-[13px] font-mono">Loading session…</p>
      </div>
    );
  }

  const totalPending = pending.length;

  return (
    <>
      <Header
        title="Inspection Reports"
        description={`${totalPending} pending review · ${approved.length} approved`}
        actions={
          <button
            type="button"
            onClick={fetchReports}
            className="h-9 px-3 rounded-lg text-[13px] text-text-secondary hover:text-text hover:bg-surface-muted transition-colors flex items-center gap-1.5 border border-border-strong"
          >
            <RefreshCw size={13} strokeWidth={2.2} className={cn(loading && "animate-spin")} />
            Refresh
          </button>
        }
      />

      <div className="px-8 py-6 max-w-225 w-full mx-auto space-y-8">
        {loading ? (
          <div className="space-y-4">
            <ReportCardSkeleton />
            <ReportCardSkeleton />
          </div>
        ) : error ? (
          <div className="py-12 flex flex-col items-center gap-2">
            <AlertTriangle size={20} className="text-danger" strokeWidth={2} />
            <p className="text-[14px] font-medium text-text">Failed to load</p>
            <p className="text-[12px] text-text-secondary">{error}</p>
            <Button size="sm" variant="secondary" className="mt-2" onClick={fetchReports}>
              Retry
            </Button>
          </div>
        ) : (
          <>
            {/* Pending section */}
            <section className="space-y-4">
              <div className="flex items-center gap-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                  Pending Review
                </p>
                {totalPending > 0 && (
                  <span className="h-5 px-1.5 rounded-full bg-warning text-white text-[10px] font-bold grid place-items-center min-w-5">
                    {totalPending}
                  </span>
                )}
              </div>

              {pending.length === 0 ? (
                <div className="py-10 flex flex-col items-center gap-2 border border-border border-dashed rounded-2xl animate-fade-in">
                  <CheckCircle2 size={20} className="text-success" strokeWidth={2} />
                  <p className="text-[14px] font-medium text-text">All caught up</p>
                  <p className="text-[12px] text-text-secondary">
                    No reports awaiting review.
                  </p>
                </div>
              ) : (
                <div className="stagger space-y-4">
                  {pending.map((r) => (
                    <PendingReportCard
                      key={r.id}
                      report={r}
                      onApproved={handleApproved}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Approved section */}
            <section className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                Approved Records
              </p>

              {approved.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 border border-border border-dashed rounded-2xl">
                  <ClipboardCheck size={20} className="text-text-tertiary" strokeWidth={2} />
                  <p className="text-[13px] text-text-secondary">No approved reports yet.</p>
                </div>
              ) : (
                <div
                  className="bg-surface border border-border rounded-2xl overflow-hidden stagger"
                  style={{ boxShadow: "var(--shadow-sm)" }}
                >
                  {approved.map((r) => (
                    <ApprovedReportRow key={r.id} report={r} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}
