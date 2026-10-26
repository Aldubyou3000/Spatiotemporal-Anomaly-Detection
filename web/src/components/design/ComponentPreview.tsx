"use client";

import { useEffect, useState } from 'react';
import { SWRConfig, type Middleware, type Key, type BareFetcher, type SWRConfiguration } from 'swr';
import { AuthContext } from '@/context/AuthContext';
import { ThemeContext } from '@/context/ThemeContext';
import { ToastProvider } from '@/components/ui/Toast';
import { CATALOG, COLOR_TOKENS, SIZE_TOKENS, freshDraft, previewCss, previewFetch, readDraft, type Draft, type SpecimenId } from './library';
import { analyst, fixtureFor, createFixtureApi } from './fixtures';
import { Specimen } from './Specimens';

// These hooks normally provide their own API fetcher. Replace it before they mount.
const sampleData: Middleware = useSWRNext => function useSample<Data, Error>(key: Key, _fetcher: BareFetcher<Data> | null, config: SWRConfiguration<Data, Error, BareFetcher<Data>>) {
  return useSWRNext<Data, Error>(key, async () => fixtureFor(key) as Data, config);
};
const sampleCache = () => new Map();
export function ComponentPreview() {
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [selection, setSelection] = useState<SpecimenId|'all'>('all');
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = previewFetch(originalFetch, window.location.href, createFixtureApi());
    const preventNavigation = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', preventNavigation, true);
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.type !== 'ui-library-settings') return;
      setDraft(readDraft(event.data.draft));
      setSelection(CATALOG.some(item=>item.id===event.data.selection) ? event.data.selection : 'all');
    };
    window.addEventListener('message', receive);
    setReady(true);
    window.parent.postMessage({type:'ui-library-ready'}, window.location.origin);
    return () => { window.fetch = originalFetch; document.removeEventListener('click', preventNavigation, true); window.removeEventListener('message', receive); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = draft.theme;
    document.documentElement.dataset.density = draft.density;
    document.body.dataset.gallerySelection = selection;
    const oldStyle = document.getElementById('ui-library-style');
    oldStyle?.remove();
    const computed = getComputedStyle(document.documentElement);
    const tokens = Object.fromEntries([...COLOR_TOKENS, ...SIZE_TOKENS].map(([key])=>[key,computed.getPropertyValue(key).trim()]));
    window.parent.postMessage({type:'ui-library-defaults',tokens},window.location.origin);
    const style = document.createElement('style');
    style.id = 'ui-library-style';
    style.textContent = previewCss(draft) + ':root{--chart-high:var(--danger);--chart-brand:var(--brand);--chart-low:var(--teal)}';
    document.head.appendChild(style);
    return ()=>style.remove();
  }, [draft, selection]);
  const theme = (value: 'light'|'dark') => { setDraft(d=>({...d,theme:value})); window.parent.postMessage({type:'ui-library-theme',theme:value},window.location.origin); };
  if (!ready) return <p style={{padding:24,color:'var(--text-muted)'}}>Loading components…</p>;
  const entries = selection === 'all' ? CATALOG : CATALOG.filter(item=>item.id===selection);
  return <AuthContext.Provider value={{user:analyst,loading:false,logout:async()=>{}}}>
    <ThemeContext.Provider value={{theme:draft.theme,setTheme:theme,toggleTheme:()=>theme(draft.theme==='light'?'dark':'light')}}>
      <SWRConfig value={{provider:sampleCache,use:[sampleData],revalidateOnFocus:false,revalidateOnReconnect:false,errorRetryCount:0}}>
        <ToastProvider>
          <style>{`
            html,body{height:auto;min-height:100%;background:var(--bg);overflow:auto}
            .design-gallery{margin:12px;padding:20px;display:flex;flex-direction:column;gap:32px;background:var(--surface);border-radius:var(--r-xl)}
            .design-gallery[data-view="single"]{margin:0;padding:16px;background:transparent}
            .design-specimen{min-width:0}
            .design-specimen+.design-specimen{border-top:1px solid var(--divider);padding-top:24px}
            .design-specimen>header{padding:0 0 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
            .design-gallery[data-view="single"]>.design-specimen>header{display:none}
            .design-specimen>header h2{margin:0;font-size:var(--font-base);font-weight:600}
            .design-specimen>header p{margin:3px 0 0;color:var(--text-muted);font-size:var(--font-xs)}
            .design-specimen>header button{border:1px solid var(--border);border-radius:var(--r-md);color:var(--text-secondary);background:var(--surface);padding:5px 8px;white-space:nowrap;font:inherit;font-size:var(--font-xs);cursor:pointer}
            .design-specimen-body{min-width:0}
            .design-stack{display:flex;flex-direction:column;gap:20px}
            .design-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
            .design-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:24px}
            .design-caption{font-size:var(--font-xs);color:var(--text-muted);line-height:1.6}
            .design-gallery h3{margin:0;font-size:var(--font-base);font-weight:600}
            .design-gallery table{width:100%}
            .design-shell aside{position:relative!important;flex-shrink:0}
            .design-shell header{position:relative!important}
            @media(max-width:600px){.design-gallery{padding:12px;gap:24px}.design-specimen>header p{max-width:220px}}
          `}</style>
          <div className="design-gallery" data-view={selection === 'all' ? 'all' : 'single'}>{entries.map(item=><section key={item.id} className="design-specimen" data-specimen={item.id}>
            <header><div><h2>{item.name}</h2><p>{item.description}</p></div>{selection==='all'&&<button onClick={()=>window.parent.postMessage({type:'ui-library-select',selection:item.id},window.location.origin)}>Customize →</button>}</header>
            <div className="design-specimen-body"><Specimen id={item.id}/></div>
          </section>)}</div>
        </ToastProvider>
      </SWRConfig>
    </ThemeContext.Provider>
  </AuthContext.Provider>;
}
