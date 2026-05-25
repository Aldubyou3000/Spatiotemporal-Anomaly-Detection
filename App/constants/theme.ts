/**
 * Design Tokens — single source of truth for the app's visual language.
 *
 * Principles:
 *  • Strict 4 / 8-pt spacing grid
 *  • Type scale aligned to multiples of 2 — 11, 12, 13, 15, 17, 20, 28
 *  • Semantic color names, not raw hex in components
 *  • Light + dark surfaces tuned for contrast (WCAG AA)
 */

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const spacing = {
  xxs: 4,
  xs:  8,
  sm:  12,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 40,
  xxxl: 48,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────
// Strict scale — every text style in the app must map to one of these.
export const typography = {
  // Display — large, sparingly used (hero greeting name only)
  display: { size: 28, lineHeight: 34, weight: '700' as const, letterSpacing: -0.4 },

  // Title — screen / section titles
  title:    { size: 20, lineHeight: 26, weight: '700' as const, letterSpacing: -0.2 },

  // Subtitle — secondary heading / card titles
  subtitle: { size: 17, lineHeight: 22, weight: '600' as const, letterSpacing: -0.1 },

  // Body — default reading text
  body:     { size: 15, lineHeight: 22, weight: '400' as const, letterSpacing: 0 },
  bodyMed:  { size: 15, lineHeight: 22, weight: '500' as const, letterSpacing: 0 },
  bodyBold: { size: 15, lineHeight: 22, weight: '600' as const, letterSpacing: 0 },

  // Callout — supporting text, list metadata
  callout:  { size: 13, lineHeight: 18, weight: '400' as const, letterSpacing: 0 },
  calloutMed: { size: 13, lineHeight: 18, weight: '500' as const, letterSpacing: 0 },

  // Caption — pills, chips, fine print
  caption:  { size: 12, lineHeight: 16, weight: '500' as const, letterSpacing: 0.1 },
  captionBold: { size: 12, lineHeight: 16, weight: '600' as const, letterSpacing: 0.1 },

  // Overline — uppercase section labels (sparingly)
  overline: { size: 11, lineHeight: 14, weight: '600' as const, letterSpacing: 0.6 },
} as const;

// ─── Semantic palettes ───────────────────────────────────────────────────────
// Single accent (Blue 600) plus carefully chosen support colors.
export const palette = {
  // Brand
  brand:        '#1E6FD9',
  brandPressed: '#1B62C2',
  brandSoft:    'rgba(30,111,217,0.10)',

  // Status semantics
  success:      '#0DB976',
  successSoft:  'rgba(13,185,118,0.10)',
  warning:      '#F5A623',
  warningSoft:  'rgba(245,166,35,0.10)',
  danger:       '#E53535',
  dangerSoft:   'rgba(229,53,53,0.10)',
  info:         '#1E9DFF',
  infoSoft:     'rgba(30,157,255,0.10)',
  accent:       '#9B6DFF',
  accentSoft:   'rgba(155,109,255,0.10)',

  white:        '#FFFFFF',
} as const;

// ─── Theme — derived light / dark surfaces ──────────────────────────────────
export type Theme = {
  bg:          string;   // page background
  surface:     string;   // card / sheet background
  surfaceAlt:  string;   // input / nested surfaces
  surfaceMuted: string;  // hover / pressed state
  border:      string;   // outlines & dividers
  borderStrong: string;  // emphasized outline (inputs)
  text:        string;   // primary text
  textSecondary: string; // labels, captions
  textTertiary: string;  // disabled, placeholder
  textInverse: string;   // on brand background
  shadow:      string;
};

export const lightTheme: Theme = {
  bg:            '#F5F7FA',
  surface:       '#FFFFFF',
  surfaceAlt:    '#FFFFFF',
  surfaceMuted:  'rgba(15,23,42,0.04)',
  border:        'rgba(15,23,42,0.06)',
  borderStrong:  '#D1D9E8',
  text:          '#0D1B3E',
  textSecondary: '#6B7A99',
  textTertiary:  '#A8B4CC',
  textInverse:   '#FFFFFF',
  shadow:        'rgba(15,23,42,0.06)',
};

export const darkTheme: Theme = {
  bg:            '#0A0F1E',
  surface:       '#131929',
  surfaceAlt:    '#0F1929',
  surfaceMuted:  'rgba(255,255,255,0.04)',
  border:        'rgba(255,255,255,0.06)',
  borderStrong:  '#1E2D47',
  text:          '#F0F4FF',
  textSecondary: '#7A8BAA',
  textTertiary:  '#3A4D6B',
  textInverse:   '#FFFFFF',
  shadow:        'rgba(0,0,0,0.4)',
};

export const getTheme = (isDark: boolean): Theme => (isDark ? darkTheme : lightTheme);

// ─── Elevation ───────────────────────────────────────────────────────────────
// Subtle by default — premium feel comes from restraint, not shadow stacks.
export const elevation = {
  none: {
    shadowOpacity: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

// ─── Hit target ──────────────────────────────────────────────────────────────
// Minimum 44pt for accessible touch targets (iOS HIG / Material 48dp).
export const minTouchTarget = 44;
