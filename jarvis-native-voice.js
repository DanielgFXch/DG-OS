'use strict';
/* DG OS local voice playback.
 * On iOS Web Speech events may be missing. A repeated tap restarts playback,
 * never traps the user in a "tap again to hear anything" stop-only state.
 * No credentials, network calls, microphone access or paid voice requests. */
(function(root) {
  const synth=root.speechSynthesis||null;
  const Utterance=root.SpeechSynthesisUtterance||null;
  let active=null,started=false,watchdog=null,restartTimer=null,requestId=0;

  function clearTimers(){
    if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
    if(restartTimer!==null){clearTimeout(restartTimer);restartTimer=null;}
  }
  function isSupported(){return Boolean(synth&&Utterance);}
  function cancelIfBusy(force=false){
    if(!synth)return;
    if(force||synth.speaking||synth.pending||synth.paused){
      try{synth.cancel();}catch{}
    }
  }
  function stop(){
    const existed=Boolean(active||restartTimer!==null);
    requestId++;
    active=null;started=false;clearTimers();
    // Never cancel an idle engine; that can cancel the *next* speech on Safari.
    cancelIfBusy(existed);
  }
  function diagnostic(code){
    const detail=String(code||'unbekannt');
    if(detail==='canceled'||detail==='interrupted')
      return 'iPhone hat die Wiedergabe unterbrochen ('+detail+'). Versuche Systemstimme und teste direkt in Safari.';
    if(detail==='voice-unavailable'||detail==='language-unavailable')
      return 'Stimme nicht verfügbar ('+detail+'). Wähle «Systemstimme · automatisch».';
    if(detail==='not-allowed')
      return 'iOS verhindert den Sprachstart (not-allowed). Teste direkt in Safari durch Antippen.';
    if(detail==='audio-busy')
      return 'Audio durch eine andere App blockiert (audio-busy). Andere Audiowiedergabe stoppen.';
    return 'Geräte-Stimme konnte nicht starten ('+detail+'). Prüfe «Ton prüfen» und teste die Systemstimme in Safari.';
  }
  function play({text,voice=null,lang='de-DE',rate=1,pitch=1,onState=()=>{}}){
    if(!isSupported()){
      onState({state:'error',error:'unsupported',message:'Lokale Sprachausgabe wird nicht unterstützt.'});
      return false;
    }
    const transcript=String(text||'').trim();
    if(!transcript)return false;
    const hadActive=Boolean(active||restartTimer!==null);
    const browserBusy=Boolean(synth.speaking||synth.pending||synth.paused);
    const restartNeeded=hadActive&&browserBusy;
    // Invalidate stale onend/onerror handlers. If Safari says it is already
    // idle, forget the stale JS reference and immediately try a fresh speech.
    requestId++;
    const id=requestId;
    active=null;started=false;clearTimers();

    const begin=()=>{
      if(id!==requestId)return;
      const u=new Utterance(transcript.slice(0,800));
      u.lang=lang;
      const numericRate=Number(rate);
      u.rate=Number.isFinite(numericRate)?Math.min(1.3,Math.max(.7,numericRate)):1;
      const numericPitch=Number(pitch);
      u.pitch=Number.isFinite(numericPitch)?numericPitch:1;
      u.volume=1;
      if(voice && typeof voice.voiceURI==='string' && voice.voiceURI){
        u.voice=voice;
        u.lang=voice.lang||lang;
      }
      active=u;
      started=false;
      u.onstart=()=>{
        if(id!==requestId||active!==u)return;
        started=true;
        if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
        onState({state:'speaking',message:'Jarvis spricht mit der Geräte-Stimme.'});
      };
      u.onend=()=>{
        if(id!==requestId||active!==u)return;
        active=null;started=false;
        if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
        onState({state:'ended',message:'Wiedergabe beendet.'});
      };
      u.onerror=(event)=>{
        if(id!==requestId||active!==u)return;
        active=null;started=false;
        if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
        const error=String(event?.error||'unknown');
        onState({state:'error',error,message:diagnostic(error)});
      };
      try{
        // First attempt runs synchronously inside the user's tap.
        synth.speak(u);
        if(synth.paused)synth.resume();
        if(active===u&&!started){
          onState({state:'starting',message:'Jarvis startet die Stimme …'});
          watchdog=setTimeout(()=>{
            if(id!==requestId||active!==u||started)return;
            active=null;started=false;watchdog=null;
            cancelIfBusy();
            onState({state:'timeout',message:'Kein Sprachstart nach 5 Sekunden. Teste «Ton prüfen» und die «Systemstimme · automatisch» direkt in Safari.'});
          },5000);
        }
      }catch{
        if(id!==requestId)return;
        active=null;started=false;
        if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
        onState({state:'error',error:'exception',message:'iPhone konnte die Sprachausgabe nicht starten. Bitte in Safari testen.'});
      }
    };

    if(restartNeeded){
      // A previous iOS utterance is still marked speaking/pending.
      // Allow its cancellation callback to settle; automatically attempt
      // the new speech on this same tap instead of demanding a second tap.
      cancelIfBusy();
      onState({state:'restarting',message:'Jarvis startet die Stimme erneut …'});
      restartTimer=setTimeout(()=>{restartTimer=null;begin();},130);
    }else{
      // No playback known to be active, or iOS forgot to emit onend:
      // do not call cancel() and risk aborting the user's new speech.
      begin();
    }
    return true;
  }
  root.DGOSLocalVoice=Object.freeze({play,stop,isSupported,diagnostic});
})(window);
