'use strict';
// Browser candle pathway must be real, bounded, and WAIT-only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const lib=require('../browser-trading-brain.js');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const nowMs=Date.parse('2026-11-13T21:15:30.000Z');
const quote={symbol:'XAUUSD',price:4100,at:new Date(nowMs-5000).toISOString(),source:'TWELVEDATA_BROWSER_WEBSOCKET'};
function rows(def){
  const interval=def.seconds*1000;
  const currentStart=Math.floor(nowMs/interval)*interval;
  return Array.from({length:Math.max(def.count,def.min+4)},(_,i)=>{
    const ms=currentStart-(i+1)*interval;
    const dt=new Date(ms);
    const datetime=def.seconds>=86400
      ?dt.toISOString().slice(0,10)
      :dt.toISOString().slice(0,19).replace('T',' ');
    const open=4100+Math.sin(i/9)*10;
    return{datetime,open:String(open.toFixed(3)),
      high:String((open+8).toFixed(3)),low:String((open-8).toFixed(3)),
      close:String((open+1).toFixed(3))};
  });
}
function feed({badFrame=null,failOn=null}={}){
  const requests=[];
  return{requests,fetchFn:async raw=>{
    const url=new URL(raw);
    const interval=url.searchParams.get('interval');
    const def=lib.DEFS.find(x=>x.td===interval);
    assert.ok(def,'Real TwelveData interval');
    assert.equal(url.hostname,'api.twelvedata.com');
    assert.equal(url.searchParams.get('symbol'),'XAU/USD');
    assert.equal(url.searchParams.get('apikey'),'private-test-key');
    requests.push(def.id);
    if(def.id===failOn)return{ok:false,status:429,json:async()=>({})};
    return{ok:true,json:async()=>({
      meta:{symbol:badFrame===def.id?'EUR/USD':'XAU/USD',interval},
      values:rows(def)
    })};
  }};
}
const engine={
  computeAllDerivedModules:({liveData,sessions,candles})=>{
    assert.equal(liveData.symbol,'XAU/USD');
    assert.ok(Array.isArray(candles.h1));
    return{liquidity:[{id:'asiaLow',label:'Asia Low',price:4080,status:'sweeped'}]};
  },
  computeTradingBrainV1:(candles,liq,price)=>{
    assert.ok(candles.daily?.series.length>=30);
    assert.ok(candles['15min']?.series.length>=28);
    assert.equal(price,4100);
    return{
      symbol:'XAUUSD',status:'BUY_READY',
      htfContext:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}},
      targets:[{direction:'down',price:4070,priority:'PRIMARY',reason:'Daily Low'}],
      liquidity:liq,liquidityMemory:{},
      entry:{status:'BUY_READY',direction:'bullish',entryZone:{priceLow:4090,priceHigh:4095},stopLoss:4080,reasons:['BAD BUY']},
      decision:{status:'BUY_READY',direction:'bullish',entryZone:{priceLow:4090,priceHigh:4095},invalidation:4080,reasons:['BAD BUY']},
      risk:{entryPrice:4092},
      report:{status:'BUY_READY',summary:'Original engine: READY',
        htfBias:{macro:{state:'BULLISH'},trading:{state:'BEARISH'}},
        freshBullishPOIs:[],freshBearishPOIs:[]}
    };
  }
};
(async()=>{
 const f=feed();
 const brain=lib.create({fetchFn:f.fetchFn,nowFn:()=>nowMs,engine,quoteFn:()=>quote});
 assert.equal(brain.snapshot().verified,false);
 assert.equal(brain.snapshot().reason,'FRESH_CANDLES_MISSING');
 await brain.refresh('private-test-key');
 assert.equal(f.requests.length,7,'Only seven real REST requests, not huge traffic');
 const state=brain.snapshot();
 assert.equal(state.verified,true);
 assert.equal(state.source,'BROWSER_TWELVEDATA_LIVE');
 assert.equal(state.brain.htfContext.trading.state,'BEARISH');
 assert.equal(state.brain.targets[0].price,4070);
 assert.equal(state.brain.status,'WAIT');
 assert.equal(state.brain.entry.status,'WAIT');
 assert.equal(state.brain.decision.status,'WAIT');
 assert.equal(state.brain.decision.direction,null);
 assert.equal(state.brain.decision.entryZone,null);
 assert.equal(state.brain.decision.invalidation,null);
 assert.equal(state.brain.risk,null);
 assert.match(state.brain.report.summary,/NO FOMO/);
 assert.doesNotMatch(state.brain.report.summary,/BUY READY/);
 const second=await brain.refresh('private-test-key');
 assert.equal(f.requests.length,7,'No repeated API calls inside timeframe TTL');
 assert.equal(second.missing.length,0);
 assert.equal(brain.snapshot().verified,true);
 // Stale or wrong-symbol WebSocket quote cannot validate old candle context.
 for(const invalid of [
   {...quote,at:new Date(nowMs-25000).toISOString()},
   {...quote,at:new Date(nowMs+15000).toISOString()},
   {...quote,symbol:'EURUSD'},
   {...quote,source:'SIMULATION'},
   {...quote,price:0}
 ]){
   const instance=lib.create({fetchFn:f.fetchFn,nowFn:()=>nowMs,engine,quoteFn:()=>invalid});
   await instance.refresh('private-test-key');
   assert.equal(instance.snapshot().verified,false);
 }
 const bad=feed({failOn:'15min'});
 const partial=lib.create({fetchFn:bad.fetchFn,nowFn:()=>nowMs,engine,quoteFn:()=>quote});
 await partial.refresh('private-test-key');
 assert.equal(partial.snapshot().verified,false);
 assert.match(partial.diagnostic().errors['15min'],/HTTP 429/);
 const mismatch=feed({badFrame:'weekly'});
 const safety=lib.create({fetchFn:mismatch.fetchFn,nowFn:()=>nowMs,engine,quoteFn:()=>quote});
 await safety.refresh('private-test-key');
 assert.equal(safety.snapshot().verified,false);
 assert.match(safety.diagnostic().errors.weekly,/Symbol stimmt nicht/);
 const missingKey=lib.create({fetchFn:f.fetchFn,nowFn:()=>nowMs,engine,quoteFn:()=>quote});
 await missingKey.refresh('');
 assert.match(missingKey.diagnostic().lastError,/API-Key fehlt/);
 const five=lib.DEFS.find(d=>d.id==='5min');
 const stillOpen=lib.parseSeries({meta:{symbol:'XAU/USD',interval:'5min'},values:[
   {datetime:'2026-11-13 21:15:00',open:'4100',high:'4101',low:'4099',close:'4100'},
   {datetime:'2026-11-13 21:10:00',open:'4100',high:'4102',low:'4098',close:'4101'}
 ]},five,nowMs);
 assert.equal(stillOpen.length,1,'Unclosed 5M candle must never confirm an entry');
 assert.equal(stillOpen[0].datetime,'2026-11-13 21:10:00');
 const html=read('index.html'),app=read('app.js'),personal=read('personal.js'),cmd=read('trading-command.js');
 assert.ok(html.indexOf('browser-trading-brain.js')<html.indexOf('app.js?v='));
 assert.ok(html.indexOf('marketBrain.js')<html.indexOf('browser-trading-brain.js'));
 assert.match(app,/DGOSBrowserTradingBrain=Object.freeze/);
 assert.match(app,/verifiedLiveBrainSource\(\)/);
 assert.match(app,/browserCandleBrain\.refresh\(key\)/);
 assert.match(personal,/DGOSBrowserTradingBrain\?\.getSnapshot\?\.\(\)/);
 assert.match(cmd,/browserVerified/);
 assert.match(cmd,/DG BROWSER-TREND LIVE/);
 assert.ok(read('sw.js').includes('browser-trading-brain.js?v=1'));
 for(const f of ['app.js','personal.js','trading-command.js','browser-trading-brain.js'])
   assert.doesNotThrow(()=>new (require('node:vm').Script)(read(f)),f+' syntax');
 console.log('PASS: live browser SMC context uses authentic closed OHLC and current XAU tick; always WAIT; bounded REST budget and no false ready');
})().catch(e=>{console.error(e);process.exitCode=1;});
