'use strict';
// Strictly presentation/data provenance testing: never modifies trading rules.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assess}=require('../trading-evidence-gate.js');
const nowMs=Date.parse('2026-11-13T16:45:00Z');
const state={
  symbol:'XAUUSD',
  quote:{price:3900},
  freshness:{
    websocketStatus:'streaming',
    isPriceLive:true,
    lastPriceUpdate:new Date(nowMs-4000).toISOString()
  }
};
const brain={report:{status:'WATCH_BUY'},decision:{status:'WATCH_BUY'}};
const check=(overrides={})=>assess({reachable:true,marketState:state,brain,nowMs,...overrides});
assert.deepEqual(check(),{live:true,reason:'LIVE_TICK_CONFIRMED',ageSeconds:4});
assert.equal(check({reachable:false}).reason,'SERVER_OFFLINE');
assert.equal(check({brain:null}).reason,'BRAIN_MISSING');
assert.equal(check({marketState:{...state,symbol:'EURUSD'}}).reason,'INVALID_MARKET');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,websocketStatus:'disconnected'}}}).reason,'STREAM_NOT_LIVE');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,isPriceLive:false}}}).reason,'STREAM_NOT_LIVE');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,lastPriceUpdate:new Date(nowMs-25000).toISOString()}}}).reason,'STALE_TICK');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,lastPriceUpdate:'not-a-date'}}}).reason,'INVALID_TIMESTAMP');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,lastPriceUpdate:new Date(nowMs+10000).toISOString()}}}).reason,'INVALID_TIMESTAMP');
assert.equal(check({marketState:{...state,freshness:{...state.freshness,lastPriceUpdate:new Date(nowMs+1000).toISOString()}}}).live,true);
assert.equal(check({maxAgeSeconds:3}).live,false);
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const command=fs.readFileSync(path.join(root,'trading-command.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(app.includes('isVerifiedLiveTradingBrain()'),'Trading Brain UI checks actual tick freshness');
assert.ok(app.includes('verifiedLiveBrainSource()'));
assert.ok(app.includes('DGTradingEvidenceGate.assess({'));
assert.ok(app.includes("source:'always-on'"));
assert.ok(app.includes("source:'browser'"));
assert.ok(command.includes('feedGate.live'),'Session command UI cannot claim live from HTTP reachability');
assert.ok(command.includes('NICHT LIVE GEPRÜFT'),'Missing sweeps are not misreported as NO SWEEP');
assert.ok(html.indexOf('trading-evidence-gate.js')<html.indexOf('./app.js'),'Gate loads before the application');
assert.ok(html.includes('tradingSourceEvidence'),'Source and data age displayed');
console.log('PASS: DG Trading Brain rejects delayed/disconnected/future/invalid ticks and marks unavailable sweep evidence.');
