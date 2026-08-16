'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const reality=require('../scripts/dgRealityCheck.js');

const c=(datetime,open,high,low,close)=>({datetime,open,high,low,close});

function snapshot(){
  const base=[c('2026-08-17 08:00:00',100,102,99,101),c('2026-08-17 09:00:00',101,103,100,102),c('2026-08-17 10:00:00',102,104,101,103)];
  return{source:'fixture',health:{status:'ok'},market:{symbol:'XAUUSD',quote:{price:103},brain:{liquidity:[]},candles:{
    weekly:{series:base},daily:{series:base},'4h':{series:base},'1h':{series:[...base,c('2026-08-15 10:00:00',103,120,110,115)]},'15min':{series:base}
  }}};
}

test('Reality CLI requires exactly one real input source',()=>{
  assert.throws(()=>reality.parseArgs([]),/exactly one/);
  assert.throws(()=>reality.parseArgs(['--server','https://example.test','--snapshot','x.json']),/exactly one/);
  assert.deepEqual(reality.parseArgs(['--server','https://example.test','--json']),{json:true,server:'https://example.test',snapshot:null});
});

test('Reality report uses local Market Brain and exposes filtered candle health',()=>{
  const input=snapshot();
  input.market.brain.tradingBrain={status:'PRODUCTION_SENTINEL'};
  const report=reality.buildRealityReport(input);
  const h1=report.dataHealth.timeframes.find(tf=>tf.timeframe==='H1');
  assert.equal(report.symbol,'XAUUSD');
  assert.equal(report.localBrainVersion,require('../package.json').version);
  assert.equal(h1.rawCount,4);
  assert.equal(h1.usableCount,3);
  assert.equal(h1.removedCount,1);
  assert.notEqual(report.decision.internalStatus,'PRODUCTION_SENTINEL');
});

test('Reality text contains the required operator sections',()=>{
  const text=reality.formatText(reality.buildRealityReport(snapshot()));
  for(const heading of ['DATA HEALTH','RELEVANT POIs','KEY LIQUIDITY','CONFIRMATION','DECISION','RULE QUESTIONS']) assert.match(text,new RegExp(heading));
});
