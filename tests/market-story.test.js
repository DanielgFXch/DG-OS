'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const MB=require('../marketBrain.js');

test('presentation layer maps every internal decision status without changing it',()=>{
  const cases={
    WAIT:['WAIT',null],WATCH_BUY:['WATCH','BUY'],WATCH_SELL:['WATCH','SELL'],
    BUY_CONFIRMATION:['WATCH','BUY'],SELL_CONFIRMATION:['WATCH','SELL'],
    BUY_READY:['READY','BUY'],SELL_READY:['READY','SELL'],MISSED:['MISSED',null],DATA_NOT_READY:['DATA_NOT_READY',null]
  };
  for(const [status,[stage,direction]] of Object.entries(cases)){
    assert.deepEqual(MB.presentDecisionStatus(status),{decisionStage:stage,decisionDirection:direction,detailStatus:status});
  }
});

function brainFor(status,options={}){
  const presentation=MB.presentDecisionStatus(status);
  const isReady=status==='BUY_READY'||status==='SELL_READY';
  const poi={id:'p1',type:'fvg',timeframe:'4H',direction:presentation.decisionDirection==='SELL'?'bearish':'bullish',priceLow:100,priceHigh:102,quality:'high',status:'fresh',tested:true,mitigationPercent:25,reaction:true,range:'100.00–102.00'};
  return{
    decision:{status,...presentation,direction:poi.direction,counterBias:!!options.counterBias,macroBias:'NEUTRAL_MIXED',tradingBias:'BULLISH',primaryPoi:options.noPoi?null:poi,confirmation:options.confirmation===false?null:{status:isReady?'ENGULFING_CONFIRMED':'NO_CONFIRMATION'},entryZone:isReady?{priceLow:100,priceHigh:101}:'UNDEFINED',invalidation:99,targets:[],missingRequirements:['Noch kein Setup.'],reasons:['Deterministischer Testgrund.']},
    report:{freshBullishPOIs:options.pois||[poi],freshBearishPOIs:[],status},
    liquidity:options.liquidity||[]
  };
}

test('market story presents WAIT, WATCH and READY states in trader language',()=>{
  for(const [status,headline] of [['WAIT','WAIT'],['WATCH_BUY','WATCH BUY'],['WATCH_SELL','WATCH SELL'],['BUY_READY','READY BUY'],['SELL_READY','READY SELL']]){
    const story=MB.generateDGBriefing(brainFor(status),new Date('2026-08-17T06:00:00Z'));
    assert.match(story,new RegExp(`STATUS\\n\\n${headline}`));
    assert.match(story,new RegExp(`Detail: ${status}`));
  }
});

test('market story greets Meister Gomes and includes the real current gold price',()=>{
  const brain=brainFor('WAIT');
  brain.currentPrice=4375.60165;
  const story=MB.generateDGBriefing(brain,new Date('2026-08-17T06:00:00Z'));
  assert.match(story,/Guten Morgen, Meister Gomes\./);
  assert.match(story,/Gold liegt aktuell bei 4375\.60\./);
});

test('Jarvis wake-up uses only current brain facts',()=>{
  const brain=brainFor('WATCH_SELL');
  brain.currentPrice=4375.60165;
  brain.htfContext={};
  brain.htfContext.daily={externalBias:'bullish'};
  brain.htfContext.h4={externalBias:'bearish'};
  const spoken=MB.generateJarvisWakeUp(brain,new Date('2026-08-17T06:00:00Z'));
  assert.match(spoken,/Guten Morgen, Meister Gomes\./);
  assert.match(spoken,/Gold liegt aktuell bei 4375\.60\./);
  assert.match(spoken,/Daily ist BULLISH, 4H ist BEARISH\./);
  assert.match(spoken,/Aktueller Status: WATCH SELL\./);
  assert.match(spoken,/Wir warten auf: Reaktion am relevanten POI\./);
});

