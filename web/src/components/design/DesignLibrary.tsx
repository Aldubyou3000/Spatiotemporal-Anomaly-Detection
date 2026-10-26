"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Layers3, Monitor, Moon, RotateCcw, Search, SlidersHorizontal, Smartphone, Sun, Tablet } from 'lucide-react';
import { CATALOG, COLOR_TOKENS, SIZE_TOKENS, PROPERTY_CONTROLS, STORAGE_KEY, freshDraft, readDraft, propertyMax, type Draft, type SpecimenId, type ComponentStyle } from './library';
import styles from './DesignLibrary.module.css';

export function DesignLibrary() {
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [loaded, setLoaded] = useState(false);
  const [selection, setSelection] = useState<SpecimenId | 'all'>('all');
  const [query, setQuery] = useState('');
  const [inspector, setInspector] = useState<'theme' | 'component'>('theme');
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [storageError, setStorageError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const active = CATALOG.find(item => item.id === selection);
  const current = draft.tokens[draft.theme];
  const component: ComponentStyle = selection === 'all' ? {} : draft.components[selection] ?? {};
  const message = { type: 'ui-library-settings', draft, selection };

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); if (saved) setDraft(readDraft(JSON.parse(saved))); }
    catch { setStorageError('The saved draft could not be loaded. Starting with the website defaults.'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); }
    catch { setStorageError('Browser storage is unavailable. Edits will last until this page closes.'); }
    frame.current?.contentWindow?.postMessage(message, window.location.origin);
    // The message is composed from these values on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selection, loaded]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'ui-library-ready') frame.current?.contentWindow?.postMessage(message, window.location.origin);
      if (event.data?.type === 'ui-library-defaults') setDefaults(event.data.tokens);
      if (event.data?.type === 'ui-library-theme' && (event.data.theme === 'light' || event.data.theme === 'dark')) setDraft(d=>({...d,theme:event.data.theme}));
      if (event.data?.type === 'ui-library-select' && CATALOG.some(item=>item.id===event.data.selection)) { setSelection(event.data.selection); setInspector('component'); }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selection]);
  const token = (key: string, value: string) => setDraft(d => ({ ...d, tokens: { ...d.tokens, [d.theme]: { ...d.tokens[d.theme], [key]: value } } }));
  const property = (key: string, value: string | number) => {
    if (selection === 'all') return;
    setDraft(d => readDraft({ ...d, components: { ...d.components, [selection]: { ...d.components[selection], [key]: value } } }));
  };
  const choose = (id: SpecimenId | 'all') => { setSelection(id); setInspector(id === 'all' ? 'theme' : 'component'); };
  const reset = () => {
    if (selection !== 'all' && inspector === 'component') setDraft(d => { const components = { ...d.components }; delete components[selection]; return { ...d, components }; });
    else setDraft(freshDraft());
  };
  const matches = CATALOG.filter(item => `${item.name} ${item.group} ${item.sources.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  const changed = Object.values(draft.tokens).reduce((count, tokens) => count + Object.keys(tokens).length, 0) + Object.values(draft.components).reduce((count, value) => count + Object.keys(value ?? {}).length, 0) + Number(draft.font !== 'website');
  return <div className={styles.library}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.brandIcon}><Layers3 size={19} /></span><div><strong>UI Library</strong><small>AWS Sentinel · Design playground</small></div><span className={styles.local}>LOCAL</span></div>
      <div className={styles.topActions}><span className={styles.saved} role="status"><Check size={13} />{storageError ? 'Local draft warning' : loaded ? `${changed ? `${changed} edits · ` : ''}Draft saved in this browser` : 'Loading draft…'}</span><a href="/zones"><ArrowLeft size={14} /> Website</a></div>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.navigation} aria-label="Component library">
        <label className={styles.search} data-search-field><Search size={14} /><input aria-label="Find a component" placeholder="Find a component…" value={query} onChange={e => setQuery(e.target.value)} /></label>
        <button className={styles.navItem} data-active={selection === 'all'} onClick={() => choose('all')}><Layers3 size={15} /> All components <span>{CATALOG.length}</span></button>
        <nav>{[...new Set(CATALOG.map(item => item.group))].map(group => <section key={group}><h2>{group}</h2>{matches.filter(item => item.group === group).map(item => <button key={item.id} className={styles.navItem} data-active={selection === item.id} onClick={() => choose(item.id)}>{item.name}<ChevronRight size={12} /></button>)}</section>)}</nav>
        {!matches.length && <p className={styles.muted}>No components match your search.</p>}
        <p className={styles.navNote}>Live components.<br />Sample data. Your own workspace.</p>
      </aside>
      <main className={styles.canvas}>
        <div className={styles.canvasHeader}><div><div className={styles.eyebrow}>{active?.group ?? 'Your design system'}</div><h1>{active?.name ?? 'All components'}</h1><p>{active?.description ?? 'Explore the website’s building blocks. Select a component to fine-tune its appearance.'}</p></div>
          <div className={styles.viewControls}>
            <div className={styles.segment} aria-label="Preview theme">{(['light', 'dark'] as const).map(theme => <button key={theme} aria-label={`${theme} preview`} aria-pressed={draft.theme === theme} onClick={() => setDraft(d => ({ ...d, theme }))}>{theme === 'light' ? <Sun size={15} /> : <Moon size={15} />}</button>)}</div>
            <div className={styles.segment} aria-label="Preview width">{([['desktop', Monitor], ['tablet', Tablet], ['mobile', Smartphone]] as const).map(([viewport, Icon]) => <button key={viewport} aria-label={`${viewport} preview`} aria-pressed={draft.viewport === viewport} onClick={() => setDraft(d => ({ ...d, viewport }))}><Icon size={15} /></button>)}</div>
          </div>
        </div>
        {storageError && <p className={styles.warning} role="status">{storageError}</p>}
        <div className={styles.stage}><div className={styles.frameWrap} data-width={draft.viewport}>
          <iframe ref={frame} title="Live component preview" src="/ui-library/preview" className={styles.frame} onLoad={() => frame.current?.contentWindow?.postMessage(message, window.location.origin)} />
        </div></div>
        <footer className={styles.canvasFooter}><span>Changes affect this playground only.</span><span>{draft.viewport === 'desktop' ? 'Fluid canvas' : draft.viewport === 'tablet' ? '768px canvas' : '390px canvas'} · {draft.theme}</span></footer>
      </main>
      <aside className={styles.inspector} aria-label="Appearance editor">
        <div className={styles.inspectorHeading}><SlidersHorizontal size={15} /><strong>Appearance</strong><button onClick={reset} title="Reset current styles" aria-label="Reset current styles"><RotateCcw size={14} /></button></div>
        <div className={styles.inspectorTabs}><button aria-pressed={inspector === 'theme'} onClick={() => setInspector('theme')}>Shared theme</button><button disabled={selection === 'all'} aria-pressed={inspector === 'component'} onClick={() => setInspector('component')}>Component</button></div>
        <div className={styles.inspectorBody}>
          {inspector === 'theme' ? <>
            <div className={styles.sectionLabel}>Preview settings</div><label className={styles.field}>Density<select value={draft.density} onChange={e => setDraft(d => ({ ...d, density: e.target.value as Draft['density'] }))}><option value="compact">Compact</option><option value="roomy">Roomy</option></select></label>
            <div className={styles.sectionLabel}>Colors <small>{draft.theme} theme</small></div>
            {COLOR_TOKENS.map(([key, label]) => { const value = current[key] ?? defaults[key] ?? '#1e6fd9'; return <label className={styles.colorField} key={key}><span>{label}</span><input type="color" aria-label={`${label} color`} value={/^#[\da-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={e => token(key, e.target.value)} /><code>{value.toUpperCase()}</code></label>; })}
            <div className={styles.sectionLabel}>Type, spacing & shape</div>
            <label className={styles.field}>Typeface<select aria-label="Typeface" value={draft.font} onChange={e => setDraft(d=>({...d,font:e.target.value as Draft['font']}))}><option value="website">Website default</option><option value="system">System sans</option><option value="serif">Serif</option><option value="mono">Monospace</option></select></label>
            {SIZE_TOKENS.map(([key, label, min, max]) => { const value = parseFloat(current[key] ?? defaults[key]) || min; return <label className={styles.rangeField} key={key}><span>{label}<output>{value}px</output></span><input type="range" aria-label={label} min={min} max={max} value={value} onChange={e => token(key, `${e.target.value}px`)} /></label>; })}
          </> : <>
            <div className={styles.sectionLabel}>{active?.name}</div><p className={styles.muted}>Override this component’s appearance. Unset controls follow the shared theme.</p>
            {(['background', 'color', 'border'] as const).map(key => <label className={styles.colorField} key={key}><span>{key === 'color' ? 'Text color' : key === 'border' ? 'Border color' : 'Background'}</span><input type="color" aria-label={`Component ${key}`} value={component[key] ?? (key === 'background' ? '#ffffff' : key === 'color' ? '#0b1220' : '#e4e7eb')} onChange={e => property(key, e.target.value)} /><code>{component[key] ?? 'Auto'}</code></label>)}
            {PROPERTY_CONTROLS.map(([key, label, min, max]) => <label className={styles.rangeField} key={key}><span>{label}<output>{component[key] === undefined ? 'Auto' : `${component[key]}px`}</output></span><input type="range" aria-label={`Component ${label}`} min={min} max={propertyMax(selection, key, max)} value={component[key] ?? min} onChange={e => property(key, Number(e.target.value))} /></label>)}
            <button className={styles.resetButton} onClick={reset}><RotateCcw size={13} /> Reset component</button>
            <div className={styles.sectionLabel}>Source components</div>{active?.sources.map(source => <code className={styles.source} key={source}>components/{source}</code>)}
            {selection === 'save-status' && <p className={styles.muted}>RunSaveController coordinates the same save dialog and status components; its navigation guards are not run in this playground.</p>}
          </>}
          <p className={styles.inspectorNote}>Your draft stays here when you refresh. Reset returns to the website’s defaults.</p>
        </div>
      </aside>
    </div>
  </div>;
}
