'use strict';
// Directional preference must be understandable, grounded and NEVER a
// fabricated trade approval or win probability.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {read}=require('../trading-direction-compass.js');
const base=path.resolve(__dirname,'..');
const file=name=>fs.readFileSync(path.join(base,name),'utf8');
const BRAIN={
  symbol:'XAUUSD',status:'WAIT',
  report:{status:'WAIT',summary:'Real market facts',freshBullishPOIs:[],freshBearishPOIs:[]},
  decision:{status:'WAIT',direction:null,entryZone:null,targets:[],invalidation:null}
};
function ctx(overrides={}){
  return{read:()=>({
    available:true,tradingBias:'BEARISH',macroBias:'BULLISH',
    downTargets:[{price:3880,reason:'Daily Low',priority:'PRIMARY'}],
    upTargets:[{price:3930,reason:'Daily High',priority:'PRIMARY'}],
    sweptLows:[],...overrides
  })};
}
const live={liveVerified:true,continuousVerified:false,price:3900,trendContext:ctx()};
const noData=read(BRAIN,{...live,liveVerified:false,historical:true});
assert.equal(noData.focus,'WAIT');
assert.equal(noData.tradeReady,false);
assert.match(noData.explanation,/historischer/i);
assert.doesNotMatch(noData.headline,/SELL-FOKUS|BUY-FOKUS/);
assert.equal(read(null,live).focus,'WAIT');
assert.equal(read({...BRAIN,status:'DATA_NOT_READY'},live).focus,'WAIT');
assert.equal(read({...BRAIN,symbol:'EURUSD'},live).focus,'WAIT');

const bearish=read(BRAIN,live);
assert.equal(bearish.focus,'SELL');
assert.equal(bearish.tradeReady,false);
assert.match(bearish.headline,/SELL-FOKUS/);
assert.equal(bearish.target.price,3880);
assert.match(bearish.contextLabel,/WIDERSPRÜCHLICH/);
assert.match(bearish.opposition.join(' '),/Macro- und Trading-Bias/);
assert.match(bearish.nextStep,/15M-Confirmation/);
assert.match(bearish.entryLabel,/WAIT/);
assert.doesNotMatch(JSON.stringify(bearish),/75%|90%|Trefferquote|garantiert/);

const aligned=read(BRAIN,{...live,trendContext:ctx({macroBias:'BEARISH'})});
assert.equal(aligned.contextLabel,'MACRO + TRADING GLEICHE RICHTUNG');
assert.match(aligned.evidence.join(' '),/Monthly\/Weekly/);
assert.equal(aligned.focus,'SELL');

const low=read(BRAIN,{...live,trendContext:ctx({
 sweptLows:[{price:3891,label:'Asia Low',reactionConfirmed:true}]
})});
assert.equal(low.focus,'SELL','H1 reaction does not flip HTF bias to a BUY entry');
assert.match(low.opposition.join(' '),/BUY als Gegenbewegung/);
assert.match(low.opposition.join(' '),/15M-Confirmation/);
assert.equal(low.tradeReady,false);

const bullish=read(BRAIN,{...live,trendContext:ctx({
 tradingBias:'BULLISH',macroBias:'BULLISH'
})});
assert.equal(bullish.focus,'BUY');
assert.equal(bullish.target.price,3930);
assert.match(bullish.entryLabel,/WAIT/);

const mixed=read(BRAIN,{...live,trendContext:ctx({
 tradingBias:'NEUTRAL_MIXED',macroBias:'BULLISH'
})});
assert.equal(mixed.focus,'WAIT');
assert.equal(mixed.target,null);
assert.match(mixed.opposition.join(' '),/Eine Richtung wäre geraten/);

const noTarget=read(BRAIN,{...live,price:3875});
assert.equal(noTarget.focus,'SELL'); // informational bias, not a trade
assert.equal(noTarget.target,null);
assert.match(noTarget.opposition.join(' '),/Kein belegtes offenes Ziel/);
assert.equal(noTarget.tradeReady,false);

const completeBuy={
 ...BRAIN,
 decision:{
   status:'BUY_READY',direction:'bullish',
   entryZone:{priceLow:3895,priceHigh:3900},
   invalidation:3888,
   targets:[{direction:'up',price:3920,reason:'Buyside',priority:'PRIMARY'}]
 }
};
const continuous={...live,continuousVerified:true,trendContext:ctx({tradingBias:'BULLISH',macroBias:'BULLISH'})};
const good=read(completeBuy,continuous);
assert.equal(good.tradeReady,true);
assert.match(good.entryLabel,/BUY READY/);
assert.match(good.nextStep,/manuell|selbst prüfen/i);
const browserNotReady=read(completeBuy,{...continuous,continuousVerified:false});
assert.equal(browserNotReady.tradeReady,false);
assert.match(browserNotReady.entryLabel,/WAIT/);
const missingPlan=read({...completeBuy,decision:{...completeBuy.decision,invalidation:null}},continuous);
assert.equal(missingPlan.tradeReady,false);
assert.match(missingPlan.entryLabel,/UNVOLLSTÄNDIG/);
const badDirection=read({...completeBuy,decision:{...completeBuy.decision,invalidation:3910}},continuous);
assert.equal(badDirection.tradeReady,false);
const wrongTarget=read({...completeBuy,decision:{...completeBuy.decision,
 targets:[{direction:'up',price:3880}]}},continuous);
assert.equal(wrongTarget.tradeReady,false);
const missed=read({...BRAIN,decision:{...BRAIN.decision,status:'MISSED'}},live);
assert.match(missed.entryLabel,/MISSED/);
const actualTrend=require('../trading-trend-context.js');
const integrated=read({
 ...BRAIN,htfContext:{macro:{state:'BEARISH'},trading:{state:'BEARISH'}},
 targets:[{price:3882,priority:'PRIMARY',reason:'Daily Low',direction:'down'}],
 liquidity:[],structure:{weekly:{externalBias:'bearish'},daily:{externalBias:'bearish'},h4:{externalBias:'bearish'}}
},{liveVerified:true,continuousVerified:false,price:3900,trendContext:actualTrend});
assert.equal(integrated.focus,'SELL');
assert.equal(integrated.target.price,3882);

const html=file('index.html'),ui=file('trading-command.js'),voice=file('jarvis-conversation.js');
for(const id of [
 'tradingDirectionCompass','tradingDirectionFocus','tradingDirectionQuality',
 'tradingDirectionExplanation','tradingDirectionEvidence','tradingDirectionOpposition',
 'tradingDirectionEntry','tradingDirectionNextStep','tradingDirectionTarget'
])assert.ok(html.includes('id="'+id+'"'),'Missing direction Compass UI '+id);
assert.ok(html.indexOf('trading-direction-compass.js')<html.indexOf('jarvis-conversation.js'));
assert.match(ui,/renderDirectionCompass\(analysisBrain,realBrain,feedGate\.live/);
assert.match(voice,/options\.directionCompass\?\.read\?/);
assert.match(voice,/Meine aktuelle Beobachtungsrichtung/);
assert.ok(file('personal.js').includes('directionCompass:window.DGDirectionCompass'));
assert.ok(file('personal.js').includes('continuousVerified=verified'));
assert.ok(file('sw.js').includes('trading-direction-compass.js?v=1'));
console.log('PASS: Jarvis BUY/SELL/WAIT directional support, no fake confidence, strict entry safety');
