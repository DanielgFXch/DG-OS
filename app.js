
// Semantic Versioning (siehe CHANGELOG.md für die vollständige Historie).
// Bei jedem abgeschlossenen Build hier + in CHANGELOG.md aktualisieren.
const DG_OS_VERSION='0.12.0';

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
const MarketBrain={liveData:null,sessions:null,premiumDiscount:null,htfBias:null,liquidity:null,pois:null};

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

// Module 7: POI Engine — architecture only (v0.12.0)
//
// This is the first of four build stages Daniel asked for, in order:
// 1. Architecture (this build)  2. Detection  3. Bewertung/Scoring
// 4. Connection to the Daniel Decision Engine.
//
// POIs are meant to become DG OS's *memory* — not disposable drawings, but
// objects other modules (Daniel Decision Engine, Alert Engine, Reports,
// Learning Engine) will read the same way they already read
// MarketBrain.liquidity. So the object shape, the type registry, and the
// aggregator wiring all go in now, on day one, even though most detectors
// don't run yet — exactly like LIQUIDITY_LEVEL_DEFS did for Module 6.
//
// createPOI() is the single place that assembles a POI object, so every
// field listed below is guaranteed present (or explicitly null) no matter
// which detector produced it — no detector improvises its own shape.
function createPOI({type,direction,priceHigh,priceLow,timeframe,status,strength,confidence,reason,relatedLiquidity,relatedHTFBias,premiumDiscountZone}){
  return{
    id:`${type}-${timeframe}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    type,                                            // one of POI_TYPE_DEFS ids
    direction:direction||null,                        // 'bullish' | 'bearish' | null
    priceHigh:typeof priceHigh==='number'?priceHigh:null,
    priceLow:typeof priceLow==='number'?priceLow:null,
    timeframe:timeframe||null,
    createdAt:new Date().toISOString(),
    status:status||'fresh',                            // 'fresh' | 'mitigated'
    strength:typeof strength==='number'?strength:null,   // 0-100, reserved for Stage 3 (Bewertung)
    confidence:typeof confidence==='number'?confidence:null, // 0-100, reserved for Stage 3
    reason:reason||null,                                  // why this POI was created
    relatedLiquidity:relatedLiquidity||[],                  // ids into MarketBrain.liquidity
    relatedHTFBias:relatedHTFBias||null,                     // MarketBrain.htfBias.bias snapshot
    premiumDiscountZone:premiumDiscountZone||null             // zone snapshot at creation
  };
}

// Eight detector stubs, one per prepared POI type. Every one of them returns
// [] today — none has the underlying data it needs yet (real per-candle OHLC
// series with swing/structure detection, which the Market Brain doesn't
// fetch at any timeframe below Daily/session ranges). They exist as named,
// individually documented functions rather than one TODO so Stage 2
// (Erkennung) replaces a single function body at a time, in isolation,
// without touching the registry, the aggregator, or the UI.
function detectOrderBlocks(brain){
  // Needs: per-candle OHLC series (H1/M5) + structure/swing detection.
  return[];
}
function detectBreakers(brain){
  // Needs: an invalidated Order Block that price has broken back through.
  return[];
}
function detectFairValueGaps(brain){
  // Needs: 3-candle imbalance detection on a chosen entry timeframe.
  return[];
}
function detectInverseFairValueGaps(brain){
  // Needs: a Fair Value Gap that has been fully closed/inverted.
  return[];
}
function detectMitigationBlocks(brain){
  // Needs: the last down/up-close candle before a displacement move.
  return[];
}
function detectRejectionBlocks(brain){
  // Needs: wick-dominant candle detection at a swing high/low.
  return[];
}
function detectSupplyZones(brain){
  // Needs: base-before-drop candle clustering.
  return[];
}
function detectDemandZones(brain){
  // Needs: base-before-rally candle clustering.
  return[];
}

// The type registry — the actual "architecture prepared for 8 types"
// requirement. `implemented:false` for all eight until each one's detector
// (above) is built out in Stage 2; flipping it to true is the only registry
// change that stage needs to make.
const POI_TYPE_DEFS=[
  {id:'orderBlock',label:'Order Block',category:'Struktur',implemented:false,detect:detectOrderBlocks},
  {id:'breaker',label:'Breaker',category:'Struktur',implemented:false,detect:detectBreakers},
  {id:'fvg',label:'Fair Value Gap',category:'Imbalance',implemented:false,detect:detectFairValueGaps},
  {id:'ifvg',label:'Inverse Fair Value Gap',category:'Imbalance',implemented:false,detect:detectInverseFairValueGaps},
  {id:'mitigationBlock',label:'Mitigation Block',category:'Struktur',implemented:false,detect:detectMitigationBlocks},
  {id:'rejectionBlock',label:'Rejection Block',category:'Struktur',implemented:false,detect:detectRejectionBlocks},
  {id:'supply',label:'Supply Zone',category:'Zone',implemented:false,detect:detectSupplyZones},
  {id:'demand',label:'Demand Zone',category:'Zone',implemented:false,detect:detectDemandZones}
];

// brain is the full MarketBrain object (not just liveData) because real
// detectors will need MarketBrain.liquidity/htfBias/premiumDiscount to fill
// in a POI's relatedLiquidity/relatedHTFBias/premiumDiscountZone fields.
function computePOIEngine(brain){
  return{
    list:POI_TYPE_DEFS.flatMap(def=>def.detect(brain)),
    types:POI_TYPE_DEFS.map(def=>({id:def.id,label:def.label,category:def.category,implemented:def.implemented}))
  };
}

const POI_STATUS_LABEL={fresh:'FRISCH',mitigated:'MITIGATED'};
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
    return`
    <div class="poi-row">
      <span class="poi-label">${typeLabel}<span class="poi-meta">${poi.timeframe||'—'}${poi.direction?' · '+poi.direction:''}</span></span>
      <span class="poi-price">${range}</span>
      <span class="poi-status poi-status-${poi.status}">${POI_STATUS_LABEL[poi.status]||poi.status}</span>
    </div>`;
  }).join('');

  container.innerHTML=listHtml+registryHtml;
}

function refreshDerivedModules(){
  MarketBrain.premiumDiscount=computePremiumDiscount(MarketBrain.liveData);
  MarketBrain.htfBias=computeHTFBias(MarketBrain.liveData);
  MarketBrain.liquidity=computeLiquidityEngine(MarketBrain.liveData);
  MarketBrain.pois=computePOIEngine(MarketBrain);
  renderPremiumDiscount(MarketBrain.premiumDiscount);
  renderHTFBias(MarketBrain.htfBias);
  renderLiquidityEngine(MarketBrain.liquidity);
  renderPOIEngine(MarketBrain.pois);
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
