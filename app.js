
// Semantic Versioning (siehe CHANGELOG.md für die vollständige Historie).
// Bei jedem abgeschlossenen Build in package.json + CHANGELOG.md aktualisieren.
//
// package.json ist seit v0.21.0 die einzige Quelle der Versionsnummer — sie
// wird hier per fetch() geladen (loadVersion(), siehe unten), nicht mehr als
// String im Code dupliziert. Die Node-Seite (scripts/ingest.js) liest
// dieselbe Datei per require(), damit Browser und Server nie unterschiedliche
// Versionen zeigen können.
let DG_OS_VERSION=null;

// ---------------------------------------------------------------------------
// This file is DOM/rendering + app-only logic (greeting, sessions clock,
// Alpha Simulation, Telegram, TwelveData WebSocket streaming). Every pure
// Market Brain computation (Premium/Discount, HTF Bias, Liquidity Engine,
// POI Engine, Structure Engine, DG Confidence Engine, Daniel Decision
// Engine, DG Overview) moved to marketBrain.js in v0.20.0 (Phase 1 — Core
// Foundation) so the exact same logic can run in the browser AND in the
// Node ingest script (scripts/ingest.js) without drifting apart. index.html
// loads marketBrain.js before this file, so every function/constant that
// used to be defined here (computePremiumDiscount, LIQUIDITY_STATUS_LABEL,
// fmtPrice, ...) is still available as a plain global — no call site below
// had to change. See docs/MARKET_BRAIN.md for the full module writeup.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Market Brain aggregator
//
// One shared object every module reads from and writes to, instead of each
// module keeping its own private state. Shape comes from
// createMarketBrainState() (marketBrain.js) so the browser and the Node
// ingest script always agree on it. Nothing outside this file should reach
// into data/market.json directly; go through MarketBrain instead.
// ---------------------------------------------------------------------------
const MarketBrain=createMarketBrainState();

const PD_TIMEFRAMES=[{id:'daily',name:'Daily'},{id:'weekly',name:'Weekly'},{id:'monthly',name:'Monthly'}];

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

const REPORT_STATUS_CLASS={'WAIT':'wait','WATCH BUY':'watch','WATCH SELL':'watch','BULLISH SCENARIO':'bullish','BEARISH SCENARIO':'bearish'};

// DG Trading Brain V1 — only ever populated from a reachable Always-On
// Server's real GET /api/brain/XAUUSD response (tradingBrainState, set in
// pollMarketServer()). No local/offline computation, no fallback numbers —
// if the server isn't connected, this card says so honestly instead of
// showing anything.
function renderTradingBrain(brain){
  const statusEl=$('brainStatus'),biasEl=$('brainBias'),confEl=$('brainConfidence');
  const buyEl=$('brainBuyPOIs'),sellEl=$('brainSellPOIs'),liqEl=$('brainLiquidity'),targetsEl=$('brainTargets'),summaryEl=$('brainSummary');
  if(!statusEl) return;

  if(!brain||!brain.report){
    statusEl.textContent='Nicht verbunden';statusEl.className='brain-status';
    biasEl.textContent='—';biasEl.className='bias-value';
    confEl.textContent='—';
    const emptyMsg='<div class="poi-empty">Kein Always-On Server verbunden — siehe „XAUUSD Live" Karte.</div>';
    buyEl.innerHTML=emptyMsg;sellEl.innerHTML=emptyMsg;
    liqEl.innerHTML='<div class="liq-row"><span class="liq-label">Nicht verbunden.</span></div>';
    targetsEl.innerHTML='<div class="poi-empty">Nicht verbunden.</div>';
    summaryEl.textContent='Verbinde einen Always-On Server (siehe „XAUUSD Live" Karte), um den DG Trading Brain V1 Report zu sehen.';
    return;
  }

  const report=brain.report,htf=brain.htfContext;
  statusEl.textContent=report.status;
  statusEl.className=`brain-status brain-status-${REPORT_STATUS_CLASS[report.status]||''}`;
  biasEl.textContent=htf.overallBias?htf.overallBias.toUpperCase():'—';
  biasEl.className=`bias-value ${htf.overallBias?'bias-'+htf.overallBias:''}`;
  confEl.textContent=typeof htf.confidence==='number'?`${htf.confidence}%`:'—';

  const poiRow=p=>`
    <div class="poi-row">
      <span class="poi-label">${p.type==='fvg'?'FVG':'Order Block'}<span class="poi-meta">${p.timeframe}</span></span>
      <span class="poi-price">${p.range}<span class="poi-confidence">Score ${p.score} · ${p.quality}</span></span>
    </div>`;
  buyEl.innerHTML=(report.bestBuyPOIs&&report.bestBuyPOIs.length)?report.bestBuyPOIs.map(poiRow).join(''):'<div class="poi-empty">Keine Buy-POIs erkannt.</div>';
  sellEl.innerHTML=(report.bestSellPOIs&&report.bestSellPOIs.length)?report.bestSellPOIs.map(poiRow).join(''):'<div class="poi-empty">Keine Sell-POIs erkannt.</div>';

  liqEl.innerHTML=(report.keyLiquidity&&report.keyLiquidity.length)
    ?report.keyLiquidity.map(text=>`<div class="liq-row"><span class="liq-label">${text}</span></div>`).join('')
    :'<div class="liq-row"><span class="liq-label">Aktuell keine auffälligen Level.</span></div>';

  const targets=(brain.targets||[]).slice(0,6);
  targetsEl.innerHTML=targets.length?targets.map(t=>`
    <div class="poi-row">
      <span class="poi-label">${t.direction==='up'?'▲':'▼'} ${t.reason}<span class="poi-meta">${t.timeframe}</span></span>
      <span class="poi-price">${fmtPrice(t.price)}</span>
    </div>`).join(''):'<div class="poi-empty">Keine Targets erkannt.</div>';

  summaryEl.textContent=report.summary||'';
}

