'use strict';
/* Jarvis ↔ Telegram device pairing. The server's existing device-token challenge
   is used unchanged. Never expose Telegram bot tokens or Cartesia API keys. */
(() => {
  const anchor=document.querySelector('#personalJarvis .jarvis-voice-console') ||
    document.querySelector('#voiceSelect')?.closest('.card');
  if(!anchor)return;

  const endpoint='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/telegram-tasks';
  const deviceKey='dgos.deviceSession';
  const pendingKey='dgos.voice.pairing.pending.v1';
  let pending=null,claimBusy=false,refreshBusy=false,claimTimer=null;

  const el=document.createElement('section');
  el.className='jarvis-device-pair';
  el.id='jarvisDevicePair';
  el.innerHTML=
    '<div class="jdp-head"><div><strong>JARVIS · GERÄTEVERBINDUNG</strong><small>Einmalig auf diesem iPhone</small></div><span id="jdpBadge">PRÜFEN</span></div>'+
    '<p id="jdpMessage" role="status" aria-live="polite">Ich prüfe deine Telegram-Kopplung …</p>'+
    '<div id="jdpControls" hidden>'+
      '<button type="button" id="jdpStart">🔗 Mit Telegram verbinden</button>'+
      '<div id="jdpPending" hidden>'+
        '<p><b>1.</b> Öffne deinen bestehenden Jarvis-Bot in Telegram. Drücke dort auf <b>Start</b>.</p>'+
        '<a id="jdpTelegram" target="_blank" rel="noopener noreferrer" href="#">Telegram öffnen ↗</a>'+
        '<p><b>2.</b> Wechsle zurück zu DG OS. Die Verbindung wird automatisch geprüft.</p>'+
        '<p class="jdp-fallback">Falls Telegram keinen Start-Button zeigt: Sende dem Bot <code id="jdpCommand"></code></p>'+
        '<div class="jdp-actions"><button type="button" id="jdpCopy">Befehl kopieren</button><button type="button" id="jdpCheck">Verbindung prüfen</button></div>'+
      '</div>'+
    '</div>';
  anchor.insertAdjacentElement('afterend',el);
  const $=id=>document.getElementById(id);
  const message=(text,badge)=>{$('jdpMessage').textContent=text;if(badge)$('jdpBadge').textContent=badge;};
  const token=()=>{try{return localStorage.getItem(deviceKey)||'';}catch{return '';}};
  function clearPending(){
    pending=null;
    try{sessionStorage.removeItem(pendingKey);}catch{}
    if(claimTimer){clearInterval(claimTimer);claimTimer=null;}
  }
  function restore(){
    try{
      const v=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
      if(v && /^\d{6}$/.test(v.code) && typeof v.claimSecret==='string' &&
         v.claimSecret.length>=20 && typeof v.expiresAt==='number' &&
         /^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=device_\d{6}$/.test(v.deepLink) &&
         v.expiresAt>Date.now())return v;
    }catch{}
    return null;
  }
  function showPending(){
    const active=Boolean(pending&&pending.expiresAt>Date.now());
    $('jdpPending').hidden=!active;
    $('jdpStart').hidden=active;
    if(!active)return;
    $('jdpTelegram').href=pending.deepLink;
    $('jdpCommand').textContent='/pair '+pending.code;
    message('Warte auf Bestätigung im Telegram-Bot. Du kannst nach dem Wechsel zurückkommen.','WARTET');
  }
  function connected(){
    clearPending();
    $('jdpControls').hidden=true;
    el.classList.add('jdp-connected');
    message('Dieses Gerät ist sicher mit deinem Jarvis-Telegram-Bot verbunden.','VERBUNDEN');
    window.dispatchEvent(new Event('dgos-device-session'));
  }
  async function request(action,method='GET',data){
    const t=token();
    const response=await fetch(endpoint+'/'+action,{
      method,cache:'no-store',
      headers:{...(t?{Authorization:'Bearer '+t}:{}),...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(json.error||('request_failed_'+response.status));
    return json;
  }
  async function claim(){
    if(claimBusy||!pending)return;
    if(Date.now()>=pending.expiresAt){
      clearPending();$('jdpPending').hidden=true;$('jdpStart').hidden=false;
      message('Der Kopplungscode ist abgelaufen. Bitte einen neuen erstellen.','ABGELAUFEN');
      return;
    }
    claimBusy=true;
    try{
      const result=await request('pair-claim','POST',{code:pending.code,claimSecret:pending.claimSecret});
      if(result.approved&&typeof result.deviceToken==='string'&&result.deviceToken.length>=32){
        localStorage.setItem(deviceKey,result.deviceToken);
        connected();
      }
    }catch(error){
      const code=String(error.message||'');
      if(code==='pair_chat_mismatch'||code==='invalid_pair_claim'){
        clearPending();$('jdpPending').hidden=true;$('jdpStart').hidden=false;
        message('Diese Kopplung wurde abgelehnt. Bitte neu verbinden.','FEHLER');
      }
    }finally{claimBusy=false;}
  }
  function startPolling(){
    if(claimTimer)clearInterval(claimTimer);
    if(pending)claimTimer=setInterval(()=>{if(!document.hidden)claim();},2500);
    if(pending)claim();
  }
  async function refresh(){
    if(refreshBusy)return;
    refreshBusy=true;
    try{
      const state=await request('status');
      if(state.deviceAuthenticated){
        connected();
        return;
      }
      el.classList.remove('jdp-connected');
      $('jdpControls').hidden=!state.configured;
      if(!state.configured){
        message('Der Telegram-Connector ist aktuell nicht verfügbar. Bitte später erneut versuchen.','OFFLINE');
      }else if(pending){
        showPending();startPolling();
      }else{
        $('jdpPending').hidden=true;$('jdpStart').hidden=false;
        message(state.paired
          ?'Dein Bot ist verbunden. Dieses iPhone muss noch einmalig bestätigt werden.'
          :'Bitte deinen Jarvis-Bot einmalig mit diesem Gerät verbinden.','KOPPLUNG');
      }
    }catch{
      if(!pending){
        $('jdpControls').hidden=false;
        message('Status momentan nicht erreichbar. Du kannst die Kopplung erneut versuchen.','PRÜFEN');
      }else{showPending();startPolling();}
    }finally{refreshBusy=false;}
  }
  $('jdpStart').addEventListener('click',async()=>{
    $('jdpStart').disabled=true;
    message('Sicherer Kopplungscode wird erstellt …','VERBINDET');
    try{
      const response=await request('pair-start','POST');
      if(response.alreadyAuthenticated){connected();return;}
      if(!/^\d{6}$/.test(String(response.code||''))||
         typeof response.claimSecret!=='string'||response.claimSecret.length<20||
         !/^https:\/\/t\.me\/[A-Za-z0-9_]+\?start=device_\d{6}$/.test(String(response.deepLink||''))){
        throw Error('pairing_response_invalid');
      }
      pending={
        code:response.code,claimSecret:response.claimSecret,
        deepLink:response.deepLink,
        expiresAt:Date.now()+Math.min(600,Number(response.expiresInSeconds)||600)*1000
      };
      try{sessionStorage.setItem(pendingKey,JSON.stringify(pending));}catch{}
      showPending();startPolling();
    }catch(error){
      message('Kopplung konnte nicht gestartet werden ('+String(error.message||'Fehler')+').','FEHLER');
    }finally{$('jdpStart').disabled=false;}
  });
  $('jdpCopy').addEventListener('click',async()=>{
    if(!pending)return;
    try{await navigator.clipboard.writeText('/pair '+pending.code);message('Befehl kopiert. In deinem Jarvis-Telegram-Chat einfügen.','WARTET');}
    catch{message('Bitte diesen Befehl in Telegram senden: /pair '+pending.code,'WARTET');}
  });
  $('jdpCheck').addEventListener('click',async()=>{await claim();if(pending)message('Noch keine Bestätigung. Sende den Befehl im richtigen Telegram-Bot.','WARTET');});
  const checkOnReturn=()=>{if(pending)claim();else refresh();};
  window.addEventListener('focus',checkOnReturn);
  window.addEventListener('pageshow',checkOnReturn);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkOnReturn();});
  window.addEventListener('dgos-device-session-invalid',refresh);
  pending=restore();
  if(pending){showPending();startPolling();}
  refresh();
})();
