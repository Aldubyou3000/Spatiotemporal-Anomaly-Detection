# System Redesign Plan — Web Dashboard & Mobile App

**Date:** 2026-05-28  
**Scope:** Full visual redesign of web dashboard (Next.js) + mobile app (Expo)  
**Tech Stack:** Radix UI (unstyled components) + Tailwind CSS + design tokens  
**Timeline:** Iterative — design first, code second

---

## Your Design Preferences (Confirmed)

**Goal:** Professional & enterprise aesthetic focusing on **ease of use, productivity, and cognitive load reduction** using industry-standard design patterns.

**Priorities (Top 4):**
1. ✓ Better color palette (modern, cohesive)
2. ✓ Cleaner layout (spacing, grid, hierarchy)
3. ✓ Smoother animations (responsive, subtle)
4. ✓ Better data visualization (polished charts)

**What Stays:** Sidebar navigation, blue brand color, light/dark theme

**Pain Points:** All pages need work — login, zones, tickets, reports, everything

**Implementation:** shadcn/ui (pre-styled, faster, customizable) + Tailwind CSS

**Timeline:** No rush — gradual, iterative, quality-focused

**Scope:** Web dashboard only (mobile redesign later)

---

## Phase 1: Design Exploration (Using Claude Design)

### 1.1 Current State Assessment

**Web Dashboard (next.js)**
- Login: Centered form, dark/light theme toggle
- Dashboard: Left sidebar (navigation) + header (user profile, theme toggle) + main content
- Pages: Zones, Tickets, Reports, Technicians, Audit
- Components: Card, Button, Input, Badge, Tabs, Skeleton, FileUpload, DataTable, Charts
- Fonts: Geist (primary), Fraunces (display), JetBrains Mono (code)
- Theme: Light/dark with 8 semantic color tokens (brand, success, warning, danger, info, accent)

**Mobile App (Expo)**
- Tab navigation (Tabs) at bottom
- Screens: Auth, Tickets, Reports, Profile, Settings
- Uses SecureStore for auth tokens + theme persistence
- Same design tokens as web for visual consistency

**Current Design Gaps:**
- Visual hierarchy could be stronger
- Spacing inconsistencies across pages
- Limited use of micro-interactions (hover, focus, transitions)
- Chart/data visualization could be more polished
- Mobile app navigation needs refinement

### 1.2 Claude Design Workflow

**Step 1: Screenshot Current System**
Capture screenshots of:
- [ ] Web login page
- [ ] Web dashboard (zones overview)
- [ ] Ticket board
- [ ] Reports page
- [ ] Mobile app home screen
- [ ] Mobile ticket detail view

**Step 2: Write Design Prompt**
```
I'm redesigning a spatiotemporal anomaly detection system used by 
analysts to manage zones, weather stations, tickets, and reports.

CURRENT STATE:
- Web dashboard: sidebar navigation + header + content area
- Color scheme: Brand blue (#1E6FD9 light, #4D9CFF dark) + semantic status colors
- Typography: Geist (primary), Fraunces (display), JetBrains Mono (code)
- Current problem: All pages feel clunky and hard to use. Needs professional enterprise 
  aesthetic with better cognitive load management.

DESIGN DIRECTION (CONFIRMED):
✓ Professional & enterprise vibe (not artistic or decorative)
✓ Focus on ease of use, productivity, and industry standards
✓ Keep: Sidebar nav layout, blue brand color, light/dark theme

TOP PRIORITIES:
1. Better color palette — modern, cohesive, professional
2. Cleaner layout — improve spacing, grid, visual hierarchy
3. Smoother animations — subtle, responsive micro-interactions
4. Better data visualization — polished charts, tables, data displays

PROBLEM PAGES TO SOLVE:
- Login page (awkward flow)
- Zones page (data hard to parse)
- Ticket board (clunky management)
- Reports page (confusing workflow)
- ALL pages need improvement

DESIGN CONSTRAINTS:
- Desktop: 1920px+ (analysts on larger screens)
- Light & dark mode support
- Will use shadcn/ui + Tailwind (pre-styled, accessible components)
- Must work on Firefox, Chrome, Safari

GENERATE:
- 1 cohesive design system (not multiple competing vibes)
- Modern, professional color palette (keep blue as anchor)
- Improved page layouts with clear information hierarchy
- Component styles (buttons, cards, inputs, tables, charts)
- Subtle animation guidelines (hover, focus, transitions)
- Specific focus on: zones data table readability, ticket board usability, reports clarity

Reference: Industry best practices (Figma, Linear, Vercel dashboards)
```

