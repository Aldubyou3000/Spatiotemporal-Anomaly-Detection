import { Badge } from "@/components/ui/Badge";
import type { Technician } from "@/types/tickets";
import {
  activeCount,
  workloadBreakdown,
  workloadLabel,
  workloadLevel,
  workloadTone,
} from "@/lib/technicianWorkload";

/**
 * Shared workload indicator for the analyst's technician-assignment surfaces.
 * Renders the active ticket count as a tone-coloured Badge and, optionally, the
 * per-status breakdown line ("2 assigned · 1 in review") beneath it.
 *
 * Props-only — no data fetching. The `tech` it receives must come from the
 * ticket-technicians endpoint (the only one carrying workload). One component
 * across create-ticket step 2, the add-technician pickers, and the Technicians
 * page keeps the look identical everywhere.
 */
export function TechnicianWorkloadBadge({
  tech,
  showBreakdown = false,
  align = "end",
  size = "sm",
}: {
  tech: Pick<Technician, "active_ticket_count" | "workload_by_status">;
  /** Show the "x assigned · y in review" line under the badge. */
  showBreakdown?: boolean;
  /** Horizontal alignment of the badge + breakdown. Use "start" in table cells,
   *  "end" in narrow right-aligned picker rows. */
  align?: "start" | "end";
  size?: "sm" | "md";
}) {
  const count = activeCount(tech);
  const breakdown = workloadBreakdown(tech);
  const ariaLabel = `${workloadLabel(count)} tickets (${workloadLevel(count)} load)`;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: align === "start" ? "flex-start" : "flex-end", gap: 3, minWidth: 0 }}>
      <Badge tone={workloadTone(count)} size={size} dot aria-label={ariaLabel} title={ariaLabel}>
        {workloadLabel(count)}
      </Badge>
      {showBreakdown && breakdown && (
        <span style={{ fontSize: "var(--font-xs)", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {breakdown}
        </span>
      )}
    </span>
  );
}
