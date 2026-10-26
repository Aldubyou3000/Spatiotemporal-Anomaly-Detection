const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {test}=require('node:test'),ts=require('typescript'),React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const root=path.resolve(__dirname,'../src'),cache=new Map();
let hookState=null,ticketHooks=null,swrCalls=[];
const react={...React,useState(initial){if(!hookState)return React.useState(initial);const cell=hookState.index++;if(!(cell in hookState.values))hookState.values[cell]=typeof initial==='function'?initial():initial;const state=hookState;return [state.values[cell],next=>{state.values[cell]=typeof next==='function'?next(state.values[cell]):next;}];},useEffect(...args){if(!hookState)return React.useEffect(...args);},useRef(value){return hookState?{current:value}:React.useRef(value);}};
function load(source){
 const base=path.join(root,source),file=[base,base+'.ts',base+'.tsx'].find(fs.existsSync);
 if(cache.has(file))return cache.get(file).exports;
 const mod={exports:{}};cache.set(file,mod);
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText;
 const req=name=>name==='react'?react:name.endsWith('.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>key})}:name==='next/navigation'?{useSearchParams:()=>new URLSearchParams(),usePathname:()=>'/tickets'}:name==='next/link'?{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}:name==='@/context/AuthContext'?{useAuth:()=>({user:{full_name:'Analyst'},loading:false})}:name==='@/components/ui/Toast'?{useToast:()=>({success(){},error(){}})}:name==='@/hooks/useTickets'&&source==='app/(dashboard)/tickets/page'?new Proxy({},{get:(_,key)=>ticketHooks[key]}):name==='swr'?{__esModule:true,default:(key,fetcher,options)=>{swrCalls.push({key,options});return {data:undefined,isLoading:true,mutate(){}};},mutate(){}}:name.startsWith('@/')?load(name.slice(2)):name.startsWith('.')?load(path.relative(root,path.resolve(path.dirname(file),name))):require(name);
 new Function('require','module','exports',code+(source==='app/(dashboard)/tickets/page'?'\nmodule.exports.DetailPanel=DetailPanel;':''))(req,mod,mod.exports);return mod.exports;
}
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}return null;}
function renderer(Component){const state={index:0,values:[]};return props=>{hookState=state;state.index=0;try{return Component(props);}finally{hookState=null;}};}
const ticket=load('../tests/fixtures').ticket;
test('loading buttons preserve their content footprint and never animate dimensions',()=>{
 const {Button}=load('components/ui/Button');
 const normal=Button.render({children:React.createElement('span',null,'Download PDF')},null);
 const busy=Button.render({loading:true,children:React.createElement('span',null,'Download PDF')},null);
 assert.ok(find(busy,node=>node.props?.['aria-hidden']===true&&node.props?.style?.position==='absolute'),'spinner must be out of the flex layout');
 assert.equal(normal.props.style.display,busy.props.style.display);
 assert.doesNotMatch(busy.props.style.transition,/all|width|height|padding/);
 assert.equal(busy.props['aria-busy'],true);
 assert.match(renderToStaticMarkup(busy),/Download PDF/);
});
test('review completion renders the management drawer closed immediately',()=>{
 const {TicketActionDock}=load('components/tickets/TicketActionDock');
 const render=renderer(TicketActionDock),base={ticket:{...ticket,status:'pending_review'},reviewSlot:React.createElement('p',null,'Review'),onUpdated(){}};
 let tree=render(base);assert.ok(find(tree,n=>n.props?.id==='ticket-action-drawer'));
 tree=render({...base,ticket:{...ticket,status:'follow_up'},reviewSlot:undefined});
 assert.equal(find(tree,n=>n.props?.id==='ticket-action-drawer'),null,'management must not inherit the expanded review form');
});
test('background ticket updates preserve the explicitly collapsed review drawer',()=>{
 const {TicketActionDock}=load('components/tickets/TicketActionDock'),render=renderer(TicketActionDock);
 const base={ticket:{...ticket,status:'pending_review'},reviewSlot:React.createElement('p',null,'Review'),onUpdated(){}};
 let tree=render(base);find(tree,n=>n.props?.['aria-controls']==='ticket-action-drawer').props.onClick();
 tree=render({...base,ticket:{...base.ticket,updated_at:'2026-10-27T01:00:00Z'}});
 assert.equal(find(tree,n=>n.props?.id==='ticket-action-drawer'),null);
});
test('ticket-scoped reads cannot carry another ticket details, report or files',()=>{
 const hooks=load('hooks/useTickets');swrCalls=[];
 for(const id of ['first','second']){hooks.useTicketDetail(id);hooks.useTicketReport(id);hooks.useTicketAttachments(id);}
 for(const call of swrCalls)assert.equal(call.options.keepPreviousData,false,call.key[0]);
});
test('initial detail waits for inspection and files before showing the full body',()=>{
 const {DetailPanel}=load('app/(dashboard)/tickets/page');
 ticketHooks={useTicketReport:()=>({report:null,priorRounds:[],isLoading:true}),useTicketAttachments:()=>({attachments:[],isLoading:true})};
 const html=renderToStaticMarkup(React.createElement(DetailPanel,{ticket,onUpdated(){},updateCache(){}}));
 assert.ok(!html.includes(ticket.title),'avoid showing a partial detail and growing it as resources arrive');
});

test('loaded detail remains mounted through a background refresh',()=>{
 const {DetailPanel}=load('app/(dashboard)/tickets/page');
 ticketHooks={useTicketReport:()=>({report:null,priorRounds:[],isLoading:false,isValidating:true}),useTicketAttachments:()=>({attachments:[],isLoading:false,isValidating:true})};
 const html=renderToStaticMarkup(React.createElement(DetailPanel,{ticket,onUpdated(){},updateCache(){}}));
 assert.ok(html.includes(ticket.title));assert.doesNotMatch(html,/animate-fade-in|animate-scale-in/);
});
test('review drafts and action labels stay in place during a save',()=>{
 const {ReviewPanel}=load('components/tickets/ReviewPanel'),render=renderer(ReviewPanel);
 const base={ticket:{...ticket,status:'pending_review'},approving:false,error:'',onApprove(){},onFollowUp(){}};
 let tree=render(base);find(tree,n=>n.type==='textarea').props.onChange({target:{value:'Keep these notes'}});
 tree=render({...base,approving:true});
 assert.equal(find(tree,n=>n.type==='textarea').props.value,'Keep these notes');
 const action=find(tree,n=>n.props?.loading===true);
 assert.ok(action);assert.doesNotMatch(renderToStaticMarkup(action),/Approving|Sending/);
});
