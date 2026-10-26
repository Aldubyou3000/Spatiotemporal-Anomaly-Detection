const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
const notices = {success(){},error(){},info(){}};
function load(source) {
  const base = path.join(root, source);
  const file = [base, base+'.ts', base+'.tsx'].find(fs.existsSync);
  if (cache.has(file)) return cache.get(file).exports;
  const mod = {exports:{}};cache.set(file,mod);
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
  const req = name => name.endsWith('.css') ? {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}
    : name==='next/dynamic' ? {__esModule:true,default:()=>()=>null}
    : name==='next/link' ? {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}
    : name==='next/navigation' ? {usePathname:()=>'/ui-library/preview',useRouter:()=>({push(){},replace(){}})}
    : name==='@/context/AuthContext' ? {useAuth:()=>({user:load('components/design/fixtures').analyst,loading:false,logout:async()=>{}})}
    : name==='@/context/ThemeContext' ? {useTheme:()=>({theme:'light',setTheme(){}})}
    : name==='@/components/ui/Toast' ? {useToast:()=>notices}
    : name==='swr' ? {__esModule:true,default:key=>({data:load('components/design/fixtures').fixtureFor(key),mutate:async()=>{},isLoading:false}),mutate:async()=>{}}
    : name.startsWith('@/') ? load(name.slice(2))
    : name.startsWith('.') ? load(path.relative(root,path.resolve(path.dirname(file),name))) : require(name);
  new Function('require','module','exports',code)(req,mod,mod.exports);
  return mod.exports;
}
const { CATALOG } = load('components/design/library');
const { Specimen } = load('components/design/Specimens');
for (const item of CATALOG) test(`real ${item.name} specimen renders with fixture data`,()=>{
  assert.doesNotThrow(()=>renderToStaticMarkup(React.createElement(Specimen,{id:item.id})));
});
test('every website visual component module is represented in the gallery inventory',()=>{
  const sources = new Set(CATALOG.flatMap(item=>item.sources));
  for (const group of ['ui','dashboard','history','zones','tickets']) {
    for (const file of fs.readdirSync(path.join(root,'components',group)).filter(file=>file.endsWith('.tsx'))) assert.ok(sources.has(`${group}/${file}`),`${group}/${file} missing from gallery`);
  }
});
test('the playground sidebar has its own stored preference',()=>{
  const html = renderToStaticMarkup(React.createElement(Specimen,{id:'shell'}));
  assert.match(html,/Workspace preview/);
  assert.match(fs.readFileSync(path.join(root,'components/design/Specimens.tsx'),'utf8'),/storageKey="aws-sentinel-ui-library-sidebar"/);
});

test('upload uses an accessible browse button and keeps selected files removable',()=>{
  const { FileUpload } = load('components/zones/FileUpload');
  const empty = renderToStaticMarkup(React.createElement(FileUpload,{files:[],onFilesChange(){},onRemove(){}}));
  assert.match(empty,/<button[^>]*>Browse files<\/button>/);
  assert.match(empty,/accept=".csv,text\/csv" multiple/);
  const selected = renderToStaticMarkup(React.createElement(FileUpload,{files:[{name:'station.csv',size:1024}],onFilesChange(){},onRemove(){},disabled:true}));
  assert.match(selected,/<button[^>]*disabled=""[^>]*>Add files<\/button>/);
  assert.match(selected,/aria-label="Remove station.csv"/);
  const names = ['HMDAS-SO526010-Valenzuela_NHS_Rainfall_01Jan2021_31Dec2023.csv', 'HMDAS-SO526010-NapindanII_Hourly_Rainfall_01Jan2021_31Dec2023.csv'];
  const hmdas = renderToStaticMarkup(React.createElement(FileUpload,{files:names.map(name=>({name,size:1024})),onFilesChange(){},onRemove(){}}));
  assert.match(hmdas,/>Valenzuela NHS<\/p>/);
  assert.match(hmdas,/>NapindanII<\/p>/);
  for (const name of names) assert.ok(hmdas.includes('aria-label="Remove '+name+'"'), 'removal keeps the original filename');

});

test('idle detection steps stay visible without placeholder counts; results keep real counts',()=>{
  const { PipelineDiagram } = load('components/zones/PipelineDiagram');
  const idle = renderToStaticMarkup(React.createElement(PipelineDiagram,{running:false,result:null}));
  assert.match(idle,/<ol[^>]*aria-label="Detection steps"/);
  assert.equal((idle.match(/<li>/g)||[]).length,3);
  assert.doesNotMatch(idle,/—|<details/);
  const completed = renderToStaticMarkup(React.createElement(PipelineDiagram,{running:false,result:load('components/design/fixtures').result}));
  assert.match(completed,/All three steps are complete/);
  assert.match(completed,/120 daily readings/);
  assert.doesNotMatch(completed,/role="progressbar"/);
});

test('processing shows indeterminate progress without claiming a stage is finished',()=>{
  const { PipelineDiagram } = load('components/zones/PipelineDiagram');
  const running = renderToStaticMarkup(React.createElement(PipelineDiagram,{running:true,result:null}));
  assert.match(running,/role="progressbar" aria-label="Rainfall detection in progress"/);
  assert.match(running,/aria-busy="true"/);
  assert.equal((running.match(/<li(?:\s|>)/g)||[]).length,3);
  assert.doesNotMatch(running,/aria-valuenow|All three steps are complete|Running Zone|—/);
});

test('server progress advances the active zone and shows its stations without timed completion',()=>{
  const { PipelineDiagram } = load('components/zones/PipelineDiagram');
  for (const [index, stage] of ['zone_a','zone_b','zone_c','finalizing'].entries()) {
    const html = renderToStaticMarkup(React.createElement(PipelineDiagram,{running:true,result:null,progress:{stage,station_ids:['Station One','Station Two']}}));
    assert.equal((html.match(/data-state="done"/g)||[]).length,index);
    assert.equal((html.match(/aria-current="step"/g)||[]).length,index===3?0:1);
    assert.equal(html.includes('Stations being processed'),index!==3);
    if(index!==3) assert.match(html,/Station One/);
    else assert.match(html,/Preparing your results/);
  }
});
