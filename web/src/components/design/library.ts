export const CATALOG = [
  { id: 'buttons', name: 'Buttons', group: 'Foundations', description: 'Variants, sizes, icons and loading states.', sources: ['ui/Button.tsx'], selector: 'button' },
  { id: 'inputs', name: 'Inputs', group: 'Foundations', description: 'Labels, hints, errors, password and disabled fields.', sources: ['ui/Input.tsx'], selector: 'input' },
  { id: 'selects', name: 'Select menus', group: 'Foundations', description: 'The actual portalled station and status dropdown.', sources: ['ui/Select.tsx'], selector: '[aria-haspopup="listbox"]' },
  { id: 'badges', name: 'Badges & status', group: 'Foundations', description: 'Every semantic tone, with and without a status dot.', sources: ['ui/Badge.tsx'], selector: '.design-badge' },
  { id: 'cards', name: 'Cards & typography', group: 'Foundations', description: 'Surfaces, headings, text hierarchy and shared card parts.', sources: ['ui/Card.tsx'], selector: '[data-design-card]' },
  { id: 'tabs', name: 'Tabs', group: 'Navigation', description: 'Active, inactive and interactive panel states.', sources: ['ui/Tabs.tsx'], selector: '[role="tab"]' },
  { id: 'shell', name: 'Sidebar & header', group: 'Navigation', description: 'The real dashboard shell with a sample analyst.', sources: ['dashboard/Sidebar.tsx', 'dashboard/Header.tsx', 'dashboard/PageTransition.tsx', 'ui/SentinelMark.tsx'], selector: '.design-shell' },
  { id: 'pagination', name: 'Pagination', group: 'Navigation', description: 'History paging with local page changes.', sources: ['history/HistoryPagination.tsx'], selector: 'button' },
  { id: 'dialogs', name: 'Dialogs', group: 'Feedback', description: 'Modal, confirmation, and the ticket creation flow.', sources: ['ui/Modal.tsx', 'ui/ConfirmDialog.tsx', 'zones/CreateTicketModal.tsx'], selector: '.design-dialog' },
  { id: 'notifications', name: 'Notifications & offline', group: 'Feedback', description: 'Success, error, information toasts and offline banner.', sources: ['ui/Toast.tsx', 'ui/OfflineBanner.tsx'], selector: '.toast' },
  { id: 'loading', name: 'Skeletons', group: 'Feedback', description: 'Ticket, technician, audit and detail loading states.', sources: ['ui/Skeleton.tsx'], selector: '.design-loading' },
  { id: 'save-status', name: 'Save states', group: 'Feedback', description: 'Saved, unsaved, saving and failed review states.', sources: ['history/RunSaveStatus.tsx', 'history/ReviewSaveStatus.tsx', 'history/RunSaveController.tsx'], selector: '.design-save' },
  { id: 'tables', name: 'Data table', group: 'Data & charts', description: 'Search, sorting, empty state and pagination with sample readings.', sources: ['zones/DataTable.tsx'], selector: 'td, th' },
  { id: 'charts', name: 'Rainfall charts', group: 'Data & charts', description: 'Bar comparison and history, including neighbors.', sources: ['zones/DateComparisonChart.tsx', 'zones/StationChart.tsx'], selector: '.design-chart' },
  { id: 'overview', name: 'Overview & station map', group: 'Data & charts', description: 'Summary metrics, station guide and geographic map.', sources: ['zones/OverviewTab.tsx', 'zones/StationMap.tsx'], selector: '.design-overview' },
  { id: 'neighbors', name: 'Nearby stations', group: 'Data & charts', description: 'Station selector and nearby comparison distances.', sources: ['zones/NeighborGroupsTab.tsx'], selector: '.design-neighbors' },
  { id: 'upload', name: 'File upload', group: 'Workflows', description: 'CSV drop zone, selected files and validation.', sources: ['zones/FileUpload.tsx'], selector: '.design-upload' },
  { id: 'pipeline', name: 'Pipeline', group: 'Workflows', description: 'Detection steps, indeterminate progress and completed counts.', sources: ['zones/PipelineDiagram.tsx', 'zones/InfoTip.tsx'], selector: '[aria-label="Detection steps"] > li' },
  { id: 'review', name: 'Reading review', group: 'Workflows', description: 'Queue, evidence views, notes, marking and Undo.', sources: ['zones/AnomalyReportTab.tsx', 'zones/ZoneResults.tsx'], selector: '[aria-label="Selected reading"]' },
  { id: 'tickets', name: 'Ticket & inspection', group: 'Workflows', description: 'Ticket detail, assignment dock, report review and reason chips.', sources: ['tickets/TicketDetailBody.tsx', 'tickets/TicketActionDock.tsx', 'tickets/ReviewPanel.tsx', 'tickets/ReasonPicker.tsx', 'tickets/TechnicianWorkloadBadge.tsx'], selector: '.design-ticket' },
] as const;
export type SpecimenId = typeof CATALOG[number]['id'];
export const STORAGE_KEY = 'aws-sentinel-ui-library-v1';
export const COLOR_TOKENS = [
  ['--brand', 'Accent'], ['--surface', 'Surface'], ['--bg', 'Canvas'], ['--text', 'Text'],
  ['--text-secondary', 'Secondary text'], ['--border', 'Borders'], ['--success', 'Success'],
  ['--warning', 'Warning'], ['--danger', 'Danger'], ['--teal', 'Teal'],
] as const;
export const SIZE_TOKENS = [
  ['--font-base', 'Base text', 12, 20], ['--r-md', 'Corners', 0, 24], ['--pad-x', 'Horizontal spacing', 8, 32],
  ['--pad-y', 'Vertical spacing', 6, 28], ['--row-h', 'Row height', 28, 60],
] as const;
export const PROPERTY_CONTROLS = [
  ['height', 'Height', 20, 800], ['padding', 'Padding', 0, 32], ['radius', 'Corners', 0, 32], ['fontSize', 'Text size', 10, 24],
] as const;
export function propertyMax(id: string, key: string, max: number) {
  return key === 'height' && ['buttons', 'inputs', 'selects', 'badges', 'tabs', 'pagination'].includes(id) ? 80 : max;
}
export type ComponentStyle = Partial<Record<'background' | 'color' | 'border', string> & Record<'height' | 'padding' | 'radius' | 'fontSize', number>>;
export type Draft = {
  version: 1; theme: 'light' | 'dark'; density: 'compact' | 'roomy'; viewport: 'desktop' | 'tablet' | 'mobile';
  font: 'website' | 'system' | 'serif' | 'mono';
  tokens: Record<'light' | 'dark', Record<string, string>>;
  components: Partial<Record<SpecimenId, ComponentStyle>>;
};
export function freshDraft(): Draft {
  return { version: 1, theme: 'light', density: 'compact', viewport: 'desktop', font: 'website', tokens: { light: {}, dark: {} }, components: {} };
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const color = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function readDraft(value: unknown): Draft {
  const source = object(value), draft = freshDraft();
  if (source.version !== 1) return draft;
  if (source.theme === 'dark') draft.theme = 'dark';
  if (source.density === 'roomy') draft.density = 'roomy';
  if (source.font === 'system' || source.font === 'serif' || source.font === 'mono') draft.font = source.font;
  if (source.viewport === 'tablet' || source.viewport === 'mobile') draft.viewport = source.viewport;
  for (const theme of ['light', 'dark'] as const) {
    const tokens = object(object(source.tokens)[theme]);
    for (const [key] of COLOR_TOKENS) if (color(tokens[key])) draft.tokens[theme][key] = tokens[key];
    for (const [key, , min, max] of SIZE_TOKENS) {
      const value = tokens[key];
      if (typeof value === 'string' && /^\d+(\.\d+)?px$/.test(value) && parseFloat(value) >= min && parseFloat(value) <= max) draft.tokens[theme][key] = value;
    }
  }
  for (const { id } of CATALOG) {
    const values = object(object(source.components)[id]), style: ComponentStyle = {};
    for (const key of ['background', 'color', 'border'] as const) if (color(values[key])) style[key] = values[key];
    for (const [key, , min, max] of PROPERTY_CONTROLS) if (typeof values[key] === 'number' && Number.isFinite(values[key]) && values[key] >= min && values[key] <= propertyMax(id, key, max)) style[key] = values[key];
    if (Object.keys(style).length) draft.components[id] = style;
  }
  return draft;
}
export function previewCss(input: Draft): string {
  const draft = readDraft(input), tokens = draft.tokens[draft.theme];
  const declarations = Object.entries(tokens).map(([key, value]) => `${key}:${value}`);
  const fonts = { system: 'Arial, sans-serif', serif: 'Georgia, serif', mono: 'Consolas, monospace' };
  if (draft.font !== 'website') declarations.push(`--font-geist:${fonts[draft.font]}`);
  if (tokens['--brand']) declarations.push(`--brand-hover:color-mix(in srgb,${tokens['--brand']} 85%,black)`, `--brand-soft:color-mix(in srgb,${tokens['--brand']} 12%,var(--surface))`, '--border-focus:var(--brand)', '--on-brand-soft:var(--brand)');
  for (const name of ['success', 'warning', 'danger', 'teal']) if (tokens[`--${name}`]) declarations.push(`--${name}-soft:color-mix(in srgb,var(--${name}) 12%,var(--surface))`, `--${name}-on:var(--${name})`);
  if (tokens['--font-base']) for (const [key, delta] of [['sm', -1], ['xs', -2], ['md', -1], ['lg', 1], ['xl', 5], ['metric', 1]] as const) declarations.push(`--font-${key}:${parseFloat(tokens['--font-base']) + delta}px`);
  if (tokens['--r-md']) for (const [key, delta] of [['sm', -2], ['lg', 2], ['xl', 4], ['2xl', 8]] as const) declarations.push(`--r-${key}:${Math.max(0, parseFloat(tokens['--r-md']) + delta)}px`);
  let css = `:root{${declarations.join(';')}}body{font-size:var(--font-base)}\n`;
  for (const item of CATALOG) {
    const style = draft.components[item.id];
    if (!style) continue;
    const names = { background: 'background-color', color: 'color', border: 'border-color', radius: 'border-radius', height: 'height', padding: 'padding', fontSize: 'font-size' };
    const sharedTargets: Partial<Record<SpecimenId, string>> = { buttons: 'button', inputs: 'input', selects: 'select', badges: 'badge', cards: 'card', tabs: 'tab' };
    const selector = sharedTargets[item.id] ? `[data-ui="${sharedTargets[item.id]}"]` : item.id === 'dialogs' ? '[role="dialog"]>div' : item.id === 'notifications' ? '.toast' : item.selector.split(',').map(s => `[data-specimen="${item.id}"] ${s.trim()}`).join(',');
    css += `${selector}{${Object.entries(style).map(([key, value]) => `${names[key as keyof typeof names]}:${typeof value === 'number' ? value + 'px' : value} !important`).join(';')}}\n`;
  }
  return css;
}

export function previewFetch(original: typeof fetch, base: string, sample?: (request: Request) => Promise<Response | undefined>): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, base);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const response = await sample?.(new Request(input instanceof Request ? input : url, init));
      if (response) return response;
      throw new Error('Design preview only. No website data is changed.');
    }
    return original(input, init);
  };
}
