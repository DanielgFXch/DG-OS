'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const MB=require('../marketBrain.js');

const poi=(confirmation,reaction=null)=>({id:'p1',type:'fvg',timeframe:'4H',direction:'bullish',status:'fresh',quality:'high',score:7,distanceToPrice:1,priceLow:98,priceHigh:100,reaction,confirmation});
const sweep={id:'asiaLow',label:'Asia Low',type:'low',timeframe:'Asia Session',period:'2026-08-17',price:97,status:'sweeped',sweptAt:'2026-08-17T08:00:00Z',relevance:{tier:'high'}};

test('READY is impossible without a required production confirmation',()=>{
  for(const confirmation of [null,{status:'NO_CONFIRMATION',touchedAt:'2026-08-17T09:00:00Z',reactionDetected:true,entryZone:'UNDEFINED'},{status:'CONFIRMATION_DEVELOPING',touchedAt:'2026-08-17T09:00:00Z',reactionDetected:true,entryZone:'UNDEFINED'}]){
    const result=MB.computeEntryDecision('BULLISH',[poi(confirmation,{at:'2026-08-17T09:00:00Z'})],[sweep],101);
    assert.notEqual(result.status,'BUY_READY');
  }
});

test('fresh targets never include touched or swept liquidity',()=>{
  const levels=[
    {...sweep,status:'sweeped'},
    {...sweep,id:'dailyHigh',label:'Daily High',type:'high',timeframe:'Daily',price:105,status:'touched'},
    {...sweep,id:'prevDayHigh',label:'Previous Day High',type:'high',timeframe:'Daily',price:110,status:'active'}
  ];
  const targets=MB.computeTargets(levels,[],[],101,'BULLISH');
  assert.deepEqual(targets.map(target=>target.price),[110]);
});

test('zone reaction requires a touch followed by a later close outside',()=>{
  const candles=[
    {datetime:'2026-08-17 08:00:00',open:101,high:102,low:100.5,close:101.5},
    {datetime:'2026-08-17 09:00:00',open:102,high:103,low:101,close:102.5},
    {datetime:'2026-08-17 10:00:00',open:102.5,high:104,low:101.5,close:103.5}
  ];
  const zone={timeframe:'H1',direction:'bullish',priceLow:98,priceHigh:100,formedThroughCandle:candles[0]};
  assert.equal(MB.detectZoneReaction(zone,candles),null);
  candles.splice(2,0,{datetime:'2026-08-17 09:30:00',open:100,high:100.5,low:99,close:99.5});
  assert.ok(MB.detectZoneReaction(zone,candles));
});

test('fully mitigated and low-relevance POIs never enter the main POI story',()=>{
  const report={freshBullishPOIs:[{type:'fvg',range:'98–100',timeframe:'4H',quality:'medium',tested:true,mitigationPercent:50,reaction:false}],freshBearishPOIs:[]};
  const text=MB.buildPOISection(report);
  assert.match(text,/98–100/);
  assert.doesNotMatch(text,/FULLY_MITIGATED|LOW/);
});

test('observed-at-start sweep preserves unknown historical timing',()=>{
  const level={id:'daily-swing',label:'Daily Swing High',type:'high',timeframe:'Daily',structureType:'external',period:'2026-08-01T00:00:00Z',price:105,status:'sweeped'};
  const result=MB.enrichLiquidityWithMemory([level],null,[{datetime:'2026-08-17 09:00:00',open:103,high:106,low:102,close:105}],'2026-08-17T12:00:00Z').levels[0];
  assert.equal(result.sweepTimingSource,'OBSERVED_AT_START');
  assert.equal(result.sweptAt,null);
  assert.equal(result.observedAt,'2026-08-17T12:00:00Z');
});

test('WAIT presentation can never render as READY',()=>{
  const presentation=MB.presentDecisionStatus('WAIT','bullish');
  assert.equal(presentation.decisionStage,'WAIT');
  assert.equal(presentation.decisionDirection,null);
  assert.equal(MB.presentationHeadline({status:'WAIT',direction:'bullish'}),'WAIT');
});
