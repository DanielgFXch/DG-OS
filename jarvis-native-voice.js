'use strict';
/* DG OS native voice playback: one iOS-safe speech engine shared by Jarvis and Voice Studio.
 * Speech starts synchronously inside the user tap. An idle engine is never
 * cancelled before speak(): doing so can cancel the new utterance on iOS.
 * No microphone access, network calls or remote credentials. */
(function(root) {
  const synth=root.speechSynthesis || null;
  const Utterance=root.SpeechSynthesisUtterance || null;
  let active=null,started=false,timeout=null;

  function clearWatchdog(){
    if(timeout!==null){clearTimeout(timeout);timeout=null;}
  }
  function isSupported(){return Boolean(synth && Utterance);}
  function stop(){
    active=null;
    started=false;
    clearWatchdog();
    if(!synth)return;
    // Calling cancel() when idle can abort the next utterance on mobile Safari.
    if(synth.speaking || synth.pending || synth.paused){
      try{synth.cancel();}catch{}
    }
  }
  function diagnostic(code){
    const detail=String(code||'unbekannt');
    if(detail==='canceled'||detail==='interrupted')
      return 'iPhone hat die Wiedergabe abgebrochen ('+detail+'). Tippe nochmals auf Testen. Wenn es erneut passiert: Systemstimme wählen und in Safari öffnen.';
    if(detail==='voice-unavailable'||detail==='language-unavailable')
      return 'Die Stimme ist auf diesem iPhone nicht verfügbar ('+detail+'). Wähle «Systemstimme · automatisch» oder eine andere installierte Stimme.';
    if(detail==='not-allowed')
      return 'iOS verhindert den Audiostart (not-allowed). Bitte den Testknopf direkt in Safari antippen.';
    if(detail==='audio-busy')
      return 'Das Audio wird gerade von einer anderen App verwendet (audio-busy). Andere Wiedergabe stoppen und erneut testen.';
    return 'Die Geräte-Stimme konnte nicht starten ('+detail+'). Bitte die Systemstimme in Safari testen.';
  }
  function play({text,voice=null,lang='de-DE',rate=1,pitch=1,onState=()=>{}}){
    if(!isSupported()){
      onState({state:'error',error:'unsupported',message:'Die lokale Sprachausgabe wird in diesem Browser nicht unterstützt.'});
      return false;
    }
    const script=String(text||'').trim();
    if(!script)return false;
    // A repeated tap stops an active request. A new attempt needs a fresh tap.
    if(active || synth.speaking || synth.pending || synth.paused){
      stop();
      onState({state:'stopped',message:'Vorherige Wiedergabe gestoppt. Tippe erneut auf «Stimme testen».'});
      return false;
    }
    const u=new Utterance(script.slice(0,800));
    u.lang=lang;
    u.rate=Number.isFinite(Number(rate))?Math.min(1.3,Math.max(.7,Number(rate))):1;
    u.pitch=Number.isFinite(Number(pitch))?Number(pitch):1;
    u.volume=1;
    if(voice && typeof voice.voiceURI==='string') {u.voice=voice;u.lang=voice.lang||lang;}
    active=u;
    started=false;
    u.onstart=()=>{
      if(active!==u)return;
      started=true;clearWatchdog();
      onState({state:'speaking',message:'Jarvis spricht mit der iPhone-Gerätestimme.'});
    };
    u.onend=()=>{
      if(active!==u)return;
      active=null;clearWatchdog();
      onState({state:'ended',message:'Wiedergabe beendet.'});
    };
    u.onerror=(event)=>{
      if(active!==u)return; // suppress expected cancellation on manual stop
      active=null;clearWatchdog();
      const error=String(event?.error||'unknown');
      onState({state:'error',error,message:diagnostic(error)});
    };
    try{
      // Must stay in the user gesture. Do not move speak() to setTimeout/await.
      synth.speak(u);
      if(synth.paused) synth.resume();
      if(active===u&&!started){
        onState({state:'starting',message:'Starte die iPhone-Gerätestimme …'});
        timeout=setTimeout(()=>{
          if(active===u&&!started){
            onState({state:'timeout',message:'Keine Audiostart-Bestätigung. Prüfe Medienlautstärke und teste in Safari mit «Systemstimme · automatisch».'});
          }
        },4800);
      }
      return true;
    }catch(error){
      if(active===u)active=null;
      clearWatchdog();
      onState({state:'error',error:'exception',message:'Audio konnte nicht gestartet werden. Bitte direkt in Safari testen.'});
      return false;
    }
  }
  root.DGOSLocalVoice=Object.freeze({play,stop,isSupported,diagnostic});
})(window);
