'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MB = require('../marketBrain.js');
const rest = require('../server/lib/twelveDataRest.js');

const c = (datetime, open, high, low, close) => ({ datetime, open, high, low, close });

test('weekend and carried-forward placeholder candles never feed structure/FVG', () => {
  const candles = [
    c('2026-08-14 08:00:00', 100, 102, 99, 101),
    c('2026-08-14 09:00:00', 101, 103, 100, 102),
    c('2026-08-15 10:00:00', 102, 120, 110, 115), // Saturday and would create a false gap
    c('2026-08-16 20:00:00', 102, 102.001, 101.999, 102), // H1 entirely before summer market open
    c('2026-08-16 21:00:00', 102, 104, 101, 103), // genuine Sunday-open candle (17:00 New York)
    c('2026-08-17 09:00:00', 103, 103.001, 102.999, 103), // genuine quiet trading candle
    c('2026-08-17 10:00:00', 103, 106, 102, 105)
  ];
  const clean = MB.filterUsableMarketCandles(candles, 'H1');
  assert.equal(clean.length, 5);
  assert.ok(clean.some(bar => bar.datetime === '2026-08-16 21:00:00'));
  assert.ok(clean.some(bar => bar.datetime === '2026-08-17 09:00:00'));
  assert.equal(MB.computeTimeframeBrain(candles, 'H1').candleCount, 5);
  assert.equal(MB.detectFairValueGaps(candles, 'H1').length, 0);
  assert.equal(MB.filterUsableMarketCandles([c('2026-08-16 20:00:00',102,104,101,103)],'4H').length,1,'4H candle overlapping Sunday open is real');
  assert.equal(MB.filterUsableMarketCandles([c('2026-08-17T09:00:00.000Z',103,104,102,103.5)],'H1').length,1,'ISO timestamp is accepted');
  assert.equal(MB.filterUsableMarketCandles([{open:103,high:104,low:102,close:103.5}],'H1').length,0,'missing timestamp is unusable');
});

test('central candle boundary sorts timestamps and deterministically deduplicates provider bars',()=>{
  const input=[
    c('2026-08-17 10:00:00',102,104,101,103),
    c('2026-08-17 08:00:00',100,102,99,101),
    c('2026-08-17 09:00:00',101,103,100,102),
    c('2026-08-17 09:00:00',101,103.5,100,102.5)
  ];
  const clean=MB.filterUsableMarketCandles(input,'H1');
  assert.deepEqual(clean.map(bar=>bar.datetime),['2026-08-17 08:00:00','2026-08-17 09:00:00','2026-08-17 10:00:00']);
  assert.equal(clean[1].close,102.5);
  assert.equal(MB.computeTimeframeBrain(input,'H1').candleCount,3);
});

test('HTF series containing only unusable candles produces DATA_NOT_READY',()=>{
  const valid=[c('2026-08-17 08:00:00',100,102,99,101)];
  const invalid=[c('2026-08-15 08:00:00',100,102,99,101)];
  const brain=MB.computeTradingBrainV1({weekly:{series:valid},daily:{series:valid},'4h':{series:invalid},'1h':{series:valid},'15min':{series:valid}},[],101);
  assert.equal(brain.status,'DATA_NOT_READY');
  assert.equal(brain.decision.decisionStage,'DATA_NOT_READY');
});

test('liquidity reaction must occur strictly after the sweep candle',()=>{
  const level={type:'high',sweptAt:'2026-08-17T09:00:00.000Z'};
  const sweepEngulfing=[
    c('2026-08-17 08:00:00',100,102,99,101.5),
    c('2026-08-17 09:00:00',102,103,99,100)
  ];
  assert.equal(MB.detectLiquidityReaction(level,sweepEngulfing).status,'NO_REACTION_YET');
  const later=[...sweepEngulfing,c('2026-08-17 10:00:00',99.5,102,98,98.5)];
  assert.equal(MB.detectLiquidityReaction(level,later).status,'REACTED');
});

test('fetchCandles production path filters the full series and preserves latestRealBar safeguard', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ json: async () => ({ values: [
    { datetime:'2026-08-17 10:00:00', open:'103', high:'103.001', low:'102.999', close:'103' },
    { datetime:'2026-08-17 09:00:00', open:'101', high:'104', low:'100', close:'103' },
    { datetime:'2026-08-16 21:00:00', open:'101', high:'101.001', low:'100.999', close:'101' }
  ] }) });
  try {
    const result = await rest.fetchCandles('test-key', '1h', 3, 'https://mock.invalid');
    assert.deepEqual(result.series.map(bar => bar.datetime), ['2026-08-16 21:00:00','2026-08-17 09:00:00','2026-08-17 10:00:00']);
    assert.equal(result.latestRealBar.datetime, '2026-08-17 09:00:00');
  } finally {
    global.fetch = originalFetch;
  }
});

