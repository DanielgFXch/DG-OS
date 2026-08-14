
// Semantic Versioning (siehe CHANGELOG.md für die vollständige Historie).
// Bei jedem abgeschlossenen Build hier + in CHANGELOG.md aktualisieren.
const DG_OS_VERSION='0.19.1';

const state={asia:false,sweep:false,engulf:false};
const $=id=>document.getElementById(id);

const TRADER_NAME='Daniel Gomes';

function greetingWord(localHour){
  if(localHour>=5 && localHour<11) return 'Guten Morgen';
  if(localHour>=11 && localHour<17) return 'Guten Tag';
  if(localHour>=17 && localHour<22) return 'Guten Abend';
  return 'Gute Nacht';
}

// Grobe UTC-Fenster ohne DST-Anpassung – dient nur zur Orientierung, nicht als exakte Marktzeit.
function currentSession(now){
  const day=now.getUTCDay();
  const h=now.getUTCHours();
  const weekendClosed=day===6||(day===0&&h<22)||(day===5&&h>=21);
  if(weekendClosed) return {name:'Markt geschlossen',sub:'Wochenende · nächste Session: Asia'};
  if(h>=13&&h<16) return {name:'London / NY Overlap',sub:'Höchste Liquidität des Tages'};
  if(h>=8&&h<16) return {name:'London Session',sub:'Europäische Session aktiv'};
  if(h>=16&&h<21) return {name:'New York Session',sub:'US-Session aktiv'};
  if(h>=0&&h<8) return {name:'Asia Session',sub:'Asiatische Range bildet sich'};
  return {name:'Late NY / Asia Vorbereitung',sub:'Ruhige Phase vor Asia-Open'};
}

function renderGreeting(){
  const now=new Date();
  $('greetingText').textContent=`${greetingWord(now.getHours())}, ${TRADER_NAME}`;
  const session=currentSession(now);
  $('sessionName').textContent=session.name;
  $('sessionSub').textContent=session.sub;
}

function renderTicker(){
  const now=new Date();
  $('tickerSession').textContent=`SESSION: ${currentSession(now).name.toUpperCase()}`;
  $('tickerClock').textContent=now.toLocaleTimeString('de-DE');
}

const MARKET_DATA_URL='./data/market.json';
const MARKET_STALE_MS=45*60*1000;

function fmtPrice(n){return typeof n==='number'?n.toFixed(2):'—'}

// ---------------------------------------------------------------------------
// Market Brain aggregator
//
// One shared object every module reads from and writes to, instead of each
// module keeping its own private state. This is the foundation the future
// Daniel Brain (Decision/Scenario/Risk Engine) and System layer (Alerts/
// Reports/Learning/Statistics) will read from — see docs/MARKET_BRAIN.md for
// the full module tree. Nothing outside this file should reach into
// data/market.json directly; go through MarketBrain instead.
// ---------------------------------------------------------------------------
const MarketBrain={liveData:null,sessions:null,candles:null,premiumDiscount:null,htfBias:null,liquidity:null,pois:null,structure:null,dgConfidence:null,decision:null,overview:null};

// Module 4: Premium / Discount Engine
//
// Returns a full object per timeframe range, never just a boolean, so any
// future module (Liquidity, POI, Confirmation, ...) can read
// {zone, equilibrium, distanceToEq, ...} directly instead of recomputing
// range math itself. Computed purely client-side from ranges already in
// market.json - no extra API call, and it re-evaluates instantly on every
// WebSocket price tick (see openTdSocket()'s message handler).
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

const PD_TIMEFRAMES=[{id:'daily',name:'Daily'},{id:'weekly',name:'Weekly'},{id:'monthly',name:'Monthly'}];
const PD_ZONE_LABEL={premium:'Premium',discount:'Discount',equilibrium:'Equilibrium'};

function renderPremiumDiscount(pd){
  const container=$('pdRows');
  if(!container) return;
  container.innerHTML=PD_TIMEFRAMES.map(tf=>{
    const z=pd&&pd[tf.id];
    if(!z) return `<div class="row"><span>${tf.name}</span><strong>—</strong></div>`;
    const sign=z.distanceToEqPercent>0?'+':'';
    return `<div class="row"><span>${tf.name}</span><strong class="pd-zone-${z.zone}">${PD_ZONE_LABEL[z.zone]} · ${sign}${z.distanceToEqPercent.toFixed(1)}% zur EQ</strong></div>`;
  }).join('');
}

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
function renderHTFBias(bias){
  const valueEl=$('biasValue');
  if(!valueEl) return;
  const reasonEl=$('biasReason'),confEl=$('biasConfidence'),strengthEl=$('biasStrength');
  if(!bias){
    valueEl.textContent='—';valueEl.className='bias-value';
    reasonEl.textContent='Noch keine Daten.';
    confEl.textContent='—';strengthEl.textContent='—';
    return;
  }
  valueEl.textContent=BIAS_LABEL[bias.bias];
  valueEl.className=`bias-value bias-${bias.bias}`;
  reasonEl.textContent=bias.reason;
  confEl.textContent=`${bias.confidence}%`;
  strengthEl.textContent=`${bias.trendStrength}%`;
}

// Module 6: Liquidity Engine
//
// Tracks the 12 liquidity levels that matter most for XAUUSD (Daily/Weekly/
// Monthly High & Low, Asia/London/New York High & Low) with a real, explicit
// status per level — never just a price. Config-driven, like SESSIONS above:
// adding a 13th level later means adding one entry to LIQUIDITY_LEVEL_DEFS,
// not a new function. Still purely client-side, derived from data already in
// MarketBrain.liveData/sessions - no new API call, re-evaluated on every
// WebSocket price tick via refreshDerivedModules(). No trading decision, no
// alert, no confirmation logic lives here - that belongs to later engines
// that will read MarketBrain.liquidity, per docs/MARKET_BRAIN.md.
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

// Works correctly whether the reference period is still forming (can never
// be "sweeped" by construction - the level itself keeps extending with
// price) or already closed, e.g. a finished session or the prior day's
// range - where a genuine sweep can be observed. No separate "is this period
// closed" check is needed; the price/level comparison alone is honest either
// way.
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
function renderLiquidityEngine(levels){
  const container=$('liquidityRows');
  if(!container) return;
  if(!levels){
    container.innerHTML='<div class="liq-row"><span class="liq-label">Noch keine Daten.</span></div>';
    return;
  }
  container.innerHTML=levels.map(lv=>`
    <div class="liq-row">
      <span class="liq-label">${lv.label}<span class="liq-timeframe">${lv.timeframe}${lv.period?' · '+lv.period:''}</span></span>
      <span class="liq-price">${fmtPrice(lv.price)}</span>
      <span class="liq-status liq-status-${lv.status}">${LIQUIDITY_STATUS_LABEL[lv.status]}</span>
    </div>
  `).join('');
}

