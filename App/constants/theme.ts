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
// Mobile-first scale. Minimum readable size = 16px. Line heights = 1.4–1.5×
// font size. Weight hierarchy: 700/600 for labels, 400 for data values.
export const typography = {
  // Display — hero / name (rare, large impact)
  display: { size: 32, lineHeight: 46, weight: '800' as const, letterSpacing: -0.6 },

  // Title — screen titles
  title:    { size: 24, lineHeight: 34, weight: '700' as const, letterSpacing: -0.3 },

  // Subtitle — card titles, section headings
  subtitle: { size: 20, lineHeight: 28, weight: '700' as const, letterSpacing: -0.2 },

  // Body — default reading text (labels, primary content)
  body:     { size: 16, lineHeight: 24, weight: '400' as const, letterSpacing: 0 },
  bodyMed:  { size: 16, lineHeight: 24, weight: '500' as const, letterSpacing: 0 },
  bodyBold: { size: 16, lineHeight: 24, weight: '600' as const, letterSpacing: 0 },

  // Callout — secondary content, metadata, values in info rows
  callout:    { size: 15, lineHeight: 22, weight: '400' as const, letterSpacing: 0 },
  calloutMed: { size: 15, lineHeight: 22, weight: '500' as const, letterSpacing: 0 },

  // Caption — pills, chips, timestamps, fine print
  caption:     { size: 13, lineHeight: 19, weight: '500' as const, letterSpacing: 0.1 },
  captionBold: { size: 13, lineHeight: 19, weight: '600' as const, letterSpacing: 0.1 },

  // Overline — section labels (sparingly, uppercase)
  overline: { size: 12, lineHeight: 17, weight: '700' as const, letterSpacing: 0.8 },
} as const;

// ─── Semantic palettes ───────────────────────────────────────────────────────
// The theme-independent accent + status colors, kept in lock-step with the web
// dashboard's tokens (web/src/app/globals.css) so the two surfaces feel like one
// product. These are the LIGHT-theme hues; for dark surfaces a chip should read
// its hue from `theme.status` (brightened, see darkTheme below) rather than
// reaching for raw palette hex.
export const palette = {
  // Brand
  brand:        '#3B6FE8',
  brandPressed: '#2A5ED4',   // web --brand-hover
  brandSoft:    'rgba(59,111,232,0.10)',  // soft/ghost button fill
  brandSoftStrong: 'rgba(59,111,232,0.18)',  // soft button pressed state

  // Status semantics — match web globals.css (light)
  success:      '#16A34A',
  successSoft:  'rgba(22,163,74,0.10)',
  warning:      '#D97706',
  warningSoft:  'rgba(217,119,6,0.10)',
  danger:       '#DC2626',
  dangerSoft:   'rgba(220,38,38,0.10)',
  info:         '#0891B2',
  infoSoft:     'rgba(8,145,178,0.10)',
  accent:       '#7C3AED',
  accentSoft:   'rgba(124,58,237,0.10)',

  // Neutral — inert / closed (cancelled) status. Web --text-muted: a true grey.
  neutral:      '#6B7280',
  neutralSoft:  'rgba(107,114,128,0.10)',

  white:        '#FFFFFF',
} as const;

// Per-theme status hues. On dark surfaces the saturated light hues lose contrast,
// so we brighten them to match the web's dark-theme status tokens. A component
// gets the correct hue for the active theme via `theme.status.danger`, etc.
export type StatusHues = {
  brand: string; success: string; warning: string;
  danger: string; info: string; accent: string; neutral: string;
};

export const lightStatus: StatusHues = {
  brand:   palette.brand,
  success: palette.success,
  warning: palette.warning,
  danger:  palette.danger,
  info:    palette.info,
  accent:  palette.accent,
  neutral: palette.neutral,
};

export const darkStatus: StatusHues = {
  brand:   '#6B96FF',
  success: '#34D399',
  warning: '#FBBF24',
  danger:  '#F87171',
  info:    '#22D3EE',
  accent:  '#A78BFA',
  neutral: '#8993A4',
};

