
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

function events(items){
  $('events').innerHTML=items.map(x=>`<div class="event"><time>${x.t}</time><div><strong>${x.title}</strong><span>${x.desc}</span></div></div>`).join('');
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

  if(state.sweep && state.engulf){
    $('action').className='action sell';
    $('action').textContent='🔴 SELL MÖGLICH';
    $('confidence').textContent='94%';
    $('tradeType').textContent='Countertrend Scalp';
    $('opportunity').textContent='Countertrend Sell';
    $('intradayTarget').textContent='Asia Low';
  } else if(state.sweep){
    $('action').className='action wait';
    $('action').textContent='🟡 WAIT';
    $('confidence').textContent='76%';
    $('tradeType').textContent='Bearishe Confirmation fehlt';
    $('opportunity').textContent='Sell beobachten';
    $('intradayTarget').textContent='Asia Low';
  } else {
    $('action').className='action wait';
    $('action').textContent='🟡 WAIT';
    $('confidence').textContent=state.asia?'58%':'54%';
    $('tradeType').textContent='Noch keine Trade-Freigabe';
    $('opportunity').textContent='Keine';
    $('intradayTarget').textContent='—';
  }

  const ev=[];
  if(state.asia) ev.push({t:'06:00',title:'🌏 Asia Session beendet',desc:'High 4302.00 · Low 4290.00 · Range $12.00'});
  if(state.sweep) ev.push({t:'08:47',title:'💧 Asia High gesweept',desc:'Signifikanter Wick + Gegenreaktion · POI aktiv'});
  if(state.engulf) {
    ev.push({t:'08:49',title:'⚡ Bearish Engulfing',desc:'M5 Confirmation + Displacement'});
    ev.push({t:'08:49',title:'🔴 SELL MÖGLICH',desc:'Countertrend Scalp · Ziel Asia Low · HTF bleibt bullish'});
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
  return `🧠 DG OS

${state.sweep&&state.engulf?'🔴 SELL MÖGLICH':'🟡 WAIT'}
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

if('serviceWorker' in navigator){navigator.serviceWorker.register('./sw.js').catch(()=>{})}
render();
renderGreeting();
setInterval(renderGreeting,60000);
if(tg.token){testTelegramConnection(tg.token).then(bot=>setTelegramStatus(`Verbunden · @${bot.username}`)).catch(()=>setTelegramStatus('Nicht verbunden'))}
