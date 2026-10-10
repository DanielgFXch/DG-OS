#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mod=require('../trading-intelligence.js');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function candles(date='2026-10-09') {
  const a=[];
  for(let hour=0;hour<22;hour++){
    const base=100+((hour%5)*.01);
    a.push({datetime:date+' '+String(hour).padStart(2,'0')+':00:00',open:base,
      high:hour<8?101:100.8,low:hour<8?99:99.2,close:100});
  }
  return a;
}
const time='2026-10-10T01:00:00Z';
const ready=ms=>mod.computeSessionIntelligence({candlesByTimeframe:{'1h':{series:ms}},now:new Date(time)});
const original=candles();
const baseline=ready(original);
assert.equal(baseline.status,'OBSERVED');
assert.equal(baseline.asiasession.high,101);
assert.equal(baseline.asiasession.low,99);
assert.equal(baseline.asiasession.candles,8);
assert.equal(baseline.london.asiaHigh.state,'OPEN');
assert.equal(baseline.london.asiaLow.state,'OPEN');
assert.equal(baseline.bias.macro.state,'UNAVAILABLE');
assert.equal(baseline.bias.medium.state,'UNAVAILABLE');
assert.equal(baseline.inducement.status,'AWAITING_DG_RULE');
assert.equal(baseline.model,'OBSERVATIONS_ONLY');
assert.equal(baseline.disclaimer.includes('Trading-Signal'),true);
assert.equal(ready(original.filter(c=>!c.datetime.includes(' 04:'))).status,'DATA_NOT_READY',
  'Asia range is not valid until all eight H1 bars are closed');
const highTaken=candles();
// Keep all subsequent London H1 CLOSES above the Asia High; otherwise a
// later return inside would correctly be observed as RETURN_INSIDE.
for(let i=8;i<16;i++)highTaken[i]={...highTaken[i],high:102,low:99.2,open:101.4,close:101.4};
const noReturn=ready(highTaken);
assert.equal(noReturn.london.asiaHigh.state,'TAKEN_NO_RETURN');
assert.equal(noReturn.london.asiaHigh.returnedAt,null);
assert.equal(noReturn.london.asiaLow.state,'OPEN');
const returns=candles();
returns[8]={...returns[8],high:102,close:100};
const ret=ready(returns);
assert.equal(ret.london.asiaHigh.state,'RETURN_INSIDE');
assert.equal(ret.london.asiaHigh.extreme,102);
assert.equal(ret.london.asiaHigh.at,'2026-10-09T08:00:00.000Z');
assert.equal(ret.london.asiaHigh.returnedAt,'2026-10-09T08:00:00.000Z');
assert.equal(ret.london.asiaLow.state,'OPEN');
const lowTaken=candles();
for(let i=9;i<16;i++)lowTaken[i]={...lowTaken[i],high:100.8,low:98.5,open:98.8,close:98.8};
assert.equal(ready(lowTaken).london.asiaLow.state,'TAKEN_NO_RETURN');
const dual=candles();
dual[8]={...dual[8],high:102,low:98.5,close:100};
const dualResult=ready(dual);
assert.equal(dualResult.london.bothTaken,true);
assert.equal(dualResult.london.sequence,'UNKNOWN_SAME_H1_CANDLE',
  'Never invent intrabar order for high and low sweeps in same H1 candle');
const stale=mod.computeSessionIntelligence({candlesByTimeframe:{'1h':{series:original}},now:new Date('2026-10-16T00:00:00Z')});
assert.equal(stale.status,'HISTORICAL','Old candles cannot be labelled LIVE');
const partial=candles();
partial[8]={...partial[8],high:105,close:99.7};
const beforeClose=mod.computeSessionIntelligence({candlesByTimeframe:{'1h':{series:partial}},now:new Date('2026-10-09T08:30:00Z')});
assert.equal(beforeClose.london.observedCandles,0,'Incomplete H1 candle must never show a sweep');
assert.equal(beforeClose.london.asiaHigh.state,'OPEN');
const withMacro=mod.computeSessionIntelligence({candlesByTimeframe:{'1h':{series:original}},now:new Date(time),
  brain:{htfContext:{macro:{state:'BULLISH',reasoning:['Weekly context']},trading:{state:'BEARISH',reasoning:['Daily context']}},
    structure:{h1:{externalBias:'bearish',internalBias:'bullish'}}}});
assert.equal(withMacro.bias.macro.state,'BULLISH');
assert.equal(withMacro.bias.medium.state,'BEARISH');
assert.equal(withMacro.bias.intraday.external,'bearish');
assert.equal(withMacro.inducement.status,'AWAITING_DG_RULE');
const html=read('index.html');
for(const id of ['dgSessionIntel','dgIntelHeading','dgIntelMacro','dgIntelMedium','dgIntelH1',
  'dgIntelAsiaHigh','dgIntelAsiaLow','dgIntelHighSweep','dgIntelLowSweep','dgIntelEvidence',
  'dgIntelInducement','dgIntelStatus','dgIntelProvenance','dgIntelRefresh']){
    assert.ok(html.includes('id="'+id+'"'),'Missing trading intel UI '+id);
}
assert.match(html,/trading-intelligence\.js\?v=1/);
assert.match(html,/trading-intelligence-ui\.js\?v=1/);
assert.match(html,/trading-intelligence\.css\?v=1/);
assert.doesNotThrow(()=>new Function(read('trading-intelligence-ui.js')));
assert.ok(read('trading-intelligence.css').includes('@media(max-width:670px)'));
assert.ok(read('server/marketState.js').includes("DGSessionIntel.computeSessionIntelligence"));
assert.ok(!read('trading-intelligence.js').includes('BUY_READY'));
assert.ok(!read('trading-intelligence.js').includes('SELL_READY'));
assert.ok(!read('trading-intelligence-ui.js').includes('innerHTML'));
assert.ok(!read('trading-intelligence.js').includes('Math.random'));
console.log('Session Intelligence: complete H1 Asia, London high/low reclaim, ambiguity, stale, macro/medium and isolation tests passed');
