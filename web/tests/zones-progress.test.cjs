const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
function api(get, options = {}) {
  const module = {exports:{}};
  const source = fs.readFileSync(path.join(__dirname,'../src/lib/api/zones.ts'),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>({ApiError,
    getDirectToken:()=>options.direct ? 'token' : null,
    setDirectToken:token=>options.tokens?.push(token),
    apiClient:{upload:async()=>{options.uploads?.push('upload');return {job_id:'test-job'};}, get,
      uploadDirect:async()=>{options.uploads?.push('uploadDirect');if(options.uploadError)throw options.uploadError;return {job_id:'test-job'};},getDirect:options.getDirect}}),
    ...(options.direct ? {window:{location:{hostname:'example.vercel.app'}}} : {}),
    FormData,DOMException,Error,TypeError,console:{info(){},warn(){}},clearTimeout:()=>{},
    setTimeout:options.setTimeout ?? ((callback,delay)=>{options.delays?.push(delay);queueMicrotask(callback);return 1;})});
  return module.exports.zonesApi;
}
const files = () => [new File(['station_id,date,rainfall'],'station.csv')];

test('job polling forwards actual stages/stations and returns the unchanged result',async()=>{
  const result = {run_id:'test-job'};
  const phases = ['zone_a','zone_b','zone_c'];
  const responses = [...phases.map(stage=>({status:'processing',progress:{stage,station_ids:['A','B']}})),{status:'done',result}];
  const progress = [];
  const output = await api(async url=>{assert.equal(url,'/api/zones/jobs/test-job');return responses.shift();}).process(files(),{onProgress:value=>progress.push(value)});
  assert.equal(output,result);
  assert.deepEqual(progress.map(value=>value.stage),phases);
  assert.deepEqual(progress[0].station_ids,['A','B']);
});

test('a response arriving after cancellation cannot publish stale progress',async()=>{
  let respond;
  const controller = new AbortController();
  const progress = [];
  const pending = api(()=>new Promise(resolve=>{respond=resolve;})).process(files(),{signal:controller.signal,onProgress:value=>progress.push(value)});
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort();
  respond({status:'processing',progress:{stage:'zone_c',station_ids:['Old']}});
  await assert.rejects(pending,error=>error.name==='AbortError');
  assert.equal(progress.length,0);
});


test('a healthy long-running job completes after more than the old 120 polls without another upload', async () => {
  let polls = 0;
  const uploads = [];
  const result = {run_id:'test-job'};
  assert.equal(await api(async () => ++polls <= 240 ? {status:'processing'} : {status:'done',result}, {uploads}).process(files()), result);
  assert.equal(polls, 241);
  assert.equal(uploads.length, 1);
});

test('transient failures back off and recover the same job, resetting delay after a healthy response', async () => {
  const responses = [new ApiError('Unavailable',503), new TypeError('Failed to fetch'), {status:'processing'}, {status:'done',result:{run_id:'test-job'}}];
  const delays = [], uploads = [];
  const output = await api(async url => {assert.equal(url,'/api/zones/jobs/test-job');const value=responses.shift();if(value instanceof Error) throw value;return value;}, {delays,uploads}).process(files());
  assert.equal(output.run_id,'test-job');
  assert.deepEqual(delays,[1500,3000,6000,1500]);
  assert.equal(uploads.length,1);
});

test('expired direct credentials switch subsequent polls to the cookie path', async () => {
  let directCalls=0, proxyCalls=0;
  const uploads=[];
  const output = await api(async () => ++proxyCalls === 1 ? {status:'processing'} : {status:'done',result:{run_id:'test-job'}}, {
    direct:true, uploads, getDirect:async()=>{directCalls++;throw new ApiError('Not authenticated',401);}
  }).process(files());
  assert.equal(output.run_id,'test-job');
  assert.equal(directCalls,1);
  assert.equal(proxyCalls,2);
  assert.deepEqual(uploads,['uploadDirect']);
});

test('a missing job on the proxy fallback is reported immediately without submitting again', async () => {
  const uploads=[];
  await assert.rejects(api(async()=>{throw new ApiError('Job not found or expired',404);}, {
    direct:true,uploads,getDirect:async()=>{throw new TypeError('Failed to fetch');}
  }).process(files()), /no longer available/i);
  assert.deepEqual(uploads,['uploadDirect']);
});

test('request timeouts retry but user cancellation during the polling delay stops immediately', async () => {
  let calls=0;
  await api(async()=>{if(++calls===1) throw new DOMException('Aborted','AbortError');return {status:'done',result:{}};}).process(files());
  assert.equal(calls,2);
  const controller=new AbortController();
  const pending=api(async()=>assert.fail('cancelled delay must not poll'), {setTimeout:()=>1}).process(files(),{signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));
  controller.abort();
  await assert.rejects(pending,error=>error.name==='AbortError');
});

test('terminal errors and malformed job responses stop polling', async () => {
  for(const response of [{status:'error',detail:'Invalid rainfall'}, {status:'done'}, {status:'unexpected'}]) {
    let calls=0;
    await assert.rejects(api(async()=>{assert.ok(++calls<3,'invalid responses must not keep polling');return response;}).process(files()), /Invalid rainfall|Invalid processing response/);
  }
});


test('closing or reloading the page warns while detection is running', () => {
  const React=require('react');
  const effects=[],listeners=new Map(),cells=[];
  let cursor=0;
  const source=fs.readFileSync(path.join(__dirname,'../src/context/ZonesContext.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  const react={...React,useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),
    useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],value=>{cells[i]=value;}];}};
  const window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  vm.runInNewContext(code,{module:mod,exports:mod.exports,window,require:name=>name==='react'?react:name==='@/lib/anomalyReview'?{}:require(name)});
  const render=()=>{cursor=0;effects.length=0;return mod.exports.ZonesProvider({children:null}).props.value;};
  render().setRunning(true);render();
  const cleanup=effects.at(-1)();
  let warned=false;
  listeners.get('beforeunload')({preventDefault(){warned=true;}});
  assert.equal(warned,true);
  cleanup();assert.equal(listeners.has('beforeunload'),false);
});


test('an expired direct upload token falls back by HTTP status, not error wording', async () => {
  const uploads=[],tokens=[];
  const result=await api(async()=>({status:'done',result:{run_id:'test-job'}}),{
    direct:true,uploads,tokens,uploadError:new ApiError('Invalid or expired token',401)
  }).process(files());
  assert.equal(result.run_id,'test-job');
  assert.deepEqual(uploads,['uploadDirect','upload']);
  assert.deepEqual(tokens,[null]);
});