// Module 7: POI Engine — Stage 2/4: Erkennung (v0.13.0)
//
// Four build stages, in order: 1. Architecture (v0.12.0, done) 2. Erkennung
// — detection (this build, Fair Value Gap only) 3. Bewertung/Scoring
// 4. Connection to the Daniel Decision Engine.
//
// Hard modularity rule for this stage, straight from Daniel: a detector
// must never know another module exists. Each detector is a pure function
// of its own raw input (here: an array of OHLC candles) and returns raw POI
// candidates — nothing else. It is physically incapable of reaching into
// MarketBrain.liquidity/sessions/htfBias, because it never receives
// MarketBrain at all (see POI_TYPE_DEFS' `input` selectors below, which run
// in the aggregator, not the detector). Correlating a detected zone with
// the rest of the Market Brain — liquidity, session, HTF bias, premium/
// discount — happens exactly once, centrally, in enrichPOIContext(). "Das
// Market Brain bewertet später alles gemeinsam."
//
// createPOI() is still the single place that assembles a POI object, so
// every field is guaranteed present (or explicitly null) regardless of
// which detector — or the enrichment step — produced it.
function createPOI({type,direction,priceHigh,priceLow,timeframe,createdAt,status,strength,confidence,reason,sourceCandle,impulseSize,displacement,structureReference,mitigationDetail,relatedLiquidity,relatedSession,relatedHTFBias,premiumDiscountZone,reaction}){
  return{
    id:`${type}-${timeframe}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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

// Small candle-math utilities shared by any detector that needs them. These
// are plain functions over a candle array — not a module, not state, not a
// dependency on MarketBrain — so sharing them between detectors doesn't
// violate the "no detector may know about another module" rule. They stay
// in the POI Engine's own detection layer.
const POI_ATR_WINDOW=14; // how many preceding candles define "a normal range here"

function localAverageRange(candles,index,window){
  const slice=candles.slice(Math.max(0,index-window),index+1);
  return slice.reduce((sum,c)=>sum+(c.high-c.low),0)/slice.length;
}

function isZoneMitigatedAfter(candles,fromIndex,priceLow,priceHigh){
  return candles.slice(fromIndex).some(c=>c.low<=priceHigh&&c.high>=priceLow);
}

// Fair Value Gap detector — the first real Stage 2 detector.
//
// Classic 3-candle ICT imbalance: for chronological candles c0, c1, c2, a
// bullish FVG exists when c0.high < c2.low (the untraded space between them
// is the gap); a bearish FVG is the mirror case, c0.low > c2.high. c1, the
// middle "displacement" candle whose range actually created the imbalance,
// is stored as the POI's Entstehungskerze.
//
// Confidence is intrinsic only — gap size relative to the average candle
// range of the preceding POI_ATR_WINDOW candles (a simple local ATR). A gap
// as wide as the recent average range scores ~100; a sliver of a gap scores
// low. This says nothing about liquidity/session/bias confluence yet — that
// kind of cross-module weighting is explicitly Stage 3's job.
//
// Status is decided purely from the same candle array: `mitigated` once any
// later candle's range trades back into the gap, `fresh` otherwise.
function detectFairValueGaps(candles){
  if(!Array.isArray(candles)||candles.length<3) return[];
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
      type:'fvg',direction,priceHigh,priceLow,timeframe:'H1',
      createdAt:candleTimeToIso(c1.datetime),
      status,confidence,reason,sourceCandle:c1
    }));
  }
  return zones;
}

// Order Block detector — Stage 2's second detector, and deliberately the
// *architecture* for the future "Daniel Order Block", not a fully tuned SMC
// implementation. It only identifies the zone structurally and fills every
// field a later stage will need; it makes no final trading judgement.
// `structureReference` (BOS/CHOCH) and `mitigationDetail` (a more nuanced
// mitigation flag than plain fresh/mitigated) stay explicitly null here —
// reserved for modules that don't exist yet, never faked.
//
// Definition: for chronological candles obCandle = c[i-1], displacementCandle
// = c[i] — obCandle is a bullish Order Block if it is itself a down-close
// candle immediately followed by a genuine bullish displacement candle
// (range >= OB_DISPLACEMENT_RATIO x the local average, closing in the top
// third of its own range). Bearish is the mirror case. obCandle's own
// high/low becomes the zone — the same "last opposite candle before the
// move" definition every SMC trader starts from, kept intentionally simple
// at this stage: no swing-point or BOS confirmation yet, that belongs to
// Stage 3+ once a real Structure Engine exists.
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

function detectOrderBlocks(candles){
  if(!Array.isArray(candles)||candles.length<2) return[];
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
      type:'orderBlock',direction,priceHigh,priceLow,timeframe:'H1',
      createdAt:candleTimeToIso(obCandle.datetime),
      status,confidence,reason,sourceCandle:obCandle,
      impulseSize,displacement:{candle:displacementCandle,range,avgRange,ratio}
    }));
  }
  return zones;
}

// Six detector stubs still, one per not-yet-built POI type. Every one of
// them returns [] today. They exist as named, individually documented
// functions rather than one TODO so each later build replaces a single
// function body in isolation, without touching the registry, the
// aggregator, or the UI — exactly how detectFairValueGaps and
// detectOrderBlocks were added.
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

// The type registry. `input` is the ONLY thing here that's allowed to know
// MarketBrain's shape — it selects the raw slice a detector is handed. The
// detector itself (see above) never sees anything but that slice. Flipping
// `implemented` to true is the only registry change a finished detector
// needs.
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

// The one and only place a detected POI is correlated with the rest of the
// Market Brain. Runs once per POI, after detection, regardless of which
// detector produced it — a future detector gets this enrichment for free,
// without ever touching MarketBrain itself.
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
// candle closed back outside it, in the zone's own direction. This is
// deliberately NOT called "DG Confirmation" or any other DG term — that
// would imply a defined DG rule, and rules/strategy.md's Confirmation
// chapter is still TODO. It exists only so the DG Overview can tell Daniel,
// in plain text, that a zone he's watching produced a reaction — nothing
// about whether that reaction means anything.
function detectZoneReaction(poi,candles){
  if(!Array.isArray(candles)||poi.priceLow===null||poi.priceHigh===null||!poi.direction) return null;
  const startIndex=candles.indexOf(poi.sourceCandle);
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
function renderPOIEngine(poiEngine){
  const container=$('poiRows');
  if(!container) return;
  const list=(poiEngine&&poiEngine.list)||[];
  const types=(poiEngine&&poiEngine.types)||POI_TYPE_DEFS;

  const registryHtml=types.map(t=>`
    <div class="poi-type-row">
      <span class="poi-type-label">${t.label}<span class="poi-type-category">${t.category}</span></span>
      <span class="poi-type-status ${t.implemented?'poi-type-implemented':''}">${t.implemented?'Aktiv':'Erkennung folgt'}</span>
    </div>
  `).join('');

  if(!list.length){
    container.innerHTML=`<div class="poi-empty">Noch keine POIs erkannt.</div>${registryHtml}`;
    return;
  }

  const listHtml=list.map(poi=>{
    const typeLabel=(POI_TYPE_DEFS.find(d=>d.id===poi.type)||{}).label||poi.type;
    const range=(poi.priceHigh!==null&&poi.priceLow!==null)?`${fmtPrice(poi.priceLow)} – ${fmtPrice(poi.priceHigh)}`:'—';
    const context=[];
    if(poi.relatedSession) context.push(SESSION_LABEL_BY_ID[poi.relatedSession]||poi.relatedSession);
    if(poi.relatedHTFBias) context.push(`Bias ${BIAS_LABEL[poi.relatedHTFBias]||poi.relatedHTFBias}`);
    if(poi.premiumDiscountZone) context.push(PD_ZONE_LABEL[poi.premiumDiscountZone]||poi.premiumDiscountZone);
    if(poi.relatedLiquidity.length) context.push(`${poi.relatedLiquidity.length}x Liquidity`);
    if(poi.displacement) context.push(`${poi.displacement.ratio.toFixed(1)}x Displacement`);
    if(poi.impulseSize!==null) context.push(`Impuls ${poi.impulseSize.toFixed(2)}`);
    return`
    <div class="poi-row">
      <span class="poi-label">${typeLabel}<span class="poi-meta">${poi.timeframe||'—'}${poi.direction?' · '+poi.direction:''}${context.length?' · '+context.join(' · '):''}</span></span>
      <span class="poi-price">${range}${poi.confidence!==null?`<span class="poi-confidence">${poi.confidence}% Confidence</span>`:''}</span>
      <span class="poi-status poi-status-${poi.status}">${POI_STATUS_LABEL[poi.status]||poi.status}</span>
    </div>`;
  }).join('');

  container.innerHTML=listHtml+registryHtml;
}

// Module 9: Structure Engine — pure market structure, v0.17.0
//
// Built after Module 8 (DG Confidence Engine) chronologically, but placed
// here in the file next to Liquidity/POI because it's a Market Brain data
// module, not part of Daniel Brain — module numbers in this codebase track
// build order, not architectural layer (see docs/MARKET_BRAIN.md).
//
// Foundation for DG HTF Bias, the Daniel Decision Engine, the Learning
// Engine, Reports, and Alerts — but this build is exclusively structure
// *detection*. No trading decision, no alert, no DG rule (rules/strategy.md
// chapters are still TODO). Same modularity discipline as the POI Engine:
// the detector only ever sees a plain candle array, never MarketBrain;
// correlating a structure element with Session/HTF Bias happens once,
// centrally, in enrichStructureContext().
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
//
// "Internal" vs "external" structure: rather than fetching a second
// timeframe, both are computed from the same H1 candle series with two
// different fractal window sizes — a narrow window (STRUCTURE_INTERNAL_WINDOW)
// catches minor/frequent swings, a wider one (STRUCTURE_EXTERNAL_WINDOW)
// catches only major swings. A standard, well-known technique — not a DG
// rule, and documented as such.
const STRUCTURE_INTERNAL_WINDOW=1; // 3-candle fractal — minor/internal swings
const STRUCTURE_EXTERNAL_WINDOW=3; // 7-candle fractal — major/external swings

function createStructureElement({type,label,price,createdAt,timeframe,direction,structureType,status,confidence,reason,sourceCandle,brokenLevel,relatedSession,relatedHTFBias}){
  return{
    id:`${type}-${structureType}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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

// Classic 3-(or more)-candle fractal pivot: a candle is a swing high if its
// high exceeds every candle in a `window`-sized neighborhood on both sides,
// and a swing low mirrors that on the low. Ties don't count (strict `<`),
// so a genuinely flat pivot is conservatively skipped rather than guessed at.
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

// Labels each swing point relative to the immediately preceding swing point
// of the same type — HH/LH for highs, HL/LL for lows. The first point of a
// type has no prior to compare against, so its label stays null (honest
// absence, not a guess).
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

function createSwingElement(point,structureType,candles,window){
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
    timeframe:'H1',direction,structureType,status:point.status,confidence,reason,sourceCandle:point.candle
  });
}

