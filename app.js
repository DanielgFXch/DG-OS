
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
