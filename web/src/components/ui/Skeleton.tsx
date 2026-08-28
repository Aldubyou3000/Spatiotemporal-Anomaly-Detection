import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

// Minimalist base — uses surface-sunken with a soft pulse. No heavy shimmer,
// no large borders. Fits the app's muted, Stripe-like surfaces.
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "bg-[var(--surface-sunken)] rounded-md animate-pulse",
        className
      )}
    />
  );
}

// ─── Ticket row — mirrors TicketRow exactly (11px vertical padding, 19px left
// accent offset, badge height 20). Previous version used py-3.5 (14px) and
// rounded-full badges — both too large for the actual row.
export function TicketRowSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 px-4 py-[11px] pl-[19px] border-b border-divider last:border-b-0">
      <div className="flex items-center gap-2">
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-[18px] w-20 rounded-[6px]" />
        <Skeleton className="h-[18px] w-12 rounded-[6px]" />
      </div>
      <Skeleton className="h-3.5 w-[72%]" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

// ─── Technician table row — mirrors TechRow (avatar 34, 4 data cols).
// Replaces the previous full-card spinner which was ~96px tall.
export function TechRowSkeleton() {
  return (
    <tr>
      <td style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </td>
      <td style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)" }}>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </td>
      <td style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)" }}>
        <Skeleton className="h-[18px] w-20 rounded-[6px]" />
      </td>
      <td style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)" }}>
        <Skeleton className="h-5 w-14 rounded-full" />
      </td>
      <td style={{ padding: "10px 20px", borderBottom: "1px solid var(--divider)" }}>
        <Skeleton className="h-3 w-16" />
      </td>
    </tr>
  );
}

// ─── Audit row — mirrors AuditRow (icon chip 22 + badge + actor + timestamp).
// Previous loader was a centered 60px padded spinner, too large for a 44px row.
export function AuditRowSkeleton() {
  return (
    <div className="grid grid-cols-[24px_1fr_160px_20px] items-center gap-3.5 px-5 py-[11px] border-b border-divider">
      <Skeleton className="h-[22px] w-[22px] rounded-[6px]" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-4 w-10 rounded-[4px] hidden sm:block" />
      </div>
      <div className="flex flex-col gap-1 items-end">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-3 w-3 mx-auto" />
    </div>
  );
}

// ─── Detail panel — mirrors TicketDetailBody header + property strip + sections.
// Previous loader was a full-card centered spinner (flex-1 grid placeItems center).
// This skeleton stays within the detail panel's actual height.
export function DetailSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header bar */}
      <div className="p-4 border-b border-divider space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-[6px]" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      {/* Property strip - 4 cols */}
      <div className="grid grid-cols-4 gap-6 p-5 bg-[var(--surface-sunken)] border-b border-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {/* Sections */}
      <div className="p-6 space-y-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-[14px] w-0.5 rounded-full" />
              <Skeleton className="h-3.5 w-32" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[92%]" />
            <Skeleton className="h-3 w-[84%]" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Table header skeleton for DataTable-like tables (optional) ───────────
// Used while we have no data yet but need to show the card chrome.
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden">
      <div className="flex gap-2 p-3 border-b border-border">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-[120px]" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className="h-3 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