function createBreakEvent(type,direction,candle,brokenLevel,candles,index,window,structureType){
  const avgRange=localAverageRange(candles,index,window);
  const confidence=avgRange>0?Math.max(0,Math.min(100,Math.round((Math.abs(candle.close-brokenLevel.price)/avgRange)*100))):0;
  const levelLabel=brokenLevel.type==='swingHigh'?'Swing High':'Swing Low';
  const typeLabel=type==='BOS'?'Break of Structure':'Change of Character';
  const structureLabel=structureType==='internal'?'interne':'externe';
  const reason=`${typeLabel} (${direction}): Close ${candle.close} bei ${candle.datetime} UTC ${direction==='bullish'?'über':'unter'} vorherigem ${levelLabel} ${brokenLevel.price} (${structureLabel} Struktur)`;
  return createStructureElement({
    type,label:null,price:candle.close,
    createdAt:candleTimeToIso(candle.datetime),
    timeframe:'H1',direction,structureType,status:'confirmed',confidence,reason,sourceCandle:candle,
    brokenLevel:{type:brokenLevel.type,price:brokenLevel.price,createdAt:candleTimeToIso(brokenLevel.candle.datetime)}
  });
}

// Walks the candles in order tracking the most recent unbroken swing high/low
// ("key levels") and the currently established bias. A close beyond the key
// level in the direction of the existing (or not-yet-established) bias is a
// BOS (continuation); a close beyond the key level *against* the established
// bias is a CHOCH (character change) and flips the bias. Once a key level is
// broken it's marked 'broken' and never refires — the next swing point of
// that type (whenever confirmed) becomes the new key level.
function detectStructure(candles,window,structureType){
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
      events.push(createBreakEvent(bias==='bearish'?'CHOCH':'BOS','bullish',c,keyHigh,candles,i,window,structureType));
      keyHigh.status='broken';
      bias='bullish';
    }
    if(keyLow&&keyLow.status==='active'&&c.close<keyLow.price){
      events.push(createBreakEvent(bias==='bullish'?'CHOCH':'BOS','bearish',c,keyLow,candles,i,window,structureType));
      keyLow.status='broken';
      bias='bearish';
    }
  }

  const swingElements=[...highs,...lows].map(p=>createSwingElement(p,structureType,candles,window));
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

