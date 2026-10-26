const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function api(get) {
  const module = {exports:{}};
  const source = fs.readFileSync(path.join(__dirname,'../src/lib/api/zones.ts'),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,require:()=>({apiClient:{upload:async()=>({job_id:'test-job'}),get}}),
    FormData,DOMException,console:{info(){},warn(){}},setTimeout:callback=>{queueMicrotask(callback);return 1;}});
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