**Step 3: Review & Iterate**
- Pick favorite design concepts
- Ask Claude Design for refinements
- Get detailed component styles (buttons, cards, inputs, etc.)
- Request mobile-specific layouts

**Step 4: Extract Design Specs**
Document:
- Color palette (hex values)
- Typography scale (sizes, weights, spacing)
- Component styles (button variants, card styles, etc.)
- Layout grid and spacing rules
- Micro-interactions and animations

---

## Phase 2: Implementation (Backend Prep)

Once Claude Design gives you mockups you love, we'll:

### 2.1 Update Design Tokens

**File:** `web/src/app/globals.css`

Replace current CSS variables with new palette:
```css
:root, [data-theme="light"] {
  /* New colors from Claude Design */
  --bg: ...
  --surface: ...
  --border: ...
  /* ... etc ... */
}

[data-theme="dark"] {
  /* Dark mode variants */
}
```

### 2.2 Install shadcn/ui

```powershell
cd web
npm install -D shadcn-ui
npx shadcn-ui@latest init
```

shadcn/ui will handle Radix UI + pre-styled Tailwind components automatically.

Components to add (via `shadcn-ui add`):
- `button` — primary action buttons
- `card` — data containers
- `input` — text fields
- `dialog` — modals, confirmations
- `dropdown-menu` — user menu, actions
- `table` — data tables
- `tabs` — tabbed content
- `badge` — labels, status indicators
- `select` — dropdowns
- `popover` — popovers, tooltips
- `toast` — notifications

### 2.3 Update Base Components

**Location:** `web/src/components/ui/`

Rewrite or update:
- [ ] `Button.tsx` — new variants, sizes, states
- [ ] `Card.tsx` — new spacing, shadows, borders
- [ ] `Input.tsx` — new focus states, validation styles
- [ ] `Badge.tsx` — new sizes, colors
- [ ] `Tabs.tsx` — integrate Radix UI
- Add new: `Dialog.tsx`, `Dropdown.tsx`, `Popover.tsx`, `Tooltip.tsx`

### 2.4 Update Dashboard Components

**Location:** `web/src/components/dashboard/`

- [ ] `Header.tsx` — new layout, user menu styling
- [ ] `Sidebar.tsx` — new nav styling, active states
- [ ] `PageTransition.tsx` — adjust animations if needed

### 2.5 Update Page Layouts

**Location:** `web/src/app/(dashboard)/*/page.tsx`

- [ ] `zones/page.tsx` — new grid layout, chart styling
- [ ] `tickets/page.tsx` — new table/card layout
- [ ] `reports/page.tsx` — new report card design
- [ ] `technicians/page.tsx` — new user list design
- [ ] `audit/page.tsx` — new audit log design

---

## Phase 3: Mobile App Redesign

### 3.1 Update Mobile Tokens

**File:** `App/constants/theme.ts`

Sync with new web design tokens:
```typescript
export const theme = {
  colors: {
    // Match web palette
  },
  spacing: { ... },
  typography: { ... },
};
```

### 3.2 Update Mobile Components

**Location:** `App/components/`

- [ ] Buttons, cards, inputs matching web style
- [ ] Bottom tab navigation
- [ ] Screen layouts (tickets, reports, profile)

### 3.3 Update Mobile Screens

**Location:** `App/app/`

- [ ] Auth flows
- [ ] Ticket list/detail
- [ ] Report submission
- [ ] Profile settings

---

## Phase 4: Testing & Refinement

### 4.1 Visual Regression Testing
- [ ] Login flow (web)
- [ ] Dashboard zones (web)
- [ ] Ticket board (web)
- [ ] Reports page (web)
- [ ] All mobile screens

### 4.2 Cross-Browser Testing
- [ ] Chrome/Edge desktop
- [ ] Safari desktop
- [ ] Mobile Chrome (Android)
- [ ] Safari (iOS via Expo)

### 4.3 Accessibility Check
- [ ] Color contrast (WCAG AA)
- [ ] Focus states visible
- [ ] Keyboard navigation works
- [ ] Screen reader friendly

