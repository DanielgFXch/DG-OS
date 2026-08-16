'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {TIMEFRAME_DEFS}=require('../server/lib/timeframes.js');

test('15M history survives a full weekend of provider placeholders',()=>{
  const m15=TIMEFRAME_DEFS.find(def=>def.id==='15min');
  assert.ok(m15);
  assert.ok(m15.outputsize>=384);
  assert.equal(m15.historicalReach,'4 Tage');
});