// ─── Theme — derived light / dark surfaces ──────────────────────────────────
// Surface / text / border values mirror web/src/app/globals.css so a card, a
// label, or a divider is the same color on phone and dashboard.
export type Theme = {
  bg:          string;   // page background          (web --bg)
  surface:     string;   // card / sheet background  (web --surface)
  surfaceAlt:  string;   // nested / alt surface     (web --surface-alt)
  surfaceMuted: string;  // hover / pressed state     (web --surface-muted)
  surfaceSunken: string; // inputs, wells             (web --surface-sunken)
  border:      string;   // outlines & dividers      (web --border)
  borderStrong: string;  // emphasized outline       (web --border-strong)
  divider:     string;   // hairline list dividers   (web --divider)
  text:        string;   // primary text             (web --text)
  textSecondary: string; // labels                   (web --text-secondary)
  textMuted:   string;   // muted body / meta        (web --text-muted)
  textTertiary: string;  // disabled, placeholder    (web --text-tertiary)
  textInverse: string;   // on brand background
  shadow:      string;
  status:      StatusHues; // theme-correct status hues for chips/icons
};

export const lightTheme: Theme = {
  // Modern, bright, NEUTRAL grays (Facebook/Instagram feel) — no blue-slate cast.
  bg:            '#FFFFFF',   // pure white page — flat, no tint
  surface:       '#FFFFFF',   // pure white card surface (lifts subtly off bg)
  surfaceAlt:    '#F3F4F6',   // nested surface — neutral gray-100
  surfaceMuted:  'rgba(17,24,39,0.04)',  // hover/pressed — faint neutral overlay
  surfaceSunken: '#F3F4F6',   // inputs / wells — neutral gray-100
  border:        '#E5E7EB',   // neutral gray-200 — clean hairline separation
  borderStrong:  '#D1D5DB',   // gray-300 — emphasized border
  divider:       '#F0F1F3',   // very faint neutral list divider
  text:          '#111827',   // gray-900 — primary near-black, neutral
  textSecondary: '#374151',   // gray-700 — strong secondary
  textMuted:     '#6B7280',   // gray-500 — readable supporting text
  textTertiary:  '#9CA3AF',   // gray-400 — placeholders
  textInverse:   '#FFFFFF',
  shadow:        'rgba(17,24,39,0.06)',  // softer, neutral — faint lift, not muddy
  status:        lightStatus,
};

export const darkTheme: Theme = {
  // Dark gray — blueish/cool tint, not black. Lifted ~15% from the web tokens
  // so surfaces read as charcoal rather than near-black on a phone screen.
  bg:            '#1A1D23',
  surface:       '#22262E',
  surfaceAlt:    '#292E38',
  surfaceMuted:  'rgba(255,255,255,0.05)',
  surfaceSunken: '#1E2128',
  border:        '#333844',
  borderStrong:  '#424A58',
  divider:       '#292E38',
  text:          '#F3F5F8',
  textSecondary: '#C4CBD8',
  textMuted:     '#8993A4',
  textTertiary:  '#5C6478',
  textInverse:   '#0B1220',
  shadow:        'rgba(0,0,0,0.3)',
  status:        darkStatus,
};

export const getTheme = (isDark: boolean): Theme => (isDark ? darkTheme : lightTheme);

// ─── Elevation ───────────────────────────────────────────────────────────────
// Subtle by default — premium feel comes from restraint, not shadow stacks.
// `shadowColor` defaults to a cool near-black so any caller gets a sane shadow;
// a caller may override `shadowColor: theme.shadow` for a theme-tracked tint.
export const elevation = {
  none: {
    shadowColor: '#0B1220',
    shadowOpacity: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
} as const;

// ─── Hit target ──────────────────────────────────────────────────────────────
// Minimum 44pt for accessible touch targets (iOS HIG / Material 48dp).
export const minTouchTarget = 44;