function renderStructureEngine(engine){
  const internalEl=$('structureInternalBias'),externalEl=$('structureExternalBias');
  const container=$('structureRows');
  if(!container) return;

  if(internalEl){
    const b=engine&&engine.internalBias;
    internalEl.textContent=b?BIAS_LABEL[b]:'—';
    internalEl.className=b?`bias-${b}`:'';
  }
  if(externalEl){
    const b=engine&&engine.externalBias;
    externalEl.textContent=b?BIAS_LABEL[b]:'—';
    externalEl.className=b?`bias-${b}`:'';
  }

  const list=(engine&&engine.list)||[];
  if(!list.length){
    container.innerHTML='<div class="structure-empty">Noch keine Struktur erkannt.</div>';
    return;
  }

  const sorted=[...list].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  container.innerHTML=sorted.map(el=>{
    const label=el.label||STRUCTURE_TYPE_LABEL[el.type];
    const context=[el.structureType==='internal'?'Intern':'Extern'];
    if(el.relatedSession) context.push(SESSION_LABEL_BY_ID[el.relatedSession]||el.relatedSession);
    if(el.relatedHTFBias) context.push(`Bias ${BIAS_LABEL[el.relatedHTFBias]||el.relatedHTFBias}`);
    return`
    <div class="structure-row">
      <span class="structure-label">${label}<span class="structure-meta">${el.timeframe||'—'}${el.direction?' · '+el.direction:''} · ${context.join(' · ')}</span></span>
      <span class="structure-price">${fmtPrice(el.price)}${el.confidence!==null?`<span class="structure-confidence">${el.confidence}% Confidence</span>`:''}</span>
      <span class="structure-status structure-status-${el.status}">${STRUCTURE_STATUS_LABEL[el.status]||el.status}</span>
    </div>`;
  }).join('');
}

// Module 8: DG Confidence Engine — architecture only, v0.15.0
//
// The first piece of the future Daniel Brain, sitting directly above the
// Market Brain. Per the permanent "DG methodology" rule (see CLAUDE.md),
// this is explicitly NOT a trading decision, NOT an alert, NOT an entry —
// and it does not invent a weighting scheme pretending to be Daniel's real
// rules, since those aren't defined yet. What it does today: give every
// Market Brain module a single, uniform way to report "how much clear,
// usable signal do I currently have" — nothing about a trade direction,
// nothing about buy/sell. That's structurally honest with zero DG rules
// defined, and it's exactly what the later Daniel Decision Engine
// (WAIT/WATCH/READY/HIGH PROBABILITY) will consume once those rules exist.
//
// Contribution shape — every module's contribution, uniform regardless of
// source:
// {
//   id, label,        // which module this came from
//   score,              // 0-100, or null if the module has nothing yet
//   status,              // 'positive' | 'negative' | 'missing'
//   reason                // one honest, factual sentence - never a trading opinion
// }
//
// 'positive'  = this module currently has a clear, usable structural signal
// 'negative'  = this module has data, but it's weak/ambiguous/conflicting
// 'missing'   = this module has no usable data yet
//
// Exactly like POI_TYPE_DEFS, CONFIDENCE_CONTRIBUTORS is the whole surface
// a new module needs to touch: one entry, an `input` selector (the only
// place allowed to know MarketBrain's shape) and a `compute` function that
// only ever sees its own module's already-computed output — never another
// module's. The aggregator (computeDGConfidenceEngine) is the one place
// that collects every contribution into confidence/positive/negative/
// missing — same centralization pattern as enrichPOIContext() in Module 7.

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

function renderDGConfidence(engine){
  const scoreEl=$('dgcScore');
  const container=$('dgcFactors');
  if(!scoreEl||!container) return;
  if(!engine){
    scoreEl.textContent='—';
    container.innerHTML='<div class="dgc-empty">Noch keine Daten.</div>';
    return;
  }
  scoreEl.textContent=typeof engine.confidence==='number'?`${engine.confidence}%`:'—';

  const group=(title,items,cls)=>!items.length?'':`
    <div class="dgc-group">
      <div class="dgc-group-title dgc-group-${cls}">${title} (${items.length})</div>
      ${items.map(f=>`<div class="dgc-factor dgc-factor-${cls}"><span>${f.label}</span><span class="dgc-reason">${f.reason||''}</span></div>`).join('')}
    </div>`;

  const html=group('Positive Faktoren',engine.positiveFactors,'positive')
    + group('Negative Faktoren',engine.negativeFactors,'negative')
    + group('Fehlende Faktoren',engine.missingFactors,'missing');

  container.innerHTML=html||'<div class="dgc-empty">Noch keine Daten.</div>';
}

// Module 10: Daniel Decision Engine — architecture only, v0.18.0
//
// Sits at the very top of Daniel Brain, above the DG Confidence Engine —
// the module every future consumer (Telegram Alerts, Reports, Replay, the
// Learning Engine, eventually Auto Trading) will read instead of touching
// Market Brain modules directly. This build is exclusively the
// architecture: the full DecisionState data shape, and an orchestration
// layer that reads HTF Bias, Structure Engine, Liquidity Engine, POI
// Engine, Premium/Discount, and the DG Confidence Engine — with **no DG
// rules, no entries, no alerts, and no invented trading logic**.
//
// The Decision Engine must never own a trading rule. It only reads
// rules/strategy.md (via DG_RULES_DEFINED below, a hand-maintained mirror
// of that file's Status-Übersicht — flip a chapter to true only when
// Daniel has actually filled it in, exactly like POI_TYPE_DEFS.implemented)
// and the mechanical output of the other modules. Since every chapter is
// still TODO, there is currently no rule to apply — so the engine can only
// ever honestly output WAIT, with a reason that says exactly why, never a
// fabricated WATCH/READY/INVALID. That is not a placeholder shortcut; it's
// the correct, honest answer with zero DG rules defined.
//
// DecisionState shape — the single object every future downstream module
// will consume:
// {
//   id, timestamp,
//   state,                  // 'WAIT' | 'WATCH' | 'READY' | 'INVALID'
//   confidence,               // pulled from MarketBrain.dgConfidence, never recomputed here
//   reason,                    // one honest sentence explaining the state
//   supportingModules,          // ids of modules with available data consistent with the current state
//   missingModules,              // ids of modules with no data yet
//   conflictingModules,           // pairs of available directional modules whose signals disagree
//   metConditions,                 // DG rule conditions currently satisfied (empty until rules exist)
//   unmetConditions,                // DG rule conditions currently unsatisfied, with why
//   rulesStatus,                     // snapshot of DG_RULES_DEFINED at evaluation time
//   moduleSnapshot                    // per-module {available, direction, summary} - full context for downstream consumers
// }
const DECISION_STATES={
  WAIT:{label:'WAIT',description:'Keine Trade-Freigabe — Bedingungen fehlen oder Regeln sind nicht definiert.'},
  WATCH:{label:'WATCH',description:'Setup formt sich — noch nicht alle Bedingungen erfüllt.'},
  READY:{label:'READY',description:'Alle definierten DG-Bedingungen erfüllt — Setup ist laut Regelwerk tradebar.'},
  INVALID:{label:'INVALID',description:'Ein zuvor beobachtetes Setup wurde durch die DG-Regeln als ungültig markiert.'}
};