test('market story keeps counter-bias explicit and puts facts in V1 order',()=>{
  const story=MB.generateDGBriefing(brainFor('WATCH_SELL',{counterBias:true}),new Date('2026-08-17T06:00:00Z'));
  const headings=['STATUS','RECENT EVENTS','RELEVANT POIs','LIQUIDITY NOW','SETUP','CONTEXT','WAITING FOR'];
  headings.forEach((heading,index)=>{ if(index) assert.ok(story.indexOf(headings[index-1])<story.indexOf(heading)); });
  assert.match(story,/Counter-Bias: JA/);
});

test('decision explainability separates met, missing, invalidating and context factors',()=>{
  const primary={id:'p1',type:'fvg',timeframe:'4H',reaction:{at:'2026-08-17T09:00:00Z'},confirmation:{status:'NO_CONFIRMATION'}};
  const entry={status:'SELL_CONFIRMATION',direction:'bearish',primaryPOI:'p1',liquidityEvent:{label:'Asia High',sweptAt:'2026-08-17T08:00:00Z'},entryZone:'UNDEFINED',stopLoss:null,reasons:['waiting']};
  const summary=MB.buildDecisionSummary(entry,{overallBias:'BULLISH',trading:{state:'BULLISH'},macro:{state:'BULLISH'}},null,[],[primary]);
  assert.ok(summary.metFactors.some(item=>item.includes('Asia High swept')));
  assert.ok(summary.metFactors.includes('POI reaction detected'));
  assert.deepEqual(summary.missingFactors,['15M primary confirmation']);
  assert.deepEqual(summary.invalidatingFactors,[]);
  assert.ok(summary.contextFactors.includes('Trading Bias: BULLISH'));
});

test('DATA_NOT_READY story never presents a ready trade idea',()=>{
  const story=MB.generateDGBriefing(brainFor('DATA_NOT_READY',{noPoi:true,confirmation:false,pois:[]}),new Date('2026-08-17T06:00:00Z'));
  assert.match(story,/STATUS\n\nDATA NOT READY/);
  assert.doesNotMatch(story,/READY BUY|READY SELL/);
  assert.match(story,/Entry Zone: —/);
});

test('POI story excludes absent low/full zones and reports tested mitigation reaction facts',()=>{
  const relevant={type:'fvg',range:'100.00–102.00',timeframe:'4H',quality:'high',tested:true,mitigationPercent:25,reaction:true};
  const story=MB.generateDGBriefing(brainFor('WAIT',{pois:[relevant]}),new Date('2026-08-17T06:00:00Z'));
  assert.match(story,/getestet JA · Mitigation 25% · Reaktion JA/);
  assert.doesNotMatch(story,/LOW|FULLY_MITIGATED/);
});

test('legacy POI facts never render undefined mitigation text',()=>{
  const legacy={type:'fvg',range:'100.00–102.00',timeframe:'4H',quality:'medium',tested:false,reaction:false};
  const story=MB.generateDGBriefing(brainFor('WAIT',{pois:[legacy]}),new Date('2026-08-17T06:00:00Z'));
  assert.match(story,/Mitigation nicht verfügbar/);
  assert.doesNotMatch(story,/undefined|null/);
});

test('market story displays no more than three recent liquidity events',()=>{
  const liquidity=[8,9,10,11].map((hour,index)=>({id:`s${index}`,label:`Sweep ${index}`,type:'high',timeframe:'4H',structureType:'external',price:110+index,status:'sweeped',sweptAt:`2026-08-17T${String(hour).padStart(2,'0')}:00:00Z`,sweepTimingSource:'RECONSTRUCTED_FROM_CANDLES'}));
  const story=MB.generateDGBriefing(brainFor('WAIT',{liquidity}),new Date('2026-08-17T12:00:00Z'));
  assert.doesNotMatch(story,/Sweep 0/);
  assert.equal(story.split('\n').filter(line=>line.startsWith('- Sweep')).length,3);
});
