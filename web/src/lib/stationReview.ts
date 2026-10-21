import type { HealthStatus, StationHealth, StationStuckHealth } from "@/types/zones";

// Shared by the overview, anomaly report, and map. These are review priorities, not accuracy ratings.
export const REVIEW_STATUS = {
  suspect: { label: "Needs attention", tone: "danger" },
  watch: { label: "Monitor", tone: "warning" },
  normal: { label: "No overall warning", tone: "neutral" },
  insufficient_data: { label: "Not enough data", tone: "neutral" },
} as const;

export function overallReviewStatus(high?: HealthStatus, low?: HealthStatus): HealthStatus {
  if (high === "suspect" || low === "suspect") return "suspect";
  if (high === "watch" || low === "watch") return "watch";
  if (!high || !low || high === "insufficient_data" || low === "insufficient_data") return "insufficient_data";
  return "normal";
}

function averageComparison(ratio: number | null): string {
  if (ratio == null) return "Not enough assessed rainy days for an average comparison.";
  const pct = Math.round((ratio - 1) * 100);
  return pct === 0
    ? "Average comparison: about the same as the group's typical rainfall."
    : `Average comparison: about ${Math.abs(pct)}% ${pct > 0 ? "higher" : "lower"} than the group's typical rainfall.`;
}

export function highReview(h: StationHealth | null | undefined) {
  const status = h?.status ?? "insufficient_data";
  const parts = [averageComparison(h?.bias_ratio ?? null)];
  if (h?.top_rate != null) parts.push(`Highest in the group on ${Math.round(h.top_rate * 100)}% of assessed rainy days (ties excluded).`);
  if (h?.peak_rainfall != null) parts.push(`Highest flagged reading: ${h.peak_rainfall.toFixed(1)} mm${h.peak_date ? ` on ${h.peak_date}` : ""}.`);
  const pct = h?.bias_ratio != null ? Math.round((h.bias_ratio - 1) * 100) : null;
  let detail = status === "insufficient_data"
    ? `Only ${h?.rain_days ?? 0} rainy days checked — need at least 5.`
    : "No repeated high-reading warning found.";
  if (status === "watch" || status === "suspect") {
    detail = pct == null ? "Review the flagged high readings." : pct === 0 ? "Average is close to the group's usual rainfall." : `Averages ${Math.abs(pct)}% ${pct > 0 ? "higher" : "lower"} on rainy days.`;
    if (h?.peak_rainfall != null) detail += ` Flagged peak: ${h.peak_rainfall.toFixed(1)} mm.`;
    if (h?.top_rate != null && h.top_rate > 0.7) detail += ` Highest on ${Math.round(h.top_rate * 100)}% of rainy days.`;
  }
  return {
    title: `${REVIEW_STATUS[status].label} for high readings`,
    detail,
    tip: `${h?.rain_days ?? 0} rainy days assessed. ${parts.join(" ")} The group includes this station and its three nearby stations. A warning is a reason to review the readings, not a confirmed sensor fault.`,
  };
}

export function lowReview(h: StationStuckHealth | null | undefined) {
  const status = h?.status ?? "insufficient_data";
  const parts = [averageComparison(h?.bias_ratio ?? null)];
  if (h?.zero_rate != null) parts.push(`Recorded 0–1 mm on ${h.events.length} of ${h.rain_days} assessed rainy days (${Math.round(h.zero_rate * 100)}%).`);
  if (h?.max_zero_streak) parts.push(`Longest low-reading run: ${h.max_zero_streak} successive assessed rainy days; these may be separated by dry days or gaps.`);
  let detail = status === "insufficient_data"
    ? `Only ${h?.rain_days ?? 0} rainy days checked — need at least 5.`
    : "No repeated low-reading warning found.";
  if (status === "watch" || status === "suspect") {
    const pct = h?.bias_ratio != null ? Math.round((1 - h.bias_ratio) * 100) : null;
    detail = h?.events.length
      ? `Recorded 0–1 mm on ${h.events.length} rainy days. Compare those dates with nearby stations.`
      : pct != null && pct > 0 ? `Averages ${pct}% lower on rainy days. Check these readings.` : "Review the flagged low readings.";
  }
  return {
    title: `${REVIEW_STATUS[status].label} for low readings`,
    detail,
    tip: `${h?.rain_days ?? 0} rainy days assessed. ${parts.join(" ")} Low readings are recorded rainfall of 0–1 mm, not missing measurements. Flagged days still need review.`,
  };
}