test('current Daily Sunday placeholder is excluded before open and retained after open', () => {
  const sunday = c('2026-08-16', 4375.59, 4379.85, 4375.53, 4375.69);
  assert.equal(MB.isUsableMarketCandle(sunday, 'Daily', '2026-08-16T19:30:00Z'), false);
  assert.equal(MB.isUsableMarketCandle(sunday, 'Daily', '2026-08-16T21:30:00Z'), true);
  assert.equal(MB.isUsableMarketCandle(c('2026-08-09',4300,4350,4290,4340), 'Daily', '2026-08-16T19:30:00Z'), true, 'historical Sunday-open Daily remains real');
});

test('Sunday open follows New York DST instead of a fixed UTC hour', () => {
  assert.equal(MB.isUsableMarketCandle(c('2026-08-16 20:45:00',100,101,99,100.5),'15M'),false);
  assert.equal(MB.isUsableMarketCandle(c('2026-08-16 21:00:00',100,101,99,100.5),'15M'),true);
  assert.equal(MB.isUsableMarketCandle(c('2026-01-18 21:00:00',100,101,99,100.5),'1H'),false);
  assert.equal(MB.isUsableMarketCandle(c('2026-01-18 22:00:00',100,101,99,100.5),'1H'),true);
});

test('Previous Day liquidity ignores Saturday and pre-open Sunday placeholders', () => {
  const levels = MB.previousDayLiquidityFrom([
    c('2026-08-13', 4350, 4400, 4320, 4370),
    c('2026-08-14', 4370, 4396.587, 4310.61379, 4376),
    c('2026-08-15', 4376, 4376.94227, 4375.52894, 4375.58),
    c('2026-08-16', 4375.59, 4379.85, 4375.53, 4375.69)
  ], 4375.6, '2026-08-16T19:30:00Z');
  assert.deepEqual(levels.map(level => [level.id, level.period, level.price, level.status]), [
    ['prevDayHigh', '2026-08-13', 4400, 'active'],
    ['prevDayLow', '2026-08-13', 4320, 'active']
  ]);
});

test('20-30% mitigated FVG remains partial and active', () => {
  const candles = [
    c('2026-08-17 08:00:00', 95, 100, 94, 99),
    c('2026-08-17 09:00:00', 99, 106, 98, 105),
    c('2026-08-17 10:00:00', 104, 106, 102, 105), // bullish FVG 100-102
    c('2026-08-17 11:00:00', 103, 104, 101.5, 103.5) // 25% fill
  ];
  const fvg = MB.detectFairValueGaps(candles, 'H1')[0];
  assert.equal(fvg.mitigationDetail.percent, 25);
  assert.equal(fvg.mitigationDetail.state, 'PARTIALLY_MITIGATED');
  assert.equal(fvg.status, 'fresh');
});

test('100% filled FVG is fully mitigated', () => {
  const candles = [
    c('2026-08-17 08:00:00', 95, 100, 94, 99),
    c('2026-08-17 09:00:00', 99, 106, 98, 105),
    c('2026-08-17 10:00:00', 104, 106, 102, 105),
    c('2026-08-17 11:00:00', 103, 104, 99.5, 100)
  ];
  const fvg = MB.detectFairValueGaps(candles, 'H1')[0];
  assert.equal(fvg.mitigationDetail.state, 'FULLY_MITIGATED');
  assert.equal(fvg.status, 'mitigated');
});

test('mitigation boundaries do not round tiny touches to OPEN or 99.6% to FULL', () => {
  assert.ok(MB.zoneMitigationPercent([c('2026-08-17 11:00:00',102,103,101.999,102.5)],0,100,102,'bullish')>0);
  assert.equal(MB.mitigationStateFromPercent(0.001), 'PARTIALLY_MITIGATED');
  assert.equal(MB.mitigationStateFromPercent(99.6), 'PARTIALLY_MITIGATED');
  assert.equal(MB.mitigationStateFromPercent(100), 'FULLY_MITIGATED');
});