// Runs every derived module (marketBrain.js's computeAllDerivedModules, the
// same function the Node ingest script calls) and re-renders every card.
// Called after every 15-min JSON refresh AND every WebSocket price tick.
function refreshDerivedModules(){
  Object.assign(MarketBrain,computeAllDerivedModules(MarketBrain));
  renderPremiumDiscount(MarketBrain.premiumDiscount);
  renderHTFBias(MarketBrain.htfBias);
  renderLiquidityEngine(MarketBrain.liquidity);
  renderPOIEngine(MarketBrain.pois);
  renderStructureEngine(MarketBrain.structure);
  renderDGConfidence(MarketBrain.dgConfidence);
  renderDecisionEngine(MarketBrain.decision);
  renderOverview(MarketBrain.overview);
}

// Every "is this live" indicator in the app — the header badge, the ticker
// line, and the System Status card below — is driven by this one function,
// fed by the SAME computeDataFreshness() result (marketBrain.js). Before
// v0.21.0 the header badge used its own 45-minute binary check, separate
// from any age-aware logic; that could show "LIVE" on data that was, say,
// 40 minutes old. Daniel's explicit instruction: never show LIVE off a
// stale timestamp. One status, computed once per tick, drives every badge.
const FRESHNESS_BADGE_LABEL={LIVE:'LIVE',DELAYED:'DELAYED',STALE:'STALE',NO_DATA:'OFFLINE DEMO'};
function setLiveStatus(status){
  const badge=$('connectionBadge');
  const isLive=status==='LIVE';
  badge.className=`badge status-${status}`;
  badge.innerHTML=`<span class="live-dot"></span>${FRESHNESS_BADGE_LABEL[status]||status}`;
  const tickerStatus=$('tickerStatus');
  tickerStatus.className=`ticker-item ticker-warn status-${status}`;
  tickerStatus.textContent=isLive?'LIVE DATA: CONNECTED':`LIVE DATA: ${(FRESHNESS_BADGE_LABEL[status]||status)}`;
}

let lastPreviousClose=null;
let lastMarketUpdateAt=null; // Date|string|null — set from data/market.json's updatedAt (baseline) or WS tick receipt time (streaming), never fabricated

// The timezone label is the browser's OWN resolved timezone, not a
// hardcoded "Europe/Zurich" — correct on Daniel's own device (which
// resolves to Europe/Zurich), and still honest if DG OS is ever opened
// from a device in a different timezone, rather than silently mislabeling.
const DISPLAY_TIMEZONE=(function(){
  try{ return Intl.DateTimeFormat().resolvedOptions().timeZone||'—' }catch(err){ return'—' }
})();

// Always-On Market Server (optional) — Phase D of the Always-On Market
// Server build. Nothing is hosted yet (see docs/ALWAYS_ON_HOSTING.md), so
// this is off by default and the dashboard behaves exactly as before
// (15-min JSON baseline + optional browser WebSocket) until Daniel points
// it at a real, reachable server. Same UX pattern as the existing
// TwelveData WS key field: a URL saved in localStorage, never committed.
let marketServerUrl=localStorage.getItem('dgos.marketServerUrl')||'';
let marketServerState=null;      // last successful /api/market/XAUUSD response, or null
let marketServerReachable=false;
let tradingBrainState=null;      // last successful /api/brain/XAUUSD response, or null — DG Trading Brain V1, only reachable via the Always-On Server