// Hand-maintained mirror of rules/strategy.md's Status-Übersicht. Update
// this the moment - and only the moment - Daniel actually fills in a
// chapter there. Never flip a value ahead of the real file.
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

// The registry. `input` is the only thing here allowed to know
// MarketBrain's shape. A future seventh input module (e.g. once
// Confirmation exists) means one new entry here, nothing else.
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

function renderDecisionEngine(decision){
  const stateEl=$('decisionState');
  const reasonEl=$('decisionReasonText');
  const container=$('decisionFactors');
  if(!stateEl||!container) return;

  if(!decision){
    stateEl.textContent='—';
    stateEl.className='decision-state';
    if(reasonEl) reasonEl.textContent='Noch keine Daten.';
    container.innerHTML='<div class="dgc-empty">Noch keine Daten.</div>';
    return;
  }

  stateEl.textContent=(DECISION_STATES[decision.state]&&DECISION_STATES[decision.state].label)||decision.state;
  stateEl.className=`decision-state decision-state-${decision.state}`;
  if(reasonEl) reasonEl.textContent=decision.reason;

  const group=(title,items,cls)=>!items.length?'':`
    <div class="dgc-group">
      <div class="dgc-group-title dgc-group-${cls}">${title} (${items.length})</div>
      ${items.map(item=>`<div class="dgc-factor dgc-factor-${cls}"><span>${item.label||item.condition||(item.modules?item.modules.join(' / '):'')}</span><span class="dgc-reason">${item.reason||item.summary||''}</span></div>`).join('')}
    </div>`;

  const supportingItems=decision.supportingModules.map(id=>Object.assign({label:decision.moduleSnapshot[id].label},decision.moduleSnapshot[id]));
  const missingItems=decision.missingModules.map(id=>Object.assign({label:decision.moduleSnapshot[id].label},decision.moduleSnapshot[id]));

  const html=group('Verfügbare Module',supportingItems,'positive')
    + group('Fehlende Module',missingItems,'missing')
    + group('Konflikte zwischen Modulen',decision.conflictingModules,'negative')
    + group('Erfüllte Bedingungen',decision.metConditions,'positive')
    + group('Fehlende Bedingungen',decision.unmetConditions,'missing');

  container.innerHTML=html||'<div class="dgc-empty">Noch keine Daten.</div>';
}

// DG Overview — v0.19.0
//
// Not a new detection module — a pure aggregation/UI layer over engines
// that already exist (Liquidity Engine, Structure Engine, POI Engine).
// Built because Daniel asked for a single at-a-glance card: the session/
// day/week high-low levels he checks first, the current structural bias,
// which large H1 zones are still open, and a readable text feed for two
// honestly-labeled mechanical events — a liquidity level being swept, and
// a zone reaction (see detectZoneReaction() above). No new data, no new
// DG rule, no invented weighting.
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

function renderOverview(overview){
  const levelsEl=$('overviewLevels'),structureEl=$('overviewStructure'),zonesEl=$('overviewZones'),eventsEl=$('overviewEvents');
  if(!levelsEl) return;

  const levels=(overview&&overview.quickLevels)||[];
  levelsEl.innerHTML=levels.length?levels.map(lv=>`
    <div class="ov-level">
      <span class="ov-level-label">${lv.label}</span>
      <span class="ov-level-price">${fmtPrice(lv.price)}</span>
      <span class="ov-level-status ov-level-status-${lv.status}">${LIQUIDITY_STATUS_LABEL[lv.status]}</span>
    </div>
  `).join(''):'<div class="ov-empty">Noch keine Daten.</div>';

  if(structureEl){
    const bias=overview&&overview.structureBias,ext=bias&&bias.external,intn=bias&&bias.internal;
    structureEl.innerHTML=`
      <div class="ov-structure-item"><span>Extern</span><strong class="${ext?'bias-'+ext:''}">${ext?BIAS_LABEL[ext]:'—'}</strong></div>
      <div class="ov-structure-item"><span>Intern</span><strong class="${intn?'bias-'+intn:''}">${intn?BIAS_LABEL[intn]:'—'}</strong></div>
    `;
  }

  const zones=(overview&&overview.openZones)||[];
  zonesEl.innerHTML=zones.length?zones.map(z=>{
    const typeLabel=(POI_TYPE_DEFS.find(d=>d.id===z.type)||{}).label||z.type;
    return`
    <div class="ov-zone">
      <span class="ov-zone-label">${typeLabel}<span class="ov-zone-meta">H1 · ${z.direction||'—'}</span></span>
      <span class="ov-zone-price">${fmtPrice(z.priceLow)} – ${fmtPrice(z.priceHigh)}</span>
      <span class="ov-zone-confidence">${z.confidence}%</span>
    </div>`;
  }).join(''):'<div class="ov-empty">Keine offenen Zonen über der Schwelle.</div>';

  const events=(overview&&overview.events)||[];
  eventsEl.innerHTML=events.length?events.map(e=>`<div class="ov-event ov-event-${e.kind}">${e.text}</div>`).join(''):'<div class="ov-empty">Noch keine Meldungen.</div>';
}

function refreshDerivedModules(){
  MarketBrain.premiumDiscount=computePremiumDiscount(MarketBrain.liveData);
  MarketBrain.htfBias=computeHTFBias(MarketBrain.liveData);
  MarketBrain.liquidity=computeLiquidityEngine(MarketBrain.liveData);
  MarketBrain.pois=computePOIEngine(MarketBrain);
  MarketBrain.structure=computeStructureEngine(MarketBrain);
  MarketBrain.dgConfidence=computeDGConfidenceEngine(MarketBrain);
  MarketBrain.decision=computeDecisionEngine(MarketBrain);
  MarketBrain.overview=computeOverview(MarketBrain);
  renderPremiumDiscount(MarketBrain.premiumDiscount);
  renderHTFBias(MarketBrain.htfBias);
  renderLiquidityEngine(MarketBrain.liquidity);
  renderPOIEngine(MarketBrain.pois);
  renderStructureEngine(MarketBrain.structure);
  renderDGConfidence(MarketBrain.dgConfidence);
  renderDecisionEngine(MarketBrain.decision);
  renderOverview(MarketBrain.overview);
}

