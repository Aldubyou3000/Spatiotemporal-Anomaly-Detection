"use client";

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Download, Info, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import { Tabs, TabsList, Tab, TabPanel } from '@/components/ui/Tabs';
import { Modal, ModalFooter } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Skeleton, TicketRowSkeleton, TechRowSkeleton, AuditRowSkeleton, DetailSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { SentinelMark } from '@/components/ui/SentinelMark';
import { Header } from '@/components/dashboard/Header';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { PageTransition } from '@/components/dashboard/PageTransition';
import { HistoryPagination } from '@/components/history/HistoryPagination';
import { RunSaveStatus } from '@/components/history/RunSaveStatus';
import { ReviewSaveStatus } from '@/components/history/ReviewSaveStatus';
import type { useHistoryReviews } from '@/hooks/useHistory';
import { DataTable } from '@/components/zones/DataTable';
import { DateComparisonChart } from '@/components/zones/DateComparisonChart';
import { StationChart } from '@/components/zones/StationChart';
import { FileUpload } from '@/components/zones/FileUpload';
import { PipelineDiagram } from '@/components/zones/PipelineDiagram';
import { NeighborGroupsTab } from '@/components/zones/NeighborGroupsTab';
import { ZoneResults } from '@/components/zones/ZoneResults';
import { InfoTip } from '@/components/zones/InfoTip';
import { CreateTicketModal } from '@/components/zones/CreateTicketModal';
import { TicketDetailBody } from '@/components/tickets/TicketDetailBody';
import { TicketActionDock } from '@/components/tickets/TicketActionDock';
import { ReviewPanel } from '@/components/tickets/ReviewPanel';
import { ReasonPicker } from '@/components/tickets/ReasonPicker';
import { TechnicianWorkloadBadge } from '@/components/tickets/TechnicianWorkloadBadge';
import type { AnomalyReviews } from '@/lib/anomalyReview';
import type { PipelineProgress } from '@/types/zones';
import { technicians, result, ticket, detail } from './fixtures';
import type { SpecimenId } from './library';

const OverviewTab = dynamic(() => import('@/components/zones/OverviewTab').then(m=>m.OverviewTab), {ssr:false});
const tones = ['neutral','brand','success','warning','danger','info','accent','teal'] as const;

