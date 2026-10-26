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
    : name==='next/navigation' ? {useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/tickets',useRouter:()=>({push(){},replace(){}})}
    : name==='@/hooks/useTickets' && source==='app/(dashboard)/tickets/page' ? {useTicketList:()=>({items:['assigned','pending_review','verified'].map((status,i)=>({...load('../tests/fixtures').ticket,id:'ticket-'+i,ticket_number:i+1,status})),isLoading:false,refresh(){}}),useTicketDetail:()=>({ticket:null,isLoading:false,updateCache(){}})}
    : name==='@/context/AuthContext' ? {useAuth:()=>({user:load('../tests/fixtures').analyst,loading:false,logout:async()=>{}})}
    : name==='@/context/ThemeContext' ? {useTheme:()=>({theme:'light',setTheme(){}})}
    : name==='@/components/ui/Toast' ? {useToast:()=>notices}
    : name==='swr' ? {__esModule:true,default:key=>({data:load('../tests/fixtures').fixtureFor(key),mutate:async()=>{},isLoading:false}),mutate:async()=>{}}
    : name.startsWith('@/') ? load(name.slice(2))
    : name.startsWith('.') ? load(path.relative(root,path.resolve(path.dirname(file),name))) : require(name);
  new Function('require','module','exports',code + (source==='app/(dashboard)/tickets/page' ? '\nmodule.exports.TicketRow = TicketRow;' : ''))(req,mod,mod.exports);
  return mod.exports;
}
test('upload uses an accessible browse button and keeps selected files removable',()=>{
  const { FileUpload } = load('components/zones/FileUpload');
  const empty = renderToStaticMarkup(React.createElement(FileUpload,{files:[],onFilesChange(){},onRemove(){}}));
  assert.ok([...empty.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].some(([,body])=>body.replace(/<[^>]*>/g,'')==='Browse files'));
  assert.match(empty,/accept=".csv,text\/csv" multiple/);
  const selected = renderToStaticMarkup(React.createElement(FileUpload,{files:[{name:'station.csv',size:1024}],onFilesChange(){},onRemove(){},disabled:true}));
  assert.ok([...selected.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].some(([,attrs,body])=>attrs.includes('disabled=""')&&body.replace(/<[^>]*>/g,'')==='Add files'));
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
  const completed = renderToStaticMarkup(React.createElement(PipelineDiagram,{running:false,result:load('../tests/fixtures').result}));
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

test('Zones sidebar announces processed results only when they are ready', () => {
  const { Sidebar } = load('components/dashboard/Sidebar');
  const ready = renderToStaticMarkup(React.createElement(Sidebar,{resultsReady:true}));
  assert.match(ready,/aria-label="Zones — processed results available"/);
  assert.match(ready,/>Ready</);
  const empty = renderToStaticMarkup(React.createElement(Sidebar,{resultsReady:false}));
  assert.doesNotMatch(empty,/processed results available|>Ready</);
  assert.match(empty,/>AWS Sentinel</);
  assert.doesNotMatch(empty,/>\s*(Anomaly detector|Workspace)\s*</);
});


test('ticket detail keeps full context with a labelled PDF action and quieter metadata', () => {
  const { TicketDetailBody } = load('components/tickets/TicketDetailBody');
  const model = { kind:'ticket', refId:'29', title:'Inspect unusual rainfall', status:'follow_up', priority:'high', zone:'C', stationId:'Marikina_Youth_Camp_1', assignees:[{id:'tech',name:'Assigned Technician'}], createdAt:'2026-10-25T12:00:00Z', updatedAt:'2026-10-26T12:00:00Z', description:'Original station evidence.', followUpNotes:'Check the sensor again.', report:null, onDownload(){} };
  const html = renderToStaticMarkup(React.createElement(TicketDetailBody,{model}));
  assert.match(html, /aria-label="Download ticket PDF"/);
  assert.ok([...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].some(([,body])=>body.replace(/<[^>]*>/g,'')==='PDF'));
  for (const text of ['Inspect unusual rainfall','Marikina_Youth_Camp_1','Assigned Technician','Original station evidence.','Check the sensor again.','High priority','Zone C','Created','Updated','Activity']) assert.ok(html.includes(text), text);
});

test('ticket dock exposes one clear management or review control and retains its review form', () => {
  const { TicketActionDock } = load('components/tickets/TicketActionDock');
  const ticket = {id:'ticket',status:'assigned',technicians:[]};
  const assigned = renderToStaticMarkup(React.createElement(TicketActionDock,{ticket,onUpdated(){}}));
  assert.match(assigned,/aria-label="Manage technicians"/);
  assert.match(assigned,/aria-expanded="false"/);
  assert.match(assigned,/class="actionDock"/);
  assert.doesNotMatch(assigned,/flex-shrink:0/);
  assert.doesNotMatch(assigned,/dock-ping|dock-arrow|dock-review-icon/);
  const pending = renderToStaticMarkup(React.createElement(TicketActionDock,{ticket:{...ticket,status:'pending_review'},onUpdated(){},reviewSlot:React.createElement('div',null,'Review form remains available')}));
  assert.match(pending,/aria-label="Review inspection"/);
  assert.match(pending,/aria-expanded="true"/);
  assert.match(pending,/Review form remains available/);
  assert.equal(renderToStaticMarkup(React.createElement(TicketActionDock,{ticket:{...ticket,status:'verified'},onUpdated(){}})), '');
});


test('balanced ticket queue separates update time from station and omits technician names', () => {
  const {TicketRow} = load('app/(dashboard)/tickets/page');
  const source = load('../tests/fixtures').ticket;
  const row = {...source, title:'A long but meaningful rainfall inspection title', station_id:'Marikina_Youth_Camp_1', technicians:[{full_name:'First Technician'},{full_name:'Second Technician'}],technician:{full_name:'First Technician'}};
  const html = renderToStaticMarkup(React.createElement(TicketRow,{ticket:row,selected:true,onClick(){}}));
  assert.match(html,/aria-pressed="true" data-selected="true"/);
  assert.match(html,/title="Marikina_Youth_Camp_1"/);
  assert.doesNotMatch(html,/First Technician|Second Technician|\+1/);
  assert.match(html,/<time dateTime=/);
  assert.doesNotMatch(html,/class="list-row"/);
  const tree = TicketRow({ticket:row,selected:true,onClick(){}});
  const heading = tree.props.children[0];
  assert.ok(heading.props.children.some(child => child?.type === 'time'), 'update time belongs with ticket ID/status, leaving room for the station');
});

test('ticket toolbar preserves status counts and priority choices in the shared controls', () => {
  const {default:TicketsPage} = load('app/(dashboard)/tickets/page');
  const html = renderToStaticMarkup(React.createElement(TicketsPage));
  assert.match(html,/aria-label="Search tickets"/);
  assert.match(html,/aria-label="Filter by status"/);
  assert.match(html,/All statuses \(3\)/);
  assert.match(html,/aria-label="Filter by priority"/);
  assert.match(html,/All priorities/);
  assert.match(html,/Needs review/);
  assert.match(html,/Other tickets/);
  assert.match(html,/Select a ticket/);
});


test('ticket report separates context, findings and history into named readable sections', () => {
  const {TicketDetailBody} = load('components/tickets/TicketDetailBody');
  const model = {...load('../tests/fixtures').detail, refId:'24', assigneesHistory:[{id:'past',name:'Previous Technician'}]};
  const html = renderToStaticMarkup(React.createElement(TicketDetailBody,{model}));
  assert.match(html,/<section aria-label="Ticket information"/);
  for (const title of ['Description','Reading details','Inspection findings','Previously assigned','Activity']) assert.ok(html.includes('aria-label="'+title+'"'),title);
  assert.ok(html.indexOf('aria-label="Inspection findings"') < html.indexOf('aria-label="Previously assigned"'));
  for (const text of [model.stationId, model.report.notes, model.report.rootCause, model.report.correctiveAction, 'Previous Technician']) assert.ok(html.includes(text),text);
});


test('report density groups earlier records under History and retains exact dates', () => {
  const {TicketDetailBody} = load('components/tickets/TicketDetailBody');
  const model = {...load('../tests/fixtures').detail, refId:'24', assigneesHistory:[{id:'past',name:'Previous Technician'}], priorRounds:[{id:'previous',round:1,submittedAt:'2023-09-28T10:30:00Z',notes:'Earlier inspection'}]};
  const html = renderToStaticMarkup(React.createElement(TicketDetailBody,{model}));
  const history = html.indexOf('aria-label="History"');
  assert.ok(history > html.indexOf('aria-label="Inspection findings"'));
  assert.ok(html.indexOf('aria-label="Previous rounds"') > history);
  assert.ok(html.indexOf('aria-label="Previously assigned"') > history);
  assert.ok(html.indexOf('aria-label="Activity"') > history);
  assert.ok(html.includes('dateTime="'+model.createdAt+'"'));
  assert.ok(html.includes('dateTime="'+model.updatedAt+'"'));
  for (const text of [model.stationId,model.report.notes,model.report.rootCause,model.report.correctiveAction,'Previous Technician','Round 1']) assert.ok(html.includes(text),text);
});

test('report density retains follow-up instructions and cancellation reasons in their own states', () => {
  const {TicketDetailBody} = load('components/tickets/TicketDetailBody');
  const base = {...load('../tests/fixtures').detail,refId:'24'};
  const followUp = renderToStaticMarkup(React.createElement(TicketDetailBody,{model:{...base,status:'follow_up',followUpCount:2,followUpNotes:'Inspect the gauge again.'}}));
  assert.match(followUp,/aria-label="Follow-up instructions"/);
  assert.match(followUp,/Inspect the gauge again\./);
  const cancelled = renderToStaticMarkup(React.createElement(TicketDetailBody,{model:{...base,status:'cancelled',cancellationReason:'Duplicate reading.'}}));
  assert.match(cancelled,/Duplicate reading\./);
  assert.doesNotMatch(cancelled,/aria-label="Follow-up instructions"/);
});


test('report density preserves inspection evidence and file links across ticket states', () => {
  const {TicketDetailBody} = load('components/tickets/TicketDetailBody');
  const base = {...load('../tests/fixtures').detail,refId:'24',attachments:[{id:'csv',file_name:'station-evidence.csv',file_url:'/test/station-evidence.csv',file_size:2048}]};
  for (const status of ['assigned','in-progress','pending_review','follow_up','verified','cancelled']) {
    const html = renderToStaticMarkup(React.createElement(TicketDetailBody,{model:{...base,status}}));
    for (const text of [base.stationId,base.report.notes,base.report.rootCause,base.report.correctiveAction,'station-evidence.csv']) assert.ok(html.includes(text),status+': '+text);
    assert.match(html,/href="\/test\/station-evidence.csv"/);
    assert.ok(html.indexOf('aria-label="Attachments"') < html.indexOf('aria-label="History"'));
  }
});
