"use client";

/**
 * SentinelMark — brand icon for AWS Sentinel · Anomaly Detector
 *
 * Concept: Shield (Sentinel / guardian) + Radar pulse (spatiotemporal scan)
 *          + central anomaly dot with halo.
 *
 * - Shield silhouette = sentinel watching over PAGASA AWS network
 * - Concentric quarter-arcs = radar sweep across neighbor groups (Zone B)
 * - Center dot + subtle outer halo = flagged anomaly (Zone C LOF)
 * - Diagonal sweep line = active scan direction
 *
 * Renders crisp at 14–20px inside the 30–32px blue gradient square.
 * Uses currentColor so it inherits "var(--brand-fg)" (white) on the gradient.
 */
export function SentinelMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* Shield — bolder for 18px on blue gradient */}
      <path
        d="M12 2.7 18.95 5.55v5.65c0 3.95-1.75 6.9-6.95 10.25C6.8 18.1 5.05 15.15 5.05 11.2V5.55L12 2.7Z"
        stroke="currentColor"
        strokeWidth={1.85}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Radar arcs — 2 clean quarter-rings, solid white for legibility */}
      <path
        d="M14.95 7.95A4.7 4.7 0 0 1 16.55 11.15"
        stroke="currentColor"
        strokeWidth={1.65}
        strokeLinecap="round"
        opacity={0.92}
      />
      <path
        d="M13.65 9.25A2.25 2.25 0 0 1 14.35 11.15"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      {/* Sweep line — short, crisp */}
      <path
        d="M12.95 12.05 16.9 16"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.95}
      />
      {/* Center anomaly dot */}
      <circle cx={12} cy={11.15} r={2.15} fill="currentColor" opacity={0.2} />
      <circle cx={12} cy={11.15} r={1.35} fill="currentColor" />
      <circle cx={12} cy={11.15} r={0.45} fill="white" opacity={0.9} />
    </svg>
  );
}