test('4H POI touch can confirm immediately after formation on subsequent 15M candle', () => {
  const poi = { timeframe:'4H', direction:'bullish', priceLow:100, priceHigh:102, createdAt:'2026-08-17T08:00:00.000Z', formedThroughCandle:c('2026-08-17 08:00:00',98,103,97,102) };
  const series = [
    c('2026-08-17 12:00:00',104,105,103,104),
    c('2026-08-17 12:15:00',104,104.5,101,102), // actual touch after 4H formation close
    c('2026-08-17 12:30:00',101.5,105.5,101,105) // bullish engulfing after touch
  ];
  const result = MB.computeConfirmation(poi, series);
  assert.equal(result.status, 'ENGULFING_CONFIRMED');
  assert.equal(result.touchedAt, '2026-08-17T12:15:00.000Z');
});

test('15M confirmation before POI touch does not count', () => {
  const poi = { timeframe:'4H', direction:'bullish', priceLow:100, priceHigh:102, createdAt:'2026-08-17T08:00:00.000Z', formedThroughCandle:c('2026-08-17 08:00:00',98,103,97,102) };
  const series = [
    c('2026-08-17 11:30:00',104,105,101,102),
    c('2026-08-17 11:45:00',101.5,106,101,105), // before POI formation close
    c('2026-08-17 12:15:00',104,104.5,101,102) // valid touch, no later confirmation
  ];
  assert.notEqual(MB.computeConfirmation(poi, series).status, 'ENGULFING_CONFIRMED');
});

test('POI touch without a reaction stays touched but not reacted', () => {
  const poi = { timeframe:'H1', direction:'bullish', priceLow:100, priceHigh:102, createdAt:'2026-08-17T08:00:00.000Z', formedThroughCandle:c('2026-08-17 08:00:00',98,103,97,102) };
  const result = MB.computeConfirmation(poi,[c('2026-08-17 09:15:00',103,104,101,102.5)]);
  assert.equal(result.status,'NO_CONFIRMATION');
  assert.equal(result.reactionDetected,false);
  assert.equal(result.touchedAt,'2026-08-17T09:15:00.000Z');
});

test('computeTradingBrainV1 production orchestrator carries 4H touch into 15M confirmation', () => {
  const neutral = [
    c('2026-08-17 08:00:00',100,102,99,101),c('2026-08-17 09:00:00',101,103,100,102),c('2026-08-17 10:00:00',102,104,101,103)
  ];
  const h4 = [
    c('2026-08-17 08:00:00',95,100,94,99),c('2026-08-17 12:00:00',99,106,98,105),c('2026-08-17 16:00:00',104,106,102,105)
  ];
  const candles = {
    weekly:{series:neutral},daily:{series:neutral},'4h':{series:h4},'1h':{series:neutral},
    '15min':{series:[c('2026-08-17 20:15:00',104,104.5,101,102),c('2026-08-17 20:30:00',101.5,105.5,101,105)]}
  };
  const brain=MB.computeTradingBrainV1(candles,[],103);
  const poi=brain.pois.find(p=>p.type==='fvg'&&p.timeframe==='4H'&&p.priceLow===100&&p.priceHigh===102);
  assert.ok(poi);
  assert.equal(poi.confirmation.status,'ENGULFING_CONFIRMED');
  assert.equal(poi.confirmation.touchedAt,'2026-08-17T20:15:00.000Z');
});

test('changed Asia High has a distinct liquidity memory identity', () => {
  const oldLevel = { id:'asiaHigh', period:'2026-08-17', price:2500 };
  const newLevel = { id:'asiaHigh', period:'2026-08-17', price:2504 };
  assert.notEqual(MB.liquidityMemoryKey(oldLevel), MB.liquidityMemoryKey(newLevel));
  const oldMemory = { [MB.liquidityMemoryKey(oldLevel)]:{ sweptAt:'2026-08-17T09:00:00Z',reaction:null } };
  const enriched = MB.enrichLiquidityWithMemory([{...newLevel,type:'high',status:'active'}],oldMemory,[],'2026-08-17T10:00:00Z');
  assert.equal(enriched.levels[0].status,'active');
});

test('liquidity memory key does not round distinct physical prices together', () => {
  assert.notEqual(MB.liquidityMemoryKey({id:'asiaHigh',period:'d',price:2500.00001}),MB.liquidityMemoryKey({id:'asiaHigh',period:'d',price:2500.00002}));
});