function setLiveStatus(isLive,label){
  const badge=$('connectionBadge');
  badge.classList.toggle('live',isLive);
  badge.innerHTML=`<span class="live-dot"></span>${isLive?'LIVE':(label||'OFFLINE DEMO')}`;
  const tickerStatus=$('tickerStatus');
  tickerStatus.classList.toggle('live',isLive);
  tickerStatus.textContent=isLive?'LIVE DATA: CONNECTED':`LIVE DATA: ${label?label.toUpperCase():'OFFLINE (DEMO)'}`;
}

let lastPreviousClose=null;

function setChange(pct){
  const changeEl=$('liveChange');
  if(typeof pct==='number'){
    changeEl.textContent=`${pct>0?'+':''}${pct.toFixed(2)}%`;
    changeEl.style.color=pct>0?'var(--green)':pct<0?'var(--red)':'var(--text)';
  } else {
    changeEl.textContent='—';
    changeEl.style.color='';
  }
}

async function loadMarketData(){
  try{
    const res=await fetch(`${MARKET_DATA_URL}?t=${Date.now()}`,{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    const updated=new Date(data.updatedAt);
    const isFresh=(Date.now()-updated.getTime())<MARKET_STALE_MS;

    if(typeof data.previousClose==='number') lastPreviousClose=data.previousClose;

    // Ein aktiver WebSocket-Live-Stream aktualisiert Preis/Change selbst und ist genauer
    // als die alle 15 Min. aktualisierte JSON-Baseline – die hier nicht überschreiben.
    if(!tdStreaming){
      $('livePrice').textContent=fmtPrice(data.price);
      setChange(data.changePercent);
    }
    $('liveOpen').textContent=fmtPrice(data.dailyOpen);
    $('liveHigh').textContent=fmtPrice(data.dailyHigh);
    $('liveLow').textContent=fmtPrice(data.dailyLow);
    $('liveBarDate').textContent=data.barDate||'—';
    if(!tdStreaming) $('liveUpdated').textContent=updated.toLocaleTimeString('de-DE');

    $('weeklyOpen').textContent=fmtPrice(data.weeklyOpen);
    $('weeklyHigh').textContent=fmtPrice(data.weeklyHigh);
    $('weeklyLow').textContent=fmtPrice(data.weeklyLow);
    $('monthlyOpen').textContent=fmtPrice(data.monthlyOpen);
    $('monthlyHigh').textContent=fmtPrice(data.monthlyHigh);
    $('monthlyLow').textContent=fmtPrice(data.monthlyLow);
    updateSessionData(data.sessions);

    MarketBrain.liveData=data;
    MarketBrain.sessions=data.sessions||null;
    MarketBrain.candles=data.candles||null;
    refreshDerivedModules();

    if(!tdStreaming){
      const marketClosed=currentSession(new Date()).name==='Markt geschlossen';
      let hint=isFresh
        ? `Live-Preis von TwelveData · Daily High/Low von der letzten abgeschlossenen Tageskerze (${data.barDate||'—'}).`
        : 'Daten sind veraltet – der Marktdaten-Workflow lief seit über 45 Minuten nicht.';
      if(isFresh&&marketClosed) hint+=' Markt aktuell geschlossen (Wochenende) – der Preis bewegt sich bis Handelsstart evtl. kaum.';
      $('liveHint').textContent=hint;
      setLiveStatus(isFresh,isFresh?null:'Daten veraltet');
    }
  }catch(err){
    if(!tdStreaming) setLiveStatus(false);
  }
}

// Session Engine (Market Brain Module 3) — a reusable model, not three
// copy-pasted card handlers. Every session is just {id, name, startHour,
// endHour}; status/window are pure functions of the clock, High/Low come
// from data/market.json. Future engines (Liquidity, POI, ...) should read
// from this same SESSIONS list/DOM pattern rather than inventing their own.
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

function sessionStatus(session,now){
  const{start,end}=sessionWindowToday(session,now);
  if(now<start) return'upcoming';
  if(now<end) return'active';
  return'closed';
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

function fmtHour(h){return String(h).padStart(2,'0')+':00'}

function renderSessionCards(){
  const grid=$('sessionGrid');
  if(!grid) return;
  grid.innerHTML=SESSIONS.map(s=>`
    <article class="card">
      <div class="section-title"><svg class="ic"><use href="#ic-clock"></use></svg>${s.name}<span class="session-status" id="sessionStatus-${s.id}">—</span></div>
      <div class="metrics">
        <div><span>High</span><strong id="session-${s.id}-high">—</strong></div>
        <div><span>Low</span><strong id="session-${s.id}-low">—</strong></div>
        <div><span>Range</span><strong id="session-${s.id}-range">—</strong></div>
      </div>
      <div class="session-window">${fmtHour(s.startHour)}–${fmtHour(s.endHour)} UTC</div>
    </article>
  `).join('');
}

const SESSION_STATUS_LABEL={upcoming:'Bevorstehend',active:'Aktiv',closed:'Geschlossen'};
function updateSessionStatuses(){
  const now=new Date();
  SESSIONS.forEach(s=>{
    const el=$(`sessionStatus-${s.id}`);
    if(!el) return;
    const status=sessionStatus(s,now);
    el.textContent=SESSION_STATUS_LABEL[status];
    el.className=`session-status status-${status}`;
  });
}

function updateSessionData(sessions){
  SESSIONS.forEach(s=>{
    const sd=(sessions||{})[s.id];
    const highEl=$(`session-${s.id}-high`);
    if(!highEl) return;
    const lowEl=$(`session-${s.id}-low`),rangeEl=$(`session-${s.id}-range`);
    if(sd&&typeof sd.high==='number'&&typeof sd.low==='number'){
      highEl.textContent=fmtPrice(sd.high);
      lowEl.textContent=fmtPrice(sd.low);
      rangeEl.textContent=`$${(sd.high-sd.low).toFixed(2)}`;
    }else{
      highEl.textContent='—';lowEl.textContent='—';rangeEl.textContent='—';
    }
  });
}

// TwelveData WebSocket-Streaming läuft komplett im Browser: der API-Key liegt dadurch
// sichtbar im Frontend-Code. Bewusste Entscheidung von Daniel für echtes Live-Update
// statt eines geheimen Server-seitigen Keys mit nur alle 5 Min. Aktualisierung.
const TD_WS_URL='wss://ws.twelvedata.com/v1/quotes/price';
const TD_HEARTBEAT_MS=10000;
const TD_MAX_RECONNECTS=6;
let tdSocket=null;
let tdHeartbeatTimer=null;
let tdReconnectAttempts=0;
let tdStreaming=false;

function setStreamStatus(text){$('tdStatus').textContent=text}

function stopTdHeartbeat(){
  if(tdHeartbeatTimer){clearInterval(tdHeartbeatTimer);tdHeartbeatTimer=null}
}

function openTdSocket(key){
  setStreamStatus('Verbinde…');
  const ws=new WebSocket(`${TD_WS_URL}?apikey=${encodeURIComponent(key)}`);
  tdSocket=ws;

  ws.addEventListener('open',()=>{
    tdReconnectAttempts=0;
    ws.send(JSON.stringify({action:'subscribe',params:{symbols:'XAU/USD'}}));
    stopTdHeartbeat();
    tdHeartbeatTimer=setInterval(()=>{
      if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({action:'heartbeat'}));
    },TD_HEARTBEAT_MS);
  });

  ws.addEventListener('message',e=>{
    let msg;
    try{ msg=JSON.parse(e.data) }catch(err){ return }

    if(msg.event==='subscribe-status'){
      if(msg.status==='ok'){
        tdStreaming=true;
        setStreamStatus('Live-Stream verbunden · XAU/USD');
        setLiveStatus(true);
        $('liveHint').textContent='Live-Stream aktiv (TwelveData WebSocket) – Preis aktualisiert sich in Echtzeit.';
      } else {
        setStreamStatus(`Fehler: ${msg.status||'Subscribe fehlgeschlagen'}`);
      }
      return;
    }

    if(msg.event==='price' && typeof msg.price==='number'){
      tdStreaming=true;
      $('livePrice').textContent=fmtPrice(msg.price);
      $('liveUpdated').textContent=new Date().toLocaleTimeString('de-DE');
      if(typeof lastPreviousClose==='number' && lastPreviousClose>0){
        setChange(((msg.price-lastPreviousClose)/lastPreviousClose)*100);
      }
      setLiveStatus(true);
      // Premium/Discount + HTF Bias re-evaluate instantly on every live tick,
      // not just every 15 min - they only need MarketBrain.liveData.price.
      if(MarketBrain.liveData){
        MarketBrain.liveData=Object.assign({},MarketBrain.liveData,{price:msg.price});
        refreshDerivedModules();
      }
    }
  });

  ws.addEventListener('close',()=>{
    stopTdHeartbeat();
    if(tdSocket!==ws) return;
    tdStreaming=false;
    tdReconnectAttempts++;
    if(tdReconnectAttempts<=TD_MAX_RECONNECTS){
      setStreamStatus(`Getrennt – versuche erneut (${tdReconnectAttempts}/${TD_MAX_RECONNECTS})…`);
      setTimeout(()=>{ if(tdSocket===ws) openTdSocket(key) },Math.min(3000*tdReconnectAttempts,30000));
    } else {
      setStreamStatus('Live-Stream getrennt. Bitte manuell erneut verbinden.');
      loadMarketData();
    }
  });

  ws.addEventListener('error',()=>{ try{ws.close()}catch(err){} });
}

function connectTwelveDataStream(key){
  if(!key) return;
  localStorage.setItem('dgos.tdKey',key);
  tdReconnectAttempts=0;
  if(tdSocket){ const old=tdSocket; tdSocket=null; try{old.close()}catch(err){} }
  openTdSocket(key);
}

$('tdConnect').addEventListener('click',()=>{
  connectTwelveDataStream($('tdKey').value.trim());
});

const savedTdKey=localStorage.getItem('dgos.tdKey')||'';
if(savedTdKey){
  $('tdKey').value=savedTdKey;
  connectTwelveDataStream(savedTdKey);
}

function events(items){
  $('events').innerHTML=items.map(x=>`<div class="event ev-${x.type||'default'}"><time>${x.t}</time><div><strong>${x.title}</strong><span>${x.desc}</span></div></div>`).join('');
}

// DG OS entscheidet nie durch Raten: jedes Kriterium ist explizit, das Ergebnis
// ist immer WAIT/WATCH/READY mit Begründung. Sobald echte Marktdaten und Daniels
// Regelwerk (rules/strategy.md) angebunden sind, ersetzen echte Kriterien diese
// Platzhalter-Checks 1:1, ohne die Tier-Logik selbst zu ändern.
function computeDecision(){
  const checks=[
    {label:'Preis im Premium',met:true},
    {label:'Bearisher POI (H1 OB + M5 FVG)',met:true},
    {label:'Asia High gesweept',met:state.sweep},
    {label:'Bearish Engulfing (M5)',met:state.engulf},
    {label:'Displacement',met:state.engulf}
  ];
  const metCount=checks.filter(c=>c.met).length;
  const total=checks.length;
  const tier=metCount===total?'ready':(state.sweep?'watch':'wait');
  return {checks,metCount,total,tier};
}

const CONF_RING_CIRCUMFERENCE=226.19;
const TIER_COLOR={wait:'#f2b544',watch:'#2fd9f2',ready:'#ff4d6d'};
const TIER_ICON={wait:'ic-clock',watch:'ic-eye',ready:'ic-trend-down'};
function setConfidence(pct,tier){
  $('confidence').textContent=`${pct}%`;
  const ring=$('confRing');
  ring.style.stroke=TIER_COLOR[tier]||TIER_COLOR.wait;
  ring.style.strokeDashoffset=CONF_RING_CIRCUMFERENCE*(1-pct/100);
}
function setAction(tier,label){
  $('action').className=`action ${tier}`;
  $('action').innerHTML=`<svg class="ic ic-action"><use href="#${TIER_ICON[tier]}"></use></svg><span>${label}</span>`;
}

function render(){
  $('asiaHigh').textContent=state.asia?'4302.00':'—';
  $('asiaLow').textContent=state.asia?'4290.00':'—';
  $('asiaRange').textContent=state.asia?'$12.00':'—';

  $('cSweep').className=state.sweep?'sell':'';
  $('sweepTxt').textContent=state.sweep?'Ja · stark':'Fehlt';
  $('cEngulf').className=state.engulf?'sell':'';
  $('engulfTxt').textContent=state.engulf?'M5 bestätigt':'Fehlt';
  $('cDisp').className=state.engulf?'sell':'';
  $('dispTxt').textContent=state.engulf?'Stark':'Fehlt';

  const {checks,metCount,total,tier}=computeDecision();
  const unmet=checks.filter(c=>!c.met).map(c=>c.label);

  if(tier==='ready'){
    setAction('ready','SELL READY');
    setConfidence(94,'ready');
    $('tradeType').textContent='Countertrend Scalp';
    $('opportunity').textContent='Countertrend Sell';
    $('intradayTarget').textContent='Asia Low';
    $('decisionReason').textContent=`${metCount}/${total} Kriterien erfüllt · Deshalb: READY`;
  } else if(tier==='watch'){
    setAction('watch','SELL WATCH');
    setConfidence(76,'watch');
    $('tradeType').textContent='Bearishe Confirmation fehlt';
    $('opportunity').textContent='Sell beobachten';
    $('intradayTarget').textContent='Asia Low';
    $('decisionReason').textContent=`${metCount}/${total} Kriterien erfüllt · Fehlt: ${unmet.join(', ')} · Deshalb: WAIT`;
  } else {
    setAction('wait','WAIT');
    setConfidence(state.asia?58:54,'wait');
    $('tradeType').textContent='Noch keine Trade-Freigabe';
    $('opportunity').textContent='Keine';
    $('intradayTarget').textContent='—';
    $('decisionReason').textContent=`${metCount}/${total} Kriterien erfüllt · Fehlt: ${unmet.join(', ')} · Deshalb: WAIT`;
  }

  const ev=[];
  if(state.asia) ev.push({t:'06:00',type:'session',title:'Asia Session beendet',desc:'High 4302.00 · Low 4290.00 · Range $12.00'});
  if(state.sweep) ev.push({t:'08:47',type:'liquidity',title:'Asia High gesweept',desc:'Signifikanter Wick + Gegenreaktion · POI aktiv'});
  if(state.engulf) {
    ev.push({t:'08:49',type:'confirmation',title:'Bearish Engulfing',desc:'M5 Confirmation + Displacement'});
    ev.push({t:'08:49',type:'signal',title:'SELL READY',desc:'Countertrend Scalp · Ziel Asia Low · HTF bleibt bullish'});
  }
  if(!ev.length) ev.push({t:'—',title:'Noch kein Event',desc:'DG OS wartet auf Marktdaten.'});
  events(ev);
  maybeAutoSend();
}
document.querySelectorAll('[data-step]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const s=btn.dataset.step;
    if(s==='asia') state.asia=true;
    if(s==='sweep'){state.asia=true;state.sweep=true}
    if(s==='engulf'){state.asia=true;state.sweep=true;state.engulf=true}
    if(s==='reset'){state.asia=false;state.sweep=false;state.engulf=false;lastAutoSendKey=''}
    render();
  })
});
function briefingText(){
  const {tier}=computeDecision();
  const headline=tier==='ready'?'🔴 SELL READY':tier==='watch'?'🟠 SELL WATCH':'🟡 WAIT';
  return `🧠 DG OS

${headline}
${$('decisionReason').textContent}
Confidence: ${$('confidence').textContent}

🌍 Market Plan
HTF: Bullish
Primary Target: Daily Buyside

💧 Event
${state.sweep?'Asia High gesweept':'Noch kein signifikanter Sweep'}

⚡ Confirmation
${state.engulf?'M5 Bearish Engulfing + Displacement':'Fehlt'}

🎯 Trade Plan
Typ: ${state.sweep&&state.engulf?'Countertrend Scalp':'—'}
Ziel: ${state.sweep?'Asia Low':'—'}

💡 Warum?
${state.sweep&&state.engulf?'Asia High Sweep + bearish Confirmation im POI. HTF bleibt bullish.':'DG OS wartet auf die nächste valide Bestätigung.'}`;
}
$('previewBriefing').addEventListener('click',()=>{
  const box=$('briefing');
  box.classList.toggle('hidden');
  box.textContent=briefingText();
});

