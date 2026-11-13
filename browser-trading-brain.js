/* DG OS — browser-held, evidence-only SMC context for XAU/USD.
   Uses ONLY authentic TwelveData REST OHLC and a confirmed real WebSocket tick.
   Never grants BUY_READY/SELL_READY: persistent event/memory + push require
   the Always-On Market Server. Browser/tab closure stops updates. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DGOSBrowserCandleBrain=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const API='https://api.twelvedata.com/time_series';
  const DEFS=[
    {id:'monthly',td:'1month',count:24,min:8,seconds:2678400,ttl:4*3600000,maxLag:42*86400000},
    {id:'weekly',td:'1week',count:52,min:20,seconds:604800,ttl:2*3600000,maxLag:15*86400000},
    {id:'daily',td:'1day',count:120,min:30,seconds:86400,ttl:3600000,maxLag:5*86400000},
    {id:'4h',td:'4h',count:180,min:40,seconds:14400,ttl:30*60000,maxLag:12*3600000},
    {id:'1h',td:'1h',count:168,min:40,seconds:3600,ttl:15*60000,maxLag:4*3600000},
    {id:'15min',td:'15min',count:192,min:28,seconds:900,ttl:10*60000,maxLag:3600000},
    {id:'5min',td:'5min',count:288,min:48,seconds:300,ttl:10*60000,maxLag:30*60000}
  ];
  const CORE=['weekly','daily','4h','1h','15min','5min'];
  const safeNum=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
  const validNum=n=>Number.isFinite(n)&&n>0;
  function utcMs(value){
    if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?: [0-9]{2}:[0-9]{2}:[0-9]{2})?$/.test(value))return NaN;
    const asIso=value.includes(' ')?value.replace(' ','T')+'Z':value+'T00:00:00Z';
    return Date.parse(asIso);
  }
  function parseSeries(body,def,nowMs){
    if(body?.status==='error'||body?.code>=400)throw Error(String(body.message||'TwelveData meldet einen Fehler.').slice(0,180));
    if(body?.meta?.symbol&&!['XAU/USD','XAUUSD'].includes(String(body.meta.symbol).toUpperCase()))
      throw Error('Symbol stimmt nicht mit XAU/USD überein.');
    if(body?.meta?.interval&&body.meta.interval!==def.td)
      throw Error('Zeitfenster der Antwort stimmt nicht überein.');
    if(!Array.isArray(body?.values))throw Error('TwelveData liefert keine OHLC-Kerzen.');
    const seen=new Set();
    const series=body.values.map(x=>{
      const datetime=x?.datetime,open=safeNum(x?.open),high=safeNum(x?.high),
        low=safeNum(x?.low),close=safeNum(x?.close),start=utcMs(datetime);
      if(!Number.isFinite(start)||start>nowMs+5000||
        ![open,high,low,close].every(validNum)||high<low||
        open<low||open>high||close<low||close>high)return null;
      // Never interpret an unfinished candle as a closed confirmation.
      if(nowMs<start+def.seconds*1000+1500)return null;
      if(seen.has(start))return null;
      seen.add(start);
      return{datetime,open,high,low,close,start};
    }).filter(Boolean).sort((a,b)=>a.start-b.start);
    return series.map(({start,...bar})=>bar);
  }
  function makeSessions(series,price,nowMs){
    const day=new Date(nowMs).toISOString().slice(0,10);
    const result={};
    for(const [id,start,end] of [['asia',0,8],['london',8,16],['ny',13,21]]){
      const bars=series.filter(x=>x.datetime.slice(0,10)===day&&
        Number(x.datetime.slice(11,13))>=start&&Number(x.datetime.slice(11,13))<end);
      result[id]=bars.length
        ?{date:day,high:Math.max(...bars.map(x=>x.high)),low:Math.min(...bars.map(x=>x.low))}
        :{date:null,high:null,low:null};
    }
    return result;
  }
  function create({fetchFn,nowFn,engine,quoteFn}={}){
    const fetcher=fetchFn||((...args)=>fetch(...args));
    const clock=nowFn||(()=>Date.now());
    const market=engine||(typeof globalThis!=='undefined'?globalThis:{});
    const quoteGetter=quoteFn||(()=>globalThis.DGOSBrowserGoldFeed?.getQuote?.());
    const candles={};
    const fetched={};
    const errors={};
    let refreshing=false;
    let prevMemory=null;
    let cached=null;
    let lastComputedAt=0;
    let lastPrice=null;
    let lastError=null;
    const diagnostic=()=>({
      mode:'BROWSER_REST',refreshing,
      loaded:DEFS.filter(d=>Array.isArray(candles[d.id])&&candles[d.id].length>=d.min).map(d=>d.id),
      missing:CORE.filter(id=>!Array.isArray(candles[id])||candles[id].length<(DEFS.find(d=>d.id===id)?.min||1)),
      lastError,errors:{...errors}
    });
    async function request(def,key,nowMs){
      const url=API+'?symbol=XAU%2FUSD&interval='+encodeURIComponent(def.td)+
        '&outputsize='+def.count+'&timezone=UTC&apikey='+encodeURIComponent(key);
      const response=await fetcher(url,{cache:'no-store'});
      if(!response?.ok)throw Error('TwelveData HTTP '+(response?.status||'Fehler'));
      const body=await response.json();
      const list=parseSeries(body,def,nowMs);
      if(list.length<def.min)throw Error(def.id+': nur '+list.length+' valide geschlossene Kerzen; mindestens '+def.min+' benötigt.');
      return list;
    }
    async function refresh(key,{force=false}={}){
      if(refreshing)return diagnostic();
      if(typeof key!=='string'||!key.trim()){
        lastError='TwelveData-API-Key fehlt. Bitte unter „XAUUSD Live“ eintragen.';
        return diagnostic();
      }
      refreshing=true;
      const nowMs=clock();
      const needed=DEFS.filter(d=>force||!fetched[d.id]||nowMs-fetched[d.id]>=d.ttl);
      try{
        // 7 first-load calls, then per-timeframe TTL. No secret is persisted,
        // logged or sent anywhere except TwelveData's own API origin.
        const results=await Promise.allSettled(needed.map(d=>request(d,key.trim(),nowMs)));
        results.forEach((res,i)=>{
          const d=needed[i];
          if(res.status==='fulfilled'){
            candles[d.id]=res.value;
            fetched[d.id]=clock();
            delete errors[d.id];
          }else{
            errors[d.id]=String(res.reason?.message||'Netzwerk/CORS-Fehler').slice(0,180);
          }
        });
        lastError=Object.keys(errors).length?
          'Einige echte Kerzendaten fehlen. Prüfe TwelveData-Tarif, API-Limit oder Browser-Netzwerk.':null;
        cached=null;
      }finally{refreshing=false;}
      return diagnostic();
    }
    function snapshot(){
      const nowMs=clock();
      const quote=quoteGetter();
      const at=Date.parse(quote?.at||'');
      const tickAge=nowMs-at;
      if(quote?.symbol!=='XAUUSD'||quote?.source!=='TWELVEDATA_BROWSER_WEBSOCKET'||
        !validNum(quote?.price)||!Number.isFinite(at)||tickAge< -5000||tickAge>20000)
        return{verified:false,reason:'FRESH_GOLD_TICK_MISSING',...diagnostic()};
      const missing=CORE.filter(id=>{
        const def=DEFS.find(d=>d.id===id),series=candles[id];
        if(!Array.isArray(series)||series.length<def.min)return true;
        const newest=series[series.length-1];
        const age=nowMs-(utcMs(newest.datetime)+def.seconds*1000);
        return !Number.isFinite(age)||age< -5000||age>def.maxLag;
      });
      if(missing.length)return{verified:false,reason:'FRESH_CANDLES_MISSING',missing,
        ...diagnostic(),price:quote.price};
      if(cached&&nowMs-lastComputedAt<3500&&lastPrice===quote.price)
        return{...cached,quote};
      if(typeof market.computeTradingBrainV1!=='function'||typeof market.computeAllDerivedModules!=='function')
        return{verified:false,reason:'DG_ENGINE_MISSING',...diagnostic()};
      try{
        const data={};
        for(const d of DEFS)data[d.id]={series:candles[d.id]||[]};
        const daily=data.daily.series.at(-1),weekly=data.weekly.series.at(-1),
          monthly=data.monthly.series.at(-1);
        const sessions=makeSessions(data['1h'].series,quote.price,nowMs);
        const liveData={
          symbol:'XAU/USD',price:quote.price,
          dailyOpen:daily.open,dailyHigh:daily.high,dailyLow:daily.low,
          weeklyOpen:weekly.open,weeklyHigh:weekly.high,weeklyLow:weekly.low,
          monthlyOpen:monthly?.open||null,monthlyHigh:monthly?.high||null,monthlyLow:monthly?.low||null,
          sessions
        };
        const derived=market.computeAllDerivedModules({
          liveData,sessions,candles:{h1:data['1h'].series}
        });
        const real=market.computeTradingBrainV1(data,derived.liquidity||[],quote.price,null,prevMemory,[]);
        prevMemory=real.liquidityMemory||prevMemory;
        // The browser can't establish uninterrupted event history / trade
        // invalidation while closed. Prevent a stateless READY or chasable
        // confirmation from being misrepresented as trade authorization.
        const note='Browser-Goldkurs und frische echte Kerzen vorhanden. '+
          'Nur SMC-Kontext; ohne kontinuierlichen Setup-Verlauf kein LIVE-ENTRY. WAIT / NO FOMO.';
        const brain={
          ...real,status:'WAIT',risk:null,
          entry:{...real.entry,status:'WAIT',entryZone:null,stopLoss:null,reasons:[note]},
          decision:{...real.decision,status:'WAIT',direction:null,primaryPoi:null,
            entryZone:null,invalidation:null,riskReward:[],
            missingRequirements:[note],reasons:[note]},
          report:{...real.report,status:'WAIT',risk:null,summary:note+'\n'+String(real.report?.summary||'')}
        };
        cached={verified:true,reason:'BROWSER_CANDLE_CONTEXT_VERIFIED',
          source:'BROWSER_TWELVEDATA_LIVE',brain,sessions,quote,
          refreshedAt:new Date(Math.max(...Object.values(fetched))).toISOString(),
          note:'Echtzeitpreis + per REST aktualisierte geschlossene Candle-Historie; kein 24/7-Tracking, keine Entry-Freigabe.'};
        lastPrice=quote.price;
        lastComputedAt=nowMs;
        return cached;
      }catch(err){
        lastError='DG Browser-Analyse fehlgeschlagen: '+String(err.message||err).slice(0,150);
        return{verified:false,reason:'BRAIN_CALCULATION_FAILED',...diagnostic()};
      }
    }
    return Object.freeze({refresh,snapshot,diagnostic});
  }
  return Object.freeze({create,parseSeries,utcMs,makeSessions,DEFS,CORE});
});
