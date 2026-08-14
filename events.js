
// ---------------------------------------------------------------------------
// DG OS Event Classification — Market Context vs. Trading Event
//
// Phase 1 (Core Foundation, v0.20.0). Implements the rule Daniel set
// explicitly (see docs/DG_OS_V2_AUDIT.md, "Event classification" section):
//
//   Level entsteht = Market Context -> still speichern.
//   Mit einem Level passiert etwas (Touch / Sweep / Reaktion / Confirmation
//   etc.) = Trading Event -> potenziell relevant.
//
// classifyMarketEvents(prevBrain, nextBrain) diffs two consecutive
// MarketBrain snapshots (see marketBrain.js) and returns every event that
// happened between them, each tagged with its category. Nothing here
// decides whether an event is *worth telling Daniel about* beyond that
// category split — that's the future Alert Layer's job (see the audit's
// Recommended V2 Architecture), reading this category field, not a
// hand-maintained exclusion list.
//
// This module invents no trading rule. Every event type is either a direct
// relabeling of a status/field the Market Brain already computes (SWEPT,
// TOUCHED, POI_REACHED, REACTION_DETECTED, BOS/CHOCH_CONFIRMED) or a
// generic, previously-documented structural detector reused as its own
// event (DISPLACEMENT_DETECTED, ENGULFING_CONFIRMED — see marketBrain.js).
// SETUP_* and TARGET_REACHED are listed for a complete vocabulary but have
// no emitter yet: a "setup" is inherently a DG-rule concept, and
// rules/strategy.md is still entirely TODO (Knowledge Mode gate) — emitting
// them today would mean inventing the rule that decides what a setup is.
// ---------------------------------------------------------------------------
(function(root, factory){
  const brainLib = (typeof module==='object'&&module.exports) ? require('./marketBrain.js') : root;
  const lib = factory(brainLib);
  if (typeof module === 'object' && module.exports) {
    module.exports = lib;
  } else {
    Object.assign(root, lib);
  }
})(typeof self !== 'undefined' ? self : this, function(MB){

// Every event type DG OS knows about, and its category. This map is the
// single place that decides context-vs-trading — diff functions below only
// ever produce a `type`; the category is looked up here, never hardcoded
// twice.
const EVENT_CATEGORY={
  ASIA_HIGH_CREATED:'context',ASIA_LOW_CREATED:'context',
  LONDON_HIGH_CREATED:'context',LONDON_LOW_CREATED:'context',
  NY_HIGH_CREATED:'context',NY_LOW_CREATED:'context',

  ASIA_HIGH_TOUCHED:'trading',ASIA_LOW_TOUCHED:'trading',
  ASIA_HIGH_SWEPT:'trading',ASIA_LOW_SWEPT:'trading',
  LONDON_HIGH_TOUCHED:'trading',LONDON_LOW_TOUCHED:'trading',
  LONDON_HIGH_SWEPT:'trading',LONDON_LOW_SWEPT:'trading',
  NY_HIGH_TOUCHED:'trading',NY_LOW_TOUCHED:'trading',
  NY_HIGH_SWEPT:'trading',NY_LOW_SWEPT:'trading',

  LIQUIDITY_SWEPT:'trading',
  POI_REACHED:'trading',FVG_REACHED:'trading',ORDERBLOCK_REACHED:'trading',
  REACTION_DETECTED:'trading',
  ENGULFING_CONFIRMED:'trading',DISPLACEMENT_DETECTED:'trading',
  BOS_CONFIRMED:'trading',CHOCH_CONFIRMED:'trading',

  // Reserved — no emitter yet, see file header.
  SETUP_FORMING:'trading',SETUP_CONFIRMED:'trading',
  SETUP_INVALIDATED:'trading',TARGET_REACHED:'trading'
};

const SESSION_EVENT_PREFIX={
  asiaHigh:'ASIA_HIGH',asiaLow:'ASIA_LOW',
  londonHigh:'LONDON_HIGH',londonLow:'LONDON_LOW',
  nyHigh:'NY_HIGH',nyLow:'NY_LOW'
};

function makeEvent(type,at,payload){
  return{type,category:EVENT_CATEGORY[type]||'trading',at:at||new Date().toISOString(),payload:payload||{}};
}

// Session-level lifecycle: creation (context, silent) and status
// transitions (trading). Daily/Weekly/Monthly levels are diffed for
// LIQUIDITY_SWEPT (the generic catch-all) but never get a *_CREATED event —
// Daniel only asked for that on the six session levels.
function diffLiquidityEvents(prevLiquidity,nextLiquidity){
  const events=[];
  if(!Array.isArray(nextLiquidity)) return events;
  const prevById=new Map((prevLiquidity||[]).map(lv=>[lv.id,lv]));

  nextLiquidity.forEach(lv=>{
    const prev=prevById.get(lv.id);
    const prefix=SESSION_EVENT_PREFIX[lv.id];

    if(prefix&&typeof lv.price==='number'){
      const isNewPeriod=!prev||prev.price===null||prev.period!==lv.period;
      if(isNewPeriod){
        events.push(makeEvent(`${prefix}_CREATED`,null,{levelId:lv.id,label:lv.label,price:lv.price,period:lv.period}));
      }
    }

    if(prev&&prev.status!==lv.status&&typeof lv.price==='number'){
      if(lv.status==='touched'&&prev.status==='active'&&prefix){
        events.push(makeEvent(`${prefix}_TOUCHED`,null,{levelId:lv.id,label:lv.label,price:lv.price}));
      }
      if(lv.status==='sweeped'&&prev.status!=='sweeped'){
        if(prefix) events.push(makeEvent(`${prefix}_SWEPT`,null,{levelId:lv.id,label:lv.label,price:lv.price}));
        events.push(makeEvent('LIQUIDITY_SWEPT',null,{levelId:lv.id,label:lv.label,timeframe:lv.timeframe,price:lv.price}));
      }
    }
  });

  return events;
}

// POI lifecycle: first mitigation ("reached") and zone reaction, both
// diffed by the POI's now-deterministic id (see marketBrain.js's poiId()).
// A POI with no matching previous entry is skipped, not treated as
// "reached" — see classifyMarketEvents()'s cold-start guard for why that
// matters more broadly.
function diffPOIEvents(prevList,nextList){
  const events=[];
  if(!Array.isArray(nextList)) return events;
  const prevById=new Map((prevList||[]).map(p=>[p.id,p]));

  nextList.forEach(poi=>{
    const prev=prevById.get(poi.id);
    if(!prev) return;

    if(prev.status==='fresh'&&poi.status==='mitigated'){
      const payload={poiId:poi.id,poiType:poi.type,direction:poi.direction,priceLow:poi.priceLow,priceHigh:poi.priceHigh};
      events.push(makeEvent('POI_REACHED',null,payload));
      if(poi.type==='fvg') events.push(makeEvent('FVG_REACHED',null,payload));
      if(poi.type==='orderBlock') events.push(makeEvent('ORDERBLOCK_REACHED',null,payload));
    }

    if(!prev.reaction&&poi.reaction){
      events.push(makeEvent('REACTION_DETECTED',poi.reaction.at,{poiId:poi.id,poiType:poi.type,direction:poi.direction,reason:poi.reaction.reason}));
    }
  });

  return events;
}

// Structure lifecycle: a BOS/CHOCH element with an id not present in the
// previous snapshot is a genuinely new break — detectStructure() re-derives
// the full history every run, so without stable ids every old break would
// look "new" forever. Swing points (HH/HL/LH/LL) aren't in Daniel's
// requested event list, so they're not diffed here.
function diffStructureEvents(prevList,nextList){
  const events=[];
  if(!Array.isArray(nextList)) return events;
  const prevIds=new Set((prevList||[]).map(el=>el.id));

  nextList.forEach(el=>{
    if(prevIds.has(el.id)) return;
    if(el.type==='BOS') events.push(makeEvent('BOS_CONFIRMED',el.createdAt,{structureId:el.id,direction:el.direction,price:el.price,structureType:el.structureType}));
    if(el.type==='CHOCH') events.push(makeEvent('CHOCH_CONFIRMED',el.createdAt,{structureId:el.id,direction:el.direction,price:el.price,structureType:el.structureType}));
  });

  return events;
}

// Candle-pattern lifecycle: displacement/engulfing candles are re-detected
// fresh every run from the same 72h candle window, so — same reasoning as
// structure — only ids absent from the previous run's candle-pattern list
// are genuinely new.
function diffCandlePatternEvents(prevPatternIds,candles){
  const events=[];
  const displacement=MB.detectDisplacementCandles(candles||[]);
  const engulfing=MB.detectEngulfingCandles(candles||[]);
  const nextIds=new Set();

  displacement.forEach(d=>{
    nextIds.add(d.id);
    if(!prevPatternIds.has(d.id)) events.push(makeEvent('DISPLACEMENT_DETECTED',d.at,{candleAt:d.candle.datetime,direction:d.direction,ratio:d.ratio}));
  });
  engulfing.forEach(e=>{
    nextIds.add(e.id);
    if(!prevPatternIds.has(e.id)) events.push(makeEvent('ENGULFING_CONFIRMED',e.at,{candleAt:e.candle.datetime,direction:e.direction}));
  });

  return{events,nextIds:Array.from(nextIds)};
}

// The one entry point. `prevState` is the previously persisted snapshot
// (see scripts/ingest.js) — `{liquidity, pois, structure, patternIds}` — or
// null on a true cold start (no previous run exists yet). Cold start
// returns zero events on purpose: without a real "before," every level and
// every historical BOS/CHOCH/POI in the current candle window would look
// like it "just happened," which would be dishonest — they didn't just
// happen, there's just no baseline yet. A cold start only seeds state.
function classifyMarketEvents(prevState,nextBrain){
  if(!prevState) return{events:[],patternIds:(function(){
    const candles=(nextBrain.candles&&nextBrain.candles.h1)||[];
    const d=MB.detectDisplacementCandles(candles).map(x=>x.id);
    const e=MB.detectEngulfingCandles(candles).map(x=>x.id);
    return d.concat(e);
  })()};

  const events=[];
  events.push(...diffLiquidityEvents(prevState.liquidity,nextBrain.liquidity));
  events.push(...diffPOIEvents(prevState.pois,(nextBrain.pois&&nextBrain.pois.list)||[]));
  events.push(...diffStructureEvents(prevState.structure,(nextBrain.structure&&nextBrain.structure.list)||[]));

  const candles=(nextBrain.candles&&nextBrain.candles.h1)||[];
  const prevPatternIds=new Set(prevState.patternIds||[]);
  const patternDiff=diffCandlePatternEvents(prevPatternIds,candles);
  events.push(...patternDiff.events);

  return{events,patternIds:patternDiff.nextIds};
}

return{EVENT_CATEGORY,classifyMarketEvents,diffLiquidityEvents,diffPOIEvents,diffStructureEvents,diffCandlePatternEvents};

});