async function pollMarketServer(){
  if(!marketServerUrl){ marketServerReachable=false; marketServerState=null; tradingBrainState=null; renderTradingBrain(tradingBrainState); return; }
  try{
    const base=marketServerUrl.replace(/\/$/,'');
    const res=await fetch(`${base}/api/market/XAUUSD`,{cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    marketServerState=await res.json();
    marketServerReachable=true;
    $('marketServerStatus').textContent=`Verbunden mit Always-On Server · ${marketServerUrl}`;
    // Separate, independent fetch — the Trading Brain V1 endpoint is new
    // (this build) and older Always-On Server deployments won't have it
    // yet, so a failure here must never take down the market-state poll
    // above; it just leaves the Trading Brain card honestly empty.
    try{
      const brainRes=await fetch(`${base}/api/brain/XAUUSD`,{cache:'no-store'});
      tradingBrainState=brainRes.ok?await brainRes.json():null;
    }catch(brainErr){
      tradingBrainState=null;
    }
  }catch(err){
    marketServerReachable=false;
    marketServerState=null;
    tradingBrainState=null;
    $('marketServerStatus').textContent=`Always-On Server nicht erreichbar (${err.message}) — Dashboard nutzt Fallback (15-Min-Feed).`;
  }
  renderFreshness();
  renderTradingBrain(tradingBrainState);
}

function connectMarketServer(url){
  marketServerUrl=url.trim();
  localStorage.setItem('dgos.marketServerUrl',marketServerUrl);
  if(!marketServerUrl){
    marketServerReachable=false;marketServerState=null;tradingBrainState=null;
    $('marketServerStatus').textContent='Kein Always-On Server konfiguriert · nutzt den 15-Min-Feed + optionalen Browser-WebSocket.';
    renderFreshness();
    renderTradingBrain(tradingBrainState);
    return;
  }
  pollMarketServer();
}

$('marketServerConnect').addEventListener('click',()=>connectMarketServer($('marketServerUrl').value));
if(marketServerUrl) $('marketServerUrl').value=marketServerUrl;

// Data Freshness + Version + Price/Candle Source — Phase "Version &
// Freshness" (v0.21.0) + Phase D (Always-On Market Server). Ticks every
// second (see setInterval below) so the age labels count up live. Price and
// candle freshness are tracked SEPARATELY, per Daniel's explicit
// instruction — a WebSocket price tick and a REST candle refresh are
// genuinely different events with different natural cadences, and
// collapsing them into one "Data Status" hid that distinction.
//
// Two sources, chosen automatically: if a reachable Always-On Server is
// configured, its own freshness computation (server/marketState.js's
// getFreshness(), reusing the exact same computeDataFreshness() this file
// uses) is authoritative — real WS ticks, real REST refreshes. Otherwise,
// falls back to exactly today's behavior: the local computeDataFreshness()
// against the 15-min JSON baseline / optional browser WebSocket, with
// price and candle freshness reported as identical (both genuinely come
// from the same fetch in that mode — reporting them as different would be
// fabricating a distinction that doesn't exist yet).
function renderFreshness(){
  let price,candle,priceSourceLabel,candleSourceLabel,displayPrice;

  if(marketServerReachable&&marketServerState&&marketServerState.freshness){
    const f=marketServerState.freshness;
    price={status:f.priceStatus,ageLabel:f.priceDataAgeLabel};
    candle={status:f.candleStatus,ageLabel:f.candleDataAgeLabel};
    priceSourceLabel='TwelveData WebSocket (Server)';
    candleSourceLabel='TwelveData REST (Server)';
    displayPrice=(marketServerState.quote&&typeof marketServerState.quote.price==='number')?marketServerState.quote.price:null;
    // The server already computes isPriceLive honestly (WS actually
    // connected AND recent) — trust it directly rather than re-deriving.
    if(!f.isPriceLive&&price.status==='LIVE') price={status:'DELAYED',ageLabel:price.ageLabel};
  } else {
    const fresh=computeDataFreshness(lastMarketUpdateAt,tdStreaming);
    price={status:fresh.status,ageLabel:formatDataAge(fresh.ageSeconds)};
    candle=price; // same underlying fetch in fallback mode — an honest, not fabricated, equality
    priceSourceLabel=lastMarketUpdateAt?(tdStreaming?'TwelveData (WebSocket)':'TwelveData (15-Min-Feed)'):'—';
    candleSourceLabel=lastMarketUpdateAt?'TwelveData (15-Min-Feed)':'—';
    displayPrice=(MarketBrain.liveData&&typeof MarketBrain.liveData.price==='number')?MarketBrain.liveData.price:null;
  }

  setLiveStatus(price.status);

  const priceEl=$('statusPrice'),priceStateEl=$('statusPriceState'),tzEl=$('statusTimezone'),
        lastPriceEl=$('statusLastPrice'),lastCandleEl=$('statusLastCandle'),
        priceSourceEl=$('statusPriceSource'),candleSourceEl=$('statusCandleSource');
  if(!lastPriceEl) return;

  priceEl.textContent=fmtPrice(displayPrice);
  priceStateEl.textContent=price.status.replace('_',' ');
  priceStateEl.className=`status-pill status-pill-${price.status}`;
  tzEl.textContent=DISPLAY_TIMEZONE;
  lastPriceEl.textContent=price.ageLabel;
  lastCandleEl.textContent=candle.ageLabel;
  priceSourceEl.textContent=priceSourceLabel;
  candleSourceEl.textContent=candleSourceLabel;
}

function renderVersion(version){
  DG_OS_VERSION=version;
  const label=`v${version}`;
  $('appVersion').textContent=label;
  const statusVersionEl=$('statusVersion');
  if(statusVersionEl) statusVersionEl.textContent=label;
}

// package.json is the single source of truth for the version (see the file
// header comment) — fetched once at startup, never duplicated as a string
// literal elsewhere in this file.
async function loadVersion(){
  try{
    const res=await fetch('./package.json',{cache:'no-store'});
    const pkg=await res.json();
    renderVersion(pkg.version||'0.0.0');
  }catch(err){
    renderVersion('0.0.0');
  }
}

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
      lastMarketUpdateAt=data.updatedAt;
      const fresh=computeDataFreshness(lastMarketUpdateAt,false);
      const marketClosed=currentSession(new Date()).name==='Markt geschlossen';
      let hint;
      if(fresh.status==='LIVE'){
        hint=`Live-Preis von TwelveData · Daily High/Low von der letzten abgeschlossenen Tageskerze (${data.barDate||'—'}).`;
      } else if(fresh.status==='DELAYED'){
        hint=`Daten ${formatDataAge(fresh.ageSeconds)} alt – der 15-Minuten-Marktdaten-Workflow aktualisiert bald erneut.`;
      } else {
        hint='Daten sind veraltet – der Marktdaten-Workflow lief seit längerem nicht mehr.';
      }
      if(fresh.status!=='STALE'&&marketClosed) hint+=' Markt aktuell geschlossen (Wochenende) – der Preis bewegt sich bis Handelsstart evtl. kaum.';
      $('liveHint').textContent=hint;
    }
    renderFreshness();
  }catch(err){
    renderFreshness();
  }
}

