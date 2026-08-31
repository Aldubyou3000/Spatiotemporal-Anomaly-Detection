"use client";

/**
 * SentinelMark — geometric brand mark for AWS Sentinel · Anomaly Detector
 *
 * Exact geometry from `logo.html` (root): four rotated bars + centre diamond
 * forming the chevron/sentinel mark. Uses `currentColor` so the caller
 * controls the colour via CSS `color` (typically `var(--brand)` — the app's
 * blue theme token which flips between #1E6FD9 / #4D9CFF for light/dark).
 *
 * ViewBox 0 0 285 188 is the canonical artboard from logo.html — keep the
 * 285:188 (≈1.516) aspect or the diagonals shear. The component accepts a
 * single `size` as logical **width** in px; height is derived to preserve
 * aspect (consistent with logo.html's `width:285px; height:auto`).
 */
export function SentinelMark({
  size = 32,
  style,
  className,
}: {
  size?: number;
  style?: React.CSSProperties;
  className?: string;
}) {
  const h = Math.round((size * 188) / 285);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 285 188"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AWS Sentinel mark"
      fill="none"
      style={{ display: "block", overflow: "visible", ...style }}
      className={className}
    >
      <g fill="currentColor">
        {/* Left long diagonal — 170×38 */}
        <rect x="-78" y="-19" width="170" height="38" rx="7.5" ry="7.5" transform="translate(94 64) rotate(-45)" />
        {/* Right short bar — 88×38 */}
        <rect x="-44" y="-19" width="88" height="38" rx="7.5" ry="7.5" transform="translate(198 86) rotate(45)" />
        {/* Chevron left */}
        <rect x="-36" y="-19" width="72" height="38" rx="7.5" ry="7.5" transform="translate(110 135) rotate(-45)" />
        {/* Chevron right */}
        <rect x="-36" y="-19" width="72" height="38" rx="7.5" ry="7.5" transform="translate(160 135) rotate(45)" />
        {/* Centre diamond */}
        <rect x="-19" y="-19" width="38" height="38" rx="7" ry="7" transform="translate(135 110) rotate(45)" />
      </g>
    </svg>
  );
}


