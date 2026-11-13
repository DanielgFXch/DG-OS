'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {read}=require('../trading-trend-context.js');

const BASE={
  symbol:'XAUUSD',
  report:{status:'WAIT',freshBullishPOIs:[],htfBias:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}}},
  htfContext:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}},
  structure:{daily:{externalBias:'bearish'},h4:{externalBias:'bearish'}},
  liquidity:[],
  targets:[
    {direction:'down',price:4280,priority:'PRIMARY',reason:'Daily Low'},
    {direction:'up',price:4400,priority:'PRIMARY',reason:'Bearish POI'},
    {direction:'down',price:4250,priority:'SECONDARY',reason:'Weekly Low'},
    {direction:'up',price:4430,priority:'SECONDARY',reason:'Session High'}
  ],
  entry:{status:'WAIT'}
};
function make(fields={}){
  const o=JSON.parse(JSON.stringify(BASE));
  return Object.assign(o,fields);
}
const swept={
  id:'asiaLow',label:'Asia Low',type:'low',timeframe:'Asia Session',price:4300,
  status:'sweeped',sweptAt:'2026-11-13T13:00:00.000Z'
};
assert.equal(read(null).available,false);
assert.equal(read({symbol:'EURUSD',report:{}}).available,false);
const initial=read(make());
assert.equal(initial.tradingBias,'BEARISH');
assert.equal(initial.macroBias,'BULLISH');
assert.equal(initial.countertrend.isCountertrendContext,false);
assert.equal(initial.countertrend.entryStatus,'WAIT');
assert.equal(initial.downTargets[0].price,4280);
assert.equal(initial.upTargets[0].price,4400);

const noReaction=read(make({liquidity:[swept]}));
assert.equal(noReaction.sweptLows.length,1);
assert.equal(noReaction.countertrend.isCountertrendContext,true);
assert.equal(noReaction.countertrend.reactionConfirmed,false);
assert.match(noReaction.countertrend.status,/REAKTION FEHLT/);
assert.equal(noReaction.countertrend.entryStatus,'WAIT');

const reacted=read(make({
  liquidity:[{...swept,reaction:{status:'REACTED',reasons:['Bullish H1 Engulfing']}}],
  report:{...BASE.report,freshBullishPOIs:[{range:'4295-4305'}]}
}));
assert.equal(reacted.countertrend.reactionConfirmed,true);
assert.equal(reacted.countertrend.hasBullishPoi,true);
assert.match(reacted.countertrend.status,/GEGEN-TREND-LONG BEOBACHTEN/);
assert.equal(reacted.countertrend.entryStatus,'WAIT','Low + reaction must not invent BUY_READY');
assert.equal(reacted.sweptLows[0].reactionReason,'Bullish H1 Engulfing');

const irrelevant=read(make({liquidity:[
  {...swept,id:'h1-internal',timeframe:'H1',structureType:'internal'},
  {...swept,type:'high',id:'asiaHigh'},
  {...swept,status:'touched',id:'londonLow'},
  {...swept,price:null,id:'dailyLow'}
]}));
assert.equal(irrelevant.sweptLows.length,0,'No false low sweep');

const bullish=read(make({
  htfContext:{macro:{state:'BEARISH'},trading:{state:'BULLISH'}},
  liquidity:[swept]
}));
assert.equal(bullish.countertrend.isCountertrendContext,false,'Not a countertrend to bearish trading bias');

const unknown=read(make({
  htfContext:{macro:{state:'AWAITING_DG_RULE'},trading:{state:'AWAITING_DG_RULE'}},
  report:{status:'WAIT',freshBullishPOIs:[]},
  liquidity:[swept]
}));
assert.equal(unknown.tradingBias,'UNBESTIMMT');
assert.equal(unknown.countertrend.isCountertrendContext,false);

const missingHtf=read(make({
  status:'DATA_NOT_READY',
  report:{...BASE.report,status:'DATA_NOT_READY'},
  liquidity:[swept]
}));
assert.equal(missingHtf.available,false,'Incomplete HTF data cannot yield a confirmed trend or contra-trend watch');

const missingTargets=read(make({targets:[]}));
assert.deepEqual(missingTargets.upTargets,[]);
assert.deepEqual(missingTargets.downTargets,[]);

const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const command=fs.readFileSync(path.join(__dirname,'../trading-command.js'),'utf8');
assert.ok(html.indexOf('trading-trend-context.js')<html.indexOf('trading-command.js'));
for(const id of [
  'tradingTrendMacro','tradingTrendTrading','tradingTargetsDown','tradingTargetsUp',
  'tradingSweptLowTitle','tradingCountertrendTitle','tradingCountertrendEntry',
  'tradingContextSource'
]) assert.ok(html.includes('id="'+id+'"'),'Missing UI node '+id);
assert.match(command,/renderTrendContext\(analysisBrain,realBrain,Boolean\(historical\)\)/);
assert.match(command,/DGTradingEvidenceGate\.assess/);
// The screenshot's Trading screen needs a visible path to the existing
// Jarvis voice/text conversation instead of hiding it behind another tab.
for(const id of [
  'tradingJarvisLaunch','tradingAskJarvis','tradingSetupLive',
  'tradingJarvisLiveStatus','tradingJarvisLiveExplanation'
]) assert.ok(html.includes('id="'+id+'"'),'Missing visible Jarvis bridge '+id);
assert.ok(html.indexOf('id="tradingJarvisLaunch"')<
  html.indexOf('id="dgTradingSessionClock"'),'Jarvis must appear before Session Clock');
assert.ok(command.includes("data-target=\"personalJarvis\""),'Jarvis button routes to voice area');
assert.ok(command.includes("jarvisLifeCommandInput"),'Pre-populate sample Gold question');
assert.ok(command.includes("tradingAdvanced"),'Setup button opens server settings');
assert.ok(command.includes("marketServerUrl"),'Setup button points at real server URL');
assert.ok(command.includes("renderJarvisLaunch(realBrain,Boolean(historical))"));
assert.ok(command.includes("HISTORISCHE DATEN · KEIN LIVE"));
assert.ok(command.includes("Der Server antwortet, aber ein ausreichend frischer TwelveData-WebSocket-Tick fehlt"));
console.log('DG Jarvis trend/target/countertrend read-only context: PASS');