const reportWithLiquidity = liquidity => MB.generateMarketReport({
  biasResult:{overallBias:'NEUTRAL_MIXED',confidence:null,reasoning:[],macro:null,trading:null},
  tfBrainsByOutputKey:{weekly:null,daily:null,h4:null},premiumDiscountByOutputKey:{weekly:null,daily:null,h4:null},
  liquidity,poisAll:[],targets:[],entryDecision:{status:'WAIT',reasons:[]},risk:null,sessionNotes:[],newsContext:{status:'DATA_SOURCE_NOT_CONNECTED',events:[]}
});

test('swept external Daily swing moves from main liquidity to Recent Events', () => {
  const level={id:'daily-swing',label:'Daily Swing High',type:'high',timeframe:'Daily',structureType:'external',period:'2026-08-10T00:00:00Z',price:110,status:'sweeped',sweptAt:'2026-08-17T10:00:00Z',sweepTimingSource:'RECONSTRUCTED_FROM_CANDLES'};
  const report=reportWithLiquidity([level]);
  assert.equal(report.notableLiquidity.length,0);
  assert.equal(report.recentEvents.length,1);
  assert.ok(report.recentEvents[0].includes('Daily Swing High'));
  assert.ok(!MB.buildLiquiditySection([level]).text.includes('Daily Swing High'));
});

test('swept external 4H swing moves from main liquidity to Recent Events', () => {
  const level={id:'h4-swing',label:'4H Swing Low',type:'low',timeframe:'4H',structureType:'external',period:'2026-08-17T04:00:00Z',price:90,status:'sweeped',sweptAt:'2026-08-17T11:00:00Z',sweepTimingSource:'RECONSTRUCTED_FROM_CANDLES'};
  const report=reportWithLiquidity([level]);
  assert.equal(report.notableLiquidity.length,0);
  assert.deepEqual(report.recentEvents,['4H Swing Low swept at 11:00 UTC']);
  assert.ok(!MB.buildLiquiditySection([level]).text.includes('4H Swing Low'));
});

test('Recent Events contains at most the three newest liquidity sweeps', () => {
  const levels=[8,9,10,11].map((hour,index)=>({id:`s${index}`,label:`Sweep ${index}`,type:'high',timeframe:'4H',structureType:'external',price:110+index,status:'sweeped',sweptAt:`2026-08-17T${String(hour).padStart(2,'0')}:00:00Z`,sweepTimingSource:'RECONSTRUCTED_FROM_CANDLES'}));
  const text=MB.buildRecentEventsSection(levels);
  assert.ok(!text.includes('Sweep 0'));
  assert.ok(text.indexOf('Sweep 3')<text.indexOf('Sweep 2'));
  assert.ok(text.indexOf('Sweep 2')<text.indexOf('Sweep 1'));
  assert.equal(text.split('\n').filter(line=>line.startsWith('- Sweep')).length,3);
});

test('cold-start sweep is reconstructed from complete real candle coverage', () => {
  const level={id:'h4-swing',label:'4H Swing High',type:'high',timeframe:'4H',structureType:'external',period:'2026-08-17T08:00:00Z',price:105,status:'sweeped'};
  const h1=[
    c('2026-08-17 07:00:00',99,101,98,100),
    c('2026-08-17 08:00:00',100,104,99,103),
    c('2026-08-17 09:00:00',103,106,102,105)
  ];
  const result=MB.enrichLiquidityWithMemory([level],null,h1,'2026-08-17T12:00:00Z').levels[0];
  assert.equal(result.sweptAt,'2026-08-17T09:00:00.000Z');
  assert.equal(result.sweepTimingSource,'RECONSTRUCTED_FROM_CANDLES');
  assert.equal(result.observedAt,null);
});

test('cold-start sweep without complete history is OBSERVED_AT_START with no invented sweptAt', () => {
  const level={id:'daily-swing',label:'Daily Swing High',type:'high',timeframe:'Daily',structureType:'external',period:'2026-08-01T00:00:00Z',price:105,status:'sweeped'};
  const h1=[c('2026-08-17 09:00:00',103,106,102,105)];
  const result=MB.enrichLiquidityWithMemory([level],null,h1,'2026-08-17T12:00:00Z').levels[0];
  assert.equal(result.sweepTimingSource,'OBSERVED_AT_START');
  assert.equal(result.sweptAt,null);
  assert.equal(result.observedAt,'2026-08-17T12:00:00Z');
  assert.match(result.reaction.reasons[0],/exakter historischer Sweep-Zeitpunkt nicht verfügbar/);
  assert.match(MB.buildRecentEventsSection([result]),/Beim Start bereits gesweept/);
});

