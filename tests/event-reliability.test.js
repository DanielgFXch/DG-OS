'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const Events=require('../events.js');
const MB=require('../marketBrain.js');

function decision(status='WAIT'){
  return{status,direction:null,primaryPoi:null,confirmation:null,targets:[],reasons:[]};
}

test('dynamic session price cannot inherit the old physical level status',()=>{
  const prev=[{id:'asiaHigh',label:'Asia High',period:'2026-08-17',price:100,status:'active'}];
  const next=[{id:'asiaHigh',label:'Asia High',period:'2026-08-17',price:101,status:'sweeped'}];
  assert.deepEqual(Events.diffLiquidityEvents(prev,next),[]);
});

test('restart does not advertise reconstructed or observed-at-start sweeps as live',()=>{
  for(const source of ['RECONSTRUCTED_FROM_CANDLES','OBSERVED_AT_START']){
    const level={id:'daily-swing',label:'Daily Swing High',period:'2026-08-16',price:100,type:'high',timeframe:'Daily',structureType:'external',status:'sweeped'};
    const key=MB.liquidityMemoryKey(level);
    const brain={decision:decision(),liquidity:[level],liquidityMemory:{[key]:{sweepTimingSource:source,reaction:{status:'REACTED',reasons:['historical']}}}};
    const result=Events.classifyTradingBrainEvents({entryStatus:'WAIT',activeSetup:null,liquidityMemory:{}},brain,101,Date.parse('2026-08-17T10:00:00Z'));
    assert.deepEqual(result.events.filter(event=>event.type.startsWith('LIQUIDITY_')),[]);
  }
});

test('observed-live sweep emits once and persisted memory prevents restart duplication',()=>{
  const level={id:'asiaHigh',label:'Asia High',period:'2026-08-17',price:100,type:'high',timeframe:'Asia Session',status:'sweeped'};
  const key=MB.liquidityMemoryKey(level);
  const memory={[key]:{sweepTimingSource:'OBSERVED_LIVE',reaction:{status:'NO_REACTION_YET'}}};
  const brain={decision:decision(),liquidity:[level],liquidityMemory:memory};
  const first=Events.classifyTradingBrainEvents({entryStatus:'WAIT',activeSetup:null,liquidityMemory:{}},brain,101,Date.parse('2026-08-17T10:00:00Z'));
  assert.equal(first.events.filter(event=>event.type==='LIQUIDITY_SWEPT').length,1);
  const restart=Events.classifyTradingBrainEvents({entryStatus:'WAIT',activeSetup:null,liquidityMemory:memory},brain,101,Date.parse('2026-08-17T10:01:00Z'));
  assert.equal(restart.events.filter(event=>event.type==='LIQUIDITY_SWEPT').length,0);
});

test('primary target event requires a new price crossing and does not repeat after restart',()=>{
  const target={priority:'PRIMARY',direction:'up',price:105,reason:'Daily High'};
  const setup={direction:'bullish',primaryPoi:{id:'p1'},targets:[target]};
  const brain={decision:{...decision('BUY_READY'),direction:'bullish',primaryPoi:{id:'p1'},targets:[target]},liquidity:[],liquidityMemory:{}};
  const before={entryStatus:'BUY_READY',activeSetup:setup,liquidityMemory:{},lastPrice:104};
  const crossed=Events.classifyTradingBrainEvents(before,brain,106,Date.parse('2026-08-17T10:00:00Z'));
  assert.equal(crossed.events.filter(event=>event.type==='PRIMARY_TARGET_REACHED').length,1);
  const afterRestart={...before,lastPrice:106};
  const repeated=Events.classifyTradingBrainEvents(afterRestart,brain,106,Date.parse('2026-08-17T10:01:00Z'));
  assert.equal(repeated.events.filter(event=>event.type==='PRIMARY_TARGET_REACHED').length,0);
});
