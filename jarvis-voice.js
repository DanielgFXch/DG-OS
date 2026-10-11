'use strict';
/* Jarvis voice: local voice, Cartesia TTS and OpenAI TTS.
   API secrets stay in the existing DG OS Supabase backend; device pairing is shared. */
(() => {
  const panel=document.getElementById('personalJarvis');
  const reply=document.getElementById('personalJarvisReply');
  if(!panel || !reply) return;
  const synth=window.speechSynthesis || null;
  const base='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/';
  const endpoint=()=>base+(provider==='openai-tts'?'jarvis-openai-voice':'jarvis-cartesia');
  const storageKey='dgos.voiceStudio.preferences.v1';
  const cartesiaVoiceKey='dgos.cartesia.voiceId';
  const openaiVoiceKey='dgos.openai.voiceId';
  const providerVoiceKey=()=>provider==='openai-tts'?openaiVoiceKey:cartesiaVoiceKey;
  const enabledKey='dgos.jarvis.speech.enabled';
  const deviceSession=()=>{
    try{return localStorage.getItem('dgos.deviceSession')||'';}catch{return '';}
  };
  const store=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  const read=(key)=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
  let prefs={};
  try{prefs=JSON.parse(read(storageKey)||'{}')||{};}catch{}
  let provider=['browser','cartesia','openai-tts'].includes(prefs.provider)?prefs.provider:'browser';
  let voiceId=read(providerVoiceKey())||'';
  let voices=[],currentAudio=null,objectUrl='',abort=null,sequence=0,lastText='',lastPrepared='',lastCompleted='',microphoneBusy=false;
  let validatedServerVoice=null,serverTestBusy=false;
  const controls=document.createElement('div');
  controls.className='jarvis-voice-console';
  controls.innerHTML=`
    <div class="jv-console-head">
      <span class="jv-console-title">JARVIS <span>VOICE CONTROL</span></span>
      <div class="jv-head-actions"><button id="jvQuickToggle" type="button" aria-pressed="true" aria-controls="jvEnabled">🔊 Stimme an</button><span id="jvVoiceBadge" class="jv-voice-badge">BEREIT</span></div>
    </div>
    <div class="jv-voice-fields">
      <label>Voice Engine<select id="jvEngine"><option value="browser">Geräte-Stimme · kostenlos</option><option value="cartesia">Cartesia · Premium</option><option value="openai-tts">OpenAI · Premium-Stimmen</option></select></label>
      <label>Stimme<select id="jvVoice" aria-label="Jarvis Stimme auswählen"></select></label>
      <label>Sprache<select id="jvLang"><option value="de-DE">Deutsch</option><option value="en-GB">English</option><option value="pt-PT">Português (Portugal)</option></select></label>
    </div>
    <div class="jv-voice-actions">
      <label class="jv-autospeak"><input id="jvEnabled" type="checkbox"> Antworten vorlesen · Jarvis spricht zurück</label>
      <button id="jvReload" type="button">Stimmen laden</button>
      <button id="jvPreview" type="button" class="jv-action-primary">Stimme testen</button>
      <button id="jvSoundCheck" type="button">🔊 Ton prüfen</button>
      <button id="jvRead" type="button">Antwort vorlesen</button>
      <button id="jvStop" type="button">Stopp</button>
    </div>
    <audio id="jvAudioPlayer" controls preload="none" hidden aria-label="Erzeugte Jarvis Premium-Stimme abspielen"></audio>
    <p class="jv-voice-notice" id="jvNotice" role="status" aria-live="polite"></p>
    <a class="jv-studio-link" href="./voice-studio.html">Premium Voice Studio ↗</a>
  `;
  // Keep Voice Control outside the hero so the home-style sphere is the focus.
  // The Telegram pairing widget anchors to this same console afterwards.
  const voiceLocation=panel.querySelector('.jarvis-cinematic-hero')||reply;
  voiceLocation.insertAdjacentElement('afterend',controls);
  // Immediate, accessible voice feedback in the VISIBLE hero. The complete
  // provider settings below may be collapsed on iPhone.
  const hero=panel.querySelector('.jarvis-cinematic-hero');
  if(hero){
    const strip=document.createElement('div');
    strip.className='jv-hero-audio';
    strip.innerHTML=
      '<div class="jv-hero-audio-buttons">'+
      '<button id="jvHeroToggle" type="button" aria-pressed="true">🔊 Stimme an</button>'+
      '<button id="jvHeroRead" type="button">▶ Antwort anhören</button>'+
      '</div>'+
      '<div class="jv-diagnostic-actions">'+
      '<button id="jvHeroTone" type="button">♪ Ton prüfen</button>'+
      '<button id="jvHeroFile" type="button">🎧 Audio-Datei testen</button>'+
      '</div>'+
      '<p id="jvHeroNotice" role="status" aria-live="polite">Sprachausgabe bereit.</p>'+
      '<button id="jvUseServerVoice" type="button" hidden>Diese Stimme für Antworten verwenden</button>'+
      '<small class="jv-diagnostic-hint">Audio-Datei: Test über den verbundenen Sprachanbieter. Kann geringe API-Kosten verursachen.</small>';
    hero.append(strip);
  }
  const $=id=>document.getElementById(id);
  // HTML audio must stay VISIBLE even when the advanced voice settings are closed.
  if(hero && $('jvAudioPlayer')){
    $('jvAudioPlayer').classList.add('jv-hero-player');
    hero.querySelector('.jv-hero-audio')?.append($('jvAudioPlayer'));
  }
  const setMessage=(message,badge='BEREIT')=>{
    $('jvNotice').textContent=message;
    $('jvVoiceBadge').textContent=badge;
    const heroNotice=$('jvHeroNotice');
    if(heroNotice){
      heroNotice.textContent=message;
      heroNotice.dataset.state=badge;
    }
  };
  $('jvRead').textContent='▶ Letzte Antwort anhören';
  $('jvEngine').value=provider;
  $('jvLang').value=['de-DE','en-GB','pt-PT'].includes(prefs.language)?prefs.language:'de-DE';
  // Jarvis speaks by default; only explicit owner opt-out ('0') keeps replies silent.
  $('jvEnabled').checked=read(enabledKey)!=='0';
  function updateQuickToggle(){
    const active=$('jvEnabled').checked;
    const button=$('jvQuickToggle');
    button.textContent=active?'🔊 Stimme an':'🔇 Stimme aus';
    button.setAttribute('aria-pressed',String(active));
    button.dataset.enabled=String(active);
    const heroToggle=$('jvHeroToggle');
    if(heroToggle){
      heroToggle.textContent=active?'🔊 Stimme an':'🔇 Stimme aus';
      heroToggle.setAttribute('aria-pressed',String(active));
      heroToggle.dataset.enabled=String(active);
    }
  }
  updateQuickToggle();
  function save(){
    store(storageKey,JSON.stringify({provider,voice:provider==='browser'?$('jvVoice').value:'',
      language:$('jvLang').value,pace:Number(prefs.pace)>=0.7&&Number(prefs.pace)<=1.3?Number(prefs.pace):0.95}));
  }
  function stop(){
    sequence++;
    if(abort){abort.abort();abort=null;}
    if(window.DGOSLocalVoice)window.DGOSLocalVoice.stop();
    else if(synth && (synth.speaking || synth.pending || synth.paused))synth.cancel();
    if(currentAudio){currentAudio.pause();currentAudio.removeAttribute('src');currentAudio.load();currentAudio.hidden=true;currentAudio=null;}
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
    const premium=provider!=='browser';
    $('jvReload').hidden=!premium;
    // Manual playback is available with local voice even when premium TTS is unavailable.
    const localReady=Boolean(window.DGOSLocalVoice?.isSupported());
    $('jvPreview').disabled=premium&&!voices.length&&!localReady;
    $('jvRead').disabled=premium&&!voices.length&&!localReady;
    if(premium){
      options(voices,voiceId);
      if(!deviceSession())setMessage('Verbinde dein Gerät einmalig mit Telegram.','KOPPLUNG');
      else if(!voices.length)setMessage('Stimmen werden geladen. Falls ein Anbieter fehlt, prüfen wir den anderen.','VERBINDEN');
      else setMessage((provider==='openai-tts'?'OpenAI':'Cartesia')+' bereit. Wähle eine Stimme und drücke «Stimme testen».','BEREIT');
    } else {
      options(nativeVoices(),prefs.voice||'');
      setMessage(synth?'Geräte-Stimme bereit. Kostenlos und ohne Anmeldung.':'Dieser Browser unterstützt keine lokale Sprachausgabe.','LOKAL');
    }
  }
  async function api(method,body,signal){
    const session=deviceSession();
    if(!session)throw Error('Verbinde dieses iPhone direkt unten über «Mit Telegram verbinden».');
    const res=await fetch(endpoint(),{method,signal,cache:'no-store',headers:{
      Authorization:'Bearer '+session,...(body?{'Content-Type':'application/json'}:{})
    },...(body?{body:JSON.stringify(body)}:{})});
    if(!res.ok){
      const error=await res.json().catch(()=>({}));
      if(res.status===401){window.dispatchEvent(new Event('dgos-device-session-invalid'));throw Error('Dieses iPhone ist noch nicht mit Jarvis verbunden. Verwende unten «Mit Telegram verbinden».');}
      if(error.error==='voice_not_configured'){
        const message=provider==='cartesia'?'Cartesia API-Key fehlt im bestehenden DG-OS-Projekt.':'OpenAI API-Key fehlt im bestehenden DG-OS-Projekt.';
        const exception=new Error(message);exception.code='voice_not_configured';throw exception;
      }
      if(error.error==='voice_invalid_api_key')throw Error('OpenAI API-Key ist ungültig. Bitte den Schlüssel im bestehenden DG-OS-Projekt prüfen.');
      if(error.error==='voice_provider_rate_limit')throw Error('Der Sprachanbieter ist gerade ausgelastet. Bitte später erneut testen.');
      if(error.error==='slow_down')throw Error('Bitte kurz warten und erneut testen.');
      throw Error((provider==='openai-tts'?'OpenAI':'Cartesia')+'-Stimme nicht verfügbar ('+(error.upstream_status||res.status)+').');
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
      if(!voices.length)throw Error('Keine Stimmen vom Anbieter erhalten. Bitte Verbindung prüfen.');
      voiceId=voices.some(v=>v.id===voiceId)?voiceId:voices[0].id;
      store(providerVoiceKey(),voiceId);render();
    }catch(error){
      if(provider==='cartesia'&&error?.code==='voice_not_configured'){
        provider='openai-tts';voiceId=read(providerVoiceKey())||'';
        save();render();
        setMessage('Cartesia fehlt. Prüfe automatisch die OpenAI Premium-Stimmen …','PRÜFEN');
        await loadVoices();return;
      }
      setMessage(error.message||'Premium-Stimmen konnten nicht geladen werden.','FEHLER');
    }
    finally{$('jvReload').disabled=false;}
  }
  // On iOS, speechSynthesis.onstart is NOT evidence of audible sound.
  // The independent Web Audio tone can identify device output issues.
  async function testTone(){
    setMessage('Testton wird abgespielt. Hörst du den Ton?','TON-TEST');
    try{
      const result=await window.DGOSSoundCheck?.playTestTone();
      if(result?.ok){
        setMessage('Testton gestartet. Falls du ihn hörst, aber die Geräte-Stimme stumm bleibt, teste die Audio-Datei. Falls nicht, prüfe Stummschalter, Medienlautstärke und Audioausgabe.','TON-TEST');
      }else setMessage(result?.reason||'Der Audiotest konnte nicht gestartet werden.','FEHLER');
    }catch{
      setMessage('Testton fehlgeschlagen. Prüfe die Audioausgabe deines iPhones.','FEHLER');
    }
  }
  // Alternative: decoded MP3/WAV through the native <audio> element,
  // independent of Safari Web Speech. Only one explicit user click creates
  // a paid sample; GET checks do not generate paid audio.
  async function testAudioFile(){
    if(serverTestBusy)return;
    const session=deviceSession();
    if(!session){
      setMessage('Für die Audio-Datei muss dein iPhone mit DG OS gekoppelt sein.','KOPPLUNG');
      return;
    }
    serverTestBusy=true;
    $('jvHeroFile').disabled=true;
    $('jvUseServerVoice').hidden=true;
    setMessage('Ich prüfe deine vorhandenen Sprachanbieter …','PRÜFEN');
    const providers=[
      {provider:'openai-tts',route:'jarvis-openai-voice',fallback:'onyx',kind:'MP3'},
      {provider:'cartesia',route:'jarvis-cartesia',fallback:'',kind:'WAV'}
    ];
    try{
      let chosen=null;
      let configError='';
      for(const candidate of providers){
        const response=await fetch(base+candidate.route,{
          method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+session}
        });
        if(response.status===401){
          setMessage('Dein Gerät muss erneut mit JARVIS verbunden werden.','KOPPLUNG');
          return;
        }
        if(!response.ok){
          const error=await response.json().catch(()=>({}));
          if(error.error==='voice_not_configured')configError+=' '+(candidate.provider==='openai-tts'?'OpenAI':'Cartesia')+' fehlt.';
          continue;
        }
        const data=await response.json();
        const available=Array.isArray(data.voices)?data.voices.filter(x=>x&&typeof x.id==='string'):[];
        const selected=available.find(x=>x.id===candidate.fallback)||available[0];
        if(selected){
          chosen={...candidate,voiceId:selected.id};
          break;
        }
      }
      if(!chosen){
        setMessage('Kein serverbasierter Sprachanbieter einsatzbereit.'+configError+' Prüfe «Stimme & Verbindung».','FEHLER');
        return;
      }
      // Explicit, short test sentence to limit paid provider consumption.
      const text='Hallo Gomes. Ich bin Jarvis. Das ist ein Test meiner Audioausgabe.';
      setMessage('Test-Audio wird vorbereitet ('+chosen.kind+') …','GENERIEREN');
      const response=await fetch(base+chosen.route,{
        method:'POST',cache:'no-store',
        headers:{Authorization:'Bearer '+session,'Content-Type':'application/json'},
        body:JSON.stringify({text,voice_id:chosen.voiceId,language:'de',pace:.95})
      });
      if(!response.ok){
        const reason=await response.json().catch(()=>({}));
        if(reason.error==='slow_down')throw Error('Bitte einige Sekunden warten und den Audio-Test nochmals starten.');
        if(reason.error==='device_pairing_required')throw Error('Deine DG-OS-Geräteverbindung ist abgelaufen.');
        throw Error('Audio-Datei konnte nicht erzeugt werden ('+(reason.error||response.status)+').');
      }
      const blob=await response.blob();
      if(!blob.type.includes('audio')||blob.size<100)throw Error('Der Sprachanbieter hat keine gültige Audiodatei geliefert.');
      stop(); // Stops any silent native Web Speech attempt; releases stale blobs.
      objectUrl=URL.createObjectURL(blob);
      currentAudio=$('jvAudioPlayer');
      currentAudio.src=objectUrl;
      currentAudio.hidden=false;
      lastPrepared=text;
      currentAudio.onended=()=>setMessage('Die Audio-Datei wurde abgespielt. Hast du die Stimme gehört?','BEREIT');
      validatedServerVoice=chosen;
      $('jvUseServerVoice').hidden=false;
      setMessage('Audio-Datei bereit. Falls du nichts hörst: Tippe direkt auf ▶ im Audioplayer unten.','STARTEN');
      try{
        await currentAudio.play();
        setMessage('Audio-Wiedergabe gestartet. Hörst du diese Datei?','AUDIO-TEST');
      }catch{
        // An explicit tap on native controls is needed on some iPhone PWAs.
        setMessage('iOS blockiert den automatischen Start. Tippe auf ▶ im Audioplayer unter dieser Meldung.','STARTEN');
      }
    }catch(error){
      setMessage(error?.message||'Audio-Datei konnte nicht getestet werden.','FEHLER');
    }finally{
      serverTestBusy=false;
      $('jvHeroFile').disabled=false;
    }
  }
  function speakLocal(text,fallback=false){
    const player=window.DGOSLocalVoice;
    if(!player?.isSupported()){
      setMessage('Dieses Gerät kann keine lokale Stimme abspielen. Öffne DG OS in Safari oder prüfe den Premium-Anbieter.','FEHLER');
      return false;
    }
    const selected=provider==='browser'?synth?.getVoices?.().find(v=>v.voiceURI===$('jvVoice').value):null;
    return player.play({
      text,voice:selected,lang:$('jvLang').value,rate:.94,pitch:.96,
      onState:({state,message})=>{
        const badge=state==='error'||state==='timeout'?'FEHLER':
          state==='speaking'?'SPRICHT':state==='starting'||state==='restarting'?'STARTET':'BEREIT';
        const retry=state==='error'||state==='timeout'?' Tippe auf «▶ Letzte Antwort anhören», um es erneut zu versuchen.':'';
        // A Web Speech onstart event does not guarantee sound on iOS.
        const reported=state==='speaking'
          ?'iPhone meldet Sprachstart, Ton ist nicht bestätigt. Falls du nichts hörst: «♪ Ton prüfen» oder «🎧 Audio-Datei testen».'
          :((message||'')+retry);
        setMessage((fallback?'Premium nicht erreichbar · iPhone-Stimme. ':'')+reported,badge);
      }
    });
  }
  async function speak(text,preview=false){
    if(!text||(!preview&&!$('jvEnabled').checked))return;
    if(provider==='browser'){speakLocal(text);return;}
    // Premium unconfigured? Speak locally instead of silently ignoring
    // the recognised microphone command or purchasing a new provider.
    if(!voiceId){speakLocal(text,true);return;}
    if(currentAudio&&lastPrepared===text){
      try{currentAudio.currentTime=0;await currentAudio.play();setMessage('Jarvis spricht mit '+(provider==='openai-tts'?'OpenAI':'Cartesia')+'.','SPRICHT');}
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
      currentAudio=$('jvAudioPlayer');currentAudio.src=objectUrl;currentAudio.hidden=false;lastPrepared=text;
      currentAudio.onended=()=>setMessage('Wiedergabe beendet.','BEREIT');
      try{
        await currentAudio.play();
        setMessage(text.length>300?'Jarvis spricht · die Antwort wurde auf 300 Zeichen gekürzt.':'Jarvis spricht mit '+(provider==='openai-tts'?'OpenAI':'Cartesia')+'.','SPRICHT');
      }catch{
        setMessage('Audio ist bereit. Tippe auf ▶ im Audioplayer direkt über dieser Meldung.','STARTEN');
      }
    }catch(error){
      if(thisRequest!==sequence||error.name==='AbortError')return;
      if(!speakLocal(text,true))setMessage(error.message||'Premium-Audio konnte nicht erstellt werden.','FEHLER');
    }finally{if(thisRequest===sequence)abort=null;}
  }
  $('jvEngine').addEventListener('change',()=>{stop();provider=$('jvEngine').value;voiceId=read(providerVoiceKey())||'';voices=[];save();render();if(provider!=='browser')loadVoices();});
  $('jvLang').addEventListener('change',save);
  $('jvVoice').addEventListener('change',()=>{stop();if(provider!=='browser'){voiceId=$('jvVoice').value;store(providerVoiceKey(),voiceId);}else prefs.voice=$('jvVoice').value;save();render();});
  $('jvHeroTone')?.addEventListener('click',testTone);
  $('jvHeroFile')?.addEventListener('click',()=>{void testAudioFile();});
  $('jvUseServerVoice')?.addEventListener('click',()=>{
    if(!validatedServerVoice)return;
    stop();
    provider=validatedServerVoice.provider;
    voiceId=validatedServerVoice.voiceId;
    store(providerVoiceKey(),voiceId);
    voices=[{id:voiceId,name:provider==='openai-tts'?'OpenAI':'Cartesia'}];
    $('jvEngine').value=provider;
    save();
    render();
    // Premium is only activated after this explicit owner click.
    setMessage('Server-Stimme aktiviert. Neue Antworten werden über deinen vorhandenen Anbieter erzeugt. Dies kann API-Kosten verursachen.','BEREIT');
    $('jvUseServerVoice').hidden=true;
  });
  $('jvHeroToggle')?.addEventListener('click',()=>{
    $('jvQuickToggle').dispatchEvent(new Event('click',{bubbles:true}));
  });
  $('jvHeroRead')?.addEventListener('click',()=>{
    // User gesture on the visible hero bypasses iOS blocked async autoplay.
    void speak(lastText||reply.textContent||'',true);
  });
  $('jvQuickToggle').addEventListener('click',()=>{
    $('jvEnabled').checked=!$('jvEnabled').checked;
    $('jvEnabled').dispatchEvent(new Event('change',{bubbles:true}));
  });
  $('jvEnabled').addEventListener('change',()=>{
    updateQuickToggle();
    const enabled=$('jvEnabled').checked;
    store(enabledKey,enabled?'1':'0');
    if(!enabled){
      stop();
      setMessage('Sprachausgabe ausgeschaltet. Jarvis antwortet weiterhin als Text.','STUMM');
    }else{
      setMessage('Sprachausgabe eingeschaltet. Jarvis spricht nach jedem fertigen Befehl.','BEREIT');
      // If the owner enables speech directly after a completed result, play
      // that answer once as feedback. Never speak while microphone is active.
      if(lastCompleted&&!microphoneBusy)void speak(lastCompleted);
    }
  });
  $('jvReload').addEventListener('click',loadVoices);
  $('jvPreview').addEventListener('click',()=>speak('Hallo. Ich bin Jarvis. Hörst du mich?',true));
  $('jvRead').addEventListener('click',()=>speak(lastText||reply.textContent||'',true));
  $('jvSoundCheck').addEventListener('click',async()=>{
    const result=await window.DGOSSoundCheck?.playTestTone();
    setMessage(result?.reason||'Audiotest nicht verfügbar.',result?.ok?'TON-TEST':'FEHLER');
  });
  $('jvStop').addEventListener('click',()=>{stop();setMessage('Wiedergabe gestoppt.','BEREIT');});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('dgos-device-session',()=>{if(provider!=='browser')loadVoices();});
  synth?.addEventListener?.('voiceschanged',()=>{if(provider==='browser')render();});
  lastText=reply.textContent||'';
  // Never read out microphone status, interim transcripts or thinking states.
  // Only completed Jarvis responses produce speech after an explicit user command.
  window.addEventListener('dgos-jarvis-microphone-state',event=>{
    const state=event.detail?.state;
    microphoneBusy=state==='starting'||state==='listening'||state==='processing';
    if(microphoneBusy){
      stop(); // No audio feedback into the recording microphone.
      setMessage(state==='listening'?'Ich höre zu. Sprich jetzt; tippe zum Beenden.':
        state==='processing'?'Aufnahme wird in Text umgewandelt …':'Mikrofon wird geöffnet …','ZUHÖREN');
    }
  });
  window.addEventListener('dgos-jarvis-final-response',event=>{
    const text=String(event.detail?.text||'').trim();
    if(!text)return; // Identical requests should still receive a spoken answer.
    lastText=text;
    lastCompleted=text;
    microphoneBusy=false;
    const replay=$('jvHeroRead');if(replay)replay.disabled=false;
    if($('jvEnabled').checked){
      void speak(text);
    }else{
      setMessage('Antwort als Text angezeigt. Aktiviere «Antworten vorlesen», damit Jarvis sie sagt.','STUMM');
    }
  });
  render();
  if(provider!=='browser'&&deviceSession())loadVoices();
})();