const tg={
  token:localStorage.getItem('dgos.tgToken')||'',
  chatId:localStorage.getItem('dgos.tgChatId')||'',
  autoSend:localStorage.getItem('dgos.tgAutoSend')==='1'
};
$('tgToken').value=tg.token;
$('tgChatId').value=tg.chatId;
$('tgAutoSend').checked=tg.autoSend;
$('tgSend').disabled=!(tg.token&&tg.chatId);

function setTelegramStatus(text){$('telegramStatus').textContent=text}

async function testTelegramConnection(token){
  const res=await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data=await res.json();
  if(!data.ok) throw new Error(data.description||'Ungültiger Token');
  return data.result;
}

async function sendTelegramMessage(token,chatId,text){
  const res=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text})
  });
  const data=await res.json();
  if(!data.ok) throw new Error(data.description||'Senden fehlgeschlagen');
  return data.result;
}

$('tgSave').addEventListener('click',async()=>{
  tg.token=$('tgToken').value.trim();
  tg.chatId=$('tgChatId').value.trim();
  tg.autoSend=$('tgAutoSend').checked;
  localStorage.setItem('dgos.tgToken',tg.token);
  localStorage.setItem('dgos.tgChatId',tg.chatId);
  localStorage.setItem('dgos.tgAutoSend',tg.autoSend?'1':'0');
  $('tgSend').disabled=!(tg.token&&tg.chatId);
  if(!tg.token){setTelegramStatus('Nicht verbunden');return}
  setTelegramStatus('Verbinde…');
  try{
    const bot=await testTelegramConnection(tg.token);
    setTelegramStatus(`Verbunden · @${bot.username}`);
  }catch(err){
    setTelegramStatus(`Fehler: ${err.message}`);
  }
});