### 4.4 Micro-interactions Polish
- [ ] Button hover states smooth
- [ ] Page transitions feel responsive
- [ ] Loading states clear
- [ ] Error states visible

---

## Implementation Order (Gradual, No Deadline)

**Phase 1: Design** (Week 1)
- [ ] Screenshot all pages (login, zones, tickets, reports, technicians, audit)
- [ ] Write prompt, paste into Claude Design
- [ ] Iterate on concepts (request refinements)
- [ ] Finalize color palette, typography, component specs
- [ ] Get layout mockups for each page

**Phase 2: Setup** (Week 2)
- [ ] Initialize shadcn/ui in web project
- [ ] Add core components (button, card, input, dialog, etc.)
- [ ] Update `globals.css` with new design tokens from Claude Design
- [ ] Test theme switching (light/dark)

**Phase 3: Component Refresh** (Weeks 3-4)
- [ ] Customize shadcn components (shadows, borders, spacing)
- [ ] Update `components/ui/` with new styles
- [ ] Test each component in isolation

**Phase 4: Page Redesign** (Weeks 5-7)
- [ ] Login page — auth flow clarity
- [ ] Zones page — data table readability, chart styling
- [ ] Ticket board — improved layout, visual hierarchy
- [ ] Reports page — clearer workflow, form design
- [ ] Technicians, Audit pages

**Phase 5: Polish & Testing** (Week 8)
- [ ] Micro-interactions (hover, focus, transitions)
- [ ] Accessibility audit (contrast, focus states, keyboard nav)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Dark mode refinement
- [ ] Final tweaks based on actual usage

---

## Key Files to Modify

### Web
- `web/src/app/globals.css` — design tokens
- `web/src/app/layout.tsx` — if fonts change
- `web/src/components/ui/*.tsx` — all base components
- `web/src/components/dashboard/*.tsx` — layout components
- `web/src/app/(dashboard)/*.tsx` — page layouts
- `web/tailwind.config.ts` — if needed for new utilities
- `web/package.json` — add Radix UI dependencies

### Mobile
- `App/constants/theme.ts` — design tokens
- `App/components/*.tsx` — component styles
- `App/app/*.tsx` — screen layouts

### Documentation
- This file (REDESIGN_PLAN.md)
- `DESIGN_SYSTEM.md` — new (finalized design specs)

---

## shadcn/ui + Tailwind Strategy

**Why shadcn/ui:**
- Pre-styled Radix UI components + Tailwind CSS
- Full accessibility built-in (ARIA, keyboard nav, focus management)
- Fast to implement — no building from scratch
- Highly customizable — modify shadows, colors, spacing easily
- Copies components into your project — full control, no dependencies

**How We'll Use It:**
1. Initialize shadcn/ui in the project
2. Add components via `shadcn-ui add` (copies code into `components/ui/`)
3. Customize colors/spacing in `globals.css` design tokens
4. Components automatically inherit theme variables
5. Pages import from `components/ui/` — clean, no framework visibility

**Workflow:**
```powershell
# Add a component
npx shadcn-ui@latest add button

# It copies to web/src/components/ui/button.tsx
# Then customize via design tokens in globals.css
```

**Example: Customizing via Design Tokens**
```css
/* globals.css */
:root {
  --primary: #1E6FD9;        /* shadcn/ui uses this */
  --primary-foreground: #fff;
  --border: rgba(15, 23, 42, 0.06);
  /* ... */
}

/* Button automatically uses these vars */
/* No need to modify component code */
```

---

## Success Criteria

- [ ] New design approved (via Claude Design iterations)
- [ ] All pages match mockups
- [ ] Light/dark themes work perfectly
- [ ] Mobile and web look cohesive
- [ ] Accessibility passes WCAG AA
- [ ] No console errors or warnings
- [ ] Page load times unchanged
- [ ] All features still work (zones, tickets, reports, etc.)

---

## Next Steps

1. **Start Claude Design** — take screenshots, write prompt, explore concepts
2. **Share design** — show me what Claude Design generated
3. **Get approval** — finalize color palette + component styles
4. **Begin Phase 2** — implement with Radix UI + Tailwind

Ready to screenshot and start exploring designs?
