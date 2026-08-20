
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
  SETUP_INVALIDATED:'trading',TARGET_REACHED:'trading',

  // Secondary 5M Confirmation (Kapitel 8 update, 2026-08-20) — purely
  // informational early heads-up, own type prefix so it never collides
  // (dedupe key, dashboard icon, Telegram formatting) with the 15M-driven,
  // Entry-authoritative events above.
  '5M_REACTION_DETECTED':'trading','5M_CONFIRMATION_DEVELOPING':'trading',
  '5M_ENGULFING_CONFIRMED':'trading','5M_STRUCTURE_CONFIRMED':'trading'
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

// ---------------------------------------------------------------------------
// DG Trading Brain V1 Event/Alert Engine (autonomous night build, Phase 5/6/
// 9/10). Separate from classifyMarketEvents() above on purpose — that
// function diffs the LEGACY single-H1 brain (computeAllDerivedModules);
// this one diffs the NEW multi-timeframe DG Trading Brain
// (computeTradingBrainV1's `decision` summary, see marketBrain.js). Shares
// the same event store (state/events.jsonl via marketStateStore.js) but
// tags every event `source:'tradingBrainV1'` so the two vocabularies never
// get confused with each other, even where a type name coincides
// (REACTION_DETECTED, ENGULFING_CONFIRMED exist in both).
//
// Every event carries Daniel's requested shape: type, timestamp, symbol,
// direction, timeframe, price, relatedPoi, significance, explanation,
// dedupeKey. Dedup itself works by only ever calling this function with a
// genuine transition (previous vs. next state) — see marketState.js.
// ---------------------------------------------------------------------------

// SYSTEM_THRESHOLD, not a DG rule: how close price must get to a POI's near
// edge to count as "approaching" for UI/event purposes only. No trading
// decision ever depends on this number — see rules/strategy.md Kapitel 6's
// explicit instruction to keep such a distance out of strategy.md entirely.
const POI_APPROACH_THRESHOLD_PERCENT=0.15;
const CONFIRMATION_RANK={NO_CONFIRMATION:0,REACTION_DETECTED:1,CONFIRMATION_DEVELOPING:2,ENGULFING_CONFIRMED:3,STRUCTURE_CONFIRMED:4};
const ACTIVE_ENTRY_STATUSES=['WATCH_BUY','WATCH_SELL','BUY_CONFIRMATION','SELL_CONFIRMATION','BUY_READY','SELL_READY'];

// Alert-Fatigue-Schutz (Kapitel 13/16, "keine unnötigen Alerts für ... jeden
// Price Tick"): price sitting right at a liquidity level can flip
// touched/sweeped back and forth tick to tick, which would otherwise flip
// WATCH_BUY <-> WAIT (and fire SETUP_INVALIDATED) every few seconds. A
// WATCH_BUY/WATCH_SELL entry (still tentative by definition) re-alerts only
// after this cooldown; BUY_READY/SELL_READY always alerts immediately —
// never suppressed, since that's the one status Daniel must never miss.
const STATUS_EVENT_COOLDOWN_MS=60000;

function tbEvent(type,fields){
  fields=fields||{};
  const at=fields.at||new Date().toISOString();
  return{
    type,category:'trading',source:'tradingBrainV1',at,symbol:'XAUUSD',
    direction:fields.direction||null,timeframe:fields.timeframe||null,
    price:typeof fields.price==='number'?fields.price:null,
    relatedPoi:fields.relatedPoi||null,
    significance:fields.significance||'normal',
    explanation:fields.explanation||null,
    dedupeKey:fields.dedupeKey||`${type}-${fields.relatedPoi||'none'}-${fields.direction||'none'}`
  };
}

function isApproaching(primaryPoi,currentPrice){
  if(!primaryPoi||typeof currentPrice!=='number'||typeof primaryPoi.priceHigh!=='number'||typeof primaryPoi.priceLow!=='number') return false;
  const nearEdge=primaryPoi.direction==='bullish'?primaryPoi.priceHigh:primaryPoi.priceLow;
  if(!(currentPrice>0)) return false;
  return(Math.abs(currentPrice-nearEdge)/currentPrice)*100<=POI_APPROACH_THRESHOLD_PERCENT;
}

