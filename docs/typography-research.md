# Website typography research — 2026-10-26

Status: Roboto approved by the user and implemented across the website.
Implementation plan: `docs/superpowers/plans/2026-10-26-website-typography.md`.

## User requirements

- Apply a consistent text system across the whole website, including login and the local UI Library.
- Improve size, hierarchy, visibility, typeface and text color.
- Familiarity with Google interfaces, while retaining Sentinel's identity and neutral pearl surfaces.
- Main text must not be small. Current gray supporting text can feel washed out.
- Preserve established split views, restrained highlighting, plain backgrounds and minimal borders/shadows.
- Consult several primary sources rather than repeatedly adopting one design system.

## Findings before implementation

- Root layout loads Geist, Fraunces and JetBrains Mono through next/font/google.
- Main body uses Geist; Fraunces is only referenced by the unused .font-display class. Removing its unused load is a later implementation candidate, not done here.
- Default size tokens are 15px base, 14px small, 12.5px extra-small; compact density reduces some to 13px/12px. Many component-specific overrides bypass those values.
- A literal-only scan found 46 declarations below 14px across seven files, excluding CSS token references and conditional expressions. This is a lower bound, not a count of every small-text instance.
- Badge uses conditional 11px/11.5px sizes. Login, map labels, sidebar subtitle and UI Library include smaller hardcoded values.
- Body does not set an explicit font-size, although child controls do. Native element defaults and component-specific sizes therefore contribute to inconsistency.
- Header has a deliberately disabled text-size picker with an old independent scale; it must not silently override a new scale or be re-enabled without separate work.
- Density currently mixes spacing changes with font-size reductions.
- Date/rainfall/queue fields and charts use monospace more widely than strictly technical content needs.
- Charts measure token sizes through root computed styles; axis margins/tick density need checking after changes.
- UI Library draft preview derives smaller type from base with arithmetic, uses legacy --font-geist overrides, and has per-component font overrides. Its defaults and validation must be kept in sync so stale drafts do not misrepresent the new system.

## Color measurements on existing surfaces

Computed from solid CSS token colors, not screenshots. These do not certify every rendered component.

| Foreground | White | Workspace #F1F3F5 | Shell #E8EAED |
|---|---:|---:|---:|
| Primary #202124 | 16.10 | 14.47 | 13.36 |
| Secondary #51565E | 7.39 | 6.64 | 6.13 |
| Muted #626A73 | 5.49 | 4.93 | 4.55 |
| Tertiary #6D747D | 4.72 | 4.25 | 3.92 |
| Brand #1E6FD9 | 4.85 | 4.36 | 4.02 |
| Brand hover #1758B3 | 6.81 | 6.12 | 5.65 |

Implications:

- Tertiary text is unsuitable for ordinary readable text on workspace/shell surfaces at the normal-text 4.5 threshold.
- Existing brand blue works as white-button text contrast but needs a darker text-link role on tinted surfaces.
- Some existing gray values meet minimum contrast yet still look weak when combined with 11–12.5px text. Passing contrast alone does not guarantee comfortable reading.
- Proposed preview uses #202124 primary and #3C4043 secondary with #51565E for limited help text; keep neutral pearl backgrounds distinct from text colors.

## Primary references and differences