export function Specimen({ id }: { id: SpecimenId }) {
  const toast = useToast();
  const [value,setValue] = useState('');
  const [dialog,setDialog] = useState<'modal'|'confirm'|'ticket'|'save'|null>(null);
  const [offset,setOffset] = useState(0);
  const [files,setFiles] = useState<File[]>([]);
  const [running,setRunning] = useState(false);
  const [complete,setComplete] = useState(false);
  const [pipelineStage,setPipelineStage] = useState<PipelineProgress['stage']>('zone_a');
  const [reviews,setReviews] = useState<AnomalyReviews>({});
  const [sampleTicket,setSampleTicket] = useState(ticket);
  const [saved,setSaved] = useState(false);
  const [showEmpty,setShowEmpty] = useState(false);
  useEffect(() => {
    if (id !== 'notifications') return;
    const previous = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    return () => {
      if (previous) Object.defineProperty(navigator, 'onLine', previous);
      else Reflect.deleteProperty(navigator, 'onLine');
      window.dispatchEvent(new Event('online'));
    };
  }, [id]);
  const notify = () => toast.info('Design preview', {description:'This action uses sample data in the playground.'});
  switch(id) {
    case 'buttons': return <div className="design-stack">
      <div className="design-row">{(['primary','secondary','ghost','danger'] as const).map(variant=><Button key={variant} variant={variant} onClick={notify}>{variant}</Button>)}</div>
      <div className="design-row"><Button size="sm" onClick={notify}>Small</Button><Button size="md" onClick={notify}>Medium</Button><Button size="lg" onClick={notify}>Large</Button><Button size="icon" aria-label="Add sample" onClick={notify}><Plus size={15}/></Button></div>
      <div className="design-row"><Button variant="primary" onClick={notify}><Plus size={14}/>Create ticket</Button><Button onClick={notify}><Download size={14}/>Download</Button><Button disabled>Disabled</Button><Button loading>Saving</Button></div>
    </div>;
    case 'inputs': return <div className="design-grid"><Input id="design-name" label="Station name" placeholder="Enter a station" hint="A short descriptive name."/><Input id="design-email" label="Email" defaultValue="sample@example.invalid"/><Input id="design-error" label="Required field" error="Enter a value to continue."/><Input id="design-password" label="Password" type="password" passwordToggle defaultValue="sample-only"/><Input id="design-disabled" label="Disabled field" disabled placeholder="Not available"/></div>;
    case 'selects': return <div className="design-stack"><Select ariaLabel="Sample station" width="100%" value={value} onChange={setValue} placeholder="Choose a station" options={[{value:'',label:'All stations'},...Object.keys(result.neighbors).map(id=>({value:id,label:id}))]}/><p className="design-caption">Open the dropdown to inspect its menu, focus and selection states.</p></div>;
    case 'badges': return <div className="design-stack">{[false,true].map(dot=><div key={String(dot)} className="design-row">{tones.map(tone=><Badge className="design-badge" key={tone} tone={tone} dot={dot}>{tone}</Badge>)}</div>)}<div className="design-row"><Badge className="design-badge" tone="warning">Needs review</Badge><Badge className="design-badge" tone="danger">High reading</Badge><Badge className="design-badge" tone="teal">Low reading</Badge><Badge className="design-badge" tone="success">Verified</Badge></div></div>;
    case 'cards': return <div className="design-grid"><Card data-design-card><CardHeader><CardTitle>Station summary</CardTitle><Badge tone="brand">4 stations</Badge></CardHeader><CardBody><h2 style={{fontSize:'var(--font-xl)',margin:'0 0 8px'}}>Rainfall overview</h2><p>Body text at the website’s base size.</p><p className="design-caption">Secondary supporting text and a quiet caption.</p><Button size="sm" onClick={notify}>View details</Button></CardBody></Card><Card data-design-card><CardHeader><CardTitle>Type scale</CardTitle></CardHeader><CardBody>{['xl','lg','base','sm','xs'].map(size=><p key={size} style={{fontSize:`var(--font-${size})`,margin:'8px 0'}}>AWS Sentinel · {size}</p>)}</CardBody></Card></div>;
    case 'tabs': return <Tabs defaultValue="overview"><TabsList><Tab value="overview">Overview</Tab><Tab value="readings">Readings</Tab><Tab value="details" icon={<Info size={14}/>}>Details</Tab></TabsList>{['overview','readings','details'].map(item=><TabPanel key={item} value={item}><p style={{padding:20}}>This is the {item} panel. Try the tabs above.</p></TabPanel>)}</Tabs>;
    case 'shell': return <div className="design-shell" style={{display:'flex',height:510,overflow:'hidden',background:'var(--bg)',borderRadius:'var(--r-xl)'}}><Sidebar storageKey="aws-sentinel-ui-library-sidebar"/><div className="dashboard-workspace" style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}><Header title="UI Library"/><PageTransition><div className="dashboard-content" style={{padding:24}}><SentinelMark size={50}/><h2 style={{marginTop:20}}>Workspace preview</h2><p className="design-caption">Try the sidebar collapse, theme button and account menu.</p></div></PageTransition></div></div>;
    case 'pagination': return <HistoryPagination total={83} offset={offset} onChange={setOffset}/>;
    case 'dialogs': return <div className="design-row"><Button onClick={()=>setDialog('modal')}>Open modal</Button><Button onClick={()=>setDialog('confirm')}>Open confirmation</Button><Button onClick={()=>setDialog('save')}>Save reminder</Button><Button onClick={()=>setDialog('ticket')}>Create ticket flow</Button>{dialog==='modal'&&<Modal title="Edit station" subtitle="Local component preview" onClose={()=>setDialog(null)}><div className="design-dialog" style={{padding:24}}><Input id="modal-title" label="Station name" defaultValue="MarikinaYouthCamp"/><p className="design-caption" style={{marginTop:12}}>Modal body, field states and footer actions.</p></div><ModalFooter><Button onClick={()=>setDialog(null)}>Cancel</Button><Button variant="primary" onClick={()=>{setDialog(null);notify();}}>Save</Button></ModalFooter></Modal>}{dialog==='confirm'&&<ConfirmDialog title="Confirm this sample action?" message="This dialog is a design preview. It will not update a ticket or review." onCancel={()=>setDialog(null)} onConfirm={()=>{setDialog(null);notify();}}/>}{dialog==='save'&&<ConfirmDialog title="Save this run?" message="Your run stays in Zones for this session. Save it to History to keep it." cancelLabel="Cancel" confirmLabel="Don’t save" onCancel={()=>setDialog(null)} onConfirm={()=>setDialog(null)} extraAction={<Button variant="primary" onClick={()=>{setDialog(null);notify();}}>Save</Button>}/>}{dialog==='ticket'&&<CreateTicketModal stationId="MarikinaYouthCamp" technicians={technicians} file={null} onClose={()=>setDialog(null)}/>}</div>;
    case 'notifications': return <div className="design-stack"><div className="design-row"><Button onClick={()=>toast.success('Review saved',{description:'MarikinaYouthCamp · Sample reading'})}>Success toast</Button><Button onClick={()=>toast.error('Couldn’t save review',{description:'A sample error message.'})}>Error toast</Button><Button onClick={notify}>Information toast</Button><Button onClick={()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:!!showEmpty});setShowEmpty(!showEmpty);window.dispatchEvent(new Event(showEmpty?'online':'offline'));}}>{showEmpty?'Show online state':'Show offline banner'}</Button></div><OfflineBanner/><p className="design-caption">Toasts use the real notification viewport. Dismiss them with the close button.</p></div>;
    case 'loading': return <div className="design-loading design-grid"><div><p className="design-caption">Ticket rows</p><TicketRowSkeleton/><TicketRowSkeleton/><p className="design-caption">Audit rows</p><AuditRowSkeleton/></div><div><p className="design-caption">Technician table</p><table><tbody><TechRowSkeleton/></tbody></table><Skeleton className="h-4 w-32"/><p className="design-caption" style={{marginTop:20}}>Detail panel</p><DetailSkeleton/></div></div>;
    case 'save-status': return <div className="design-save design-stack"><div className="design-row"><RunSaveStatus compact result={{...result,history_saved:false}} onSave={()=>setSaved(true)}/><RunSaveStatus compact result={{...result,history_saved:true}} onSave={()=>setSaved(true)}/></div><RunSaveStatus result={{...result,history_saved:saved}} onSave={()=>setSaved(true)}/>{['saved','saving','failed'].map(state=><ReviewSaveStatus key={state} state={{ready:true,saving:state==='saving',saveError:state==='failed'?'Couldn’t save this sample review.':null,error:undefined,retry:async()=>undefined} as unknown as ReturnType<typeof useHistoryReviews>}/>)}<p className="design-caption">RunSaveController uses these states with the shared Modal, Input and ConfirmDialog. Navigation and server saving are disabled here.</p></div>;
    case 'tables': return <div><Button size="sm" onClick={()=>setShowEmpty(!showEmpty)}>{showEmpty?'Show sample rows':'Preview empty state'}</Button><DataTable data={showEmpty?[]:result.cleaned_data} columns={[{key:'station_id',header:'Station'},{key:'date',header:'Date',mono:true},{key:'rainfall',header:'Rainfall (mm)',mono:true},{key:'is_anomaly',header:'System flag',render:v=><Badge tone={v?'danger':'neutral'}>{v?'High':'Typical'}</Badge>}]} caption="Sample station readings" pageSize={5} searchKeys={['station_id','date']}/></div>;
    case 'charts': return <div className="design-stack"><h3>Same-day rainfall</h3><div className="design-chart" style={{height:240}}><DateComparisonChart height="100%" bars={Object.keys(result.neighbors).map((stationId,i)=>({stationId,rainfall:i===0?48:8+i,isSelected:i===0,isAnomaly:i===0}))}/></div><h3>Rainfall history</h3><div className="design-chart" style={{height:240}}><StationChart height="100%" data={result.flagged_data.filter(r=>r.station_id==='MarikinaYouthCamp')} neighbors={[{stationId:'Mandaluyong',byDate:Object.fromEntries(result.flagged_data.filter(r=>r.station_id==='Mandaluyong').map(r=>[r.date,r.rainfall]))}]}/></div></div>;
    case 'overview': return <div className="design-overview"><OverviewTab result={result}/></div>;
    case 'neighbors': return <div className="design-neighbors"><NeighborGroupsTab neighbors={result.neighbors}/></div>;
    case 'upload': return <div className="design-upload"><FileUpload files={files} onFilesChange={setFiles} onRemove={()=>setFiles([])}/><p className="design-caption">Files remain in browser memory. This sample does not process or upload them.</p></div>;
    case 'pipeline': return <div className="design-stack"><div className="design-row"><Button onClick={()=>{setRunning(true);setComplete(false);setPipelineStage('zone_a');}}>Processing state</Button>{running && <Button onClick={()=>setPipelineStage(stage=>stage==='zone_a'?'zone_b':stage==='zone_b'?'zone_c':'finalizing')}>Next zone</Button>}<Button onClick={()=>{setRunning(false);setComplete(true);}}>Completed state</Button><Button variant="ghost" onClick={()=>{setRunning(false);setComplete(false);}}>Idle state</Button><InfoTip text="This is the actual portalled help tooltip." label="Sample help"/></div><PipelineDiagram running={running} result={complete?result:null} progress={running?{stage:pipelineStage,station_ids:Object.keys(result.neighbors)}:null} renderTip={text=><InfoTip text={text}/>}/></div>;
    case 'review': return <ZoneResults result={result} reviews={reviews} defaultTab="anomalies" onCreateTicket={notify} onReview={(key,review)=>{setReviews(r=>{const next={...r};if(review)next[key]=review;else delete next[key];return next;});return Promise.resolve(review);}}/>;
    case 'tickets': return <div className="design-ticket design-stack"><div className="design-row"><TechnicianWorkloadBadge tech={technicians[0]} showBreakdown align="start"/><ReasonPicker selected={value} onSelect={setValue} reasons={['Needs another visit','Incomplete notes','Other']}/></div><div style={{borderRadius:'var(--r-xl)',overflow:'hidden'}}><TicketDetailBody model={{...detail,assignees:sampleTicket.technicians.map(tech=>({id:tech.id,name:tech.full_name}))}} footer={<TicketActionDock ticket={sampleTicket} onUpdated={setSampleTicket} reviewSlot={<ReviewPanel ticket={sampleTicket} approving={false} error="" onApprove={()=>{setSampleTicket(t=>({...t,status:'verified'}));notify();}} onFollowUp={()=>{setSampleTicket(t=>({...t,status:'follow_up'}));notify();}}/>}/>}/></div></div>;
    default: return <AlertTriangle aria-label="Preview unavailable"/>;
  }
}
