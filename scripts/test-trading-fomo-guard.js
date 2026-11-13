'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {read}=require('../trading-fomo-guard.js');

function sample(overrides={}){
  const brain={
    symbol:'XAUUSD',status:'WAIT',report:{status:'WAIT'},
    htfContext:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}},
    decision:{
      status:'WAIT',direction:'bullish',macroBias:'BULLISH',tradingBias:'BEARISH',
      reasons:['15M Confirmation noch nicht bestätigt'],
      missingRequirements:['15M Confirmation noch nicht bestätigt'],
      primaryPoi:null,confirmation:null,entryZone:'UNDEFINED',
      invalidation:null,targets:[]
    }
  };
  return {...brain,...overrides,decision:{...brain.decision,...overrides.decision},
    report:{...brain.report,...overrides.report}};
}
const live={liveVerified:true};
const offline=read(sample({decision:{status:'BUY_READY'}}),{liveVerified:false,historical:true});
assert.equal(offline.kind,'offline');
assert.equal(offline.entryStatus,'DATA_NOT_READY');
assert.match(offline.antiFomo,/FOMO/);
assert.doesNotMatch(offline.title,/BUY READY/);
assert.equal(read(null,live).kind,'offline');

const wait=read(sample(),live);
assert.equal(wait.kind,'wait');
assert.match(wait.missing[0],/15M Confirmation/);
assert.ok(!wait.title.includes('READY'));

const watch=read(sample({decision:{status:'WATCH_BUY',
  reasons:['POI erreicht; Reaktion fehlt'],primaryPoi:{type:'orderBlock',timeframe:'4H',quality:'high'}}}),live);
assert.equal(watch.kind,'watch');
assert.match(watch.missing.join(' '),/Reaktion/);
assert.match(watch.pros.join(' '),/4H/);
assert.match(watch.risks.join(' '),/gegen den bearishen Trading Bias/);

const confirmation=read(sample({decision:{status:'BUY_CONFIRMATION'}}),live);
assert.equal(confirmation.kind,'watch');
assert.match(confirmation.missing.join(' '),/15M/);

const readyBrain=sample({
  status:'BUY_READY',report:{status:'BUY_READY'},
  decision:{
    status:'BUY_READY',direction:'bullish',
    primaryPoi:{type:'fvg',timeframe:'15M',quality:'high',reaction:true},
    confirmation:{status:'ENGULFING_CONFIRMED'},
    reasons:['Liquidity Sweep + POI + 15M Engulfing'],
    entryZone:{priceLow:4210,priceHigh:4215},
    invalidation:4190,targets:[{direction:'up',price:4250,priority:'PRIMARY'}]
  }
});
const ready=read(readyBrain,live);
assert.equal(ready.kind,'ready');
assert.equal(ready.entryStatus,'BUY_READY');
assert.match(ready.pros.join(' '),/15M Confirmation/);
assert.match(ready.antiFomo,/keine Pflicht/);
assert.equal(ready.risks.some(x=>x.includes('Entry-Zone')),false);
assert.match(ready.risks.join(' '),/Gegentrend|gegen den bearishen Trading Bias/);

const incompleteReady=read(sample({
  status:'BUY_READY',report:{status:'BUY_READY'},
  decision:{status:'BUY_READY',direction:'bullish',entryZone:'UNDEFINED',invalidation:null,targets:[]}
}),live);
assert.equal(incompleteReady.kind,'ready'); // read-only: does not replace DG Entry status
assert.match(incompleteReady.risks.join(' '),/Entry-Zone/);
assert.match(incompleteReady.risks.join(' '),/Stop Loss/);
assert.match(incompleteReady.risks.join(' '),/Markt-Target/);

const missed=read(sample({status:'MISSED',report:{status:'MISSED'},
  decision:{status:'MISSED',reasons:['Der Move ist verpasst']}}),live);
assert.equal(missed.kind,'missed');
assert.match(missed.antiFomo,/Nicht chasen/);
assert.match(missed.missing.join(' '),/neues Setup/);

const stale=read(sample({status:'DATA_NOT_READY',report:{status:'DATA_NOT_READY'},
  decision:{status:'BUY_READY'}}),live);
assert.equal(stale.kind,'wait');
assert.equal(stale.entryStatus,'DATA_NOT_READY');

const wrong=read({...sample(),symbol:'EURUSD'},live);
assert.equal(wrong.kind,'offline');

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const controller=fs.readFileSync(path.join(__dirname,'../trading-command.js'),'utf8');
assert.ok(html.indexOf('trading-fomo-guard.js')<html.indexOf('trading-command.js?v='));
for(const id of ['tradingFomoGuard','tradingFomoVerdict','tradingFomoListPros',
  'tradingFomoListMissing','tradingFomoListRisks','tradingFomoBanner','tradingFomoEntry']){
  assert.ok(html.includes('id="'+id+'"'),'Missing FOMO UI element '+id);
}
assert.match(controller,/renderSetupClarity\(analysisBrain,realBrain,Boolean\(historical\)\)/);
assert.match(controller,/DGTradingEvidenceGate\.assess/);
console.log('DG Jarvis clarity and FOMO guard: PASS');