1. [Google Material: applying type](https://m3.material.io/styles/typography/applying-type): purpose-based display/headline/title/label/body roles. Useful for hierarchy; does not require adopting all mobile-oriented sizes.
2. [Material Web typography](https://github.com/material-components/material-web/blob/main/docs/theming/typography.md): font family/weight/size/line-height form a type scale; Roboto is the default. Use as reference, not a reason to install the component library.
3. [Microsoft Fluent 2 typography](https://fluent2.microsoft.design/typography): web Body 1 is 14/20 and subtitle 16/22, with sentence case. Shows that compact enterprise defaults differ from this user's larger-text preference.
4. [Atlassian applying typography](https://atlassian.design/foundations/typography/applying-typography): role tokens, relative units, sparse use of small text and 16px guidance for longer reading. Useful for the dense application context and migration plan.
5. [W3C contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): normal text at least 4.5:1; large text 3:1. Target more than the threshold for supporting text where practical.
6. [W3C resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html): 200% resizing without lost content or functionality.
7. [W3C text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): tolerate user spacing overrides; its specified spacing values are test settings, not mandatory default typography.
8. [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): meaningful controls/states/graphics need 3:1; decorative dividers are not all required to be dark.
9. [Google Design: Google Sans Flex](https://design.google/library/google-sans-flex-font): Google product fonts have evolved, including distinctions between display and text versions. Do not claim Roboto reproduces current Gmail exactly or assume all Google Sans fonts remain unavailable.

## Proposed direction for the user to compare

- Roboto: closer to Material's established typography; recommend as the first candidate, not as a proven objectively superior font.
- Geist: keeps current identity and avoids font-metric changes; same readability gains can come from corrected sizes, colors and roles.
- Both comparison samples use identical content, weights and spacing to avoid confounding the typeface choice.
- Preview: `sentinel-readable-type.html` in the thread visualization directory. Uses real product labels and numbers, 16px body/14px supporting text, darker secondary text, and a 16–18px body adjustment.
- User responded that font names alone were not visually judgeable. The user subsequently approved Roboto for the whole website.

## Candidate sizes — proposed, not approved

| Role | Size / line-height | Weight |
|---|---|---|
| Main reading text, table values, navigation and controls | 16 / 24 | 400; 500 for controls |
| Supporting metadata, badges, chart axes and help | 14 / 20 | 400; 500 where needed |
| Compact panel heading | 18 / 24 | 500–600 |
| Major section/dialog heading | 20 / 28 | 500–600 |
| Page/form heading, when present | 24 / 32 | 500 |
| Key metrics | 28 / 36 | 500 |

Do not add a redundant visible page title to every dashboard just to exercise a token. Keep one semantic h1 and use context-appropriate existing titles.
Use 14px as the smallest routine text. Preserve font size across compact/roomy density; density may adjust spacing instead.

## Implementation scope to turn into a plan after the design choice

1. Typography and text-color tokens in globals.css; explicit body font/size/line-height; independent readable light/dark palettes; normal text links distinct from filled-button brand role.
2. Root font loading/fallback and removal of unused font loads. Choose only verified family/weights, retain logo geometry.
3. Button, Input, Select, Tabs, Badge, Modal, ConfirmDialog, Toast, tooltip and pagination typography, heights and wrapping.
4. Header/sidebar/breadcrumbs, login and all dashboard pages: Zones setup/progress/overview/data/review, History list/summary/results, Tickets/Reports, Technicians and Audit.
5. Chart/map labels, numeric alignment, line spacing, timestamps, long station/file names. Use normal UI face plus tabular numbers; reserve mono for actual code/version/raw identifiers where valuable.
6. UI Library editor and fixtures, token bounds/defaults, stale draft handling and accurate new-default previews.
7. Type checking, focused interaction regressions, foreground/background contrast matrix for both themes, and real-browser checks with loaded/fallback fonts, 100/125/150/200% zoom, narrow widths, dense content and user text-spacing overrides.

## Material tradeoff

Larger text will reduce rows visible per viewport. Preserve readability and accessible actions rather than shrinking fonts or clipping content. Keep the two-panel structure at normal desktop size; allow internal scroll, wrapping or responsive stacking when required at zoom/narrow widths.


## Implemented result

Roboto is served through Next.js fonts at weights 400/500/600/700. Geist and the unused Fraunces load/display class are removed; code blocks retain JetBrains Mono. Body, controls and ordinary table text use 1rem (16px at browser default); supporting labels use .875rem (14px), headings use 18/20px, and metrics 28px. Density changes spacing rather than reducing type. Ordinary identifiers, dates and chart labels use Roboto, with tabular numerals where appropriate.

Secondary text is #3C4043 in light mode, with #51565E supporting text; dark secondary/help roles are brighter. Separate --brand-text handles readable text links without changing filled action colors. Default light/dark text roles pass 4.5:1 on shell, white panel, workspace and sunken surfaces. Login's deliberately light/dark panels have matching local theme scopes for placeholders and captions. This is not a certification of every custom gallery color combination.

Shared controls accommodate the larger type, dialog cards have viewport height limits and an internal scroll path, date fields have more width, and charts use CSS type tokens directly rather than parsing rem as pixels. UI Library defaults resolve to computed pixels; older saved small text values are raised to the readable minimum without dropping saved color/spacing settings.

Validation: TypeScript and all 119 component regressions passed; independent review findings were corrected. An initial production build completed. The final build compiled and passed type checking, then failed page-data collection with missing generated modules for /icon.png/route and /ui-library/preview/page. Both generated files existed afterward; process inspection was denied, so concurrent development activity could not be confirmed. This remains a build-verification limitation. Live browser appearance and increased zoom were not checked: browser automation is disabled in Work settings, and the native Chrome tool stopped because it could not establish the current URL confidently. No browser automation was attempted after that stop.
