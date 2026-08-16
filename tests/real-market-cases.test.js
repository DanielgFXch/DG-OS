'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const cases=require('./fixtures/real-xauusd-cases.json');
const MB=require('../marketBrain.js');

test('real 4H case preserves an open bullish FVG',()=>{
  const sample=cases.cases.openBullishFvg4H;
  const fvg=MB.detectFairValueGaps(sample.candles,'4H').find(item=>item.priceLow===sample.expectedRange.low&&item.priceHigh===sample.expectedRange.high);
  assert.ok(fvg);
  assert.equal(fvg.mitigationDetail.state,'OPEN_UNMITIGATED');
});

test('real Daily case removes Saturday but preserves Sunday-open FVG and partial mitigation',()=>{
  const sample=cases.cases.partialBullishFvgDaily;
  const clean=MB.filterUsableMarketCandles(sample.candles,'Daily','2026-08-16T20:00:00Z');
  assert.ok(!clean.some(candle=>candle.datetime==='2026-08-08'));
  assert.ok(clean.some(candle=>candle.datetime==='2026-08-09'));
  const fvg=MB.detectFairValueGaps(sample.candles,'Daily').find(item=>item.priceLow===sample.expectedRange.low&&item.priceHigh===sample.expectedRange.high);
  assert.ok(fvg);
  assert.equal(fvg.mitigationDetail.state,'PARTIALLY_MITIGATED');
  assert.ok(fvg.mitigationDetail.percent>80&&fvg.mitigationDetail.percent<100);
});

test('real Asia High sweep has a later H1 reaction, never same-candle reaction',()=>{
  const sample=cases.cases.asiaHighSweepReactionH1;
  const reaction=MB.detectLiquidityReaction(sample.level,sample.candles);
  assert.equal(reaction.status,'REACTED');
  const timestamp=reaction.reasons[0].match(/2026-[^ ]+/);
  if(timestamp) assert.ok(new Date(timestamp[0]).getTime()>new Date(sample.level.sweptAt).getTime());
});

test('real single 15M touch remains NO_CONFIRMATION',()=>{
  const sample=cases.cases.poiTouchNoConfirmation15M;
  const confirmation=MB.computeConfirmation(sample.poi,sample.candles);
  assert.equal(confirmation.touchedAt,'2026-08-14T20:45:00.000Z');
  assert.equal(confirmation.status,'NO_CONFIRMATION');
  assert.equal(confirmation.reactionDetected,false);
});
