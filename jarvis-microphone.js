/* iPhone-safe Jarvis microphone capture. MediaRecorder first on iOS,
 * browser SpeechRecognition on other browsers with recording fallback.
 * Voice audio is never stored: only sent to existing paired DG OS transcribe endpoint. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.DGOSJarvisMicrophone=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TRANSCRIBE='https://jzvnmhfhyvmmbontsoej.supabase.co/functions/v1/jarvis-private?action=transcribe';
  const MAX_MS=15000, MAX_BYTES=1900000;
  function isIOS(userAgent,platform,touchPoints){
    return /iPad|iPhone|iPod/i.test(userAgent||'') || (platform==='MacIntel' && Number(touchPoints)>1);
  }
  function chooseMime(supports){
    for(const candidate of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg']){
      try { if(supports(candidate))return candidate; }catch(_){}
    }
    return '';
  }
  function humanError(error){
    const type=String(error?.name||error?.message||'');
    if(/NotAllowedError|PermissionDeniedError|SecurityError/.test(type))
      return 'Mikrofonzugriff verweigert. Bitte in Safari die Mikrofon-Berechtigung für DG OS erlauben.';
    if(/NotFoundError|DevicesNotFoundError/.test(type))
      return 'Kein Mikrofon erkannt. Bitte iPhone-Mikrofon prüfen.';
    if(/NotReadableError|TrackStartError/.test(type))
      return 'Das Mikrofon wird gerade von einer anderen App verwendet. Bitte andere Aufnahme beenden.';
    if(/AbortError|timeout/.test(type))return 'Die Aufnahme wurde unterbrochen. Bitte erneut versuchen.';
    return error?.message||'Die Aufnahme konnte nicht gestartet werden. Bitte erneut versuchen.';
  }
  function create(options={}){
    const env=options.env||globalThis;
    const emit=(state,message)=>options.onState?.(state,message);
    const fail=message=>{emit('error',message); options.onError?.(message);};
    const nativeCtor=env.SpeechRecognition||env.webkitSpeechRecognition;
    const hasMedia=()=>Boolean(env.navigator?.mediaDevices?.getUserMedia && env.MediaRecorder);
    const preferRecorder=isIOS(env.navigator?.userAgent,env.navigator?.platform,env.navigator?.maxTouchPoints);
    let mode='idle',recognition=null,recorder=null,stream=null,recTimer=null,sequence=0,abort=null;
    function cleanStream(){
      if(recTimer!==null){env.clearTimeout(recTimer);recTimer=null;}
      if(stream){for(const track of stream.getTracks())try{track.stop();}catch(_){} stream=null;}
    }
    function isActive(){return mode==='starting'||mode==='listening'||mode==='processing';}
    function report(state,message){mode=state;emit(state,message);}
    async function transcribe(blob,mime,current){
      if(blob.size<100){fail('Ich habe keinen Ton aufgenommen. Bitte sprich etwas länger.');mode='idle';return;}
      if(blob.size>MAX_BYTES){fail('Die Aufnahme ist zu gross. Bitte nur einen kurzen Satz sprechen.');mode='idle';return;}
      const token=(()=>{try{return env.localStorage?.getItem('dgos.deviceSession')||'';}catch{return '';}})();
      if(!token){fail('Dieses iPhone ist noch nicht mit Jarvis gekoppelt. Bitte zuerst über Telegram verbinden.');mode='idle';return;}
      const file=new env.FormData();
      file.append('audio',blob,mime.includes('mp4')?'jarvis.m4a':mime.includes('ogg')?'jarvis.ogg':'jarvis.webm');
      abort=new env.AbortController();
      const timeout=env.setTimeout(()=>abort?.abort(),28500);
      try{
        const response=await env.fetch(TRANSCRIBE,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token},body:file,signal:abort.signal});
        const data=await response.json().catch(()=>({}));
        if(current!==sequence)return;
        if(!response.ok){
          let reason='Jarvis konnte die Aufnahme nicht verstehen. Bitte erneut versuchen.';
          if(response.status===401)reason='Gerätekopplung abgelaufen. Bitte Jarvis auf diesem iPhone neu mit Telegram verbinden.';
          else if(data.error==='ai_not_configured'||data.error==='stt_not_configured')reason='Kein Spracherkennungs-Anbieter auf dem DG-OS-Server eingerichtet. Bitte Cartesia oder OpenAI in Supabase aktivieren.';
          else if(data.error==='transcription_unavailable')reason='Cartesia konnte die Aufnahme gerade nicht verarbeiten. Bitte erneut versuchen oder Cartesia-Zugang und Guthaben prüfen.';
          else if(data.error==='slow_down')reason='Bitte acht Sekunden warten und dann erneut sprechen.';
          else if(data.error==='invalid_audio')reason='Dieses iPhone-Audioformat konnte nicht verarbeitet werden.';
          throw Error(reason);
        }
        const text=String(data.transcript||'').trim();
        if(!text)throw Error('Es wurde keine Sprache erkannt. Bitte erneut versuchen.');
        report('result','Erkannt: «'+text.slice(0,160)+'»');
        options.onTranscript?.(text);
        mode='idle';
      }catch(e){
        if(current===sequence){mode='idle';fail(humanError(e));}
      }finally{env.clearTimeout(timeout);if(current===sequence)abort=null;}
    }
    async function startRecording(){
      if(!hasMedia()){fail('Safari unterstützt hier keine Audioaufnahme. Bitte die Textzeile unter dem Orb verwenden.');mode='idle';return;}
      const mime=chooseMime(m=>env.MediaRecorder.isTypeSupported(m));
      if(!mime){fail('Kein unterstütztes iPhone-Audioformat. Bitte DG OS in Safari statt in einer eingebetteten Browseransicht öffnen.');mode='idle';return;}
      const current=++sequence;
      report('starting','Mikrofon wird freigegeben …');
      try{
        const microphone=await env.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
        if(current!==sequence){microphone.getTracks().forEach(t=>t.stop());return;}
        stream=microphone;
        const chunks=[];
        recorder=new env.MediaRecorder(microphone,{mimeType:mime,audioBitsPerSecond:64000});
        recorder.addEventListener('dataavailable',e=>{if(e.data?.size)chunks.push(e.data);});
        recorder.addEventListener('error',e=>{
          if(current!==sequence)return;
          cleanStream();mode='idle';fail(humanError(e.error||e));
        });
        recorder.addEventListener('stop',()=>{
          cleanStream();
          recorder=null;
          if(current!==sequence)return;
          report('processing','Aufnahme wird verarbeitet …');
          const blob=new env.Blob(chunks,{type:mime});
          void transcribe(blob,mime,current);
        });
        recorder.start(250);
        report('listening','Ich nehme auf … Sprich jetzt. Tippe nochmals zum Senden.');
        recTimer=env.setTimeout(()=>{
          if(recorder?.state==='recording'&&current===sequence)stop();
        },MAX_MS);
      }catch(e){cleanStream();recorder=null;if(current===sequence){mode='idle';fail(humanError(e));}}
    }
    function startNative(){
      const current=++sequence;
      try{
        recognition=new nativeCtor();
        recognition.lang=options.lang||'de-DE';
        recognition.interimResults=false;
        recognition.continuous=false;
        recognition.maxAlternatives=1;
        let gotResult=false;
        recognition.addEventListener('start',()=>{if(current===sequence)report('listening','Ich höre zu … Sprich jetzt.');});
        recognition.addEventListener('result',e=>{
          if(current!==sequence)return;
          const text=String(e.results?.[0]?.[0]?.transcript||'').trim();
          if(text){
            gotResult=true;
            report('result','Erkannt: «'+text.slice(0,160)+'»');
            options.onTranscript?.(text);
          }
        });
        recognition.addEventListener('end',()=>{
          if(current!==sequence)return;
          recognition=null;
          if(!gotResult)fail('Keine Sprache erkannt. Bitte noch einmal auf Jarvis tippen und deutlich sprechen.');
          mode='idle';
        });
        recognition.addEventListener('error',e=>{
          if(current!==sequence)return;
          recognition=null; mode='idle';
          const msg=e.error==='not-allowed'?'Mikrofonzugriff verweigert. Bitte Mikrofon in Safari erlauben.':
            e.error==='no-speech'?'Kein gesprochener Text erkannt. Bitte erneut versuchen.':
            'Browser-Spracherkennung fehlgeschlagen. Bitte die Textzeile nutzen.';
          fail(msg);
        });
        report('starting','Spracherkennung wird gestartet …');
        recognition.start();
      }catch(e){recognition=null;mode='idle';fail(humanError(e));}
    }
    function start(){
      if(mode==='starting'||mode==='processing')return;
      if(mode==='listening'){stop();return;}
      if(preferRecorder&&hasMedia())return void startRecording();
      if(nativeCtor)return startNative();
      if(hasMedia())return void startRecording();
      fail('Dieser Browser unterstützt keine Spracherkennung und keine Aufnahme. Bitte DG OS in Safari öffnen.');
    }
    function stop(){
      if(mode==='processing')return;
      if(recorder){
        if(recorder.state==='recording'){
          if(recTimer!==null){env.clearTimeout(recTimer);recTimer=null;}
          report('processing','Aufnahme wird verarbeitet …');
          try{recorder.stop();}catch(e){cleanStream();mode='idle';fail(humanError(e));}
        }
        return;
      }
      if(recognition){try{recognition.stop();}catch(_){}return;}
      if(mode==='starting'){
        sequence++;cleanStream();mode='idle';emit('idle','Aufnahme abgebrochen.');
      }
    }
    function destroy(){
      sequence++;
      if(abort){try{abort.abort();}catch(_){}abort=null;}
      if(recorder?.state==='recording')try{recorder.stop();}catch(_){}
      if(recognition)try{recognition.abort();}catch(_){}
      recorder=null;recognition=null;cleanStream();mode='idle';
    }
    return {start,stop,destroy,getMode:()=>mode,preferRecorder,hasMedia};
  }
  return {create,isIOS,chooseMime,humanError};
});