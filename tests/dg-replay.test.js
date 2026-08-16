'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const replay=require('../scripts/dgReplay.js');

const c=(datetime,open,high,low,close)=>({datetime,open,high,low,close});

test('replay only exposes a candle after its own timeframe close',()=>{
  const candle=c('2026-08-17 08:00:00',100,102,99,101);
  assert.equal(replay.availableAt(candle,'4h'),Date.parse('2026-08-17T12:00:00Z'));
  assert.equal(replay.candlesKnownAt([candle],'4h',Date.parse('2026-08-17T11:59:59Z')).length,0);
  assert.equal(replay.candlesKnownAt([candle],'4h',Date.parse('2026-08-17T12:00:00Z')).length,1);
});

test('candle replay cannot see a future 4H FVG formation',()=>{
  const neutral=[c('2026-08-16 22:00:00',100,102,99,101),c('2026-08-17 00:00:00',101,103,100,102)];
  const market={candles:{
    weekly:{series:neutral},daily:{series:neutral},'1h':{series:neutral},
    '4h':{series:[c('2026-08-17 00:00:00',95,100,94,99),c('2026-08-17 04:00:00',99,106,98,105),c('2026-08-17 08:00:00',104,106,102,105)]},
    '15min':{series:[c('2026-08-17 10:00:00',101,102,100,101.5),c('2026-08-17 12:00:00',102,103,101,102.5)]}
  }};
  const timeline=replay.replayMarketSnapshot(market);
  assert.equal(timeline.length,2);
  assert.equal(timeline[0].knownCandles['4h'],2);
  assert.equal(timeline[1].knownCandles['4h'],3);
  assert.equal(timeline[0].poiCount,0);
  assert.ok(timeline[1].poiCount>0);
});

test('replay CLI accepts real server or snapshot input only',()=>{
  assert.throws(()=>replay.parseArgs([]),/exactly one/);
  assert.deepEqual(replay.parseArgs(['--snapshot','market.json','--json']),{server:null,snapshot:'market.json',json:true});
});
