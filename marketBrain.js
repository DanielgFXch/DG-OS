
// ---------------------------------------------------------------------------
// DG OS Market Brain — shared computation core
//
// Every pure function here — no DOM, no `window`, no `fetch`, no
// `localStorage` — used to live inline in app.js. Phase 1 (Core Foundation,
// v0.20.0) pulled it out into its own file for one reason: the same
// detection/aggregation logic now has to run in two places that must never
// drift apart — the browser (rendering the dashboard) and the Node ingest
// script (scripts/ingest.js, run by .github/workflows/market-data.yml, which
// persists state and detects events even when no browser tab is open). One
// source of truth, loaded by both.
//
// Browser: index.html loads this file via a plain <script> tag before
// app.js, so every export below also lands as a global, exactly like it did
// when it was inline in app.js — no call site in app.js had to change.
// Node: scripts/ingest.js does `require('../marketBrain.js')` and gets the
// same functions via module.exports.
//
// Nothing in this file is a DG rule. Every detector here is the same
// generic/structural architecture it always was (see CLAUDE.md's "DG
// methodology" section) — moving it into its own file changes where the
// code lives, not what it's allowed to decide.
// ---------------------------------------------------------------------------
(function(root, factory){
  const lib = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  } else {
    Object.assign(root, lib);
  }
})(typeof self !== 'undefined' ? self : this, function(){

function fmtPrice(n){return typeof n==='number'?n.toFixed(2):'—'}

// ---------------------------------------------------------------------------
// MarketBrain state shape — a factory, not a singleton, so both app.js (one
// long-lived browser instance) and the Node ingest script (a fresh object
// every run) build the exact same shape.
// ---------------------------------------------------------------------------
function createMarketBrainState(){
  return{liveData:null,sessions:null,candles:null,premiumDiscount:null,htfBias:null,liquidity:null,pois:null,structure:null,dgConfidence:null,decision:null,overview:null};
}

// Session Engine (Market Brain Module 3) — a reusable model, not three
// copy-pasted card handlers. Every session is just {id, name, startHour,
// endHour}; status/window are pure functions of the clock, High/Low come
// from data/market.json.
const SESSIONS=[
  {id:'asia',name:'Asia',startHour:0,endHour:8},
  {id:'london',name:'London',startHour:8,endHour:16},
  {id:'ny',name:'New York',startHour:13,endHour:21}
];

function sessionWindowToday(session,now){
  const y=now.getUTCFullYear(),m=now.getUTCMonth(),d=now.getUTCDate();
  return{
    start:new Date(Date.UTC(y,m,d,session.startHour,0,0)),
    end:new Date(Date.UTC(y,m,d,session.endHour,0,0))
  };
}

// Generalizes sessionWindowToday to an arbitrary timestamp, not just "now" -
// sessionWindowToday already builds a window from a date's own Y/M/D plus a
// session's UTC hours, so it works unchanged for any historical timestamp.
// Used by the POI Engine's enrichPOIContext() to tag a detected zone with
// the session it formed in, without that module reaching into SESSIONS
// itself.
function sessionForTimestamp(dt){
  for(const s of SESSIONS){
    const{start,end}=sessionWindowToday(s,dt);
    if(dt>=start&&dt<end) return s.id;
  }
  return null;
}

// Module 4: Premium / Discount Engine
//
// Returns a full object per timeframe range, never just a boolean, so any
// future module (Liquidity, POI, Confirmation, ...) can read
// {zone, equilibrium, distanceToEq, ...} directly instead of recomputing
// range math itself.
const EQUILIBRIUM_BAND_PERCENT=3; // +/-3% of range width around EQ counts as "equilibrium", not premium/discount

function computeZoneForRange(price,high,low){
  if(typeof price!=='number'||typeof high!=='number'||typeof low!=='number'||high<=low) return null;
  const range=high-low;
  const equilibrium=low+range/2;
  const distanceToEq=price-equilibrium;
  const distanceToEqPercent=(distanceToEq/range)*100;
  const zone=Math.abs(distanceToEqPercent)<=EQUILIBRIUM_BAND_PERCENT
    ? 'equilibrium'
    : (distanceToEq>0?'premium':'discount');
  return{
    high,low,range,equilibrium,price,
    distanceToEq,distanceToEqPercent,
    zone,
    isPremium:zone==='premium',
    isDiscount:zone==='discount',
    isEquilibrium:zone==='equilibrium'
  };
}

function computePremiumDiscount(data){
  if(!data||typeof data.price!=='number') return null;
  return{
    daily:computeZoneForRange(data.price,data.dailyHigh,data.dailyLow),
    weekly:computeZoneForRange(data.price,data.weeklyHigh,data.weeklyLow),
    monthly:computeZoneForRange(data.price,data.monthlyHigh,data.monthlyLow)
  };
}

const PD_ZONE_LABEL={premium:'Premium',discount:'Discount',equilibrium:'Equilibrium'};

// Module 5: HTF Bias Engine
//
// A structural proxy only — price vs. Daily/Weekly/Monthly Open — explicitly
// NOT Daniel's real bias methodology. That will come from rules/strategy.md
// and live in the Daniel Decision Engine once it exists. `lastBOS` and
// `currentStructure` are reserved fields for a future Structure/Liquidity
// Engine that can actually detect swing points and breaks of structure; they
// stay null here rather than being faked, per the project's build rule.
function computeHTFBias(data){
  if(!data||typeof data.price!=='number') return null;
  const timeframes=[
    {id:'daily',name:'Daily',open:data.dailyOpen,high:data.dailyHigh,low:data.dailyLow},
    {id:'weekly',name:'Weekly',open:data.weeklyOpen,high:data.weeklyHigh,low:data.weeklyLow},
    {id:'monthly',name:'Monthly',open:data.monthlyOpen,high:data.monthlyHigh,low:data.monthlyLow}
  ].filter(tf=>typeof tf.open==='number');
  if(!timeframes.length) return null;

  const above=timeframes.filter(tf=>data.price>tf.open);
  const below=timeframes.filter(tf=>data.price<tf.open);
  const bias=above.length===timeframes.length?'bullish':(below.length===timeframes.length?'bearish':'mixed');
  const confidence=Math.round((Math.max(above.length,below.length)/timeframes.length)*100);

  const strengths=timeframes.map(tf=>{
    const range=(typeof tf.high==='number'&&typeof tf.low==='number')?tf.high-tf.low:null;
    return range&&range>0?Math.min(Math.abs(data.price-tf.open)/range,1):0;
  });
  const trendStrength=Math.round((strengths.reduce((a,b)=>a+b,0)/strengths.length)*100);
  const reason=timeframes.map(tf=>`${tf.name} ${data.price>tf.open?'>':'<'} Open`).join(' · ');

  return{bias,confidence,trendStrength,reason,lastBOS:null,currentStructure:null};
}

const BIAS_LABEL={bullish:'BULLISH',bearish:'BEARISH',mixed:'MIXED'};

// Module 6: Liquidity Engine
//
// Tracks the 12 liquidity levels that matter most for XAUUSD (Daily/Weekly/
// Monthly High & Low, Asia/London/New York High & Low) with a real, explicit
// status per level — never just a price. Config-driven: adding a 13th level
// later means adding one entry to LIQUIDITY_LEVEL_DEFS, not a new function.
const LIQUIDITY_LEVEL_DEFS=[
  {id:'dailyHigh',label:'Daily High',type:'high',timeframe:'Daily',priceKey:'dailyHigh',periodKey:'barDate'},
  {id:'dailyLow',label:'Daily Low',type:'low',timeframe:'Daily',priceKey:'dailyLow',periodKey:'barDate'},
  {id:'weeklyHigh',label:'Weekly High',type:'high',timeframe:'Weekly',priceKey:'weeklyHigh',periodKey:'weekBarDate'},
  {id:'weeklyLow',label:'Weekly Low',type:'low',timeframe:'Weekly',priceKey:'weeklyLow',periodKey:'weekBarDate'},
  {id:'monthlyHigh',label:'Monthly High',type:'high',timeframe:'Monthly',priceKey:'monthlyHigh',periodKey:'monthBarDate'},
  {id:'monthlyLow',label:'Monthly Low',type:'low',timeframe:'Monthly',priceKey:'monthlyLow',periodKey:'monthBarDate'},
  {id:'asiaHigh',label:'Asia High',type:'high',timeframe:'Asia Session',session:'asia',field:'high'},
  {id:'asiaLow',label:'Asia Low',type:'low',timeframe:'Asia Session',session:'asia',field:'low'},
  {id:'londonHigh',label:'London High',type:'high',timeframe:'London Session',session:'london',field:'high'},
  {id:'londonLow',label:'London Low',type:'low',timeframe:'London Session',session:'london',field:'low'},
  {id:'nyHigh',label:'New York High',type:'high',timeframe:'New York Session',session:'ny',field:'high'},
  {id:'nyLow',label:'New York Low',type:'low',timeframe:'New York Session',session:'ny',field:'low'}
];

function extractLevelRaw(def,data){
  if(def.session){
    const sd=(data.sessions||{})[def.session];
    return{price:sd?sd[def.field]:null,period:sd?sd.date:null};
  }
  return{price:data[def.priceKey],period:data[def.periodKey]};
}

// "Touched" zone width, as a % of current price - close enough to the level
// to matter, without price having actually traded through it yet.
const LIQUIDITY_TOUCH_PERCENT=0.05;

function computeLiquidityStatus(levelPrice,type,currentPrice){
  if(typeof levelPrice!=='number'||typeof currentPrice!=='number') return'invalid';
  const toleranceAbs=currentPrice*(LIQUIDITY_TOUCH_PERCENT/100);
  if(type==='high'){
    if(currentPrice>levelPrice) return'sweeped';
    if(levelPrice-currentPrice<=toleranceAbs) return'touched';
    return'active';
  }else{
    if(currentPrice<levelPrice) return'sweeped';
    if(currentPrice-levelPrice<=toleranceAbs) return'touched';
    return'active';
  }
}

function computeLiquidityEngine(data){
  if(!data||typeof data.price!=='number') return null;
  const currentPrice=data.price;
  return LIQUIDITY_LEVEL_DEFS.map(def=>{
    const raw=extractLevelRaw(def,data);
    const price=typeof raw.price==='number'?raw.price:null;
    const status=price===null?'invalid':computeLiquidityStatus(price,def.type,currentPrice);
    return{id:def.id,label:def.label,type:def.type,timeframe:def.timeframe,period:raw.period,price,status};
  });
}

const LIQUIDITY_STATUS_LABEL={active:'ACTIVE',touched:'TOUCHED',sweeped:'SWEEPED',invalid:'INVALID'};

// Module 7: POI Engine — Stage 2/4: Erkennung
//
// Hard modularity rule, straight from Daniel: a detector must never know
// another module exists. Each detector is a pure function of its own raw
// input (an array of OHLC candles) and returns raw POI candidates —
// nothing else. Correlating a detected zone with the rest of the Market
// Brain — liquidity, session, HTF bias, premium/discount — happens exactly
// once, centrally, in enrichPOIContext().
//
// POI ids are deterministic (type + timeframe + source-candle time + zone
// bounds), not random. Phase 1 (Core Foundation) requires this: the event
// pipeline diffs "this POI in the new snapshot" against "the same POI in
// the previous snapshot" by id, and that only works if the same structural
// zone gets the same id every time it's recomputed. A random id (the
// pre-v0.20.0 behavior) made every POI look brand-new on every single
// refresh — harmless for a UI that just re-renders a fresh list each time,
// but incompatible with a persistent event log.
function poiId(type,timeframe,sourceCandle,priceLow,priceHigh){
  const t=sourceCandle?sourceCandle.datetime:'na';
  const lo=typeof priceLow==='number'?priceLow.toFixed(4):'na';
  const hi=typeof priceHigh==='number'?priceHigh.toFixed(4):'na';
  return`${type}-${timeframe}-${t}-${lo}-${hi}`;
}

function createPOI({type,direction,priceHigh,priceLow,timeframe,createdAt,status,strength,confidence,reason,sourceCandle,formedThroughCandle,impulseSize,displacement,structureReference,mitigationDetail,relatedLiquidity,relatedSession,relatedHTFBias,premiumDiscountZone,reaction}){
  return{
    id:poiId(type,timeframe,sourceCandle,priceLow,priceHigh),
    type,                                            // one of POI_TYPE_DEFS ids
    direction:direction||null,                        // 'bullish' | 'bearish' | null
    priceHigh:typeof priceHigh==='number'?priceHigh:null,
    priceLow:typeof priceLow==='number'?priceLow:null,
    timeframe:timeframe||null,
    createdAt:createdAt||new Date().toISOString(),       // market time of formation if the detector knows it, else now
    status:status||'fresh',                                // 'fresh' | 'mitigated'
    strength:typeof strength==='number'?strength:null,       // 0-100, reserved for Stage 3 (Bewertung)
    confidence:typeof confidence==='number'?confidence:null,  // 0-100, intrinsic to the detector's own pattern
    reason:reason||null,                                        // why this POI was created
    sourceCandle:sourceCandle||null,                             // Entstehungskerze — the raw OHLC candle that formed it
    formedThroughCandle:formedThroughCandle||sourceCandle||null,  // last candle whose range still defines the zone boundary itself — where isZoneMitigatedAfter/detectZoneReaction start scanning FROM (see detectZoneReaction below); for FVG this is c2, not the sourceCandle (c1)
    impulseSize:typeof impulseSize==='number'?impulseSize:null,   // Impulsgröße — price distance the move traveled away from the zone
    displacement:displacement||null,                                // the displacement candle + its range/ratio evidence, where applicable
    structureReference:structureReference||null,                    // reserved for a future BOS/CHOCH Structure Engine
    mitigationDetail:mitigationDetail||null,                         // reserved for a future nuanced mitigation flag (body-close vs. wick, % filled, ...)
    relatedLiquidity:relatedLiquidity||[],                            // ids into MarketBrain.liquidity, filled by enrichment
    relatedSession:relatedSession||null,                               // filled by enrichment
    relatedHTFBias:relatedHTFBias||null,                                // filled by enrichment
    premiumDiscountZone:premiumDiscountZone||null,                       // filled by enrichment
    reaction:reaction||null                                               // filled by enrichment — see detectZoneReaction()
  };
}

function candleTimeToIso(datetime){
  return datetime?new Date(datetime.replace(' ','T')+'Z').toISOString():null;
}

// Small candle-math utilities shared by any detector that needs them.
const POI_ATR_WINDOW=14; // how many preceding candles define "a normal range here"

function localAverageRange(candles,index,window){
  const slice=candles.slice(Math.max(0,index-window),index+1);
  return slice.reduce((sum,c)=>sum+(c.high-c.low),0)/slice.length;
}

function isZoneMitigatedAfter(candles,fromIndex,priceLow,priceHigh){
  return candles.slice(fromIndex).some(c=>c.low<=priceHigh&&c.high>=priceLow);
}

// Fair Value Gap detector.
//
// Classic 3-candle ICT imbalance: for chronological candles c0, c1, c2, a
// bullish FVG exists when c0.high < c2.low (the untraded space between them
// is the gap); a bearish FVG is the mirror case, c0.low > c2.high.
function detectFairValueGaps(candles,timeframe){
  if(!Array.isArray(candles)||candles.length<3) return[];
  timeframe=timeframe||'H1';
  const zones=[];

  for(let i=2;i<candles.length;i++){
    const c0=candles[i-2],c1=candles[i-1],c2=candles[i];
    let direction=null,priceLow=null,priceHigh=null;
    if(c0.high<c2.low){ direction='bullish'; priceLow=c0.high; priceHigh=c2.low; }
    else if(c0.low>c2.high){ direction='bearish'; priceLow=c2.high; priceHigh=c0.low; }
    if(!direction) continue;

    const avgRange=localAverageRange(candles,i,POI_ATR_WINDOW);
    const confidence=avgRange>0?Math.max(0,Math.min(100,Math.round(((priceHigh-priceLow)/avgRange)*100))):0;
    const status=isZoneMitigatedAfter(candles,i+1,priceLow,priceHigh)?'mitigated':'fresh';

    const reason=direction==='bullish'
      ? `Bullische Preislücke: Low der Kerze ${c2.datetime} UTC liegt über dem High der Kerze ${c0.datetime} UTC`
      : `Bearische Preislücke: High der Kerze ${c2.datetime} UTC liegt unter dem Low der Kerze ${c0.datetime} UTC`;

    zones.push(createPOI({
      type:'fvg',direction,priceHigh,priceLow,timeframe,
      createdAt:candleTimeToIso(c1.datetime),
      status,confidence,reason,sourceCandle:c1,formedThroughCandle:c2
    }));
  }
  return zones;
}

// Order Block detector — deliberately the *architecture* for the future
// "Daniel Order Block", not a fully tuned SMC implementation.
const OB_DISPLACEMENT_RATIO=1.5;   // displacement candle's range must be >= this x the local average
const OB_CLOSE_STRENGTH_MIN=0.66;  // displacement candle must close in the outer third of its own range

function candleDirection(candle){
  if(candle.close>candle.open) return'bullish';
  if(candle.close<candle.open) return'bearish';
  return null;
}

function closeStrength(candle,direction){
  const range=candle.high-candle.low;
  if(range<=0) return 0;
  return direction==='bullish'
    ? (candle.close-candle.low)/range
    : (candle.high-candle.close)/range;
}

function detectOrderBlocks(candles,timeframe){
  if(!Array.isArray(candles)||candles.length<2) return[];
  timeframe=timeframe||'H1';
  const zones=[];

  for(let i=1;i<candles.length;i++){
    const displacementCandle=candles[i];
    const obCandle=candles[i-1];

    const avgRange=localAverageRange(candles,i,POI_ATR_WINDOW);
    if(avgRange<=0) continue;
    const range=displacementCandle.high-displacementCandle.low;
    const ratio=range/avgRange;
    if(ratio<OB_DISPLACEMENT_RATIO) continue;

    const dispDirection=candleDirection(displacementCandle);
    if(!dispDirection) continue;
    const strength=closeStrength(displacementCandle,dispDirection);
    if(strength<OB_CLOSE_STRENGTH_MIN) continue;

    const obDirection=candleDirection(obCandle);
    let direction=null;
    if(dispDirection==='bullish'&&obDirection==='bearish') direction='bullish';
    else if(dispDirection==='bearish'&&obDirection==='bullish') direction='bearish';
    if(!direction) continue;

    const priceLow=obCandle.low,priceHigh=obCandle.high;
    const impulseSize=direction==='bullish'
      ? displacementCandle.high-priceLow
      : priceHigh-displacementCandle.low;

    const rangeScore=Math.min(ratio/3,1);
    const confidence=Math.round(((rangeScore+strength)/2)*100);
    const status=isZoneMitigatedAfter(candles,i+1,priceLow,priceHigh)?'mitigated':'fresh';

    const reason=direction==='bullish'
      ? `Bullischer Order Block: Kerze ${obCandle.datetime} UTC (bearish) vor Displacement-Kerze ${displacementCandle.datetime} UTC (${ratio.toFixed(1)}x Ø-Range, Close bei ${Math.round(strength*100)}% der Kerze)`
      : `Bearischer Order Block: Kerze ${obCandle.datetime} UTC (bullish) vor Displacement-Kerze ${displacementCandle.datetime} UTC (${ratio.toFixed(1)}x Ø-Range, Close bei ${Math.round(strength*100)}% der Kerze)`;

    zones.push(createPOI({
      type:'orderBlock',direction,priceHigh,priceLow,timeframe,
      createdAt:candleTimeToIso(obCandle.datetime),
      status,confidence,reason,sourceCandle:obCandle,formedThroughCandle:displacementCandle,
      impulseSize,displacement:{candle:displacementCandle,range,avgRange,ratio}
    }));
  }
  return zones;
}

// Six detector stubs still, one per not-yet-built POI type. Every one of
// them returns [] today.
function detectBreakers(candles){
  // Needs: an invalidated Order Block that price has broken back through.
  return[];
}
function detectInverseFairValueGaps(candles){
  // Needs: a Fair Value Gap (see above) that has been fully closed/inverted.
  return[];
}
function detectMitigationBlocks(candles){
  // Needs: the last down/up-close candle before a displacement move.
  return[];
}
function detectRejectionBlocks(candles){
  // Needs: wick-dominant candle detection at a swing high/low.
  return[];
}
function detectSupplyZones(candles){
  // Needs: base-before-drop candle clustering.
  return[];
}
function detectDemandZones(candles){
  // Needs: base-before-rally candle clustering.
  return[];
}

const POI_TYPE_DEFS=[
  {id:'orderBlock',label:'Order Block',category:'Struktur',implemented:true,detect:detectOrderBlocks,input:brain=>(brain.candles&&brain.candles.h1)||[]},
  {id:'breaker',label:'Breaker',category:'Struktur',implemented:false,detect:detectBreakers,input:()=>null},
  {id:'fvg',label:'Fair Value Gap',category:'Imbalance',implemented:true,detect:detectFairValueGaps,input:brain=>(brain.candles&&brain.candles.h1)||[]},
  {id:'ifvg',label:'Inverse Fair Value Gap',category:'Imbalance',implemented:false,detect:detectInverseFairValueGaps,input:()=>null},
  {id:'mitigationBlock',label:'Mitigation Block',category:'Struktur',implemented:false,detect:detectMitigationBlocks,input:()=>null},
  {id:'rejectionBlock',label:'Rejection Block',category:'Struktur',implemented:false,detect:detectRejectionBlocks,input:()=>null},
  {id:'supply',label:'Supply Zone',category:'Zone',implemented:false,detect:detectSupplyZones,input:()=>null},
  {id:'demand',label:'Demand Zone',category:'Zone',implemented:false,detect:detectDemandZones,input:()=>null}
];

const POI_LIQUIDITY_TOLERANCE_PERCENT=0.05; // same "close enough" reasoning as LIQUIDITY_TOUCH_PERCENT

function relatedLiquidityFor(poi,liquidityLevels){
  if(!Array.isArray(liquidityLevels)||poi.priceLow===null||poi.priceHigh===null) return[];
  const tolerance=((poi.priceHigh+poi.priceLow)/2)*(POI_LIQUIDITY_TOLERANCE_PERCENT/100);
  return liquidityLevels
    .filter(lv=>typeof lv.price==='number'&&lv.price>=poi.priceLow-tolerance&&lv.price<=poi.priceHigh+tolerance)
    .map(lv=>lv.id);
}

// Zone reaction — a purely mechanical, structural fact, same honesty level
// as `status` (fresh/mitigated): price traded into a zone, and a later H1
// candle closed back outside it, in the zone's own direction. Deliberately
// NOT called "DG Confirmation" — that would imply a defined DG rule, and
// rules/strategy.md's Confirmation chapter is still TODO.
//
// Scans from `formedThroughCandle`, NOT `sourceCandle` — for a Fair Value
// Gap those differ (sourceCandle is c1, the middle/displacement candle;
// formedThroughCandle is c2, the candle whose own low/high defines the top
// of the gap). Starting from sourceCandle let c2 itself satisfy "price is
// in the zone" against its own boundary — a fresh FVG could look like it
// had already been touched and reacted to by the very next candle, even
// with zero real retracement. Order Block's sourceCandle/formedThroughCandle
// happen to differ too (obCandle vs. the displacement candle), though that
// path wasn't actually affected since a valid displacement candle is, by
// definition, already clear of the zone it displaced away from.
function detectZoneReaction(poi,candles){
  if(!Array.isArray(candles)||poi.priceLow===null||poi.priceHigh===null||!poi.direction) return null;
  const startIndex=candles.indexOf(poi.formedThroughCandle||poi.sourceCandle);
  if(startIndex===-1) return null;

  let touched=false;
  for(let i=startIndex+1;i<candles.length;i++){
    const c=candles[i];
    const inZone=c.low<=poi.priceHigh&&c.high>=poi.priceLow;
    if(inZone){ touched=true; continue; }
    if(!touched) continue;
    const reacted=poi.direction==='bullish'?c.close>poi.priceHigh:c.close<poi.priceLow;
    if(reacted){
      return{
        at:candleTimeToIso(c.datetime),
        reason:`Preis hat die Zone getestet und mit Kerze ${c.datetime} UTC wieder außerhalb geschlossen`
      };
    }
  }
  return null;
}

function distanceToPriceFor(poi,currentPrice){
  if(typeof currentPrice!=='number'||poi.priceHigh===null||poi.priceLow===null) return null;
  const midpoint=(poi.priceHigh+poi.priceLow)/2;
  return Math.round(Math.abs(midpoint-currentPrice)*100)/100;
}

function enrichPOIContext(poi,brain){
  const liveData=brain.liveData;
  const midpoint=(poi.priceHigh!==null&&poi.priceLow!==null)?(poi.priceHigh+poi.priceLow)/2:null;
  const zone=(midpoint!==null&&liveData)?computeZoneForRange(midpoint,liveData.dailyHigh,liveData.dailyLow):null;
  const candles=(brain.candles&&brain.candles.h1)||[];
  return Object.assign({},poi,{
    relatedLiquidity:relatedLiquidityFor(poi,brain.liquidity),
    relatedSession:poi.createdAt?sessionForTimestamp(new Date(poi.createdAt)):null,
    relatedHTFBias:(brain.htfBias&&brain.htfBias.bias)||null,
    premiumDiscountZone:zone?zone.zone:null,
    distanceToPrice:distanceToPriceFor(poi,liveData&&liveData.price),
    reaction:detectZoneReaction(poi,candles)
  });
}

function computePOIEngine(brain){
  const rawList=POI_TYPE_DEFS.flatMap(def=>def.detect(def.input(brain)));
  return{
    list:rawList.map(poi=>enrichPOIContext(poi,brain)),
    types:POI_TYPE_DEFS.map(def=>({id:def.id,label:def.label,category:def.category,implemented:def.implemented}))
  };
}

const POI_STATUS_LABEL={fresh:'FRISCH',mitigated:'MITIGATED'};
const SESSION_LABEL_BY_ID={asia:'Asia',london:'London',ny:'New York'};

// Displacement candle detector — a standalone version of the same
// range-vs-local-average math already used inside detectOrderBlocks(), not
// tied to Order Block formation. Same category as FVG/Order Block: generic
// candle-shape math, not a DG rule. Exists so the event pipeline can emit
// DISPLACEMENT_DETECTED independent of whether that displacement also
// happened to form an Order Block.
function detectDisplacementCandles(candles){
  if(!Array.isArray(candles)||candles.length<2) return[];
  const results=[];
  for(let i=1;i<candles.length;i++){
    const c=candles[i];
    const avgRange=localAverageRange(candles,i,POI_ATR_WINDOW);
    if(avgRange<=0) continue;
    const range=c.high-c.low;
    const ratio=range/avgRange;
    if(ratio<OB_DISPLACEMENT_RATIO) continue;
    const direction=candleDirection(c);
    if(!direction) continue;
    results.push({id:`displacement-${c.datetime}`,candle:c,direction,ratio,at:candleTimeToIso(c.datetime)});
  }
  return results;
}

// Engulfing candle detector — classic 2-candle body-engulfing pattern.
// Same category/precedent as FVG/Order Block above: mechanical candle-shape
// geometry, no entry/exit/risk judgement attached, not "DG Confirmation."
function detectEngulfingCandles(candles){
  if(!Array.isArray(candles)||candles.length<2) return[];
  const results=[];
  for(let i=1;i<candles.length;i++){
    const prev=candles[i-1],cur=candles[i];
    const prevDir=candleDirection(prev),curDir=candleDirection(cur);
    if(!prevDir||!curDir||prevDir===curDir) continue;
    const engulfsBody=curDir==='bullish'
      ? (cur.open<=prev.close&&cur.close>=prev.open)
      : (cur.open>=prev.close&&cur.close<=prev.open);
    if(!engulfsBody) continue;
    results.push({id:`engulfing-${cur.datetime}`,candle:cur,direction:curDir,at:candleTimeToIso(cur.datetime)});
  }
  return results;
}

// Module 9: Structure Engine — pure market structure
//
// Structure object shape — every element, uniform regardless of type:
// {
//   id, type,        // 'swingHigh' | 'swingLow' | 'BOS' | 'CHOCH'
//   label,             // 'HH' | 'LH' (swingHigh) | 'HL' | 'LL' (swingLow) | null (BOS/CHOCH, or a swing with no prior point to compare against)
//   price, createdAt, timeframe,
//   direction,          // 'bullish' | 'bearish' | null — HH/HL and bullish breaks are 'bullish', LH/LL and bearish breaks are 'bearish'
//   structureType,       // 'internal' | 'external' — which fractal window produced it, see below
//   status,               // 'active' | 'broken' (swing points) | 'confirmed' (BOS/CHOCH)
//   confidence,            // 0-100, intrinsic (prominence vs. local ATR for swings, breakout strength vs. local ATR for BOS/CHOCH)
//   reason, sourceCandle, brokenLevel,
//   relatedSession, relatedHTFBias   // filled by enrichment, like the POI Engine
// }
const STRUCTURE_INTERNAL_WINDOW=1; // 3-candle fractal — minor/internal swings
const STRUCTURE_EXTERNAL_WINDOW=3; // 7-candle fractal — major/external swings

// Deterministic id, same reasoning as poiId() above — the event pipeline
// needs "is this the same BOS/CHOCH/swing as last time" to be answerable by
// id equality, not by re-deriving it from scratch every time.
function structureId(type,structureType,sourceCandle,label,price){
  const t=sourceCandle?sourceCandle.datetime:'na';
  const p=typeof price==='number'?price.toFixed(4):'na';
  return`${type}-${structureType}-${t}-${label||''}-${p}`;
}

function createStructureElement({type,label,price,createdAt,timeframe,direction,structureType,status,confidence,reason,sourceCandle,brokenLevel,relatedSession,relatedHTFBias}){
  return{
    id:structureId(type,structureType,sourceCandle,label,price),
    type,
    label:label||null,
    price:typeof price==='number'?price:null,
    createdAt:createdAt||new Date().toISOString(),
    timeframe:timeframe||null,
    direction:direction||null,
    structureType:structureType||null,
    status:status||null,
    confidence:typeof confidence==='number'?confidence:null,
    reason:reason||null,
    sourceCandle:sourceCandle||null,
    brokenLevel:brokenLevel||null,
    relatedSession:relatedSession||null,
    relatedHTFBias:relatedHTFBias||null
  };
}

function directionForStructureLabel(label){
  if(label==='HH'||label==='HL') return'bullish';
  if(label==='LH'||label==='LL') return'bearish';
  return null;
}

function detectRawSwingPoints(candles,window){
  const highs=[],lows=[];
  for(let i=window;i<candles.length-window;i++){
    const c=candles[i];
    const left=candles.slice(i-window,i),right=candles.slice(i+1,i+1+window);
    if(left.every(l=>l.high<c.high)&&right.every(r=>r.high<c.high)) highs.push({index:i,type:'swingHigh',price:c.high,candle:c});
    if(left.every(l=>l.low>c.low)&&right.every(r=>r.low>c.low)) lows.push({index:i,type:'swingLow',price:c.low,candle:c});
  }
  return{highs,lows};
}

function classifyStructureSequence(points){
  let prev=null;
  return points.map(p=>{
    let label=null;
    if(prev) label = p.type==='swingHigh' ? (p.price>prev.price?'HH':'LH') : (p.price<prev.price?'LL':'HL');
    prev=p;
    return Object.assign({},p,{label,status:'active'});
  });
}

function structureProminenceConfidence(candles,point,window){
  const avgRange=localAverageRange(candles,point.index,window);
  if(avgRange<=0) return 0;
  const neighbourhood=candles.slice(Math.max(0,point.index-window),Math.min(candles.length,point.index+window+1)).filter(c=>c!==point.candle);
  if(!neighbourhood.length) return 0;
  const diff=point.type==='swingHigh'
    ? point.price-Math.max(...neighbourhood.map(c=>c.high))
    : Math.min(...neighbourhood.map(c=>c.low))-point.price;
  return Math.max(0,Math.min(100,Math.round((diff/avgRange)*100)));
}

function createSwingElement(point,structureType,candles,window,timeframe){
  timeframe=timeframe||'H1';
  const direction=directionForStructureLabel(point.label);
  const confidence=structureProminenceConfidence(candles,point,window);
  const pivotLabel=point.type==='swingHigh'?'Swing High':'Swing Low';
  const structureLabel=structureType==='internal'?'interne':'externe';
  const labelText={HH:'Higher High',LH:'Lower High',HL:'Higher Low',LL:'Lower Low'}[point.label];
  const reason=point.label
    ? `${labelText}: ${pivotLabel} bei ${point.price} (${point.candle.datetime} UTC, ${structureLabel} Struktur)`
    : `Erster erkannter ${pivotLabel} bei ${point.price} (${point.candle.datetime} UTC, ${structureLabel} Struktur) — noch kein Vergleichspunkt`;
  return createStructureElement({
    type:point.type,label:point.label,price:point.price,
    createdAt:candleTimeToIso(point.candle.datetime),
    timeframe,direction,structureType,status:point.status,confidence,reason,sourceCandle:point.candle
  });
}

function createBreakEvent(type,direction,candle,brokenLevel,candles,index,window,structureType,timeframe){
  timeframe=timeframe||'H1';
  const avgRange=localAverageRange(candles,index,window);
  const confidence=avgRange>0?Math.max(0,Math.min(100,Math.round((Math.abs(candle.close-brokenLevel.price)/avgRange)*100))):0;
  const levelLabel=brokenLevel.type==='swingHigh'?'Swing High':'Swing Low';
  const typeLabel=type==='BOS'?'Break of Structure':'Change of Character';
  const structureLabel=structureType==='internal'?'interne':'externe';
  const reason=`${typeLabel} (${direction}): Close ${candle.close} bei ${candle.datetime} UTC ${direction==='bullish'?'über':'unter'} vorherigem ${levelLabel} ${brokenLevel.price} (${structureLabel} Struktur)`;
  return createStructureElement({
    type,label:null,price:candle.close,
    createdAt:candleTimeToIso(candle.datetime),
    timeframe,direction,structureType,status:'confirmed',confidence,reason,sourceCandle:candle,
    brokenLevel:{type:brokenLevel.type,price:brokenLevel.price,createdAt:candleTimeToIso(brokenLevel.candle.datetime)}
  });
}

function detectStructure(candles,window,structureType,timeframe){
  timeframe=timeframe||'H1';
  if(!Array.isArray(candles)||candles.length<window*2+3) return{elements:[],finalBias:null};

  const{highs:rawHighs,lows:rawLows}=detectRawSwingPoints(candles,window);
  const highs=classifyStructureSequence(rawHighs);
  const lows=classifyStructureSequence(rawLows);
  const highByIndex=new Map(highs.map(p=>[p.index,p]));
  const lowByIndex=new Map(lows.map(p=>[p.index,p]));

  const events=[];
  let bias=null,keyHigh=null,keyLow=null;
  for(let i=0;i<candles.length;i++){
    if(highByIndex.has(i)) keyHigh=highByIndex.get(i);
    if(lowByIndex.has(i)) keyLow=lowByIndex.get(i);
    const c=candles[i];
    if(keyHigh&&keyHigh.status==='active'&&c.close>keyHigh.price){
      events.push(createBreakEvent(bias==='bearish'?'CHOCH':'BOS','bullish',c,keyHigh,candles,i,window,structureType,timeframe));
      keyHigh.status='broken';
      bias='bullish';
    }
    if(keyLow&&keyLow.status==='active'&&c.close<keyLow.price){
      events.push(createBreakEvent(bias==='bullish'?'CHOCH':'BOS','bearish',c,keyLow,candles,i,window,structureType,timeframe));
      keyLow.status='broken';
      bias='bearish';
    }
  }

  const swingElements=[...highs,...lows].map(p=>createSwingElement(p,structureType,candles,window,timeframe));
  return{elements:[...swingElements,...events],finalBias:bias};
}

function enrichStructureContext(el,brain){
  return Object.assign({},el,{
    relatedSession:el.createdAt?sessionForTimestamp(new Date(el.createdAt)):null,
    relatedHTFBias:(brain.htfBias&&brain.htfBias.bias)||null
  });
}

function computeStructureEngine(brain){
  const candles=(brain.candles&&brain.candles.h1)||[];
  const internal=detectStructure(candles,STRUCTURE_INTERNAL_WINDOW,'internal');
  const external=detectStructure(candles,STRUCTURE_EXTERNAL_WINDOW,'external');
  return{
    list:[...internal.elements,...external.elements].map(el=>enrichStructureContext(el,brain)),
    internalBias:internal.finalBias,
    externalBias:external.finalBias
  };
}

const STRUCTURE_TYPE_LABEL={swingHigh:'Swing High',swingLow:'Swing Low',BOS:'BOS',CHOCH:'CHOCH'};
const STRUCTURE_STATUS_LABEL={active:'ACTIVE',broken:'BROKEN',confirmed:'CONFIRMED'};

// Module 8: DG Confidence Engine — architecture only
//
// Explicitly NOT a trading decision, NOT an alert, NOT an entry — and it
// does not invent a weighting scheme pretending to be Daniel's real rules,
// since those aren't defined yet.
function contributeFromSessions(sessions){
  if(!sessions) return{score:null,status:'missing',reason:'Noch keine Session-Daten.'};
  const keys=Object.keys(sessions);
  const known=keys.filter(k=>sessions[k]&&typeof sessions[k].high==='number'&&typeof sessions[k].low==='number');
  if(!known.length) return{score:0,status:'missing',reason:'Noch keine Session mit echter Range verfügbar.'};
  const score=Math.round((known.length/keys.length)*100);
  return{score,status:known.length>=Math.ceil(keys.length/2)?'positive':'negative',reason:`${known.length}/${keys.length} Sessions mit echter Range verfügbar.`};
}

function contributeFromLiquidity(liquidity){
  if(!Array.isArray(liquidity)||!liquidity.length) return{score:null,status:'missing',reason:'Noch keine Liquidity-Daten.'};
  const valid=liquidity.filter(l=>l.status!=='invalid');
  if(!valid.length) return{score:0,status:'missing',reason:'Keine validen Liquiditäts-Level verfügbar.'};
  const notable=liquidity.filter(l=>l.status==='touched'||l.status==='sweeped');
  const score=Math.round((valid.length/liquidity.length)*100);
  return{score,status:notable.length>0||score>=50?'positive':'negative',reason:`${valid.length}/${liquidity.length} Level valide, ${notable.length} davon touched/sweeped.`};
}

function contributeFromPremiumDiscount(pd){
  if(!pd) return{score:null,status:'missing',reason:'Noch keine Premium/Discount-Daten.'};
  const zones=Object.values(pd).filter(Boolean);
  if(!zones.length) return{score:0,status:'missing',reason:'Keine Range verfügbar.'};
  const clear=zones.filter(z=>z.zone!=='equilibrium');
  const score=Math.round((clear.length/zones.length)*100);
  return{score,status:clear.length>=Math.ceil(zones.length/2)?'positive':'negative',reason:`${clear.length}/${zones.length} Timeframes zeigen eine klare Premium/Discount-Lage (nicht Equilibrium).`};
}

function contributeFromHTFBias(htfBias){
  if(!htfBias) return{score:null,status:'missing',reason:'Noch keine HTF-Bias-Daten.'};
  const score=htfBias.confidence;
  const status=htfBias.bias==='mixed'?'negative':(score>=67?'positive':'negative');
  return{score,status,reason:`Bias ${htfBias.bias.toUpperCase()} bei ${htfBias.confidence}% Confidence.`};
}

function contributeFromPoiType(poiList,type,label){
  if(!poiList) return{score:null,status:'missing',reason:`Noch keine ${label}-Daten.`};
  const zones=poiList.filter(p=>p.type===type);
  if(!zones.length) return{score:0,status:'missing',reason:`Keine ${label}-Zonen erkannt.`};
  const fresh=zones.filter(p=>p.status==='fresh');
  const avgConfidence=fresh.length?Math.round(fresh.reduce((s,p)=>s+(p.confidence||0),0)/fresh.length):0;
  return{score:avgConfidence,status:fresh.length>0?'positive':'negative',reason:`${fresh.length}/${zones.length} ${label}-Zonen noch frisch${fresh.length?`, Ø ${avgConfidence}% Confidence`:''}.`};
}
function contributeFromFVG(poiList){ return contributeFromPoiType(poiList,'fvg','Fair Value Gap') }
function contributeFromOrderBlock(poiList){ return contributeFromPoiType(poiList,'orderBlock','Order Block') }

const CONFIDENCE_CONTRIBUTORS=[
  {id:'session',label:'Sessions',input:brain=>brain.sessions,compute:contributeFromSessions},
  {id:'liquidity',label:'Liquidity Engine',input:brain=>brain.liquidity,compute:contributeFromLiquidity},
  {id:'premiumDiscount',label:'Premium/Discount',input:brain=>brain.premiumDiscount,compute:contributeFromPremiumDiscount},
  {id:'htfBias',label:'HTF Bias',input:brain=>brain.htfBias,compute:contributeFromHTFBias},
  {id:'fvg',label:'Fair Value Gap',input:brain=>brain.pois&&brain.pois.list,compute:contributeFromFVG},
  {id:'orderBlock',label:'Order Block',input:brain=>brain.pois&&brain.pois.list,compute:contributeFromOrderBlock}
];

function computeDGConfidenceEngine(brain){
  const contributions=CONFIDENCE_CONTRIBUTORS.map(c=>Object.assign({id:c.id,label:c.label},c.compute(c.input(brain))));
  const scored=contributions.filter(c=>typeof c.score==='number'&&c.status!=='missing');
  const confidence=scored.length?Math.round(scored.reduce((s,c)=>s+c.score,0)/scored.length):null;
  return{
    confidence,
    contributions,
    positiveFactors:contributions.filter(c=>c.status==='positive'),
    negativeFactors:contributions.filter(c=>c.status==='negative'),
    missingFactors:contributions.filter(c=>c.status==='missing')
  };
}

// Module 10: Daniel Decision Engine — architecture only
//
// The Decision Engine must never own a trading rule. It only reads
// rules/strategy.md (via DG_RULES_DEFINED below, a hand-maintained mirror
// of that file's Status-Übersicht) and the mechanical output of the other
// modules. Since every chapter is still TODO, there is currently no rule to
// apply — so the engine can only ever honestly output WAIT.
const DECISION_STATES={
  WAIT:{label:'WAIT',description:'Keine Trade-Freigabe — Bedingungen fehlen oder Regeln sind nicht definiert.'},
  WATCH:{label:'WATCH',description:'Setup formt sich — noch nicht alle Bedingungen erfüllt.'},
  READY:{label:'READY',description:'Alle definierten DG-Bedingungen erfüllt — Setup ist laut Regelwerk tradebar.'},
  INVALID:{label:'INVALID',description:'Ein zuvor beobachtetes Setup wurde durch die DG-Regeln als ungültig markiert.'}
};

const DG_RULES_DEFINED={
  philosophy:false,htfBias:false,liquidity:false,premiumDiscount:false,
  orderBlock:false,validFvg:false,inverseFvg:false,breaker:false,
  confirmation:false,entry:false,exit:false,riskManagement:false,
  noTrades:false,sessionRules:false,news:false,examples:false,edgeCases:false
};

function createModuleSnapshot({available,direction,summary}){
  return{available:!!available,direction:direction||null,summary:summary||null};
}

function describeHTFBiasInput(htfBias){
  if(!htfBias) return createModuleSnapshot({available:false,summary:'Noch keine HTF-Bias-Daten.'});
  return createModuleSnapshot({
    available:true,
    direction:htfBias.bias==='mixed'?null:htfBias.bias,
    summary:`Bias ${htfBias.bias.toUpperCase()} (${htfBias.confidence}% Confidence).`
  });
}

function describeStructureInput(structure){
  if(!structure||!structure.list.length) return createModuleSnapshot({available:false,summary:'Noch keine Struktur erkannt.'});
  return createModuleSnapshot({
    available:true,
    direction:structure.externalBias,
    summary:`Externe Struktur: ${structure.externalBias?structure.externalBias.toUpperCase():'—'} · Interne Struktur: ${structure.internalBias?structure.internalBias.toUpperCase():'—'}.`
  });
}

function describeLiquidityInput(liquidity){
  if(!Array.isArray(liquidity)||!liquidity.length) return createModuleSnapshot({available:false,summary:'Noch keine Liquidity-Daten.'});
  const notable=liquidity.filter(l=>l.status==='touched'||l.status==='sweeped');
  return createModuleSnapshot({available:true,summary:`${liquidity.length} Level erfasst, ${notable.length} touched/sweeped.`});
}

function describePOIInput(pois){
  if(!pois||!pois.list.length) return createModuleSnapshot({available:false,summary:'Noch keine POIs erkannt.'});
  const fresh=pois.list.filter(p=>p.status==='fresh');
  const bullish=fresh.filter(p=>p.direction==='bullish').length;
  const bearish=fresh.filter(p=>p.direction==='bearish').length;
  const direction=bullish===bearish?null:(bullish>bearish?'bullish':'bearish');
  return createModuleSnapshot({available:true,direction,summary:`${fresh.length}/${pois.list.length} POIs frisch (${bullish} bullish, ${bearish} bearish).`});
}

function describePremiumDiscountInput(pd){
  if(!pd) return createModuleSnapshot({available:false,summary:'Noch keine Premium/Discount-Daten.'});
  const zones=Object.entries(pd).filter(([,z])=>z);
  if(!zones.length) return createModuleSnapshot({available:false,summary:'Keine Range verfügbar.'});
  return createModuleSnapshot({available:true,summary:zones.map(([tf,z])=>`${tf}: ${z.zone}`).join(' · ')});
}

function describeDGConfidenceInput(dgConfidence){
  if(!dgConfidence||typeof dgConfidence.confidence!=='number') return createModuleSnapshot({available:false,summary:'Noch keine Confidence-Daten.'});
  return createModuleSnapshot({
    available:true,
    summary:`${dgConfidence.confidence}% Confidence · ${dgConfidence.positiveFactors.length} positiv, ${dgConfidence.negativeFactors.length} negativ, ${dgConfidence.missingFactors.length} fehlend.`
  });
}

const DECISION_INPUT_MODULES=[
  {id:'htfBias',label:'HTF Bias',input:brain=>brain.htfBias,describe:describeHTFBiasInput},
  {id:'structure',label:'Structure Engine',input:brain=>brain.structure,describe:describeStructureInput},
  {id:'liquidity',label:'Liquidity Engine',input:brain=>brain.liquidity,describe:describeLiquidityInput},
  {id:'pois',label:'POI Engine',input:brain=>brain.pois,describe:describePOIInput},
  {id:'premiumDiscount',label:'Premium/Discount',input:brain=>brain.premiumDiscount,describe:describePremiumDiscountInput},
  {id:'dgConfidence',label:'DG Confidence Engine',input:brain=>brain.dgConfidence,describe:describeDGConfidenceInput}
];

function computeDecisionEngine(brain){
  const moduleSnapshot={};
  DECISION_INPUT_MODULES.forEach(def=>{
    moduleSnapshot[def.id]=Object.assign({label:def.label},def.describe(def.input(brain)));
  });

  const supportingModules=Object.keys(moduleSnapshot).filter(id=>moduleSnapshot[id].available);
  const missingModules=Object.keys(moduleSnapshot).filter(id=>!moduleSnapshot[id].available);

  const directional=Object.keys(moduleSnapshot).filter(id=>moduleSnapshot[id].available&&moduleSnapshot[id].direction);
  const conflictingModules=[];
  for(let i=0;i<directional.length;i++){
    for(let j=i+1;j<directional.length;j++){
      const a=directional[i],b=directional[j];
      if(moduleSnapshot[a].direction!==moduleSnapshot[b].direction){
        conflictingModules.push({
          modules:[a,b],
          reason:`${moduleSnapshot[a].label} (${moduleSnapshot[a].direction}) vs. ${moduleSnapshot[b].label} (${moduleSnapshot[b].direction})`
        });
      }
    }
  }

  const definedChapters=Object.entries(DG_RULES_DEFINED).filter(([,defined])=>defined);
  const metConditions=[]; // no DG rules defined yet -> nothing to evaluate against
  const unmetConditions=definedChapters.length
    ? []
    : [{condition:'DG-Regeln (rules/strategy.md)',reason:'Noch kein Kapitel definiert — keine Bewertung möglich.'}];

  const state='WAIT'; // the only honest state while zero DG rule chapters are defined
  const reason=definedChapters.length
    ? 'DG-Regeln teilweise definiert, aber die Regelanwendung ist noch nicht implementiert (nächste Ausbaustufe der Decision Engine).'
    : 'Keine DG-Regeln definiert — rules/strategy.md ist noch vollständig TODO. Die Decision Engine wartet, bis mindestens ein Kapitel ausgefüllt und die Regelanwendung dafür gebaut ist.';

  return{
    id:`decision-${Date.now()}`,
    timestamp:new Date().toISOString(),
    state,confidence:(brain.dgConfidence&&typeof brain.dgConfidence.confidence==='number')?brain.dgConfidence.confidence:null,
    reason,supportingModules,missingModules,conflictingModules,
    metConditions,unmetConditions,
    rulesStatus:Object.assign({},DG_RULES_DEFINED),
    moduleSnapshot
  };
}

// DG Overview — pure aggregation/UI-feed layer over engines that already
// exist (Liquidity Engine, Structure Engine, POI Engine). No new data, no
// new DG rule, no invented weighting.
const OVERVIEW_QUICK_LEVEL_IDS=['asiaHigh','asiaLow','londonHigh','londonLow','nyHigh','nyLow','dailyHigh','dailyLow','weeklyHigh','weeklyLow'];
const OVERVIEW_ZONE_CONFIDENCE_MIN=65; // "große Zonen" — only the highest-confidence H1 POIs, not every minor gap
const OVERVIEW_EVENT_LIMIT=10;

function computeOverview(brain){
  const liquidity=brain.liquidity||[];
  const quickLevels=OVERVIEW_QUICK_LEVEL_IDS
    .map(id=>liquidity.find(lv=>lv.id===id))
    .filter(Boolean);

  const poiList=(brain.pois&&brain.pois.list)||[];
  const openZones=poiList
    .filter(p=>p.status==='fresh'&&typeof p.confidence==='number'&&p.confidence>=OVERVIEW_ZONE_CONFIDENCE_MIN)
    .sort((a,b)=>b.confidence-a.confidence);

  const sweepMessages=liquidity
    .filter(lv=>lv.status==='sweeped')
    .map(lv=>({kind:'sweep',at:null,text:`${lv.label} (${lv.timeframe}) ist gesweept — aktueller Preis ${fmtPrice(lv.price)}`}));

  const reactionMessages=poiList
    .filter(p=>p.reaction)
    .map(p=>{
      const typeLabel=(POI_TYPE_DEFS.find(d=>d.id===p.type)||{}).label||p.type;
      return{
        kind:'reaction',at:p.reaction.at,
        text:`${typeLabel} ${p.direction||''} (H1, ${fmtPrice(p.priceLow)}–${fmtPrice(p.priceHigh)}) — ${p.reaction.reason}`
      };
    });

  const events=[...reactionMessages,...sweepMessages]
    .sort((a,b)=>{
      if(a.at&&b.at) return new Date(b.at)-new Date(a.at);
      if(a.at) return -1;
      if(b.at) return 1;
      return 0;
    })
    .slice(0,OVERVIEW_EVENT_LIMIT);

  return{
    quickLevels,
    structureBias:{
      internal:(brain.structure&&brain.structure.internalBias)||null,
      external:(brain.structure&&brain.structure.externalBias)||null
    },
    openZones,
    events
  };
}

// Data Freshness — Phase 1 addition. A purely technical display
// computation, NOT a trading rule: these thresholds describe how current
// the data is relative to DG OS's own known feed intervals, nothing about
// whether the market itself is currently tradeable. Two threshold sets
// because "fresh" means something different depending on which feed is
// active: the WebSocket stream (~10s heartbeat, sub-minute ticks) versus
// the 15-minute GitHub Actions cron baseline (data/market.json). Deriving
// status from the *actual* last-update timestamp — never just "is a stream
// connected" — is the whole point: a dashboard must never claim LIVE off a
// stale timestamp, per Daniel's explicit instruction.
const FRESHNESS_THRESHOLDS={
  streaming:{live:20,delayed:90},     // seconds — WS heartbeat is 10s (TD_HEARTBEAT_MS in app.js), so LIVE tolerates ~2 missed beats before downgrading
  baseline:{live:300,delayed:1200}    // seconds — 5 min / 20 min, against a 15-min cron: LIVE = freshly refreshed, DELAYED = aging within/just past one cycle, STALE = the cron has likely stopped running
};

function computeDataFreshness(lastUpdateAt,isStreaming){
  if(!lastUpdateAt) return{status:'NO_DATA',ageSeconds:null};
  const ageSeconds=Math.max(0,Math.round((Date.now()-new Date(lastUpdateAt).getTime())/1000));
  const t=isStreaming?FRESHNESS_THRESHOLDS.streaming:FRESHNESS_THRESHOLDS.baseline;
  const status=ageSeconds<=t.live?'LIVE':(ageSeconds<=t.delayed?'DELAYED':'STALE');
  return{status,ageSeconds};
}

function formatDataAge(ageSeconds){
  if(typeof ageSeconds!=='number') return'—';
  if(ageSeconds<60) return`${ageSeconds}s`;
  const m=Math.floor(ageSeconds/60),s=ageSeconds%60;
  if(m<60) return s?`${m}m ${s}s`:`${m}m`;
  const h=Math.floor(m/60),rm=m%60;
  return rm?`${h}h ${rm}m`:`${h}h`;
}

// ---------------------------------------------------------------------------
// Module 11: DG Trading Brain V1 — HTF context, POI ranking, targets, report
//
// V1 draft, dictated directly by Daniel (his "DG TRADING BRAIN V1" prompt)
// rather than derived from rules/strategy.md, which is still fully TODO —
// see that prompt's own §2 (Market Facts vs. DG Interpretation, kept
// separate below: detectors stay pure facts, everything in this section is
// clearly labeled V1 interpretation) and §15 (only what was actually
// defined in the prompt gets transcribed, nothing invented beyond it).
// Everything below is explicitly a V1 draft, not a claim that these are
// Daniel's finished, permanent DG rules.
//
// Reuses the exact same detectors as the legacy single-H1 pipeline above
// (detectStructure/detectFairValueGaps/detectOrderBlocks), just pointed at
// each of the 7 HTF-priority candle series the Always-On Server already
// holds — no second parallel engine, no new pattern detection invented.
// ---------------------------------------------------------------------------
const HTF_TIMEFRAME_DEFS=[
  {key:'weekly',outputKey:'weekly',label:'Weekly',rank:4},
  {key:'daily',outputKey:'daily',label:'Daily',rank:3},
  {key:'4h',outputKey:'h4',label:'4H',rank:2},
  {key:'1h',outputKey:'h1',label:'H1',rank:1}
];

function seriesRange(candles){
  if(!Array.isArray(candles)||!candles.length) return null;
  return{high:Math.max(...candles.map(c=>c.high)),low:Math.min(...candles.map(c=>c.low))};
}

// One timeframe's own Structure/FVG/Order Block read — same detectors as
// the legacy H1 pipeline, pointed at a different candle series with an
// explicit timeframe label instead of the hardcoded 'H1'.
function computeTimeframeBrain(candles,timeframeLabel){
  if(!Array.isArray(candles)||!candles.length){
    return{timeframe:timeframeLabel,candleCount:0,range:null,lastCandle:null,structure:{list:[],internalBias:null,externalBias:null},rawFvgs:[],rawOrderBlocks:[]};
  }
  const internal=detectStructure(candles,STRUCTURE_INTERNAL_WINDOW,'internal',timeframeLabel);
  const external=detectStructure(candles,STRUCTURE_EXTERNAL_WINDOW,'external',timeframeLabel);
  return{
    timeframe:timeframeLabel,
    candleCount:candles.length,
    range:seriesRange(candles),
    lastCandle:candles[candles.length-1],
    structure:{list:[...internal.elements,...external.elements],internalBias:internal.finalBias,externalBias:external.finalBias},
    rawFvgs:detectFairValueGaps(candles,timeframeLabel),
    rawOrderBlocks:detectOrderBlocks(candles,timeframeLabel)
  };
}

// Nearest BOS/CHOCH on the same timeframe at or before a POI's own creation
// — correlating two already-detected facts (Structure Engine + POI Engine),
// not a new pattern detector.
function relatedStructureFor(poi,structureList){
  if(!poi.createdAt||!Array.isArray(structureList)) return null;
  const poiTime=new Date(poi.createdAt).getTime();
  const candidates=structureList
    .filter(el=>(el.type==='BOS'||el.type==='CHOCH')&&el.createdAt&&new Date(el.createdAt).getTime()<=poiTime)
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if(!candidates.length) return null;
  const nearest=candidates[0];
  return{id:nearest.id,type:nearest.type,direction:nearest.direction,price:nearest.price,createdAt:nearest.createdAt};
}

// Multi-timeframe POI enrichment — deliberately separate from
// enrichPOIContext() above, which is hardcoded to the legacy single-H1
// brain shape (brain.candles.h1, Daily-only Premium/Discount). Same
// underlying facts (relatedLiquidity, reaction, distanceToPrice), each
// evaluated against the POI's OWN timeframe range instead of always Daily.
function computeTimeframePOIs(candles,timeframeLabel,ctx){
  const raw=[...detectFairValueGaps(candles,timeframeLabel),...detectOrderBlocks(candles,timeframeLabel)];
  const range=seriesRange(candles);
  return raw.map(poi=>{
    const midpoint=(poi.priceHigh!==null&&poi.priceLow!==null)?(poi.priceHigh+poi.priceLow)/2:null;
    const zone=(midpoint!==null&&range)?computeZoneForRange(midpoint,range.high,range.low):null;
    return Object.assign({},poi,{
      relatedLiquidity:relatedLiquidityFor(poi,ctx.liquidity),
      relatedSession:poi.createdAt?sessionForTimestamp(new Date(poi.createdAt)):null,
      relatedHTFBias:ctx.overallBias||null,
      relatedStructure:relatedStructureFor(poi,ctx.structureList),
      premiumDiscountZone:zone?zone.zone:null,
      distanceToPrice:distanceToPriceFor(poi,ctx.price),
      reaction:detectZoneReaction(poi,candles)
    });
  });
}

// Previous day's High/Low as a liquidity level — Daniel's §6 explicitly
// asks for this "wenn Daten vorhanden"; the daily candle series (Phase B of
// the Always-On Server) makes it available now, unlike liveData's single
// most-recent daily bar.
function previousDayLiquidityFrom(dailySeries){
  if(!Array.isArray(dailySeries)||dailySeries.length<2) return[];
  const prev=dailySeries[dailySeries.length-2];
  if(!prev) return[];
  return[
    {id:'prevDayHigh',label:'Previous Day High',type:'high',timeframe:'Daily',period:prev.datetime,price:prev.high,status:null},
    {id:'prevDayLow',label:'Previous Day Low',type:'low',timeframe:'Daily',period:prev.datetime,price:prev.low,status:null}
  ];
}

// Unbroken (status 'active') external swing points as resting liquidity —
// a swing high/low nobody has traded through yet is exactly what
// "relevante Swing Highs/Lows" liquidity means structurally. Equal
// Highs/Lows are deliberately NOT added here — Daniel's §6 asked for them
// only "falls bestehende Erkennung schon vorhanden ist", and no such
// detector exists yet, so this stays honestly absent rather than guessed.
function swingLiquidityFrom(tfBrainsByOutputKey,currentPrice){
  const levels=[];
  HTF_TIMEFRAME_DEFS.forEach(def=>{
    const tf=tfBrainsByOutputKey[def.outputKey];
    if(!tf||!tf.structure) return;
    tf.structure.list
      .filter(el=>(el.type==='swingHigh'||el.type==='swingLow')&&el.structureType==='external'&&el.status==='active')
      .forEach(el=>{
        const type=el.type==='swingHigh'?'high':'low';
        levels.push({
          id:`swing-${def.key}-${el.id}`,label:`${def.label} Swing ${type==='high'?'High':'Low'}`,
          type,timeframe:def.label,period:el.createdAt,price:el.price,
          status:typeof currentPrice==='number'?computeLiquidityStatus(el.price,type,currentPrice):'invalid'
        });
      });
  });
  return levels;
}

function computePremiumDiscountForRange(range,currentPrice,label){
  if(!range||typeof currentPrice!=='number') return null;
  const zone=computeZoneForRange(currentPrice,range.high,range.low);
  return zone?Object.assign({timeframe:label},zone):null;
}

// DG HTF Bias — reads every timeframe's Market Facts (Structure Engine's
// externalBias — BOS/CHOCH is explicitly a Market Fact, see Daniel's own
// Market-Facts-vs-DG-Interpretation split), but does NOT synthesize them
// into a bullish/bearish verdict. Turning "these facts" into "therefore
// bullish" is exactly the DG Interpretation that only rules/strategy.md's
// Chapter 1 (DG HTF Bias) may define — and it's still 🔴 TODO. Same
// pattern as the existing computeDecisionEngine() below: honestly wait
// instead of guessing. `reasoning` lists the raw facts as context only,
// never framed as "contributing to bullish/bearish".
function computeOverallBias(tfBrainsByOutputKey,premiumDiscountByOutputKey,liquidity){
  const facts=[];

  HTF_TIMEFRAME_DEFS.forEach(def=>{
    const tf=tfBrainsByOutputKey[def.outputKey];
    const vote=tf&&(tf.structure.externalBias||tf.structure.internalBias);
    facts.push(`${def.label}: externe Struktur ${vote?vote.toUpperCase():'noch unklar'}`);
  });

  ['weekly','daily'].forEach(key=>{
    const pd=premiumDiscountByOutputKey[key];
    if(pd) facts.push(`${pd.timeframe}: Preis im ${PD_ZONE_LABEL[pd.zone]}`);
  });

  const sweptLows=(liquidity||[]).filter(l=>l.type==='low'&&l.status==='sweeped');
  const sweptHighs=(liquidity||[]).filter(l=>l.type==='high'&&l.status==='sweeped');
  if(sweptLows.length) facts.push(`${sweptLows.length} Low-Liquidity-Level gesweept (${sweptLows.map(l=>l.label).join(', ')})`);
  if(sweptHighs.length) facts.push(`${sweptHighs.length} High-Liquidity-Level gesweept (${sweptHighs.map(l=>l.label).join(', ')})`);

  if(!DG_RULES_DEFINED.htfBias){
    return{
      overallBias:'AWAITING_DG_RULE',confidence:null,
      reasoning:['DG HTF Bias (Kapitel 1 in rules/strategy.md) ist noch nicht definiert — DG OS wertet die folgenden Fakten bewusst nicht zu einem Bias-Verdikt aus:',...facts]
    };
  }
  // No chapter is defined yet, so there is no rule-application branch to
  // build here — adding one now would mean guessing at a rule Daniel
  // hasn't written. This mirrors computeDecisionEngine()'s own honesty.
  return{
    overallBias:'AWAITING_DG_RULE',confidence:null,
    reasoning:['DG HTF Bias ist als definiert markiert, aber die Regelanwendung ist noch nicht implementiert.',...facts]
  };
}

// DG POI Ranking (Order Block / Valid FVG quality) — same reasoning as
// computeOverallBias() above: "hoher/niedriger Quality POI" is explicitly
// DG Interpretation in Daniel's own Market-Facts-vs-Interpretation split,
// and Chapters 4 (DG Order Block) / 5 (DG Valid FVG) are still 🔴 TODO.
// `reasons` lists the same Market Facts the old V1 score used to weight —
// they're still useful context — but no score/quality verdict is derived
// from them until the relevant chapter is filled in.
function rankPOI(poi){
  const chapterKey=poi.type==='orderBlock'?'orderBlock':'validFvg';
  const chapterLabel=poi.type==='orderBlock'?'DG Order Block (Kapitel 4)':'DG Valid FVG (Kapitel 5)';

  const facts=[`Timeframe ${poi.timeframe}`,poi.status==='fresh'?'Frisch / unmitigiert':'Bereits mitigiert'];
  if(poi.displacement) facts.push('Mit Displacement entstanden');
  if(poi.relatedStructure) facts.push(`Verbunden mit ${poi.relatedStructure.type} (${poi.relatedStructure.direction})`);
  if(Array.isArray(poi.relatedLiquidity)&&poi.relatedLiquidity.length) facts.push(`Nahe ${poi.relatedLiquidity.length} Liquidity-Level`);
  if(poi.premiumDiscountZone) facts.push(`Liegt im ${PD_ZONE_LABEL[poi.premiumDiscountZone]}`);

  if(!DG_RULES_DEFINED[chapterKey]){
    return{score:null,quality:'AWAITING_DG_RULE',reasons:[`${chapterLabel} ist noch nicht definiert — kein Ranking möglich.`,...facts]};
  }
  return{score:null,quality:'AWAITING_DG_RULE',reasons:[`${chapterLabel} ist als definiert markiert, aber die Bewertungslogik ist noch nicht implementiert.`,...facts]};
}

// DG Targets — "möglicher Target" is DG Interpretation (which level
// actually matters), so `priority` stays AWAITING_DG_RULE. The candidate
// list itself (which liquidity/POI levels sit above/below price) is a
// Market Fact — direction is pure geometry, not a judgement call. Sorted
// nearest-first purely for readability (a neutral, non-judgemental order,
// not a claim about relevance), capped so the list stays readable.
const TARGET_MAX_PER_DIRECTION=4;

function computeTargets(liquidity,pois,currentPrice){
  if(typeof currentPrice!=='number') return[];
  const candidates=[];

  (liquidity||[]).forEach(lv=>{
    if(typeof lv.price!=='number'||lv.status==='invalid'||lv.status==='sweeped') return; // sweeped = already taken, not a forward target
    candidates.push({
      direction:lv.price>currentPrice?'up':'down',price:lv.price,type:'liquidity',timeframe:lv.timeframe,
      reason:`${lv.label} (${lv.timeframe})`,priority:'AWAITING_DG_RULE',_dist:Math.abs(lv.price-currentPrice)
    });
  });

  (pois||[]).filter(p=>p.status==='fresh').forEach(p=>{
    const mid=(p.priceHigh+p.priceLow)/2;
    candidates.push({
      direction:mid>currentPrice?'up':'down',price:Math.round(mid*100)/100,type:`poi-${p.type}`,timeframe:p.timeframe,
      reason:`${p.type==='fvg'?'FVG':'Order Block'} ${p.direction} (${p.timeframe})`,priority:'AWAITING_DG_RULE',_dist:Math.abs(mid-currentPrice)
    });
  });

  const strip=c=>{ const{_dist,...rest}=c; return rest; };
  const up=candidates.filter(c=>c.direction==='up').sort((a,b)=>a._dist-b._dist).slice(0,TARGET_MAX_PER_DIRECTION).map(strip);
  const down=candidates.filter(c=>c.direction==='down').sort((a,b)=>a._dist-b._dist).slice(0,TARGET_MAX_PER_DIRECTION).map(strip);
  return[...up,...down];
}

// DG Market Report — assembled entirely from Market Facts + the honestly-
// gated interpretation results above. `status` can never be WAIT/WATCH
// BUY/.../BULLISH SCENARIO today — every one of those labels would itself
// be a DG Interpretation verdict, and none of the underlying chapters are
// defined yet. AWAITING_DG_RULE is the only honest value, exactly like
// `overallBias` and POI `quality` above — never BUY/SELL READY, per
// Daniel's explicit instruction.
function summarizeTimeframeContext(tf,pd){
  if(!tf||!tf.range) return'Noch keine Daten.';
  const bias=tf.structure.externalBias?tf.structure.externalBias.toUpperCase():'NEUTRAL';
  const zone=pd?PD_ZONE_LABEL[pd.zone]:null;
  return`Struktur ${bias}${zone?`, Preis im ${zone}`:''} (Range ${fmtPrice(tf.range.low)}–${fmtPrice(tf.range.high)})`;
}

function generateMarketReport(input){
  const{overallBias,confidence,reasoning,tfBrainsByOutputKey,premiumDiscountByOutputKey,liquidity,pois,targets}=input;

  const notableLiquidity=(liquidity||[])
    .filter(l=>l.status==='sweeped'||l.status==='touched')
    .map(l=>`${l.label} (${l.timeframe}) — ${LIQUIDITY_STATUS_LABEL[l.status]||l.status} bei ${fmtPrice(l.price)}`);

  const poiFact=p=>({timeframe:p.timeframe,type:p.type,range:`${fmtPrice(p.priceLow)}–${fmtPrice(p.priceHigh)}`,status:p.status,quality:p.quality});
  const freshBullishPOIs=(pois||[]).filter(p=>p.direction==='bullish'&&p.status==='fresh')
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map(poiFact);
  const freshBearishPOIs=(pois||[]).filter(p=>p.direction==='bearish'&&p.status==='fresh')
    .sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map(poiFact);

  const status='AWAITING_DG_RULE';

  const lines=[];
  lines.push(`HTF Bias: ${overallBias} — ${DG_RULES_DEFINED.htfBias?'Kapitel definiert, Regelanwendung noch nicht implementiert':'Kapitel 1 (DG HTF Bias) in rules/strategy.md ist noch TODO'}`);
  lines.push(`Weekly: ${summarizeTimeframeContext(tfBrainsByOutputKey.weekly,premiumDiscountByOutputKey.weekly)}`);
  lines.push(`Daily: ${summarizeTimeframeContext(tfBrainsByOutputKey.daily,premiumDiscountByOutputKey.daily)}`);
  lines.push(`4H: ${summarizeTimeframeContext(tfBrainsByOutputKey.h4,premiumDiscountByOutputKey.h4)}`);
  lines.push(notableLiquidity.length?`Liquidity (touched/sweeped): ${notableLiquidity.join(' · ')}`:'Liquidity (touched/sweeped): aktuell keine.');
  lines.push(`Fresh Bullish POIs: ${freshBullishPOIs.length?freshBullishPOIs.map(p=>`${p.range} (${p.timeframe})`).join(', '):'keine'} — Qualität: AWAITING_DG_RULE`);
  lines.push(`Fresh Bearish POIs: ${freshBearishPOIs.length?freshBearishPOIs.map(p=>`${p.range} (${p.timeframe})`).join(', '):'keine'} — Qualität: AWAITING_DG_RULE`);
  const up=(targets||[]).find(t=>t.direction==='up');
  const down=(targets||[]).find(t=>t.direction==='down');
  if(up) lines.push(`Nächstes Level aufwärts (Fakt, keine Priorisierung): ${fmtPrice(up.price)} (${up.reason})`);
  if(down) lines.push(`Nächstes Level abwärts (Fakt, keine Priorisierung): ${fmtPrice(down.price)} (${down.reason})`);
  lines.push(`Status: ${status} — DG-Regeln für Bias/POI-Qualität/Targets sind noch nicht definiert (rules/strategy.md).`);

  return{
    htfBias:{overallBias,confidence,reasoning},
    weeklyContext:summarizeTimeframeContext(tfBrainsByOutputKey.weekly,premiumDiscountByOutputKey.weekly),
    dailyContext:summarizeTimeframeContext(tfBrainsByOutputKey.daily,premiumDiscountByOutputKey.daily),
    h4Context:summarizeTimeframeContext(tfBrainsByOutputKey.h4,premiumDiscountByOutputKey.h4),
    notableLiquidity,freshBullishPOIs,freshBearishPOIs,targets:targets||[],
    status,summary:lines.join('\n')
  };
}

function summarizeHTFContextEntry(tf,pd){
  if(!tf) return null;
  return{
    timeframe:tf.timeframe,candleCount:tf.candleCount,range:tf.range,
    internalBias:tf.structure.internalBias,externalBias:tf.structure.externalBias,
    premiumDiscount:pd,fvgCount:tf.rawFvgs.length,orderBlockCount:tf.rawOrderBlocks.length,
    lastCandle:tf.lastCandle
  };
}

// Top-level orchestrator — the ONE function server/marketState.js calls.
// candlesByTimeframe: the server's existing {id: {series, latestRealBar}}
// map (weekly/daily/4h/1h at minimum). liquidityBase: the existing
// computeLiquidityEngine(liveData) output — reused, not recomputed.
function computeTradingBrainV1(candlesByTimeframe,liquidityBase,currentPrice){
  candlesByTimeframe=candlesByTimeframe||{};
  const tfBrainsByOutputKey={};
  HTF_TIMEFRAME_DEFS.forEach(def=>{
    const entry=candlesByTimeframe[def.key];
    tfBrainsByOutputKey[def.outputKey]=computeTimeframeBrain((entry&&entry.series)||[],def.label);
  });

  const premiumDiscountByOutputKey={};
  HTF_TIMEFRAME_DEFS.forEach(def=>{
    premiumDiscountByOutputKey[def.outputKey]=computePremiumDiscountForRange(tfBrainsByOutputKey[def.outputKey].range,currentPrice,def.label);
  });

  const dailyEntry=candlesByTimeframe.daily;
  const prevDayLiquidity=previousDayLiquidityFrom(dailyEntry&&dailyEntry.series);
  const combinedLiquidity=[...(liquidityBase||[]),...prevDayLiquidity,...swingLiquidityFrom(tfBrainsByOutputKey,currentPrice)];

  const biasResult=computeOverallBias(tfBrainsByOutputKey,premiumDiscountByOutputKey,combinedLiquidity);

  const pois=[];
  HTF_TIMEFRAME_DEFS.forEach(def=>{
    const entry=candlesByTimeframe[def.key];
    const series=(entry&&entry.series)||[];
    if(!series.length) return;
    const structureList=tfBrainsByOutputKey[def.outputKey].structure.list;
    const enriched=computeTimeframePOIs(series,def.label,{liquidity:combinedLiquidity,structureList,overallBias:biasResult.overallBias,price:currentPrice});
    enriched.forEach(poi=>{
      const ranked=rankPOI(poi); // score/quality: AWAITING_DG_RULE until Chapter 4/5 is defined — see rankPOI()
      pois.push(Object.assign({},poi,ranked));
    });
  });

  const targets=computeTargets(combinedLiquidity,pois,currentPrice);

  const report=generateMarketReport({
    overallBias:biasResult.overallBias,confidence:biasResult.confidence,reasoning:biasResult.reasoning,
    tfBrainsByOutputKey,premiumDiscountByOutputKey,liquidity:combinedLiquidity,pois,targets
  });

  const htfContext={
    weekly:summarizeHTFContextEntry(tfBrainsByOutputKey.weekly,premiumDiscountByOutputKey.weekly),
    daily:summarizeHTFContextEntry(tfBrainsByOutputKey.daily,premiumDiscountByOutputKey.daily),
    h4:summarizeHTFContextEntry(tfBrainsByOutputKey.h4,premiumDiscountByOutputKey.h4),
    h1:summarizeHTFContextEntry(tfBrainsByOutputKey.h1,premiumDiscountByOutputKey.h1),
    overallBias:biasResult.overallBias,confidence:biasResult.confidence,reasoning:biasResult.reasoning
  };

  return{
    symbol:'XAUUSD',timestamp:new Date().toISOString(),htfContext,
    structure:{weekly:tfBrainsByOutputKey.weekly.structure,daily:tfBrainsByOutputKey.daily.structure,h4:tfBrainsByOutputKey.h4.structure,h1:tfBrainsByOutputKey.h1.structure},
    liquidity:combinedLiquidity,premiumDiscount:premiumDiscountByOutputKey,
    pois,targets,report,status:report.status,
    // Machine-readable pointer to exactly which rules/strategy.md chapters
    // gate the interpretation fields above — cheap, honest, not a guess.
    awaitingDgRule:['htfBias','orderBlock','validFvg'].filter(k=>!DG_RULES_DEFINED[k])
  };
}

// Runs every derived module in dependency order over {liveData, sessions,
// candles} and returns a brand-new, fully-computed brain snapshot. This is
// the ONE function both the browser (app.js's refreshDerivedModules) and
// the Node ingest script call — same order, same logic, same output shape,
// every time. Order matters: later modules read earlier ones' output
// (POI Engine reads liquidity, Decision Engine reads everything).
function computeAllDerivedModules(brain){
  const next=Object.assign({},brain);
  next.premiumDiscount=computePremiumDiscount(next.liveData);
  next.htfBias=computeHTFBias(next.liveData);
  next.liquidity=computeLiquidityEngine(next.liveData);
  next.pois=computePOIEngine(next);
  next.structure=computeStructureEngine(next);
  next.dgConfidence=computeDGConfidenceEngine(next);
  next.decision=computeDecisionEngine(next);
  next.overview=computeOverview(next);
  return next;
}

return{
  fmtPrice,createMarketBrainState,
  FRESHNESS_THRESHOLDS,computeDataFreshness,formatDataAge,
  SESSIONS,sessionWindowToday,sessionForTimestamp,
  EQUILIBRIUM_BAND_PERCENT,computeZoneForRange,computePremiumDiscount,PD_ZONE_LABEL,
  computeHTFBias,BIAS_LABEL,
  LIQUIDITY_LEVEL_DEFS,extractLevelRaw,LIQUIDITY_TOUCH_PERCENT,computeLiquidityStatus,computeLiquidityEngine,LIQUIDITY_STATUS_LABEL,
  createPOI,candleTimeToIso,POI_ATR_WINDOW,localAverageRange,isZoneMitigatedAfter,
  detectFairValueGaps,candleDirection,closeStrength,detectOrderBlocks,OB_DISPLACEMENT_RATIO,OB_CLOSE_STRENGTH_MIN,
  detectBreakers,detectInverseFairValueGaps,detectMitigationBlocks,detectRejectionBlocks,detectSupplyZones,detectDemandZones,
  POI_TYPE_DEFS,POI_LIQUIDITY_TOLERANCE_PERCENT,relatedLiquidityFor,detectZoneReaction,enrichPOIContext,computePOIEngine,
  POI_STATUS_LABEL,SESSION_LABEL_BY_ID,
  detectDisplacementCandles,detectEngulfingCandles,
  STRUCTURE_INTERNAL_WINDOW,STRUCTURE_EXTERNAL_WINDOW,createStructureElement,directionForStructureLabel,
  detectRawSwingPoints,classifyStructureSequence,structureProminenceConfidence,createSwingElement,createBreakEvent,
  detectStructure,enrichStructureContext,computeStructureEngine,STRUCTURE_TYPE_LABEL,STRUCTURE_STATUS_LABEL,
  contributeFromSessions,contributeFromLiquidity,contributeFromPremiumDiscount,contributeFromHTFBias,
  contributeFromPoiType,contributeFromFVG,contributeFromOrderBlock,CONFIDENCE_CONTRIBUTORS,computeDGConfidenceEngine,
  DECISION_STATES,DG_RULES_DEFINED,createModuleSnapshot,
  describeHTFBiasInput,describeStructureInput,describeLiquidityInput,describePOIInput,describePremiumDiscountInput,describeDGConfidenceInput,
  DECISION_INPUT_MODULES,computeDecisionEngine,
  OVERVIEW_QUICK_LEVEL_IDS,OVERVIEW_ZONE_CONFIDENCE_MIN,OVERVIEW_EVENT_LIMIT,computeOverview,
  computeAllDerivedModules,
  HTF_TIMEFRAME_DEFS,seriesRange,computeTimeframeBrain,relatedStructureFor,computeTimeframePOIs,
  previousDayLiquidityFrom,swingLiquidityFrom,computePremiumDiscountForRange,computeOverallBias,
  rankPOI,TARGET_MAX_PER_DIRECTION,computeTargets,summarizeTimeframeContext,
  generateMarketReport,summarizeHTFContextEntry,computeTradingBrainV1
};

});
