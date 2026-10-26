# Website typography implementation

Approved direction: Roboto, following the visible comparison in `docs/typography-research.md`. Scope is the web website; mobile, processing algorithms and data are unchanged.

1. Replace the root font with locally served Next.js Roboto. Keep JetBrains Mono for code only. Set shared body/control text to 16px, supporting text to 14px, panel titles to 18px, dialog/section titles to 20px and metrics to 28px. Density adjusts spacing, never reduces the type scale. Use rem units so browser text preferences work.
2. Darken supporting text in the pearl theme and brighten it in dark mode. Give text links a separate accessible blue while retaining existing action/selection colors. Increase shared controls enough for the new text, preserving selection and loading geometry.
3. Remove undersized overrides in login, navigation, badges, charts, map popups and the UI Library. Make the library's generated scale and restored drafts respect the approved minimums without discarding saved colors or layout settings. Keep split views and ordinary numeric alignment.
4. Run type checks and focused regressions, inspect representative light/dark pages at normal and increased zoom, then obtain a fresh review. Update architecture records with actual results and any remaining limits.

Validation covers readable contrast on every routine surface, density-independent text floors, preview scale generation, existing component behavior, font delivery and responsive wrapping. Do not use clipping or smaller fonts to hide overflow.