test('bullish bias does not gate a stronger bearish counter-setup', () => {
  const bearishPoi = { id:'bear', direction:'bearish', status:'fresh', quality:'high', score:7, distanceToPrice:1, priceLow:104, priceHigh:106, type:'fvg', timeframe:'4H', reaction:{ at:'2026-08-17T09:00:00Z' }, confirmation:{ status:'ENGULFING_CONFIRMED', touchedAt:'2026-08-17T09:00:00Z', entryZone:{ priceLow:104, priceHigh:105 } } };
  const liquidity = [{ id:'asiaHigh', label:'Asia High', type:'high', timeframe:'Asia Session', status:'sweeped', sweptAt:'2026-08-17T08:00:00Z', price:107, relevance:{ tier:'high' } }];
  const result = MB.computeEntryDecision('BULLISH', [bearishPoi], liquidity, 103);
  assert.equal(result.status, 'SELL_READY');
  assert.equal(result.counterBias, true);
});

test('exact bullish/bearish tie follows explicit bias and stays WAIT when mixed', () => {
  const poi = direction => ({ id:direction, direction, status:'fresh', quality:'high', score:7, distanceToPrice:1, priceLow:direction==='bullish'?98:104, priceHigh:direction==='bullish'?100:106, type:'fvg', timeframe:'4H', reaction:{at:'2026-08-17T09:00:00Z'}, confirmation:{status:'ENGULFING_CONFIRMED',touchedAt:'2026-08-17T09:00:00Z',entryZone:{priceLow:100,priceHigh:101}} });
  const liquidity = [
    {id:'asiaLow',label:'Asia Low',type:'low',timeframe:'Asia Session',status:'sweeped',sweptAt:'2026-08-17T08:00:00Z',price:97,relevance:{tier:'high'}},
    {id:'asiaHigh',label:'Asia High',type:'high',timeframe:'Asia Session',status:'sweeped',sweptAt:'2026-08-17T08:00:00Z',price:107,relevance:{tier:'high'}}
  ];
  assert.equal(MB.computeEntryDecision('BEARISH',[poi('bullish'),poi('bearish')],liquidity,103).direction,'bearish');
  assert.equal(MB.computeEntryDecision('NEUTRAL_MIXED',[poi('bullish'),poi('bearish')],liquidity,103).status,'WAIT');
});

test('OBSERVED_AT_START liquidity without a real sweep timestamp cannot drive an entry setup',()=>{
  const poi={id:'bear',direction:'bearish',status:'fresh',quality:'high',score:7,distanceToPrice:1,priceLow:104,priceHigh:106,type:'fvg',timeframe:'4H',reaction:{at:'2026-08-17T09:00:00Z'},confirmation:{status:'NO_CONFIRMATION',touchedAt:'2026-08-17T09:00:00Z',entryZone:'UNDEFINED'}};
  const liquidity=[{id:'asiaHigh',label:'Asia High',type:'high',timeframe:'Asia Session',status:'sweeped',sweptAt:null,sweepTimingSource:'OBSERVED_AT_START',price:107,relevance:{tier:'high'}}];
  assert.equal(MB.computeEntryDecision('BEARISH',[poi],liquidity,103).status,'WAIT');
});

test('entry never exposes an invalidation on the wrong side of its primary POI',()=>{
  const poi={id:'bear',direction:'bearish',status:'fresh',quality:'high',score:7,distanceToPrice:1,priceLow:104,priceHigh:106,type:'fvg',timeframe:'4H',reaction:{at:'2026-08-17T09:00:00Z'},confirmation:{status:'NO_CONFIRMATION',touchedAt:'2026-08-17T09:00:00Z',entryZone:'UNDEFINED'}};
  const liquidity=[{id:'asiaHigh',label:'Asia High',type:'high',timeframe:'Asia Session',status:'sweeped',sweptAt:'2026-08-17T08:00:00Z',price:100,relevance:{tier:'high'}}];
  const result=MB.computeEntryDecision('BEARISH',[poi],liquidity,103);
  assert.equal(result.status,'SELL_CONFIRMATION');
  assert.equal(result.stopLoss,null);
});

