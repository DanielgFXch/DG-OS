'use strict';
/* DG OS Jarvis Voice v2. Browser voice + real server-side Cartesia TTS.
   Cartesia API key stays in Supabase. Uses existing Telegram-paired DG OS device session. */
(() => {
  const panel=document.getElementById('personalJarvis');
  const reply=document.getElementById('personalJarvisReply');
  if(!panel || !reply) return;
  const synth=window.speechSynthesis || null;
  const endpoint='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-cartesia';
  const storageKey='dgos.voiceStudio.preferences.v1', voiceKey='dgos.cartesia.voiceId';
  const enabledKey='dgos.jarvis.speech.enabled';
  const deviceSession=()=>{
    try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return '';}
  };
  const store=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  const read=(key)=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
  let prefs={};
  try{prefs=JSON.parse(read(storageKey)||'{}')||{};}catch{}
  let provider=prefs.provider==='cartesia'?'cartesia':'browser';
  let voiceId=read(voiceKey)||'';
  let voices=[],currentAudio=null,objectUrl='',abort=null,sequence=0,lastText='',lastPrepared='';
  const controls=document.createElement('div');
  controls.className='jarvis-voice-console';
  controls.innerHTML=`
    <div class="jv-console-head">
      <span class="jv-console-title">JARVIS <span>VOICE CONTROL</span></span>
      <span id="jvVoiceBadge" class="jv-voice-badge">BEREIT</span>
    </div>
    <div class="jv-voice-fields">
      <label>Voice Engine<select id="jvEngine"><option value="browser">Geräte-Stimme · kostenlos</option><option value="cartesia">Cartesia · Premium</option></select></label>
      <label>Stimme<select id="jvVoice" aria-label="Jarvis Stimme auswählen"></select></label>
      <label>Sprache<select id="jvLang"><option value="de-DE">Deutsch</option><option value="en-GB">English</option><option value="pt-PT">Português (Portugal)</option></select></label>
    </div>
    <div class="jv-voice-actions">
      <label class="jv-autospeak"><input id="jvEnabled" type="checkbox"> Antworten vorlesen</label>
      <button id="jvReload" type="button">Stimmen laden</button>
      <button id="jvPreview" type="button" class="jv-action-primary">Stimme testen</button>
      <button id="jvSoundCheck" type="button">🔊 Ton prüfen</button>
      <button id="jvRead" type="button">Antwort vorlesen</button>
      <button id="jvStop" type="button">Stopp</button>
    </div>
    <p class="jv-voice-notice" id="jvNotice" role="status" aria-live="polite"></p>
    <a class="jv-studio-link" href="./voice-studio.html">Premium Voice Studio ↗</a>
  `;
  // Keep Voice Control outside the hero so the home-style sphere is the focus.
  // The Telegram pairing widget anchors to this same console afterwards.
  const voiceLocation=panel.querySelector('.jarvis-cinematic-hero')||reply;
  voiceLocation.insertAdjacentElement('afterend',controls);
  const $=id=>document.getElementById(id);
  const setMessage=(message,badge='BEREIT')=>{$('jvNotice').textContent=message;$('jvVoiceBadge').textContent=badge;};
  $('jvEngine').value=provider;
  $('jvLang').value=['de-DE','en-GB','pt-PT'].includes(prefs.language)?prefs.language:'de-DE';
  $('jvEnabled').checked=read(enabledKey)==='1';
  function save(){
    store(storageKey,JSON.stringify({provider,voice:provider==='browser'?$('jvVoice').value:'',
      language:$('jvLang').value,pace:Number(prefs.pace)>=0.7&&Number(prefs.pace)<=1.3?Number(prefs.pace):0.95}));
  }
  function stop(){
    sequence++;
    if(abort){abort.abort();abort=null;}
    if(window.DGOSLocalVoice)window.DGOSLocalVoice.stop();
    else if(synth && (synth.speaking || synth.pending || synth.paused))synth.cancel();
    if(currentAudio){currentAudio.pause();currentAudio.removeAttribute('src');currentAudio.load();currentAudio=null;}
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl='';}
    lastPrepared='';
  }
  function options(items,selected){
    const select=$('jvVoice');select.replaceChildren();
    if(!items.length){select.add(new Option('Keine Stimmen geladen',''));select.disabled=true;return;}
    items.forEach(x=>select.add(new Option(x.name,x.id)));
    select.disabled=false;
    select.value=items.some(x=>x.id===selected)?selected:items[0].id;
  }
  function nativeVoices(){
    const list=synth?synth.getVoices().slice().sort((a,b)=>Number(b.lang.startsWith('de'))-Number(a.lang.startsWith('de'))||a.name.localeCompare(b.name)):[];
    return [{id:'',name:'Systemstimme · automatisch'},...list.map(x=>({id:x.voiceURI,name:x.name+' · '+x.lang}))];
  }
  function render(){
    const premium=provider==='cartesia';
    $('jvReload').hidden=!premium;
    if(premium){
      options(voices,voiceId);
      if(!deviceSession())setMessage('Einmalig hier unten mit Telegram koppeln. Danach kannst du Premium-Stimmen laden.','KOPPLUNG');
      else if(!voices.length)setMessage('Tippe auf «Stimmen laden» und wähle eine Cartesia-Stimme.','VERBINDEN');
      else setMessage('Premium bereit. Wähle eine Stimme oder teste sie.','CARTESIA');
    } else {
      options(nativeVoices(),prefs.voice||'');
      setMessage(synth?'Geräte-Stimme bereit. Kostenlos und ohne Anmeldung.':'Dieser Browser unterstützt keine lokale Sprachausgabe.','LOKAL');
    }
  }
  async function api(method,body,signal){
    const session=deviceSession();
    if(!session)throw Error('Verbinde dieses iPhone direkt unten über «Mit Telegram verbinden».');
    const res=await fetch(endpoint,{method,signal,cache:'no-store',headers:{
      Authorization:'Bearer '+session,...(body?{'Content-Type':'application/json'}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
    if(!res.ok){
      const error=await res.json().catch(()=>({}));
      if(res.status===401){window.dispatchEvent(new Event('dgos-device-session-invalid'));throw Error('Dieses iPhone ist noch nicht mit Jarvis verbunden. Verwende unten «Mit Telegram verbinden».');}
      if(error.error==='voice_not_configured')throw Error('Cartesia ist auf dem DG-OS-Server noch nicht konfiguriert.');
      if(error.error==='slow_down')throw Error('Bitte kurz warten und erneut testen.');
      throw Error('Premium-Stimme nicht verfügbar ('+(error.upstream_status||res.status)+').');
    }
    return res;
  }
  async function loadVoices(){
    if(!deviceSession()){render();return;}
    $('jvReload').disabled=true;
    setMessage('Premium-Stimmen werden geladen …','VERBINDEN');
    try{
      const response=await api('GET');
      const data=await response.json();
      voices=Array.isArray(data.voices)?data.voices.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'):[];
      if(!voices.length)throw Error('Keine Cartesia-Stimmen gefunden. Bitte Cartesia-Verbindung prüfen.');
      voiceId=voices.some(v=>v.id===voiceId)?voiceId:voices[0].id;
      store(voiceKey,voiceId);render();
    }catch(error){setMessage(error.message||'Premium-Stimmen konnten nicht geladen werden.','FEHLER');}
    finally{$('jvReload').disabled=false;}
  }
  async function speak(text,preview=false){
    if(!text||(!preview&&!$('jvEnabled').checked))return;
    if(provider==='browser'){
      const player=window.DGOSLocalVoice;
      if(!player?.isSupported())return setMessage('Die lokale Sprachausgabe ist hier nicht verfügbar. Öffne das Voice Studio in Safari.','FEHLER');
      const voice=synth.getVoices().find(v=>v.voiceURI===$('jvVoice').value);
      player.play({
        text,voice,lang:$('jvLang').value,rate:.94,pitch:.96,
        onState:({state,message})=>{
          const badge=state==='error'||state==='timeout'?'FEHLER':state==='speaking'?'SPRICHT':state==='starting'||state==='restarting'?'STARTET':'BEREIT';
          setMessage(message,badge);
        }
      });
      return;
    }
    if(!voiceId){setMessage('Bitte erst «Stimmen laden» und eine Premium-Stimme auswählen.','VERBINDEN');return;}
    if(currentAudio&&lastPrepared===text){
      try{currentAudio.currentTime=0;await currentAudio.play();setMessage('Jarvis spricht mit Cartesia.','SPRICHT');}
      catch{setMessage('Tippe nochmals auf «Antwort vorlesen», um die Audiofreigabe zu aktivieren.','STARTEN');}
      return;
    }
    stop();
    const thisRequest=sequence;
    const limited=String(text).trim().slice(0,300);
    abort=new AbortController();
    setMessage('Premium-Antwort wird erzeugt …','GENERIEREN');
    try{
      const response=await api('POST',{text:limited,voice_id:voiceId,
        language:$('jvLang').value.slice(0,2),pace:Number(prefs.pace)>=.7&&Number(prefs.pace)<=1.3?Number(prefs.pace):.95},abort.signal);
      const blob=await response.blob();
      if(thisRequest!==sequence)return;
      if(!blob.type.includes('audio')||!blob.size)throw Error('Keine Audiodaten empfangen.');
      objectUrl=URL.createObjectURL(blob);
      currentAudio=new Audio(objectUrl);lastPrepared=text;
      currentAudio.onended=()=>setMessage('Wiedergabe beendet.','BEREIT');
      try{
        await currentAudio.play();
        setMessage(text.length>300?'Jarvis spricht · die Antwort wurde für diesen Test auf 300 Zeichen gekürzt.':'Jarvis spricht mit Cartesia.','SPRICHT');
      }catch{
        setMessage('Audio bereit. Tippe auf «Antwort vorlesen», damit dein iPhone die Wiedergabe startet.','STARTEN');
      }
    }catch(error){
      if(thisRequest!==sequence||error.name==='AbortError')return;
      setMessage(error.message||'Premium-Audio konnte nicht erstellt werden.','FEHLER');
    }finally{if(thisRequest===sequence)abort=null;}
  }
  $('jvEngine').addEventListener('change',()=>{stop();provider=$('jvEngine').value;save();render();if(provider==='cartesia')loadVoices();});
  $('jvLang').addEventListener('change',save);
  $('jvVoice').addEventListener('change',()=>{stop();if(provider==='cartesia'){voiceId=$('jvVoice').value;store(voiceKey,voiceId);}else prefs.voice=$('jvVoice').value;save();render();});
  $('jvEnabled').addEventListener('change',()=>{store(enabledKey,$('jvEnabled').checked?'1':'0');if(!$('jvEnabled').checked)stop();});
  $('jvReload').addEventListener('click',loadVoices);
  $('jvPreview').addEventListener('click',()=>speak('Hallo. Ich bin Jarvis. Hörst du mich?',true));
  $('jvRead').addEventListener('click',()=>speak(lastText||reply.textContent||'',true));
  $('jvSoundCheck').addEventListener('click',async()=>{
    const result=await window.DGOSSoundCheck?.playTestTone();
    setMessage(result?.reason||'Audiotest nicht verfügbar.',result?.ok?'TON-TEST':'FEHLER');
  });
  $('jvStop').addEventListener('click',()=>{stop();setMessage('Wiedergabe gestoppt.','BEREIT');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('dgos-device-session',()=>{if(provider==='cartesia')loadVoices();});
  synth?.addEventListener?.('voiceschanged',()=>{if(provider==='browser')render();});
  lastText=reply.textContent||'';
  new MutationObserver(()=>{
    const text=reply.textContent||'';
    if(text!==lastText){lastText=text;if($('jvEnabled').checked)speak(text);}
  }).observe(reply,{childList:true,characterData:true,subtree:true});
  render();
  if(provider==='cartesia'&&deviceSession())loadVoices();
})();