function fmtHour(h){return String(h).padStart(2,'0')+':00'}

function sessionStatus(session,now){
  const{start,end}=sessionWindowToday(session,now);
  if(now<start) return'upcoming';
  if(now<end) return'active';
  return'closed';
}

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
        renderFreshness(); // subscribed, not necessarily "live" yet — honest until the first tick actually arrives
        $('liveHint').textContent='Live-Stream aktiv (TwelveData WebSocket) – Preis aktualisiert sich in Echtzeit.';
      } else {
        setStreamStatus(`Fehler: ${msg.status||'Subscribe fehlgeschlagen'}`);
      }
      return;
    }

    if(msg.event==='price' && typeof msg.price==='number'){
      tdStreaming=true;
      lastMarketUpdateAt=new Date(); // TD's WS price message carries no usable timestamp of its own — receipt time is the honest proxy, same as liveUpdated below
      $('livePrice').textContent=fmtPrice(msg.price);
      $('liveUpdated').textContent=lastMarketUpdateAt.toLocaleTimeString('de-DE');
      if(typeof lastPreviousClose==='number' && lastPreviousClose>0){
        setChange(((msg.price-lastPreviousClose)/lastPreviousClose)*100);
      }
      renderFreshness();
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
    renderFreshness(); // threshold set changes back to 'baseline' the moment streaming stops
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

loadVersion();
renderSessionCards();
document.querySelectorAll('.card').forEach((el,i)=>{el.style.animationDelay=`${Math.min(i*0.05,0.4)}s`});

if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
render();
renderGreeting();
renderTicker();
renderFreshness();
renderTradingBrain(tradingBrainState);
updateSessionStatuses();
loadMarketData();
if(marketServerUrl) pollMarketServer();
setInterval(renderGreeting,60000);
setInterval(renderTicker,1000);
setInterval(renderFreshness,1000);
setInterval(()=>{ if(marketServerUrl) pollMarketServer(); },3000);
setInterval(updateSessionStatuses,30000);
setInterval(loadMarketData,60000);
if(tg.token){testTelegramConnection(tg.token).then(bot=>setTelegramStatus(`Verbunden · @${bot.username}`)).catch(()=>setTelegramStatus('Nicht verbunden'))}
