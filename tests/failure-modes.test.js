'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const MB=require('../marketBrain.js');
const rest=require('../server/lib/twelveDataRest.js');
const store=require('../server/lib/tradingBrainStore.js');
const reality=require('../scripts/dgRealityCheck.js');

const c=(datetime,open=100,high=102,low=99,close=101)=>({datetime,open,high,low,close});

test('unreachable TwelveData rejects without fabricating candles',async()=>{
  const original=global.fetch;
  global.fetch=async()=>{throw new Error('network unreachable');};
  try{ await assert.rejects(rest.fetchCandles('not-a-real-key','1h',10,'https://unreachable.invalid'),/network unreachable/); }
  finally{ global.fetch=original; }
});

test('malformed snapshot JSON fails closed',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dg-reality-test-'));
  const file=path.join(dir,'broken.json');
  fs.writeFileSync(file,'{broken');
  try{ await assert.rejects(reality.loadInput({snapshot:file,server:null}),/JSON/); }
  finally{ fs.rmSync(dir,{recursive:true,force:true}); }
});

test('missing live price is rejected instead of replaced with fake data',()=>{
  assert.throws(()=>reality.buildRealityReport({source:'test',market:{symbol:'XAUUSD',quote:{price:null},candles:{}}}),/valid DG OS XAUUSD market response/);
});

test('partial or empty HTF input stays DATA_NOT_READY',()=>{
  const valid=[c('2026-08-17 08:00:00')];
  for(const candles of [{daily:{series:valid},'4h':{series:valid},'1h':{series:valid}},{}]){
    const brain=MB.computeTradingBrainV1(candles,[],101);
    assert.equal(brain.status,'DATA_NOT_READY');
    assert.equal(brain.decision.decisionStage,'DATA_NOT_READY');
    assert.deepEqual(brain.decision.targets,[]);
  }
});

test('corrupt or structurally invalid restart memory is ignored safely',()=>{
  assert.equal(store.parseTradingBrainState('{broken'),null);
  assert.equal(store.parseTradingBrainState('[]'),null);
  assert.deepEqual(store.parseTradingBrainState('{"entryStatus":"WATCH_BUY"}'),{entryStatus:'WATCH_BUY'});
});