// DG Active Setup Model (Kapitel/Phase 10) — only exists while a real
// WATCH/CONFIRMATION/READY scenario is active; WAIT never gets an invented
// setup. `id`/`createdAt` stay stable across ticks for the SAME direction
// so the setup's own lifetime is trackable; a direction flip creates a new
// setup (the old one having already gone through SETUP_INVALIDATED).
function buildActiveSetup(decision,existing,currentPrice){
  if(!decision||!ACTIVE_ENTRY_STATUSES.includes(decision.status)) return null;
  const now=new Date().toISOString();
  const reuse=existing&&existing.direction===decision.direction;
  return{
    id:reuse?existing.id:`setup-${Date.now()}`,
    symbol:'XAUUSD',direction:decision.direction,status:decision.status,
    createdAt:reuse?existing.createdAt:now,updatedAt:now,
    macroBias:decision.macroBias,tradingBias:decision.tradingBias,
    primaryPoi:decision.primaryPoi,confirmation:decision.confirmation,confirmation5m:decision.confirmation5m,
    entryZone:decision.entryZone,invalidation:decision.invalidation,
    targets:decision.targets,riskReward:decision.riskReward,reasons:decision.reasons,
    _approaching:isApproaching(decision.primaryPoi,currentPrice)
  };
}

