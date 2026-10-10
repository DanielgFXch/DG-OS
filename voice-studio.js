'use strict';
/* Voice Lab: browser-local audition is available independently of selected paid provider.
   No premium provider is simulated; Cartesia preview is in its own authenticated card. */
(() => {
  const $=id=>document.getElementById(id);
  const providers=['cartesia','elevenlabs','openai','browser'];
  const storageKey='dgos.voiceStudio.preferences.v1';
  const synth=window.speechSynthesis||null;
  const supported=Boolean(synth&&window.SpeechSynthesisUtterance);
  let provider='browser',utterance=null,watchdog=null,speechStarted=false;
  let savedVoice='';
  const mobileApple=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const note=message=>$('notice').textContent=message;
  function statusText(){
    if(!supported)return 'Dieses Gerät unterstützt die lokale Sprachausgabe nicht.';
    if(provider==='openai')return 'OpenAI Realtime ist noch NICHT aktiv. Die oben gewählte Stimme ist nur die lokale iPhone-Stimme. Mit «Gerätestimme anhören» kannst du sie trotzdem testen.';
    if(provider==='elevenlabs')return 'ElevenLabs ist noch nicht verbunden. Die lokale Gerätestimme lässt sich unabhängig davon testen.';
    if(provider==='cartesia')return 'Cartesia-Stimmen werden unten unter «Meine Cartesia-Stimmen» nach der Gerätekopplung geladen. Dieser Testknopf spielt nur die iPhone-Gerätestimme ab.';
    return 'Die lokale Stimme ist bereit. Drücke «Gerätestimme anhören». Keine Anmeldung nötig.';
  }
  function refresh(){
    document.querySelectorAll('[data-provider]').forEach(b=>{
      const active=b.dataset.provider===provider;
      b.dataset.active=String(active);
      b.setAttribute('aria-pressed',String(active));
    });
    $('providerStatus').textContent=!supported?'Lokal nicht unterstützt':
      provider==='browser'?'Lokale Vorschau bereit':
      provider==='openai'?'Realtime noch nicht aktiv':
      provider==='cartesia'?'Cartesia: unten verbinden':'Noch nicht verbunden';
    $('voiceSelect').disabled=!supported;
    $('preview').disabled=!supported;
    $('preview').textContent='▶ Gerätestimme anhören';
    $('preview').setAttribute('aria-label','Lokale Gerätestimme anhören – kein Premium-Test');
    note(statusText());
  }
  function populate(){
    const selection=$('voiceSelect');
    const selected=selection.value||savedVoice;
    selection.replaceChildren(new Option('Systemstimme · automatisch',''));
    if(!supported)return;
    const list=synth.getVoices().slice().sort((a,b)=>{
      const lang=$('language').value.slice(0,2);
      return Number(b.lang.startsWith(lang))-Number(a.lang.startsWith(lang))||a.name.localeCompare(b.name);
    });
    list.forEach(v=>selection.add(new Option(v.name+' · '+v.lang,v.voiceURI)));
    selection.value=list.some(v=>v.voiceURI===selected)?selected:'';
  }
  function stop(){
    if(watchdog){clearTimeout(watchdog);watchdog=null;}
    utterance=null;
    speechStarted=false;
    try{synth?.cancel();}catch{}
  }
  function read(){
    try{
      const settings=JSON.parse(localStorage.getItem(storageKey)||'{}');
      if(providers.includes(settings.provider))provider=settings.provider;
      if(['de-DE','en-GB','pt-PT'].includes(settings.language))$('language').value=settings.language;
      if(Number(settings.pace)>=.7&&Number(settings.pace)<=1.3)$('pace').value=String(settings.pace);
      if(typeof settings.voice==='string')savedVoice=settings.voice;
    }catch{}
    populate();
    $('paceOut').textContent=Number($('pace').value).toFixed(2)+'×';
    refresh();
  }
  function preview(){
    if(!supported)return note('Auf diesem Gerät ist die Browser-Sprachausgabe nicht verfügbar.');
    const text=$('sample').value.trim();
    if(!text)return note('Bitte zuerst einen Testtext eingeben.');
    // Speak synchronously in the tap handler. iOS Safari requires a real user gesture.
    stop();
    const speech=new SpeechSynthesisUtterance(text.slice(0,850));
    utterance=speech;
    speech.lang=$('language').value;
    speech.rate=Number($('pace').value);
    speech.pitch=1;
    speech.volume=1;
    const selected=synth.getVoices().find(v=>v.voiceURI===$('voiceSelect').value);
    if(selected){speech.voice=selected;speech.lang=selected.lang;}
    speech.onstart=()=>{
      if(utterance!==speech)return;
      speechStarted=true;
      if(watchdog){clearTimeout(watchdog);watchdog=null;}
      note('Die iPhone-Gerätestimme spricht jetzt. Dies ist keine OpenAI- oder Cartesia-Stimme.');
    };
    speech.onend=()=>{
      if(utterance!==speech)return;
      if(watchdog){clearTimeout(watchdog);watchdog=null;}
      utterance=null;
      note('Wiedergabe beendet. Du kannst eine andere Stimme wählen und nochmals testen.');
    };
    speech.onerror=event=>{
      if(utterance!==speech)return;
      if(watchdog){clearTimeout(watchdog);watchdog=null;}
      utterance=null;
      const detail=event.error?' ('+event.error+')':'';
      note('Sprachausgabe fehlgeschlagen'+detail+'. '+(mobileApple?'Prüfe Lautstärke und Stummmodus und teste in Safari.':'Bitte andere Stimme wählen und nochmals testen.'));
    };
    try{
      synth.speak(speech);
      if(synth.paused)synth.resume();
      note('Test gestartet. Warte kurz auf die iPhone-Gerätestimme …');
      watchdog=setTimeout(()=>{
        if(utterance===speech&&!speechStarted){
          note('iPhone startet die Sprachausgabe nicht. Prüfe Medienlautstärke und Stummmodus. Öffne das Voice Studio direkt in Safari und versuche «Systemstimme · automatisch».');
        }
      },4500);
    }catch{
      utterance=null;
      note('Audio konnte auf diesem Gerät nicht gestartet werden. Bitte in Safari testen.');
    }
  }
  document.querySelectorAll('[data-provider]').forEach(b=>b.addEventListener('click',()=>{
    stop();provider=b.dataset.provider;refresh();
  }));
  $('language').addEventListener('change',()=>{populate();});
  $('pace').addEventListener('input',()=>{$('paceOut').textContent=Number($('pace').value).toFixed(2)+'×';});
  $('preview').addEventListener('click',preview);
  $('stop').addEventListener('click',()=>{stop();note('Wiedergabe gestoppt.');});
  $('save').addEventListener('click',()=>{
    try{
      localStorage.setItem(storageKey,JSON.stringify({
        provider,voice:$('voiceSelect').value,language:$('language').value,pace:Number($('pace').value)
      }));
      savedVoice=$('voiceSelect').value;
      note('Gespeichert. '+(provider==='browser'?'Deine Gerätestimme ist ausgewählt.':'Der Anbieter ist vorgemerkt. Die lokale Vorschau testet weiterhin nur die Gerätestimme.'));
    }catch{note('Einstellungen konnten auf diesem Gerät nicht gespeichert werden.');}
  });
  if(supported)synth.addEventListener?.('voiceschanged',populate);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',stop);
  read();
})();
