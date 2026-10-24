import type { DailyReading } from "@/types/zones";

export type ReviewDecision = "anomaly" | "not_anomaly";
export interface AnomalyReview {
  status: ReviewDecision;
  note: string;
  reviewed_by: string;
  reviewer_id: string;
  reviewed_at: string;
  revision?: number;
}
export type AnomalyReviews = Record<string, AnomalyReview>;

export const DECISION_LABEL = { anomaly: "Anomaly", not_anomaly: "Not anomaly" } as const;

export function readingKey(row: Pick<DailyReading, "station_id" | "date">): string {
  return JSON.stringify([row.station_id, row.date]);
}

export function isFlaggedReading(row: DailyReading): boolean {
  return !!(row.is_anomaly || row.is_low_anomaly || row.is_dry_stuck);
}

export function flaggedReadings(rows: DailyReading[]): DailyReading[] {
  return rows.filter(isFlaggedReading).sort((a, b) => b.date.localeCompare(a.date) || a.station_id.localeCompare(b.station_id));
}

export function nextPendingReading(rows: DailyReading[], reviews: AnomalyReviews, currentKey: string): string | null {
  const current = rows.findIndex((row) => readingKey(row) === currentKey);
  for (let step = 1; step <= rows.length; step++) {
    const key = readingKey(rows[(current + step) % rows.length]);
    if (key !== currentKey && !reviews[key]) return key;
  }
  return null;
}

export function exportReviewedReadings(rows: DailyReading[], reviews: AnomalyReviews) {
  return rows.map((row) => {
    const flagged = isFlaggedReading(row);
    const review = flagged ? reviews[readingKey(row)] : undefined;
    return {
      ...row,
      review_status: review?.status ?? (flagged ? "needs_review" : "not_flagged"),
      review_note: review?.note ?? "",
      reviewed_by: review?.reviewed_by ?? "",
      reviewer_id: review?.reviewer_id ?? "",
      reviewed_at: review?.reviewed_at ?? "",
    };
  });
}

export type ReviewedReading = ReturnType<typeof exportReviewedReadings>[number];