// The one entry point for the new pipeline. `prevState` is
// {entryStatus, activeSetup, lastStatusEventAt} read from
// tradingBrainStore.js (or null on cold start — like classifyMarketEvents(),
// a cold start seeds state and emits nothing, since there's no real
// "before" to diff against). `now` defaults to Date.now(), overridable for
// tests. Returns {events, statusEventEmitted, approachEventEmitted} — the
// caller persists each cooldown timestamp only when its own flag is true,
// so a cooldown clock only resets on an actual alert, never on a
// suppressed flap.
function classifyTradingBrainEvents(prevState,brain,currentPrice,now){
  now=typeof now==='number'?now:Date.now();
  const events=[];
  let statusEventEmitted=false,approachEventEmitted=false,liquidityApproachEventEmitted=false;
  if(!brain||!brain.decision) return{events,statusEventEmitted,approachEventEmitted,liquidityApproachEventEmitted};
  const decision=brain.decision;
  const prevStatus=prevState&&prevState.entryStatus;
  const prevActiveSetup=prevState&&prevState.activeSetup;
  if(!prevState) return{events,statusEventEmitted,approachEventEmitted,liquidityApproachEventEmitted}; // cold start: seed only, no fabricated "just happened" events

  const lastStatusEventAt=prevState.lastStatusEventAt?new Date(prevState.lastStatusEventAt).getTime():0;
  const inCooldown=(now-lastStatusEventAt)<STATUS_EVENT_COOLDOWN_MS;

  if(decision.status!==prevStatus){
    if(ACTIVE_ENTRY_STATUSES.includes(decision.status)){
      const isReady=decision.status.endsWith('READY');
      if(isReady||!inCooldown){
        events.push(tbEvent(decision.status,{
          direction:decision.direction,price:currentPrice,
          relatedPoi:decision.primaryPoi&&decision.primaryPoi.id,
          timeframe:decision.primaryPoi&&decision.primaryPoi.timeframe,
          significance:isReady?'high':'normal',
          explanation:(decision.reasons&&decision.reasons[0])||null
        }));
        statusEventEmitted=true;
      }
    }else if(decision.status==='WAIT'&&prevActiveSetup&&ACTIVE_ENTRY_STATUSES.includes(prevStatus)&&!inCooldown){
      events.push(tbEvent('SETUP_INVALIDATED',{
        direction:prevActiveSetup.direction,price:currentPrice,
        relatedPoi:prevActiveSetup.primaryPoi&&prevActiveSetup.primaryPoi.id,
        significance:'high',explanation:'Setup wurde ungültig — Status zurück auf WAIT.'
      }));
      statusEventEmitted=true;
    }else if(decision.status==='MISSED'){
      // Never cooldown-gated: MISSED is inherently a one-shot transition —
      // buildActiveSetup() clears activeSetup once status is MISSED, so
      // the same priorSetupContext can't re-trigger it on the next tick.
      events.push(tbEvent('MISSED',{
        direction:decision.direction,price:currentPrice,
        relatedPoi:prevActiveSetup&&prevActiveSetup.primaryPoi&&prevActiveSetup.primaryPoi.id,
        significance:'high',explanation:(decision.reasons&&decision.reasons[0])||null
      }));
      statusEventEmitted=true;
    }else if(decision.status==='DATA_NOT_READY'&&prevStatus!=='DATA_NOT_READY'){
      events.push(tbEvent('DATA_NOT_READY',{significance:'high',explanation:(decision.reasons&&decision.reasons[0])||null}));
      statusEventEmitted=true;
    }else if(prevStatus==='DATA_NOT_READY'&&decision.status!=='DATA_NOT_READY'){
      events.push(tbEvent('SYSTEM_RECOVERED',{significance:'high',explanation:'HTF-Kern-Timeframes wieder vollständig geladen.'}));
      statusEventEmitted=true;
    }
  }

  // Confirmation progression — only on the SAME primary POI, only forward.
  if(decision.primaryPoi&&prevActiveSetup&&prevActiveSetup.primaryPoi&&prevActiveSetup.primaryPoi.id===decision.primaryPoi.id){
    const prevConf=prevActiveSetup.confirmation&&prevActiveSetup.confirmation.status;
    const nextConf=decision.confirmation&&decision.confirmation.status;
    if(nextConf&&nextConf!=='NO_CONFIRMATION'&&nextConf!==prevConf&&(CONFIRMATION_RANK[nextConf]||0)>(CONFIRMATION_RANK[prevConf]||-1)){
      events.push(tbEvent(nextConf,{
        direction:decision.direction,price:currentPrice,relatedPoi:decision.primaryPoi.id,timeframe:decision.primaryPoi.timeframe,
        significance:(nextConf==='STRUCTURE_CONFIRMED'||nextConf==='ENGULFING_CONFIRMED')?'high':'normal',
        explanation:(decision.confirmation.reasons&&decision.confirmation.reasons[0])||null
      }));
    }

    // Secondary 5M Confirmation (Kapitel 8 update) — same progression logic,
    // own event type prefix, never 'high' significance and never mentions
    // WATCH/READY: purely "schau selbst rein", 15M stays authoritative.
    const prevConf5m=prevActiveSetup.confirmation5m&&prevActiveSetup.confirmation5m.status;
    const nextConf5m=decision.confirmation5m&&decision.confirmation5m.status;
    if(nextConf5m&&nextConf5m!=='NO_CONFIRMATION'&&nextConf5m!==prevConf5m&&(CONFIRMATION_RANK[nextConf5m]||0)>(CONFIRMATION_RANK[prevConf5m]||-1)){
      events.push(tbEvent(`5M_${nextConf5m}`,{
        direction:decision.direction,price:currentPrice,relatedPoi:decision.primaryPoi.id,timeframe:'5M',
        significance:'normal',
        explanation:(decision.confirmation5m.reasons&&decision.confirmation5m.reasons[0])||null,
        dedupeKey:`5M_${nextConf5m}-${decision.primaryPoi.id}-${decision.direction}`
      }));
    }
  }

    // V1 Priority #1/#2/#3 (Daniel's explicit reorder): Liquidity Approaching,
  // Liquidity Swept, Reaction Detected on PRIMARY liquidity levels now rank
  // above POI/Confirmation alerts. LIQUIDITY_SWEPT/LIQUIDITY_REACTED are
  // diffed off the Liquidity Memory (see marketBrain.js's
  // enrichLiquidityWithMemory) — a memory key appearing for the first time
  // IS the sweep event, so "nicht immer wieder als neu melden" falls out
  // naturally: the same sweep can never diff as new twice.
  const prevLiquidityMemory=(prevState&&prevState.liquidityMemory)||{};
  const nextLiquidityMemory=brain.liquidityMemory||{};
  const levelByMemoryKey=new Map((brain.liquidity||[]).map(lv=>[MB.liquidityMemoryKey(lv),lv]));
  Object.keys(nextLiquidityMemory).forEach(key=>{
    const next=nextLiquidityMemory[key];
    const prev=prevLiquidityMemory[key];
    const level=levelByMemoryKey.get(key);
    if(!level||!MB.isV1PrimaryLiquidity(level)) return; // V1 priority: only primary liquidity gets its own sweep/reaction alert
    if(!prev){
      events.push(tbEvent('LIQUIDITY_SWEPT',{
        direction:level.type==='high'?'bearish':'bullish',price:level.price,timeframe:level.timeframe,
        significance:'high',explanation:`${level.label} gesweept bei ${level.price} — relevantes Liquidity-Level (Kapitel 2).`,
        dedupeKey:`LIQUIDITY_SWEPT-${key}`
      }));
    }
    const prevReaction=prev&&prev.reaction&&prev.reaction.status;
    const nextReaction=next.reaction&&next.reaction.status;
    if(nextReaction==='REACTED'&&prevReaction!=='REACTED'){
      events.push(tbEvent('LIQUIDITY_REACTED',{
        direction:level.type==='high'?'bearish':'bullish',price:level.price,timeframe:level.timeframe,
        significance:'high',explanation:(next.reaction.reasons&&next.reaction.reasons[0])||`Reaktion nach Sweep von ${level.label} erkannt.`,
        dedupeKey:`LIQUIDITY_REACTED-${key}`
      }));
    }
  });

  // LIQUIDITY_APPROACHING — current-state check (not a diff, same pattern as
  // IMPORTANT_POI_APPROACHING below), its own independent cooldown so it
  // doesn't compete with POI-approach or status-transition alerts.
  const lastLiquidityApproachEventAt=prevState.lastLiquidityApproachEventAt?new Date(prevState.lastLiquidityApproachEventAt).getTime():0;
  const liquidityApproachInCooldown=(now-lastLiquidityApproachEventAt)<STATUS_EVENT_COOLDOWN_MS;
  if(!liquidityApproachInCooldown){
    const approaching=(brain.liquidity||[]).find(lv=>lv.status==='approaching'&&MB.isV1PrimaryLiquidity(lv));
    if(approaching){
      events.push(tbEvent('LIQUIDITY_APPROACHING',{
        direction:approaching.type==='high'?'bearish':'bullish',price:currentPrice,timeframe:approaching.timeframe,
        explanation:`Preis nähert sich ${approaching.label} (${approaching.timeframe}) bei ${approaching.price}.`,
        dedupeKey:`LIQUIDITY_APPROACHING-${MB.liquidityMemoryKey(approaching)}`
      }));
      liquidityApproachEventEmitted=true;
    }
  }

  // IMPORTANT_POI_APPROACHING — SYSTEM_THRESHOLD only, see constant above.
  // Cooldown-gated the same way as status events (its own independent
  // clock): the "primary POI" candidate can itself change identity from
  // tick to tick as scores shift near a tie, which made an identity-based
  // "wasApproaching" check alone fire repeatedly — a plain cooldown is
  // simpler and actually prevents the spam.
  const lastApproachEventAt=prevState.lastApproachEventAt?new Date(prevState.lastApproachEventAt).getTime():0;
  const approachInCooldown=(now-lastApproachEventAt)<STATUS_EVENT_COOLDOWN_MS;
  if(decision.primaryPoi&&isApproaching(decision.primaryPoi,currentPrice)&&!approachInCooldown){
    events.push(tbEvent('IMPORTANT_POI_APPROACHING',{
      direction:decision.primaryPoi.direction,timeframe:decision.primaryPoi.timeframe,price:currentPrice,relatedPoi:decision.primaryPoi.id,
      explanation:`Preis nähert sich ${decision.primaryPoi.type} (${decision.primaryPoi.timeframe}) — SYSTEM_THRESHOLD ${POI_APPROACH_THRESHOLD_PERCENT}%, keine DG-Regel.`
    }));
    approachEventEmitted=true;
  }

  // PRIMARY_TARGET_REACHED — same target price still primary, price now crossed it.
  if(decision.targets&&decision.targets.length&&typeof currentPrice==='number'&&prevActiveSetup&&prevActiveSetup.targets){
    const primary=decision.targets.find(t=>t.priority==='PRIMARY');
    const prevPrimary=prevActiveSetup.targets.find(t=>t.priority==='PRIMARY');
    if(primary&&prevPrimary&&primary.price===prevPrimary.price){
      const reached=primary.direction==='up'?currentPrice>=primary.price:currentPrice<=primary.price;
      if(reached) events.push(tbEvent('PRIMARY_TARGET_REACHED',{direction:decision.direction,price:currentPrice,significance:'high',explanation:`Primary Target erreicht: ${primary.reason}.`}));
    }
  }

  return{events,statusEventEmitted,approachEventEmitted,liquidityApproachEventEmitted};
}

return{
  EVENT_CATEGORY,classifyMarketEvents,diffLiquidityEvents,diffPOIEvents,diffStructureEvents,diffCandlePatternEvents,
  POI_APPROACH_THRESHOLD_PERCENT,CONFIRMATION_RANK,ACTIVE_ENTRY_STATUSES,STATUS_EVENT_COOLDOWN_MS,
  buildActiveSetup,classifyTradingBrainEvents
};

});