test('POI quality counts only a provably prior liquidity sweep',()=>{
  const poi={timeframe:'4H',createdAt:'2026-08-17T08:00:00Z',formedThroughCandle:c('2026-08-17 08:00:00',100,102,99,101),relatedLiquidity:['level']};
  const level={status:'sweeped',sweptAt:'2026-08-17T13:00:00Z',relevance:{tier:'high'}};
  assert.equal(MB.poiHasSweepSupport(poi,new Map([['level',level]])),false);
  level.sweptAt='2026-08-17T11:00:00Z';
  assert.equal(MB.poiHasSweepSupport(poi,new Map([['level',level]])),true);
  level.sweptAt=null;
  assert.equal(MB.poiHasSweepSupport(poi,new Map([['level',level]])),false);
});

test('Order Block above 65% mitigation cannot remain high quality',()=>{
  const poi={type:'orderBlock',direction:'bearish',mitigationPercent:79,relatedLiquidity:['level'],reaction:{at:'2026-08-17T10:00:00Z'},relatedStructure:{id:'bos'},premiumDiscountZone:'premium',displacement:{},status:'fresh',priceLow:100,priceHigh:110,formedThroughCandle:c('2026-08-17 08:00:00',100,111,99,110)};
  const level={status:'sweeped',sweptAt:'2026-08-17T07:00:00Z',relevance:{tier:'high'}};
  const quality=MB.computePOIQuality(poi,{liquidityById:new Map([['level',level]]),tradingBiasDirection:'bearish',sameTimeframePOIs:[poi,{type:'fvg',status:'fresh',priceLow:105,priceHigh:106}]});
  assert.ok(quality.score>=5);
  assert.equal(quality.quality,'medium');
});

test('DATA_NOT_READY decision summary cannot expose an actionable setup',()=>{
  const poi={id:'p1',type:'fvg',timeframe:'4H',direction:'bullish',priceLow:100,priceHigh:102,quality:'high',score:6,confirmation:{status:'ENGULFING_CONFIRMED'}};
  const summary=MB.buildDecisionSummary({status:'DATA_NOT_READY',direction:'bullish',primaryPOI:'p1',entryZone:{priceLow:100,priceHigh:101},stopLoss:99,reasons:['missing']},{overallBias:'BULLISH',macro:null,trading:null},{riskRewardByTarget:[{rr:2}]},[{direction:'up',price:110}],[poi]);
  assert.equal(summary.decisionStage,'DATA_NOT_READY');
  assert.equal(summary.primaryPoi,null);
  assert.equal(summary.confirmation,null);
  assert.equal(summary.entryZone,'UNDEFINED');
  assert.equal(summary.invalidation,null);
  assert.deepEqual(summary.targets,[]);
  assert.deepEqual(summary.riskReward,[]);
});

test('main report excludes FULLY_MITIGATED and low-relevance POIs', () => {
  const tf={range:{low:90,high:110},structure:{externalBias:null}};
  const base={direction:'bullish',timeframe:'4H',type:'fvg',priceLow:99,priceHigh:101,score:2,maxScore:8,confirmation:null};
  const report=MB.generateMarketReport({
    biasResult:{overallBias:'NEUTRAL_MIXED',confidence:null,reasoning:[],macro:null,trading:null},
    tfBrainsByOutputKey:{weekly:tf,daily:tf,h4:tf},premiumDiscountByOutputKey:{weekly:null,daily:null,h4:null},
    liquidity:[],poisAll:[
      {...base,id:'full',quality:'high',mitigationState:'FULLY_MITIGATED',mitigationPercent:100},
      {...base,id:'low',quality:'low',mitigationState:'OPEN_UNMITIGATED',mitigationPercent:0},
      {...base,id:'relevant',quality:'medium',score:4,mitigationState:'PARTIALLY_MITIGATED',mitigationPercent:25,reaction:{at:'2026-08-17T09:00:00Z'}}
    ],targets:[],entryDecision:{status:'WAIT',reasons:[]},risk:null,sessionNotes:[],newsContext:{status:'DATA_SOURCE_NOT_CONNECTED',events:[]}
  });
  assert.deepEqual(report.freshBullishPOIs.map(p=>p.status),['PARTIALLY_MITIGATED']);
  assert.equal(report.freshBullishPOIs[0].tested,true);
  assert.equal(report.freshBullishPOIs[0].reaction,true);
  assert.ok(report.summary.startsWith('Fresh Bullish POIs:'));
  assert.ok(report.summary.includes('Mitigation 25% · getestet JA · Reaktion JA'));
  assert.ok(report.summary.indexOf('Fresh Bullish POIs:')<report.summary.indexOf('HTF Bias'));
});