$('tgSend').addEventListener('click',async()=>{
  if(!tg.token||!tg.chatId) return;
  const btn=$('tgSend');
  btn.disabled=true;
  const prevLabel=btn.textContent;
  btn.textContent='Sende…';
  try{
    await sendTelegramMessage(tg.token,tg.chatId,briefingText());
    btn.textContent='Gesendet ✓';
  }catch(err){
    btn.textContent='Fehler beim Senden';
    setTelegramStatus(`Fehler: ${err.message}`);
  }finally{
    setTimeout(()=>{btn.textContent=prevLabel;btn.disabled=false},1800);
  }
});

let lastAutoSendKey='';
async function maybeAutoSend(){
  if(!(tg.autoSend&&tg.token&&tg.chatId&&state.sweep&&state.engulf)) return;
  const key=`${state.sweep}-${state.engulf}`;
  if(key===lastAutoSendKey) return;
  lastAutoSendKey=key;
  try{
    await sendTelegramMessage(tg.token,tg.chatId,briefingText());
  }catch(err){
    setTelegramStatus(`Auto-Senden fehlgeschlagen: ${err.message}`);
  }
}

$('appVersion').textContent=`v${DG_OS_VERSION}`;
renderSessionCards();
document.querySelectorAll('.card').forEach((el,i)=>{el.style.animationDelay=`${Math.min(i*0.05,0.4)}s`});

if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
render();
renderGreeting();
renderTicker();
updateSessionStatuses();
loadMarketData();
setInterval(renderGreeting,60000);
setInterval(renderTicker,1000);
setInterval(updateSessionStatuses,30000);
setInterval(loadMarketData,60000);
if(tg.token){testTelegramConnection(tg.token).then(bot=>setTelegramStatus(`Verbunden · @${bot.username}`)).catch(()=>setTelegramStatus('Nicht verbunden'))}
